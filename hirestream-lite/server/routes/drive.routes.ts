import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/rbac.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { recruitmentDrives, recruitmentAgents, interviews, applications, candidates, jobs, placements, driveRegistrations } from "@shared/schema";
import { eq, and, desc, gte, count, ne, inArray } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { maybeNotifyDeploymentReady } from "../services/deployment-notify.service";

const router = Router();

// ── v0.4.17: Shared ownership check for application-scoped mutations ─
// Returns null when the caller is authorised (admin/superadmin, or the
// agent on the application's job, or the employer who owns the job
// directly OR via parent requisition per FRS §2.2). Returns the role
// the caller is acting as so handlers can branch on it; or an
// error tuple {status, message} to send back.
//
// This is the same pattern application.routes.ts PATCH /:id/status
// already uses; consolidated here because the audit found four
// drive.routes endpoints missing the same guard (POST /:driveId/
// interviews, PATCH /interviews/:id/result, POST /placements, GET
// /placements/:id). DRY-ing the check makes future drive endpoints
// safe-by-default — copy this helper into the new handler.
async function assertCanActOnApplication(
  db: any,
  user: any,
  applicationId: string,
): Promise<{ ok: true; isAdmin: boolean; app: any; job: any } | { ok: false; status: number; message: string }> {
  if (!user) return { ok: false, status: 401, message: "Authentication required" };
  if (!["agent", "employer", "admin", "superadmin"].includes(user.role)) {
    return { ok: false, status: 403, message: "Not authorized" };
  }
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  if (!app) return { ok: false, status: 404, message: "Application not found" };
  const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId!)).limit(1);
  if (!job) return { ok: false, status: 404, message: "Job not found" };

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (isAdmin) return { ok: true, isAdmin: true, app, job };

  const ownsAsAgent = user.role === "agent" && job.agentId === user.id;
  let ownsAsEmployer = user.role === "employer" && job.employerId === user.id;
  if (!ownsAsEmployer && user.role === "employer" && job.parentRequisitionId) {
    const [parent] = await db.select({ employerId: jobs.employerId }).from(jobs)
      .where(eq(jobs.id, job.parentRequisitionId)).limit(1);
    ownsAsEmployer = !!parent && parent.employerId === user.id;
  }
  if (!ownsAsAgent && !ownsAsEmployer) {
    return { ok: false, status: 403, message: "You can only act on applications for jobs you own." };
  }
  return { ok: true, isAdmin: false, app, job };
}

// ── Create Drive (verified agent only) ──────────────────────────────
router.post("/", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (user.role !== "agent") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only agents can create drives" } });
    }

    // Get verified agency
    const agencyRows = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!agencyRows.length || !agencyRows[0].verified) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Agency must be verified" } });
    }

    const title = String(req.body?.title ?? "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    const location = String(req.body?.location ?? "").trim();
    const date = req.body?.date;
    const targetRoles = Array.isArray(req.body?.targetRoles) ? req.body.targetRoles : [];
    const expectedCandidates = req.body?.expectedCandidates;

    if (!title || !date || !location) {
      return res.status(400).json({ success: false, error: { code: 400, message: "title, date, and location are required" } });
    }
    if (title.length < 2 || title.length > 150) {
      return res.status(400).json({ success: false, error: { code: 400, message: "title must be 2–150 characters" } });
    }
    if (location.length > 120) {
      return res.status(400).json({ success: false, error: { code: 400, message: "location too long (max 120)" } });
    }
    if (description && description.length > 3000) {
      return res.status(400).json({ success: false, error: { code: 400, message: "description too long (max 3000)" } });
    }
    if (targetRoles.length > 30) {
      return res.status(400).json({ success: false, error: { code: 400, message: "max 30 target roles" } });
    }
    const cleanRoles = targetRoles
      .map((r: any) => String(r).trim().slice(0, 40))
      .filter((r: string) => r.length > 0);

    // Drive approval required? Configurable setting.
    const { getSetting } = await import("../services/settings.service");
    const requireApproval: boolean = await getSetting("drive.require_admin_approval");

    const result = await db.insert(recruitmentDrives).values({
      agencyId: agencyRows[0].id,
      title,
      description,
      date: new Date(date),
      location,
      targetRoles: cleanRoles,
      expectedCandidates: expectedCandidates || null,
      status: requireApproval ? "pending" : "approved",
      approvedBy: requireApproval ? null : user.id,
    }).returning();

    logger.info(`Drive created: ${result[0].id} by agency ${agencyRows[0].id}`);
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── List Drives (public: upcoming active) ───────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { status } = req.query;
    const conditions: any[] = [];

    if (status && typeof status === "string") {
      conditions.push(eq(recruitmentDrives.status, status));
    } else {
      conditions.push(eq(recruitmentDrives.status, "approved"));
    }

    const rows = await db.select().from(recruitmentDrives)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(recruitmentDrives.date));

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// ── Agent's Own Drives ──────────────────────────────────────────────
router.get("/my", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const agencyRows = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!agencyRows.length) return res.json({ success: true, data: [] });

    const rows = await db.select().from(recruitmentDrives)
      .where(eq(recruitmentDrives.agencyId, agencyRows[0].id))
      .orderBy(desc(recruitmentDrives.createdAt));

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// ── Candidate: upcoming APPROVED drives + my registration state ──────
// Defined before "/:id" so the literal path isn't captured as an id.
router.get("/upcoming", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    const drives = await db.select().from(recruitmentDrives)
      .where(eq(recruitmentDrives.status, "approved"))
      .orderBy(recruitmentDrives.date);
    const agencyIds: string[] = Array.from(new Set(drives.map((d: any) => String(d.agencyId))));
    const agencyMap: Record<string, string> = {};
    if (agencyIds.length) {
      const ag = await db.select({ id: recruitmentAgents.id, name: recruitmentAgents.agencyName }).from(recruitmentAgents).where(inArray(recruitmentAgents.id, agencyIds));
      for (const a of ag) agencyMap[a.id] = a.name;
    }
    const myRegs = await db.select().from(driveRegistrations).where(eq(driveRegistrations.userId, user.id));
    const myStatus: Record<string, string> = {};
    for (const r of myRegs) myStatus[r.driveId] = r.status;
    const enriched = await Promise.all(drives.map(async (d: any) => {
      const [{ c }] = await db.select({ c: count() }).from(driveRegistrations).where(and(eq(driveRegistrations.driveId, d.id), ne(driveRegistrations.status, "cancelled")));
      return { ...d, agencyName: agencyMap[d.agencyId] || "Recruiting Agency", registeredCount: Number(c), myStatus: myStatus[d.id] ?? null };
    }));
    res.json({ success: true, data: enriched });
  } catch (error) { next(error); }
});

