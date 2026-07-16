import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { applications, candidates, jobs, interviews } from "@shared/schema";
import { eq, and, desc, inArray, ne } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { getSetting } from "../services/settings.service";

const router = Router();

const STATUS_ORDER = ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "placed"] as const;
function isBackward(from: string, to: string): boolean {
  const fi = STATUS_ORDER.indexOf(from as any);
  const ti = STATUS_ORDER.indexOf(to as any);
  return fi >= 0 && ti >= 0 && ti < fi;
}

// ── Single application status update (agent / admin / employer) ──────
router.patch("/:id/status", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (!["agent", "employer", "admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    const { status, reason, rejectionFeedback } = req.body ?? {};
    const validStatuses = ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Invalid status" } });
    }

    const [app] = await db.select().from(applications).where(eq(applications.id, req.params.id)).limit(1);
    if (!app) return res.status(404).json({ success: false, error: { code: 404, message: "Application not found" } });

    // ── IDOR guard — agent/employer must own the application's job ────
    // The bulk-status endpoint below filters by ownership; this single-
    // status path was missing the same check, so any agent could PATCH any
    // application's status by knowing its ID. Caught in the v0.4.4.0 self-
    // audit (Cat B7). admin/superadmin bypass; candidates are already
    // rejected by the role gate above.
    if (user.role === "agent" || user.role === "employer") {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId!)).limit(1);
      if (!job) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
      const ownsDirect = (user.role === "agent" && job.agentId === user.id)
        || (user.role === "employer" && job.employerId === user.id);
      // Employer also "owns" derivative jobs created off their requisition.
      let ownsViaParent = false;
      if (!ownsDirect && user.role === "employer" && job.parentRequisitionId) {
        const [parent] = await db.select({ employerId: jobs.employerId }).from(jobs)
          .where(eq(jobs.id, job.parentRequisitionId)).limit(1);
        ownsViaParent = !!parent && parent.employerId === user.id;
      }
      if (!ownsDirect && !ownsViaParent) {
        return res.status(403).json({
          success: false,
          error: { code: 403, message: "You can only update applications on your own jobs." },
        });
      }
    }

    // ── Consult runtime settings ──────────────────────────────────────
    const terminal: string[] = await getSetting("pipeline.terminal_states");
    const allowBackward: boolean = await getSetting("pipeline.allow_backward_transitions");
    const requireBackwardReason: boolean = await getSetting("pipeline.require_reason_on_backward");
    const requireRejectionReason: boolean = await getSetting("rejection.require_reason");
    const allowRevertReject: boolean = await getSetting("rejection.allow_revert");
    const autoNotify: boolean = await getSetting("notifications.auto_on_status_change");

    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const fromStatus = app.status || "submitted";

    // Terminal-state lock: regular agents cannot mutate
    if (terminal.includes(fromStatus) && !isAdmin) {
      return res.status(403).json({ success: false, error: { code: 403, message: `Status "${fromStatus}" is terminal. Ask an admin to change it.` } });
    }

    // Backward transition gate
    if (!isAdmin && isBackward(fromStatus, status) && !allowBackward) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Backward status changes are disabled. Contact an admin." } });
    }
    if (isBackward(fromStatus, status) && requireBackwardReason && !reason?.trim()) {
      return res.status(400).json({ success: false, error: { code: 400, message: "A reason is required when moving a status backward." } });
    }

    // Un-reject gate
    if (fromStatus === "rejected" && status !== "rejected" && !allowRevertReject && !isAdmin) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Reverting a rejection is disabled in system settings." } });
    }

    // Rejection-reason gate
    if (status === "rejected" && requireRejectionReason && !rejectionFeedback?.trim()) {
      return res.status(400).json({ success: false, error: { code: 400, message: "A rejection reason / feedback is required." } });
    }

    const updates: any = { status };
    if (rejectionFeedback !== undefined) updates.rejectionFeedback = rejectionFeedback || null;
    const [updated] = await db.update(applications).set(updates).where(eq(applications.id, app.id)).returning();

    // v0.4.14: auto-create a placement row when transitioning to selected.
    // Without this the employer's "issue offer from Placements tab" CTA
    // pointed nowhere — see PlacementAutoCreate service header for the
    // UAT context. Idempotent; safe even if a row already exists.
    if (status === "selected") {
      try {
        const { ensurePlacementForApplication } = await import("../services/placement-autocreate.service");
        await ensurePlacementForApplication(app.id);
      } catch (e: any) { logger.warn(`placement auto-create on status change failed: ${e?.message}`); }
    }

    // PWS §8: audit every application state transition
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "application", entityId: app.id, action: "status_change",
        fromState: fromStatus, toState: status,
        reason: reason || rejectionFeedback,
        ipAddress: req.ip,
      });
    } catch (e: any) { logger.warn(`audit on status change failed: ${e?.message}`); }

    // PWS §5: fire the matching pipeline event through the notification engine
    // so candidate/agent/employer all get the right wording per their role.
    // The engine is the single source of truth for notifications on status
    // changes; the legacy per-status notify() call is gone so candidates don't
    // get two rows per transition (one generic "Application Update" + one
    // templated event).
    const eventKey =
      status === "reviewed"            ? "application.reviewed"
    : status === "shortlisted"         ? "application.shortlisted"
    : status === "interview_scheduled" ? "interview.scheduled"
    : status === "selected"            ? "application.selected"
    : status === "rejected" && user.role === "employer" ? "application.employer_rejected"
    : status === "rejected"            ? "application.rejected"
    : null;

    let fired = false;
    if (autoNotify && eventKey) {
      try {
        const { fireEvent, resolveParticipantsFromApplication } = await import("../services/event-notifications.service");
        const ctx = await resolveParticipantsFromApplication(app.id);
        ctx.actorUserId = user.id;
        ctx.actorRole = user.role;
        await fireEvent(eventKey as any, ctx);
        fired = true;
      } catch (e: any) { logger.warn(`fireEvent on status change failed: ${e?.message}`); }
    }

    // Fallback only if the engine didn't fire (unmapped status, missing
    // template, or autoNotify disabled by admin). Keeps the candidate informed
    // even when the template layer is misconfigured.
    if (autoNotify && !fired && app.candidateId && app.jobId) {
      const [cand] = await db.select().from(candidates).where(eq(candidates.id, app.candidateId)).limit(1);
      const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId)).limit(1);
      if (cand?.userId && job) {
        const labels: Record<string, string> = {
          reviewed: "Your application has been reviewed",
          shortlisted: "You've been shortlisted",
          interview_scheduled: "An interview has been scheduled",
          selected: "You've been selected",
          rejected: "Your application was not selected this time",
        };
        const severity =
          status === "selected" || status === "shortlisted" || status === "interview_scheduled" ? "positive"
        : status === "rejected" ? "warning"
        : "info";
        notify({
          userId: cand.userId, type: "application_update",
          title: `${labels[status] || status}`,
          message: `${labels[status] || status} for "${job.title}" at ${job.company}.`,
          severity: severity as any,
          metadata: { applicationId: app.id, jobId: app.jobId, newStatus: status },
        }).catch(() => {});
      }
    }

    logger.info(`Application ${app.id}: ${fromStatus} → ${status} by ${user.id}${reason ? ` (reason: ${reason})` : ""}`);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Bulk Status Update ──────────────────────────────────────────────
