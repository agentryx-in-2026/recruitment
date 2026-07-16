import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/rbac.middleware";
import { storage } from "../storage";
import { grievances, grievanceComments, users } from "@shared/schema";
import { eq, and, desc, count, ne } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { logger } from "../config/logger.config";
import { autoRouteGrievance, slaDaysForCategory } from "../services/grievance-router.service";
import { logTransition } from "../services/audit-transitions.service";

const router = Router();

// admin + superadmin both get the god-view of grievances. Used in every
// list/edit endpoint below.
const ADMIN_ROLES = ["admin", "superadmin"];

// audit 2026-07-06 (Batch 4B-2): computed SLA/aging fields for list responses
// so every grievance list can render an "overdue" badge without a second
// round-trip. `overdue` = SLA already breached (cron-stamped) OR an active
// grievance older than its per-category SLA; resolved grievances never flag.
async function withSlaInfo(rows: any[]): Promise<any[]> {
  const slaByCategory = new Map<string, number>();
  const now = Date.now();
  const out: any[] = [];
  for (const r of rows) {
    let slaDays = slaByCategory.get(r.category);
    if (slaDays === undefined) {
      slaDays = await slaDaysForCategory(r.category).catch(() => 7);
      slaByCategory.set(r.category, slaDays);
    }
    const ageDays = r.createdAt ? Math.floor((now - new Date(r.createdAt).getTime()) / 86_400_000) : 0;
    const active = r.status !== "resolved";
    out.push({
      ...r,
      slaDays,
      ageDays,
      overdue: !!r.slaBreachedAt || (active && ageDays > slaDays),
    });
  }
  return out;
}

// ── Submit Grievance (candidate or agent) ───────────────────────────
router.post("/", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const category = String(req.body?.category ?? "");
    const subject = String(req.body?.subject ?? "").trim();
    const description = String(req.body?.description ?? "").trim();

    // Single-agency (HPSEDC) reframe 2026-07-07: "agency_complaint" made sense in
    // the multi-agency marketplace but not when HPSEDC is the sole super-agency.
    // Replaced in the UI by "recruitment_problem" (issue with the recruitment/
    // placement process) and "workplace_abuse" (deployed-worker abuse: unpaid
    // wages, passport held, unsafe conditions). Legacy "agency_complaint" stays
    // accepted so historical rows and in-flight clients don't break.
    const validCategories = ["fraud_report", "recruitment_problem", "workplace_abuse", "application_issue", "technical_problem", "policy_inquiry", "other", "agency_complaint"];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ success: false, error: { code: 400, message: `category must be: ${validCategories.join(", ")}` } });
    }
    if (subject.length < 3 || subject.length > 200) {
      return res.status(400).json({ success: false, error: { code: 400, message: "subject must be 3–200 characters" } });
    }
    if (description.length < 10 || description.length > 3000) {
      return res.status(400).json({ success: false, error: { code: 400, message: "description must be 10–3000 characters" } });
    }

    // Structured context — drives the auto-router + the admin watchlist.
    // applicationId is REQUIRED for application_issue auto-routing to the
    // agent; jobId/agencyId let the fraud watchlist show the offending
    // record inline; reason/url are free-text breadcrumbs.
    const metadata: Record<string, any> = {};
    const rawMeta = req.body?.metadata;
    if (rawMeta && typeof rawMeta === "object") {
      if (typeof rawMeta.applicationId === "string") metadata.applicationId = rawMeta.applicationId;
      if (typeof rawMeta.jobId === "string") metadata.jobId = rawMeta.jobId;
      if (typeof rawMeta.agencyId === "string") metadata.agencyId = rawMeta.agencyId;
      if (typeof rawMeta.reason === "string") metadata.reason = rawMeta.reason.slice(0, 60);
      if (typeof rawMeta.url === "string") metadata.url = rawMeta.url.slice(0, 400);
    }

    // Auto-routing — pick an owner based on category + metadata. Keeps the
    // "where does this go" decision in one place (grievance-router.service)
    // instead of leaving everything in the admin's queue. Returns null when
    // we can't pick a specific user (then the admin queue picks it up).
    const route = await autoRouteGrievance(category as any, metadata);

    // Every grievance must have a concrete owner so the complainant has someone
    // to converse with. If the auto-router can't pick a specific user, fall back
    // to an admin (HPSEDC staff) instead of leaving it ownerless.
    let ownerId = route.assignedToUserId;
    if (!ownerId) {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      ownerId = admin?.id ?? null;
    }

    const result = await db.insert(grievances).values({
      userId: user.id,
      category,
      subject,
      description,
      status: "submitted",
      assignedTo: ownerId,
      adminNotes: route.reason,   // stamps the routing decision so any operator can see why
      metadata,
    }).returning();
    const grievance = result[0];

    // Audit-log the create + the auto-route as a single transition so the
    // who/why is recoverable later.
    logTransition({
      actorUserId: user.id,
      actorRole: user.role,
      entityType: "grievance",
      entityId: grievance.id,
      action: "create",
      fromState: null,
      toState: "submitted",
      reason: `category=${category}; ${route.reason}`,
      ipAddress: req.ip,
    }).catch(() => {});

    // Notify the owner (if any) so they don't have to refresh the dashboard
    // to discover new work. Falls back gracefully — fire-and-forget.
    if (ownerId) {
      const slaDays = await slaDaysForCategory(category).catch(() => 7);
      notify({
        userId: ownerId,
        type: "system",
        title: `New grievance assigned: ${subject.slice(0, 80)}`,
        message: `Category: ${category}. ${route.reason}. SLA target: ${slaDays} day${slaDays === 1 ? "" : "s"}.`,
        metadata: { grievanceId: grievance.id, category, slaDays },
      }).catch(() => {});
    }

    logger.info(`Grievance ${grievance.id} (${category}) → ${route.assignedToUserId || "admin queue"}`);
    res.status(201).json({ success: true, data: grievance });
  } catch (error) {
    next(error);
  }
});