// ── Get Single Drive ────────────────────────────────────────────────
// security 2026-07-07 (A01-7): was unauthenticated and unfiltered — anyone
// could read pending/rejected/cancelled drives incl. rejectionReason. Now
// requires auth; non-approved drives are only visible to admin/superadmin
// and the owning agency (who need them for the review/edit flow).
router.get("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });

    const user = req.user as any;
    if (rows[0].status !== "approved") {
      const isAdmin = user.role === "admin" || user.role === "superadmin";
      if (!isAdmin) {
        const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
        if (!myAgency || myAgency.id !== rows[0].agencyId) {
          // 404 (not 403) so non-staff can't confirm a hidden drive exists.
          return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });
        }
      }
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── Edit Drive (before approval) ────────────────────────────────────
router.patch("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const rows = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });

    // Only the owning agency can edit, and only if still pending
    const agencyRows = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!agencyRows.length || agencyRows[0].id !== rows[0].agencyId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    if (rows[0].status !== "pending") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Can only edit pending drives" } });
    }

    const { title, description, date, location, targetRoles, expectedCandidates } = req.body;
    const updates: any = {};
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (date) updates.date = new Date(date);
    if (location) updates.location = location;
    if (targetRoles) updates.targetRoles = targetRoles;
    if (expectedCandidates !== undefined) updates.expectedCandidates = expectedCandidates;

    const result = await db.update(recruitmentDrives).set(updates).where(eq(recruitmentDrives.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── Cancel Drive ────────────────────────────────────────────────────
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const rows = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });

    const agencyRows = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (user.role !== "admin" && user.role !== "superadmin" && (!agencyRows.length || agencyRows[0].id !== rows[0].agencyId)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    await db.update(recruitmentDrives).set({ status: "cancelled" }).where(eq(recruitmentDrives.id, req.params.id));
    res.json({ success: true, message: "Drive cancelled" });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/drives/:id/notify-candidates
// Agent action: blast a drive announcement to relevant candidates. Tester
// feedback 2.13: no visible way to notify candidates about a scheduled drive.
// Recipients: candidates with shortlisted+ applications on any job the agent
// owns (scoped to the agent's pool so a drive by Agency A doesn't spam Agency
// B's candidates). Messages land in the in-app notifications drawer via the
// existing `notify()` service — same severity rules, same dismissable pattern.
router.post("/:id/notify-candidates", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = req.user as any;
    if (user.role !== "agent" && user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Agents only" });
    }
    const { message } = req.body ?? {};
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id));
    if (!drive) return res.status(404).json({ success: false });

    // Ownership check: agency that owns this drive must match the caller
    // (unless admin). Also: only approved drives should broadcast — we don't
    // want "Come to the drive on Tuesday" messages going out before HPSEDC
    // has reviewed it.
    const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (user.role !== "admin" && user.role !== "superadmin" && (!myAgency || myAgency.id !== drive.agencyId)) {
      return res.status(403).json({ success: false, message: "Not your drive" });
    }
    if (drive.status !== "approved") {
      return res.status(400).json({ success: false, message: "Drive must be approved before notifying candidates" });
    }

    // Candidate pool: anyone with a shortlisted / interview_scheduled app on
    // a job this agency owns. Dedup by candidate.userId.
    const owningAgencyId = user.role === "admin" || user.role === "superadmin" ? drive.agencyId : myAgency!.id;
    const [owningAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, owningAgencyId!)).limit(1);
    if (!owningAgency) return res.status(404).json({ success: false, message: "Agency not found" });

    const apps = await db
      .select({ appId: applications.id, candidateUserId: candidates.userId, candidateName: candidates.fullName, jobTitle: jobs.title })
      .from(applications)
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(
        eq(jobs.agentId, owningAgency.userId),
        // audit 2026-07-06 (C5): the old post-query "filter" was dead code
        // (String(a.appId ? "" : "") is always ""), so rejected/withdrawn
        // applicants were broadcast too. Filter to shortlisted+ in the query.
        inArray(applications.status, ["shortlisted", "interview_scheduled", "selected"]),
      ));

    const targets = new Map<string, { candidateName: string; jobTitle: string }>();
    for (const a of apps as any[]) {
      if (a.candidateUserId && !targets.has(a.candidateUserId)) {
        targets.set(a.candidateUserId, { candidateName: a.candidateName, jobTitle: a.jobTitle });
      }
    }

    const when = new Date(drive.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const body = (message && String(message).trim().length > 0)
      ? String(message).trim().slice(0, 500)
      : `A recruitment drive "${drive.title}" is scheduled on ${when} at ${drive.location}. We may invite you — watch for the interview call.`;

    let sent = 0;
    for (const [userId, meta] of targets) {
      try {
        await notify({
          userId,
          title: `Upcoming drive: ${drive.title}`,
          message: body,
          severity: "info",
          type: "drive.announcement",
          metadata: { driveId: drive.id, location: drive.location, date: drive.date },
        });
        sent++;
      } catch (e: any) {
        logger.warn(`notify failed for user ${userId}: ${e?.message}`);
      }
    }
    res.json({ success: true, data: { notified: sent, targetsTotal: targets.size } });
  } catch (err) { next(err); }
});