router.patch("/bulk-status", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userRole = (req.user as any)?.role;
    if (!["agent", "employer", "admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "ids must be a non-empty array" } });
    }

    if (ids.length > 50) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Maximum 50 applications per bulk update" } });
    }

    const validStatuses = ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` } });
    }

    // Ownership filter: agents/employers can only update applications on their own jobs
    const userId = (req.user as any)?.id;
    let ownedAppIds = ids;
    if (userRole === "agent" || userRole === "employer") {
      const ownedApps = await db
        .select({ appId: applications.id })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(and(
          inArray(applications.id, ids),
          userRole === "agent" ? eq(jobs.agentId, userId) : eq(jobs.employerId, userId)
        ));
      ownedAppIds = ownedApps.map((a: { appId: string }) => a.appId);
      if (ownedAppIds.length === 0) {
        return res.status(403).json({ success: false, error: { code: 403, message: "None of the specified applications belong to your jobs" } });
      }
    }

    const updated = await db
      .update(applications)
      .set({ status })
      .where(inArray(applications.id, ownedAppIds))
      .returning();

    // v0.4.14: bulk-select also needs placement auto-create. Same idempotent
    // helper as the single-status path.
    if (status === "selected" && updated.length > 0) {
      try {
        const { ensurePlacementForApplication } = await import("../services/placement-autocreate.service");
        await Promise.all(updated.map((u: any) => ensurePlacementForApplication(u.id)));
      } catch (e: any) { logger.warn(`bulk placement auto-create failed: ${e?.message}`); }
    }

    // v0.4.17: parity with the single-status path — fire the templated
    // pipeline event through the engine so candidates/agents/employers
    // all get the right role-specific wording. The legacy generic
    // notify() below stays as a fall-back when the engine can't fire
    // (unmapped status, missing template, autoNotify disabled).
    const eventKey =
      status === "reviewed"            ? "application.reviewed"
    : status === "shortlisted"         ? "application.shortlisted"
    : status === "interview_scheduled" ? "interview.scheduled"
    : status === "selected"            ? "application.selected"
    : status === "rejected"            ? "application.rejected"
    : null;

    const autoNotify: boolean = await getSetting("notifications.auto_on_status_change");
    const firedSet = new Set<string>();
    if (autoNotify && eventKey) {
      try {
        const { fireEvent, resolveParticipantsFromApplication } = await import("../services/event-notifications.service");
        await Promise.all(updated.map(async (app: any) => {
          try {
            const ctx = await resolveParticipantsFromApplication(app.id);
            ctx.actorUserId = userId;
            ctx.actorRole = userRole;
            await fireEvent(eventKey as any, ctx);
            firedSet.add(app.id);
          } catch (e: any) { logger.warn(`bulk fireEvent failed for ${app.id}: ${e?.message}`); }
        }));
      } catch (e: any) { logger.warn(`bulk fireEvent module load failed: ${e?.message}`); }
    }

    // Legacy fallback notification — only for rows the event engine
    // didn't fire on (unmapped status, missing template, etc.).
    const statusLabels: Record<string, string> = {
      reviewed: "Your application has been reviewed",
      shortlisted: "You've been shortlisted",
      interview_scheduled: "An interview has been scheduled",
      selected: "You've been selected",
      rejected: "Your application was not selected this time",
    };

    for (const app of updated) {
      if (firedSet.has(app.id)) continue;
      if (!app.candidateId || !app.jobId) continue;

      const candRows = await db.select().from(candidates).where(eq(candidates.id, app.candidateId)).limit(1);
      const jobRows = await db.select().from(jobs).where(eq(jobs.id, app.jobId)).limit(1);

      if (candRows.length > 0 && candRows[0].userId && jobRows.length > 0) {
        notify({
          userId: candRows[0].userId,
          type: "application_update",
          title: `Application Update: ${jobRows[0].title}`,
          message: `${statusLabels[status] || status} for "${jobRows[0].title}" at ${jobRows[0].company}.`,
          metadata: { applicationId: app.id, jobId: app.jobId, newStatus: status },
        }).catch(() => {});
      }
    }

    logger.info(`Bulk status update: ${updated.length} applications → ${status} (${firedSet.size} via event engine, ${updated.length - firedSet.size} via fallback)`);
    res.json({ success: true, data: { updated: updated.length, status } });
  } catch (error) {
    next(error);
  }
});

// ── Get Application Detail (with score breakdown) ───────────────────
router.get("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const result = await db
      .select({ application: applications, job: jobs, candidate: candidates })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .where(eq(applications.id, req.params.id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Application not found" } });
    }

    const row = result[0] as any;
    const app = row.application;
    const job = row.job;
    const candidate = row.candidate;

    // Ownership check: candidates see only their own, agents/employers only their jobs'
    const user = req.user as any;
    if (user.role === "candidate") {
      if (candidate.userId !== user.id) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Access denied" } });
      }
    } else if (user.role === "agent") {
      if (job.agentId !== user.id) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Access denied" } });
      }
    } else if (user.role === "employer") {
      if (job.employerId !== user.id) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Access denied" } });
      }
    }

    // v0.4.33 (Phase 3, Item 2): v2 7-factor breakdown via the shared
    // matching service so weights + policy + version come from settings.
    const { calculateMatchBreakdown } = await import("../services/matching.service");
    const breakdown = await calculateMatchBreakdown(candidate, job);

    res.json({
      success: true,
      data: {
        id: app.id,
        status: app.status,
        matchScore: app.matchScore,
        appliedAt: app.appliedAt,
        scoreBreakdown: breakdown,
        job: {
          id: job.id, title: job.title, company: job.company,
          location: job.location, country: job.country, salary: job.salary,
          skills: job.skills, experience: job.experience,
        },
        candidate: {
          id: candidate.id, fullName: candidate.fullName,
          email: candidate.email, skills: candidate.skills,
          experience: candidate.experience, location: candidate.location,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── Candidate Recommendations ───────────────────────────────────────
router.get("/recommendations/for-me", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    if ((req.user as any)?.role !== "candidate") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only candidates can get recommendations" } });
    }

    // Get candidate profile
    const candRows = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
    if (candRows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const candidate = candRows[0];

    // Get all active, PUBLIC jobs only. agents_only requisitions (employer
    // demand not yet picked up by an agency) must never be recommended to a
    // candidate — they can't apply to them ("Job not found or inactive").
    const activeJobs = await db.select().from(jobs)
      .where(and(eq(jobs.status, "active"), eq(jobs.visibility, "public")));

    // Get jobs candidate already applied to
    const appliedRows = await db
      .select({ jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.candidateId, candidate.id));
    const appliedJobIds = new Set(appliedRows.map((r: any) => r.jobId));

    // v0.4.33 (Phase 3, Item 2): score via the v2 7-factor matching service.
    // Threshold is the same `matching.recommendation_threshold_pct` setting
    // the v1 engine already honoured.
    const threshold: number = await getSetting("matching.recommendation_threshold_pct");
    const { calculateMatchBreakdown } = await import("../services/matching.service");
    // UAT-03 #13: never recommend a country this candidate was rejected for.
    // job.routes.ts already hides these from the listing; the recommendations
    // feed must match or the destination reappears on the most prominent surface.
    // Compared case-insensitively/trimmed to match the apply-time gate in
    // job.routes.ts — the feed must never offer a job the apply would refuse.
    const rejectedCountries = new Set<string>(
      (((candidate as any).rejectedCountries as string[]) || [])
        .filter(Boolean)
        .map((c) => c.trim().toLowerCase()),
    );
    const unapplied = activeJobs.filter(
      (job: any) => !appliedJobIds.has(job.id) && !rejectedCountries.has((job.country || "").trim().toLowerCase()),
    );
    const scoredAll = await Promise.all(unapplied.map(async (job: any) => {
      const bd = await calculateMatchBreakdown(candidate, job);
      return { ...job, matchScore: bd.total, scoreBreakdown: bd };
    }));
    const scored = scoredAll
      .filter((j: any) => j.matchScore >= threshold)
      .sort((a: any, b: any) => b.matchScore - a.matchScore)
      .slice(0, 10);

    res.json({ success: true, data: scored });
  } catch (error) {
    next(error);
  }
});

// v0.4.33 (Phase 3): the v1 inline scorer was retired. All scoring now
// flows through server/services/matching.service.ts so weights, policy,
// and version come from settings (matching.weights, matching.policy,
// matching.engine_version) and the admin Parameters Module can tune them
// at runtime.

// ── Record Interview Outcome ────────────────────────────────────────
// FRS §2.7 / §6: interviews can be conducted by agent or employer
// depending on the deployment. This endpoint replaces the confusing
// "Mark Selected" one-tap action with a deliberate pass/fail capture
// that also writes the interviews row (previously the table was being
// scheduled-into but never recorded against).
//
// On pass  → application transitions to "selected"
// On fail  → application transitions to "rejected" (notes → rejectionFeedback)
//
// Gated by the `interview.conducted_by` setting:
//   agent_only     → only agent (and admins) may record
//   employer_only  → only employer (and admins) may record
//   either         → agent OR employer (and admins) may record
router.post("/:id/interview-outcome", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const { result, notes, rating } = req.body ?? {};

    if (!["pass", "fail"].includes(result)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "result must be 'pass' or 'fail'" } });
    }
    if (rating !== undefined && rating !== null) {
      const n = Number(rating);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return res.status(400).json({ success: false, error: { code: 400, message: "rating must be an integer 1..5" } });
      }
    }

    const [app] = await db.select().from(applications).where(eq(applications.id, req.params.id)).limit(1);
    if (!app) return res.status(404).json({ success: false, error: { code: 404, message: "Application not found" } });
    if (app.status !== "interview_scheduled") {
      return res.status(400).json({ success: false, error: { code: 400, message: `Cannot record outcome — application is "${app.status}", not "interview_scheduled".` } });
    }

    const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId!)).limit(1);
    if (!job) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });

    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const conductedBy: string = await getSetting("interview.conducted_by");

    // Role gate per setting
    if (!isAdmin) {
      const ownsAsAgent = user.role === "agent" && job.agentId === user.id;
      // Employer "owns" the job directly, or via parent requisition for derivative jobs (FRS §2.2)
      let ownsAsEmployer = user.role === "employer" && job.employerId === user.id;
      if (!ownsAsEmployer && user.role === "employer" && job.parentRequisitionId) {
        const [parent] = await db.select({ employerId: jobs.employerId }).from(jobs)
          .where(eq(jobs.id, job.parentRequisitionId)).limit(1);
        ownsAsEmployer = !!parent && parent.employerId === user.id;
      }
      const allowAgent    = conductedBy === "agent_only"    || conductedBy === "either";
      const allowEmployer = conductedBy === "employer_only" || conductedBy === "either";
      const ok = (ownsAsAgent && allowAgent) || (ownsAsEmployer && allowEmployer);
      if (!ok) {
        return res.status(403).json({
          success: false,
          error: { code: 403, message: `Not authorized to record this interview outcome (policy: ${conductedBy}).` },
        });
      }
    }

    // Write interviews row — schema has notes/rating/result/conductedBy
    // already. scheduledAt is NOT NULL so back-fill with now() if missing.
    await db.insert(interviews).values({
      applicationId: app.id,
      scheduledAt: new Date(),
      result: result === "pass" ? "selected" : "rejected",
      notes: notes || null,
      rating: rating ? Number(rating) : null,
      conductedBy: user.id,
    });

    const newStatus = result === "pass" ? "selected" : "rejected";
    const updates: any = { status: newStatus };
    if (newStatus === "rejected" && notes) updates.rejectionFeedback = notes;
    const [updated] = await db.update(applications).set(updates).where(eq(applications.id, app.id)).returning();

    // v0.4.14: pass → selected also auto-creates a placement. Idempotent.
    if (newStatus === "selected") {
      try {
        const { ensurePlacementForApplication } = await import("../services/placement-autocreate.service");
        await ensurePlacementForApplication(app.id);
      } catch (e: any) { logger.warn(`placement auto-create on interview-outcome failed: ${e?.message}`); }
    }

    // Audit
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "application", entityId: app.id, action: "interview_outcome",
        fromState: "interview_scheduled", toState: newStatus,
        reason: notes,
        ipAddress: req.ip,
        extra: { result, rating: rating ?? null, policy: conductedBy },
      });
    } catch (e: any) { logger.warn(`audit on interview-outcome failed: ${e?.message}`); }

    // Fire notification event
    const autoNotify: boolean = await getSetting("notifications.auto_on_status_change");
    if (autoNotify) {
      try {
        const { fireEvent, resolveParticipantsFromApplication } = await import("../services/event-notifications.service");
        const ctx = await resolveParticipantsFromApplication(app.id);
        ctx.actorUserId = user.id;
        ctx.actorRole = user.role;
        const eventKey = newStatus === "selected" ? "application.selected"
                       : user.role === "employer" ? "application.employer_rejected"
                       : "application.rejected";
        await fireEvent(eventKey as any, ctx);
      } catch (e: any) { logger.warn(`fireEvent on interview-outcome failed: ${e?.message}`); }
    }

    logger.info(`Application ${app.id}: interview_scheduled → ${newStatus} (interview outcome by ${user.role} ${user.id})`);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Candidate Withdraw Application ──────────────────────────────────
router.post("/:id/withdraw", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (user.role !== "candidate") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only candidates can withdraw applications" } });
    }

    // Find the application
    const [app] = await db.select().from(applications).where(eq(applications.id, req.params.id)).limit(1);
    if (!app) return res.status(404).json({ success: false, error: { code: 404, message: "Application not found" } });

    // Verify ownership: candidate must own this application
    if (app.candidateId) {
      const [cand] = await db.select().from(candidates).where(eq(candidates.id, app.candidateId)).limit(1);
      if (!cand || cand.userId !== user.id) {
        return res.status(403).json({ success: false, error: { code: 403, message: "You can only withdraw your own applications" } });
      }
    }

    // Don't allow withdraw on terminal states
    const terminalStatuses = ["rejected", "withdrawn", "completed", "placed"];
    if (terminalStatuses.includes(app.status || "")) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Cannot withdraw an application with status "${app.status}"` } });
    }

    const [updated] = await db.update(applications).set({ status: "withdrawn" }).where(eq(applications.id, app.id)).returning();

    // Audit log
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "application", entityId: app.id, action: "status_change",
        fromState: app.status || "submitted", toState: "withdrawn",
        reason: "Candidate withdrew application",
        ipAddress: req.ip,
      });
    } catch (e: any) { logger.warn(`audit on withdraw failed: ${e?.message}`); }

    logger.info(`Application ${app.id} withdrawn by candidate ${user.id}`);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

export default router;