// ── Grievances assigned to me (any role — agent / tech-owner / etc.) ────
// Lets a non-admin user see grievances they need to action. Agents will see
// application_issue grievances on jobs they own; the technical-owner user
// will see all technical_problem grievances; etc.
router.get("/assigned-to-me", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(grievances)
      .where(eq(grievances.assignedTo, (req.user as any).id))
      .orderBy(desc(grievances.createdAt));

    res.json({ success: true, data: await withSlaInfo(rows) });
  } catch (error) {
    next(error);
  }
});

// ── My Grievances ───────────────────────────────────────────────────
router.get("/my", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(grievances)
      .where(eq(grievances.userId, (req.user as any).id))
      .orderBy(desc(grievances.createdAt));

    res.json({ success: true, data: await withSlaInfo(rows) });
  } catch (error) {
    next(error);
  }
});

// ── Admin / Superadmin: List All Grievances ─────────────────────────
// Superadmin gets the god-view (same data as admin). Both roles see every
// grievance regardless of assignment; filters narrow the view.
router.get("/", protect, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { status, category, assigned } = req.query;
    const conditions: any[] = [];
    if (status && typeof status === "string") conditions.push(eq(grievances.status, status));
    if (category && typeof category === "string") conditions.push(eq(grievances.category, category));
    // ?assigned=unassigned filters to the admin-queue bucket; ?assigned=me
    // (in the future) could narrow to "things I personally own"; ?assigned=
    // any other user_id matches that owner exactly.
    if (assigned === "unassigned") {
      const { isNull } = await import("drizzle-orm");
      conditions.push(isNull(grievances.assignedTo));
    } else if (typeof assigned === "string" && assigned !== "all") {
      conditions.push(eq(grievances.assignedTo, assigned));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(grievances).where(whereClause).orderBy(desc(grievances.createdAt));

    // Hydrate with submitter + owner (username + role) so the admin UI can
    // render "Assigned to: priya_verma (candidate)" without a second round-trip.
    const userIds = new Set<string>();
    for (const r of rows) {
      if (r.userId) userIds.add(r.userId);
      if (r.assignedTo) userIds.add(r.assignedTo);
    }
    const userMap: Record<string, { username: string; role: string }> = {};
    if (userIds.size > 0) {
      const { inArray } = await import("drizzle-orm");
      const ur = await db.select({ id: users.id, username: users.username, role: users.role })
        .from(users).where(inArray(users.id, Array.from(userIds)));
      for (const u of ur) userMap[u.id] = { username: u.username, role: u.role };
    }
    const enriched = rows.map((r: any) => ({
      ...r,
      submitter: r.userId ? userMap[r.userId] : null,
      owner: r.assignedTo ? userMap[r.assignedTo] : null,
    }));

    res.json({ success: true, data: await withSlaInfo(enriched) });
  } catch (error) {
    next(error);
  }
});

// ── Admin: Get Single Grievance ─────────────────────────────────────
router.get("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(grievances).where(eq(grievances.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Grievance not found" } });

    // User can only see their own, admin can see all
    const user = req.user as any;
    if (user.role !== "admin" && user.role !== "superadmin" && rows[0].userId !== user.id) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── Update Grievance (status, notes, reassign, resolve) ─────────────