// ── Admin: Approve Drive ────────────────────────────────────────────
router.patch("/:id/approve", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });

    if (rows[0].status !== "pending") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Drive is not in pending state" } });
    }

    const result = await db.update(recruitmentDrives)
      .set({ status: "approved", approvedBy: (req.user as any).id })
      .where(eq(recruitmentDrives.id, req.params.id))
      .returning();

    // Notify the agency
    const agency = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, rows[0].agencyId)).limit(1);
    if (agency.length && agency[0].userId) {
      notify({
        userId: agency[0].userId,
        type: "system",
        title: "Recruitment Drive Approved",
        message: `Your drive "${rows[0].title}" has been approved by HPSEDC.`,
        metadata: { driveId: rows[0].id },
      }).catch(() => {});
    }

    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── Admin: Reject Drive ─────────────────────────────────────────────
router.patch("/:id/reject", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { reason } = req.body;
    const rows = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });

    const result = await db.update(recruitmentDrives)
      .set({ status: "rejected", rejectionReason: reason || null })
      .where(eq(recruitmentDrives.id, req.params.id))
      .returning();

    // Notify the agency
    const agency = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, rows[0].agencyId)).limit(1);
    if (agency.length && agency[0].userId) {
      notify({
        userId: agency[0].userId,
        type: "system",
        title: "Recruitment Drive Rejected",
        message: `Your drive "${rows[0].title}" was not approved.${reason ? ' Reason: ' + reason : ''}`,
        metadata: { driveId: rows[0].id },
      }).catch(() => {});
    }

    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// INTERVIEWS
// ═══════════════════════════════════════════════════════════════════

// ── Schedule Interview ──────────────────────────────────────────────
router.post("/:driveId/interviews", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const { applicationId, scheduledAt, location, mode, interviewerName, meetingLink } = req.body;

    if (!applicationId || !scheduledAt) {
      return res.status(400).json({ success: false, error: { code: 400, message: "applicationId and scheduledAt are required" } });
    }

    // v0.4.17: IDOR guard — only the agent/employer who owns the
    // application's job (or admin) can schedule an interview on it.
    const guard = await assertCanActOnApplication(db, user, applicationId);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: { code: guard.status, message: guard.message } });
    }

    const result = await db.insert(interviews).values({
      driveId: req.params.driveId !== "none" ? req.params.driveId : null,
      applicationId,
      scheduledAt: new Date(scheduledAt),
      location: location || null,
      mode: mode || "in_person",
      // v0.4.34.1: capture interviewer + meeting link so candidate panel
      // can render them. Both optional.
      interviewerName: interviewerName ? String(interviewerName).slice(0, 200) : null,
      meetingLink: meetingLink ? String(meetingLink).slice(0, 500) : null,
      conductedBy: user.id,
    }).returning();

    // Update application status
    await db.update(applications).set({ status: "interview_scheduled" }).where(eq(applications.id, applicationId));

    // Notify candidate
    const candRows = await db.select().from(candidates).where(eq(candidates.id, guard.app.candidateId!)).limit(1);
    const jobTitle = guard.job.title;

    if (candRows.length && candRows[0].userId) {
      notify({
        userId: candRows[0].userId,
        type: "application_update",
        title: "Interview Scheduled",
        message: `Your interview for "${jobTitle}" is scheduled for ${new Date(scheduledAt).toLocaleDateString('en-IN')} at ${location || 'TBD'}.`,
        metadata: { interviewId: result[0].id, applicationId, jobId: guard.app.jobId },
      }).catch(() => {});
    }

    logger.info(`Interview scheduled: ${result[0].id} for application ${applicationId} by ${user.role} ${user.id}`);
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── List Interviews for a Drive ─────────────────────────────────────
router.get("/:driveId/interviews", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // security 2026-07-07 (A01-3): previously only `protect` — any
    // authenticated user (incl. candidates) could list every interview on any
    // drive with candidate name/email/skills. Reuse the admin-or-owning-agency
    // check from GET /:id/registrations.
    const user = req.user as any;
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.driveId)).limit(1);
    if (!drive) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!isAdmin && (!myAgency || myAgency.id !== drive.agencyId)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not your drive" } });
    }

    const rows = await db
      .select({ interview: interviews, application: applications, candidate: candidates, job: jobs })
      .from(interviews)
      .innerJoin(applications, eq(interviews.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(interviews.driveId, req.params.driveId))
      .orderBy(desc(interviews.scheduledAt));

    const data = rows.map((r: any) => ({
      id: r.interview.id,
      scheduledAt: r.interview.scheduledAt,
      location: r.interview.location,
      mode: r.interview.mode,
      result: r.interview.result,
      notes: r.interview.notes,
      candidate: { id: r.candidate.id, fullName: r.candidate.fullName, email: r.candidate.email, skills: r.candidate.skills },
      job: { id: r.job.id, title: r.job.title, company: r.job.company },
      applicationId: r.application.id,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── My Interviews (candidate) ───────────────────────────────────────
router.get("/interviews/my", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candRows = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
    if (!candRows.length) return res.json({ success: true, data: [] });

    const rows = await db
      .select({ interview: interviews, application: applications, job: jobs })
      .from(interviews)
      .innerJoin(applications, eq(interviews.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.candidateId, candRows[0].id))
      .orderBy(desc(interviews.scheduledAt));

    const data = rows.map((r: any) => ({
      id: r.interview.id,
      scheduledAt: r.interview.scheduledAt,
      location: r.interview.location,
      mode: r.interview.mode,
      result: r.interview.result,
      job: { id: r.job.id, title: r.job.title, company: r.job.company },
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Record Interview Result ─────────────────────────────────────────
router.patch("/interviews/:id/result", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const { result: interviewResult, notes } = req.body;
    // Accept null/undefined to clear the result back to pending
    const validResults = ["selected", "rejected", "hold", null];
    if (interviewResult !== null && interviewResult !== undefined && !validResults.includes(interviewResult)) {
      return res.status(400).json({ success: false, error: { code: 400, message: `result must be: selected, rejected, hold, or null to clear` } });
    }

    const intRows = await db.select().from(interviews).where(eq(interviews.id, req.params.id)).limit(1);
    if (!intRows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Interview not found" } });

    // v0.4.17: IDOR guard — only the agent/employer who owns the
    // interview's application's job (or admin) can record its result.
    const guard = await assertCanActOnApplication(db, user, intRows[0].applicationId);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: { code: guard.status, message: guard.message } });
    }

    const normalised = interviewResult ?? null;
    const updated = await db.update(interviews)
      .set({ result: normalised, notes: notes !== undefined ? notes || null : intRows[0].notes })
      .where(eq(interviews.id, req.params.id))
      .returning();

    // Reflect result onto the application status
    if (normalised === "selected") {
      await db.update(applications).set({ status: "selected" }).where(eq(applications.id, intRows[0].applicationId));
    } else if (normalised === "rejected") {
      await db.update(applications).set({ status: "rejected" }).where(eq(applications.id, intRows[0].applicationId));
    } else if (normalised === "hold" || normalised === null) {
      // Revert the application back to interview_scheduled — result is pending again
      await db.update(applications).set({ status: "interview_scheduled" }).where(eq(applications.id, intRows[0].applicationId));
    }

    // Notify candidate
    const appRows = await db.select().from(applications).where(eq(applications.id, intRows[0].applicationId)).limit(1);
    if (appRows.length && appRows[0].candidateId) {
      const candRows = await db.select().from(candidates).where(eq(candidates.id, appRows[0].candidateId)).limit(1);
      const jobRows = await db.select().from(jobs).where(eq(jobs.id, appRows[0].jobId!)).limit(1);

      if (candRows.length && candRows[0].userId && jobRows.length) {
        const messages: Record<string, string> = {
          selected: `Congratulations! You've been selected for "${jobRows[0].title}" at ${jobRows[0].company}.`,
          rejected: `Your interview for "${jobRows[0].title}" was not successful this time.`,
          hold: `Your interview result for "${jobRows[0].title}" is on hold. We'll update you soon.`,
        };
        notify({
          userId: candRows[0].userId,
          type: "application_update",
          title: `Interview Result: ${jobRows[0].title}`,
          message: messages[interviewResult],
          metadata: { interviewId: req.params.id, applicationId: intRows[0].applicationId },
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: updated[0] });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PLACEMENTS
// ═══════════════════════════════════════════════════════════════════

// ── Create Placement ────────────────────────────────────────────────
router.post("/placements", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const { applicationId, country, salary, startDate, appointmentLetterUrl } = req.body;

    if (!applicationId || !country) {
      return res.status(400).json({ success: false, error: { code: 400, message: "applicationId and country are required" } });
    }

    // v0.4.17: IDOR guard — only the agent/employer who owns the
    // application's job (or admin) can issue a placement offer.
    const guard = await assertCanActOnApplication(db, user, applicationId);
    if (!guard.ok) {
      return res.status(guard.status).json({ success: false, error: { code: guard.status, message: guard.message } });
    }

    if (guard.app.status !== "selected") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Application must be in 'selected' status to create placement" } });
    }

    // audit 2026-07-06 (Batch 4B): ECR candidates cannot have a travel/start
    // date until PDO + PBBY are done (Emigration Act). Gate only when a start
    // date is being set — the offer itself can be issued without one.
    if (startDate) {
      const gateOn: boolean = await (await import("../services/settings.service")).getSetting("compliance.gate_travel_on_pdo_pbby");
      if (gateOn && guard.app.candidateId) {
        const [cand] = await db.select().from(candidates).where(eq(candidates.id, guard.app.candidateId)).limit(1);
        const { ecrTravelGateIssue } = await import("../services/deployment.service");
        const missing = cand ? ecrTravelGateIssue(cand) : null;
        if (missing) {
          return res.status(400).json({ success: false, error: { code: 400, message: `This candidate holds an ECR passport — complete ${missing} before setting a travel/start date. (Create the offer without a start date, or update the candidate's compliance record.)` } });
        }
      }
    }

    // audit 2026-07-06 (Batch 4B): stamp the offer's validity deadline so a
    // stale offer can't be accepted months later. 0 days = no expiry.
    const validityDays: number = await (await import("../services/settings.service")).getSetting("placement.offer_validity_days");
    const offerExpiresAt = validityDays > 0 ? new Date(Date.now() + validityDays * 86400_000) : null;

    const result = await db.insert(placements).values({
      applicationId,
      country,
      salary: salary || null,
      startDate: startDate ? new Date(startDate) : null,
      appointmentLetterUrl: appointmentLetterUrl || null,
      status: "offered",
      offerExpiresAt,
    }).returning();

    // PWS §8: audit placement lifecycle (v0.4.17 — was missing before)
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "placement", entityId: result[0].id, action: "create",
        toState: "offered",
        ipAddress: req.ip,
        extra: { applicationId, country, salary: salary || null },
      });
    } catch (e: any) { logger.warn(`audit on placement create failed: ${e?.message}`); }

    // Notify candidate
    const candRows = await db.select().from(candidates).where(eq(candidates.id, guard.app.candidateId!)).limit(1);
    if (candRows.length && candRows[0].userId) {
      notify({
        userId: candRows[0].userId,
        type: "application_update",
        title: "Placement Offer Received!",
        message: `You have received a placement offer for "${guard.job.title}" in ${country}. Please review and accept/decline.`,
        metadata: { placementId: result[0].id, applicationId },
      }).catch(() => {});
    }

    logger.info(`Placement created: ${result[0].id} for application ${applicationId} by ${user.role} ${user.id}`);
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── Get Placement Detail ────────────────────────────────────────────
// v0.4.17: ownership-gated. Before this fix anyone with a placement id
// could read salary, country, and appointment-letter URL. Three valid
// readers: the placed candidate, the job's owning agent/employer
// (direct or via parent requisition), and admin/superadmin.
router.get("/placements/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (!user) return res.status(401).json({ success: false, error: { code: 401, message: "Authentication required" } });

    const rows = await db.select().from(placements).where(eq(placements.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Placement not found" } });

    const isAdmin = user.role === "admin" || user.role === "superadmin";
    if (!isAdmin) {
      // Resolve the application + job + candidate so we can compare ids.
      const [row] = await db
        .select({
          appId: applications.id,
          candUserId: candidates.userId,
          agentId: jobs.agentId,
          employerId: jobs.employerId,
          parentRequisitionId: jobs.parentRequisitionId,
        })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(eq(applications.id, rows[0].applicationId))
        .limit(1);

      const isCandidateOwner = !!row && row.candUserId === user.id;
      const isAgentOwner = !!row && user.role === "agent" && row.agentId === user.id;
      let isEmployerOwner = !!row && user.role === "employer" && row.employerId === user.id;
      // Employer also owns derivative jobs via parent requisition (FRS §2.2)
      if (!isEmployerOwner && row && user.role === "employer" && row.parentRequisitionId) {
        const [parent] = await db.select({ employerId: jobs.employerId }).from(jobs)
          .where(eq(jobs.id, row.parentRequisitionId)).limit(1);
        isEmployerOwner = !!parent && parent.employerId === user.id;
      }

      if (!isCandidateOwner && !isAgentOwner && !isEmployerOwner) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
      }
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── Candidate: Accept Placement ─────────────────────────────────────
router.patch("/placements/:id/accept", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(placements).where(eq(placements.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Placement not found" } });

    // Ownership: only the placed candidate (or admin) can accept
    const user = req.user as any;
    if (user.role !== "admin" && user.role !== "superadmin") {
      const appRows = await db.select().from(applications).where(eq(applications.id, rows[0].applicationId)).limit(1);
      if (appRows.length > 0) {
        const candRows = await db.select().from(candidates).where(eq(candidates.id, appRows[0].candidateId!)).limit(1);
        if (!candRows.length || candRows[0].userId !== user.id) {
          return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
        }
      }
    }

    if (rows[0].status !== "offered") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Can only accept an offered placement" } });
    }

    // audit 2026-07-06 (Batch 4B): compliance gates on accept. Admins bypass
    // both (supervisory override — e.g. letter handed over on paper).
    const isSupervisor = user.role === "admin" || user.role === "superadmin";
    if (!isSupervisor) {
      const { getSetting } = await import("../services/settings.service");
      // (a) No accept without the appointment letter on file.
      const requireLetter: boolean = await getSetting("placement.require_letter_to_accept");
      if (requireLetter && !rows[0].appointmentLetterUrl) {
        return res.status(400).json({ success: false, error: { code: 400, message: "This offer cannot be accepted yet — the appointment letter has not been uploaded. Please ask HPSEDC to attach it first." } });
      }
      // (b) No accept past the offer's validity deadline.
      if (rows[0].offerExpiresAt && new Date() > new Date(rows[0].offerExpiresAt)) {
        return res.status(400).json({ success: false, error: { code: 400, message: `This offer expired on ${new Date(rows[0].offerExpiresAt).toLocaleDateString("en-IN")} and can no longer be accepted. Please contact HPSEDC if you still want this placement.` } });
      }
    }

    const result = await db.update(placements)
      .set({ status: "accepted", candidateResponse: "accepted" })
      .where(eq(placements.id, req.params.id))
      .returning();

    await db.update(applications).set({ status: "placed" as any }).where(eq(applications.id, rows[0].applicationId));

    // v0.4.17: audit placement lifecycle (PWS §8)
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "placement", entityId: req.params.id, action: "accept",
        fromState: "offered", toState: "accepted",
        ipAddress: req.ip,
        extra: { applicationId: rows[0].applicationId },
      });
    } catch (e: any) { logger.warn(`audit on placement accept failed: ${e?.message}`); }

    // readiness 2026-07-07: accepting the offer can be the last gate — announce
    // the one-time "cleared for deployment" if everything else was already done.
    maybeNotifyDeploymentReady(db, req.params.id).catch(() => {});

    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── Candidate: Decline Placement ────────────────────────────────────
router.patch("/placements/:id/decline", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { reason } = req.body;
    const rows = await db.select().from(placements).where(eq(placements.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Placement not found" } });

    // Ownership: only the placed candidate (or admin) can decline
    const user = req.user as any;
    if (user.role !== "admin" && user.role !== "superadmin") {
      const appRows = await db.select().from(applications).where(eq(applications.id, rows[0].applicationId)).limit(1);
      if (appRows.length > 0) {
        const candRows = await db.select().from(candidates).where(eq(candidates.id, appRows[0].candidateId!)).limit(1);
        if (!candRows.length || candRows[0].userId !== user.id) {
          return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
        }
      }
    }

    if (rows[0].status !== "offered") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Can only decline an offered placement" } });
    }

    const result = await db.update(placements)
      .set({ status: "declined", candidateResponse: "declined", declineReason: reason || null })
      .where(eq(placements.id, req.params.id))
      .returning();

    // v0.4.17: audit placement lifecycle (PWS §8)
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "placement", entityId: req.params.id, action: "decline",
        fromState: "offered", toState: "declined",
        reason: reason || undefined,
        ipAddress: req.ip,
        extra: { applicationId: rows[0].applicationId },
      });
    } catch (e: any) { logger.warn(`audit on placement decline failed: ${e?.message}`); }

    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── Staff: placement lifecycle tail (active → completed) ────────────
// audit 2026-07-06 (Batch 4B): after a candidate accepts, nothing ever moved
// the placement to 'active' (deployed/working) or 'completed' (contract done)
// even though welfare tracking + agent stats already read those states. Legal
// transitions: accepted → active → completed; anything else is rejected.
// Mounted under /api/v1/drives, same as the other placement endpoints.
router.patch("/placements/:id/lifecycle", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (!["agent", "admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only HPSEDC staff can update the placement lifecycle" } });
    }
    const nextStatus = String(req.body?.status ?? "");
    if (!["active", "completed"].includes(nextStatus)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "status must be \"active\" or \"completed\"" } });
    }

    // Resolve placement + owning job for the agent ownership check.
    const [row] = await db
      .select({ placement: placements, app: applications, job: jobs })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(placements.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ success: false, error: { code: 404, message: "Placement not found" } });

    const isSupervisor = user.role === "admin" || user.role === "superadmin";
    if (!isSupervisor && !(user.role === "agent" && row.job.agentId === user.id)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "You can only update placements on your own jobs" } });
    }

    // Transition validation: accepted → active → completed. (Applications show
    // 'placed' after accept; the placement row itself is 'accepted'.)
    const from = row.placement.status ?? "offered";
    const legal: Record<string, string[]> = { active: ["accepted"], completed: ["active"] };
    if (!legal[nextStatus].includes(from)) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `Cannot move a '${from}' placement to '${nextStatus}'. Legal order: accepted → active → completed.` },
      });
    }

    const [updated] = await db.update(placements)
      .set({ status: nextStatus })
      .where(eq(placements.id, req.params.id))
      .returning();

    // PWS §8: audit the lifecycle transition like the other placement moves.
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "placement", entityId: req.params.id, action: "status_change",
        fromState: from, toState: nextStatus,
        ipAddress: req.ip,
        extra: { applicationId: row.placement.applicationId },
      });
    } catch (e: any) { logger.warn(`audit on placement lifecycle failed: ${e?.message}`); }

    // Tell the candidate their placement moved (best-effort).
    const [cand] = await db.select().from(candidates).where(eq(candidates.id, row.app.candidateId!)).limit(1);
    if (cand?.userId) {
      notify({
        userId: cand.userId,
        type: "application_update",
        title: nextStatus === "active" ? "Placement is now active" : "Placement completed",
        message: nextStatus === "active"
          ? `Your placement for "${row.job.title}" in ${row.placement.country} is now active. HPSEDC will follow up with welfare check-ins.`
          : `Your placement for "${row.job.title}" in ${row.placement.country} has been marked completed. Thank you — please share any feedback with HPSEDC.`,
        severity: "positive",
        metadata: { placementId: req.params.id, applicationId: row.placement.applicationId },
      }).catch(() => {});
    }

    // readiness 2026-07-07: lifecycle moves keep the placement in the offer-
    // accepted family — re-check so a never-announced placement still gets its
    // one-time "cleared for deployment" (best-effort).
    maybeNotifyDeploymentReady(db, req.params.id).catch(() => {});

    logger.info(`Placement ${req.params.id} lifecycle ${from} → ${nextStatus} by ${user.role} ${user.id}`);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// ── Candidate: register for / cancel an approved drive ──────────────