// Admin / superadmin always; otherwise the assigned owner (so the agent
// who owns an application_issue grievance, or the technical owner, can
// act on it without admin-roundtrip).
router.patch("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(grievances).where(eq(grievances.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Grievance not found" } });
    const grievance = rows[0];

    const user = req.user as any;
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    const isOwner = grievance.assignedTo === user.id;
    const isComplainant = grievance.userId === user.id;
    const isStaff = isAdmin || isOwner;
    if (!isStaff && !isComplainant) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to update this grievance." } });
    }

    const { status, adminNotes, resolutionNotes, assignedTo } = req.body;
    const updates: any = {};
    const fromStatus = grievance.status || "submitted";

    if (status) {
      const validStatuses = ["submitted", "under_review", "action_taken", "resolved", "escalated"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: { code: 400, message: `status must be: ${validStatuses.join(", ")}` } });
      }
      // The COMPLAINANT closes the loop: they can CLOSE (resolve) their own
      // grievance at any active stage — confirming a fix, or simply withdrawing
      // it — and can reopen it after HPSEDC has acted.
      if (!isStaff) {
        const canClose = status === "resolved" && grievance.status !== "resolved";
        const canReopen = status === "under_review" && grievance.status === "action_taken";
        if (!canClose && !canReopen) {
          return res.status(403).json({ success: false, error: { code: 403, message: "You can close your grievance, or reopen it after HPSEDC has acted." } });
        }
      } else if (status === "resolved") {
        // Staff drive the work but don't self-resolve — the complainant confirms.
        return res.status(403).json({ success: false, error: { code: 403, message: "Resolution is confirmed by the complainant. Mark it 'Action Taken' and they'll close it." } });
      }
      updates.status = status;
      if (status === "resolved") updates.resolvedAt = new Date();
      // When staff first moves it to under_review, stamp them as the owner.
      if (status === "under_review" && isStaff && !grievance.assignedTo) updates.assignedTo = user.id;
    }
    // Notes + reassignment are staff-only.
    if (adminNotes !== undefined && isStaff) updates.adminNotes = adminNotes;
    if (resolutionNotes !== undefined && isStaff) updates.resolutionNotes = resolutionNotes;
    // Reassignment — admin/superadmin only. Pass assignedTo:null to push back
    // to the admin queue. Validate the target user exists.
    let reassignedFrom: string | null = null;
    if (assignedTo !== undefined && isAdmin) {
      if (assignedTo === null || assignedTo === "") {
        updates.assignedTo = null;
        reassignedFrom = grievance.assignedTo;
      } else if (typeof assignedTo === "string") {
        const [u] = await db.select().from(users).where(eq(users.id, assignedTo)).limit(1);
        if (!u) return res.status(400).json({ success: false, error: { code: 400, message: "assignedTo user_id does not exist" } });
        updates.assignedTo = u.id;
        reassignedFrom = grievance.assignedTo;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No updatable fields supplied" } });
    }

    const result = await db.update(grievances).set(updates).where(eq(grievances.id, req.params.id)).returning();
    const updated = result[0];

    // Audit-log: status change is the most useful row to capture. Reassign is
    // tracked too so an admin can see the chain of ownership later.
    if (status && status !== fromStatus) {
      logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "grievance", entityId: grievance.id, action: "status_change",
        fromState: fromStatus, toState: status,
        reason: resolutionNotes || adminNotes,
        ipAddress: req.ip,
      }).catch(() => {});
    }
    if (reassignedFrom !== null || (assignedTo !== undefined && isAdmin)) {
      logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "grievance", entityId: grievance.id, action: "reassigned",
        fromState: reassignedFrom || "(unassigned)",
        toState: updates.assignedTo || "(unassigned)",
        ipAddress: req.ip,
      }).catch(() => {});
    }

    // Notify the OTHER party on status change. Staff acting → tell the
    // complainant; complainant acting (resolve/reopen) → tell the owner/admins.
    if (status && status !== fromStatus) {
      if (isStaff) {
        notify({
          userId: grievance.userId,
          type: "system",
          title: `Grievance Update: ${grievance.subject}`,
          message: status === "action_taken"
            ? `HPSEDC has acted on your grievance — please review and confirm if it's resolved.${resolutionNotes ? ' Note: ' + resolutionNotes : ''}`
            : `Your grievance status is now "${status.replace(/_/g, " ")}".`,
          metadata: { grievanceId: grievance.id },
        }).catch(() => {});
      } else {
        const recipients = grievance.assignedTo
          ? [grievance.assignedTo]
          : (await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"))).map((u: any) => u.id);
        for (const rid of recipients) {
          notify({
            userId: rid, type: "system",
            title: status === "resolved" ? `Grievance resolved by complainant: ${grievance.subject.slice(0, 60)}` : `Grievance reopened: ${grievance.subject.slice(0, 60)}`,
            message: status === "resolved" ? "The complainant confirmed the issue is resolved." : "The complainant reopened the grievance — it needs another look.",
            metadata: { grievanceId: grievance.id },
          }).catch(() => {});
        }
      }
    }
    if (updates.assignedTo && updates.assignedTo !== grievance.assignedTo) {
      notify({
        userId: updates.assignedTo,
        type: "system",
        title: `Grievance assigned to you: ${grievance.subject.slice(0, 80)}`,
        message: `Reassigned by ${user.username || user.role}. Category: ${grievance.category}.`,
        metadata: { grievanceId: grievance.id, category: grievance.category },
      }).catch(() => {});
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// ── Grievance discussion thread (two-way: complainant ⇄ owner/admin) ─
// Access: the complainant, the assigned owner, or any admin/superadmin.
type ThreadCtx =
  | { ok: false; code: 404 | 403 }
  | { ok: true; g: any; isComplainant: boolean; isStaff: boolean };
async function loadThreadCtx(db: any, id: string, user: any): Promise<ThreadCtx> {
  const rows = await db.select().from(grievances).where(eq(grievances.id, id)).limit(1);
  if (!rows.length) return { ok: false, code: 404 };
  const g = rows[0];
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const isOwner = g.assignedTo === user.id;
  const isComplainant = g.userId === user.id;
  if (!isAdmin && !isOwner && !isComplainant) return { ok: false, code: 403 };
  return { ok: true, g, isComplainant, isStaff: isAdmin || isOwner };
}
const threadDeny = (res: any, code: 404 | 403) =>
  res.status(code).json({ success: false, error: { code, message: code === 404 ? "Grievance not found" : "Not authorized" } });

router.get("/:id/comments", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const ctx = await loadThreadCtx(db, req.params.id, req.user);
    if (!ctx.ok) return threadDeny(res, ctx.code);

    const rows = await db.select().from(grievanceComments)
      .where(eq(grievanceComments.grievanceId, req.params.id))
      .orderBy(grievanceComments.createdAt);
    // Enrich with author username; complainant never sees internal staff notes.
    const visible = (ctx.isStaff ? rows : rows.filter((c: any) => !c.internal)) as any[];
    const ids: string[] = Array.from(new Set(visible.map((c) => String(c.userId))));
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { inArray } = await import("drizzle-orm");
      const ur = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids));
      for (const u of ur) nameMap[u.id] = u.username;
    }
    res.json({ success: true, data: visible.map((c) => ({ ...c, authorName: nameMap[c.userId] || "User" })) });
  } catch (e) { next(e); }
});