router.post("/:id/register", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    if (user.role !== "candidate") return res.status(403).json({ success: false, error: { code: 403, message: "Only candidates can register for drives." } });
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!drive) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });
    if (drive.status !== "approved") return res.status(400).json({ success: false, error: { code: 400, message: "This drive is not open for registration yet." } });
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : null;

    const [existing] = await db.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, drive.id), eq(driveRegistrations.userId, user.id))).limit(1);
    let reg;
    if (existing) {
      [reg] = await db.update(driveRegistrations).set({ status: "registered", note }).where(eq(driveRegistrations.id, existing.id)).returning();
    } else {
      [reg] = await db.insert(driveRegistrations).values({ driveId: drive.id, userId: user.id, status: "registered", note }).returning();
    }
    // Notify the owning agency.
    const [agency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, drive.agencyId)).limit(1);
    if (agency?.userId) {
      const [cand] = await db.select({ name: candidates.fullName }).from(candidates).where(eq(candidates.userId, user.id)).limit(1);
      notify({ userId: agency.userId, type: "system", title: `New drive registration: ${drive.title.slice(0, 60)}`, message: `${cand?.name || "A candidate"} registered for your recruitment drive.`, metadata: { driveId: drive.id } }).catch(() => {});
    }
    res.status(201).json({ success: true, data: reg });
  } catch (error) { next(error); }
});

router.post("/:id/unregister", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    await db.update(driveRegistrations).set({ status: "cancelled" })
      .where(and(eq(driveRegistrations.driveId, req.params.id), eq(driveRegistrations.userId, user.id)));
    res.json({ success: true });
  } catch (error) { next(error); }
});

// ── Agency owner / admin: registrant list for a drive ───────────────
router.get("/:id/registrations", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, req.params.id)).limit(1);
    if (!drive) return res.status(404).json({ success: false, error: { code: 404, message: "Drive not found" } });
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!isAdmin && (!myAgency || myAgency.id !== drive.agencyId)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not your drive" } });
    }
    const regs = await db.select().from(driveRegistrations)
      .where(and(eq(driveRegistrations.driveId, drive.id), ne(driveRegistrations.status, "cancelled")))
      .orderBy(driveRegistrations.createdAt);
    const uids: string[] = regs.map((r: any) => String(r.userId));
    const candMap: Record<string, any> = {};
    if (uids.length) {
      const cs = await db.select({ userId: candidates.userId, name: candidates.fullName, location: candidates.location, phone: candidates.phone, photoUrl: candidates.photoUrl })
        .from(candidates).where(inArray(candidates.userId, uids));
      for (const c of cs) candMap[c.userId!] = c;
    }
    res.json({ success: true, data: regs.map((r: any) => ({ ...r, candidate: candMap[r.userId] || null })) });
  } catch (error) { next(error); }
});