router.post("/:id/comments", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const user = req.user as any;
    const ctx = await loadThreadCtx(db, req.params.id, user);
    if (!ctx.ok) return threadDeny(res, ctx.code);
    const { g, isStaff, isComplainant } = ctx;

    const body = String(req.body?.body ?? "").trim();
    if (body.length < 1 || body.length > 3000) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Message must be 1–3000 characters." } });
    }
    const internal = isStaff && req.body?.internal === true; // only staff post internal notes; complainant never

    const [row] = await db.insert(grievanceComments).values({
      grievanceId: g.id, userId: user.id, authorRole: user.role, body, internal,
    }).returning();

    // Notify the OTHER party (internal notes don't ping the complainant).
    if (!internal) {
      if (isComplainant) {
        if (g.assignedTo) {
          notify({ userId: g.assignedTo, type: "system", title: `New reply on grievance: ${g.subject.slice(0, 70)}`, message: body.slice(0, 140), metadata: { grievanceId: g.id } }).catch(() => {});
        } else {
          const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
          for (const a of admins) notify({ userId: a.id, type: "system", title: `New reply on grievance: ${g.subject.slice(0, 70)}`, message: body.slice(0, 140), metadata: { grievanceId: g.id } }).catch(() => {});
        }
      } else if (g.userId && g.userId !== user.id) {
        notify({ userId: g.userId, type: "system", title: `HPSEDC replied to your grievance: ${g.subject.slice(0, 70)}`, message: body.slice(0, 140), metadata: { grievanceId: g.id } }).catch(() => {});
      }
    }

    res.status(201).json({ success: true, data: { ...row, authorName: user.username } });
  } catch (e) { next(e); }
});

export default router;