// ── Agency owner / admin: act on a registrant (invite / mark attended) ─
// Drives the job-fair lifecycle: registered → invited → attended.
router.patch("/registrations/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    const [reg] = await db.select().from(driveRegistrations).where(eq(driveRegistrations.id, req.params.id)).limit(1);
    if (!reg) return res.status(404).json({ success: false, error: { code: 404, message: "Registration not found" } });
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, reg.driveId)).limit(1);
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!isAdmin && (!drive || !myAgency || myAgency.id !== drive.agencyId)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not your drive" } });
    }
    const status = String(req.body?.status ?? "");
    if (!["registered", "invited", "attended", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "status must be: invited, attended, registered, cancelled" } });
    }
    const [updated] = await db.update(driveRegistrations).set({ status }).where(eq(driveRegistrations.id, reg.id)).returning();
    // Tell the candidate when they're invited to attend.
    if (status === "invited" && drive) {
      const when = new Date(drive.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      notify({
        userId: reg.userId, type: "system",
        title: `You're invited to a recruitment drive`,
        message: `Please attend "${drive.title}" on ${when} at ${drive.location}. Bring your documents.`,
        metadata: { driveId: drive.id },
      }).catch(() => {});
    }
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
});

// ── Agency: schedule an on-the-spot interview for a drive registrant ──
// The walk-in flow: a registrant who may not have applied yet gets an interview
// against one of the agency's jobs. Creates (or reuses) the application so the
// candidate flows into the normal pipeline → selection → placement.
router.post("/:driveId/registrations/:regId/schedule-interview", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    const { jobId, scheduledAt, location, mode, interviewerName } = req.body;
    if (!jobId || !scheduledAt) return res.status(400).json({ success: false, error: { code: 400, message: "jobId and scheduledAt are required" } });

    const [reg] = await db.select().from(driveRegistrations).where(and(eq(driveRegistrations.id, req.params.regId), eq(driveRegistrations.driveId, req.params.driveId))).limit(1);
    if (!reg) return res.status(404).json({ success: false, error: { code: 404, message: "Registration not found" } });
    const [drive] = await db.select().from(recruitmentDrives).where(eq(recruitmentDrives.id, reg.driveId)).limit(1);
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const [myAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
    if (!isAdmin && (!drive || !myAgency || myAgency.id !== drive.agencyId)) return res.status(403).json({ success: false, error: { code: 403, message: "Not your drive" } });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    if (!isAdmin && job.agentId !== user.id) return res.status(403).json({ success: false, error: { code: 403, message: "You can only schedule interviews for your own job postings." } });

    const [cand] = await db.select().from(candidates).where(eq(candidates.userId, reg.userId)).limit(1);
    if (!cand) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    // Reuse an existing application for this (candidate, job), else create one.
    let app = (await db.select().from(applications).where(and(eq(applications.candidateId, cand.id), eq(applications.jobId, jobId))).limit(1))[0];
    if (!app) {
      [app] = await db.insert(applications).values({ candidateId: cand.id, jobId, status: "interview_scheduled", matchScore: 0 }).returning();
    } else {
      await db.update(applications).set({ status: "interview_scheduled" }).where(eq(applications.id, app.id));
    }
    const [iv] = await db.insert(interviews).values({
      driveId: drive!.id, applicationId: app.id, scheduledAt: new Date(scheduledAt),
      location: location || drive!.location, mode: mode || "in_person",
      interviewerName: interviewerName ? String(interviewerName).slice(0, 200) : null, conductedBy: user.id,
    }).returning();
    await db.update(driveRegistrations).set({ status: "attended" }).where(eq(driveRegistrations.id, reg.id));

    notify({
      userId: reg.userId, type: "application_update", title: "Interview scheduled at the drive",
      message: `Your interview for "${job.title}" is on ${new Date(scheduledAt).toLocaleDateString("en-IN")} at ${location || drive!.location}.`,
      metadata: { interviewId: iv.id, applicationId: app.id, jobId },
    }).catch(() => {});
    res.status(201).json({ success: true, data: iv });
  } catch (error) { next(error); }
});

export default router;
