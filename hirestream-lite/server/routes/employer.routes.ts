/**
 * Employer-specific actions. Reflects the real overseas-placement workflow
 * where employer is a decision-maker reviewing the agency's curated shortlist —
 * not a front-line recruiter.
 */

import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import {
  jobs, applications, candidates, placements, recruitmentAgents, notifications, auditLog,
  employers, employerDocuments,
} from "@shared/schema";
import { eq, and, inArray, desc, or, isNotNull } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { logger } from "../config/logger.config";
import {
  employerDocUpload, verifyUploadedFile, handleUploadErrors,
  HS_EMPLOYER_DOCS_DIR, UPLOAD_DIR,
} from "../middleware/upload.middleware";

const router = Router();
router.use(protect);
router.use((req, res, next) => {
  const user = (req as any).user;
  if (!["employer", "admin", "superadmin"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Employer-only endpoint" });
  }
  next();
});

// v0.4.32 (HPSEDC Item 1): allowed employer doc types — kept inline so the
// route file is self-contained. Pair with the schema comment in shared/schema.
const EMPLOYER_DOC_TYPES = [
  // Overseas-employer document set (FRS: employers are foreign companies).
  "demand_letter", "power_of_attorney", "company_registration",
  "employment_contract", "signatory_id", "agreement", "other",
  // Legacy Indian-doc values kept valid so any pre-existing rows still load.
  "cin_certificate", "gst_certificate", "pan_card", "address_proof", "labour_permission",
];

// Helper: load the caller's employer row, or null. Auto-creates a stub row
// for a logged-in employer who hasn't submitted KYB yet — without this, the
// first PATCH /profile call would 404 because the row doesn't exist yet.
async function getOrCreateEmployerRow(db: any, userId: string) {
  const rows = await db.select().from(employers).where(eq(employers.userId, userId)).limit(1);
  if (rows.length) return rows[0];
  const created = await db.insert(employers).values({
    userId,
    companyName: "(pending)", // placeholder; will be filled by PATCH /profile
  }).returning();
  return created[0];
}

// Return the set of job IDs the employer "owns": their direct jobs + every
// derivative (agent-picked-up) job whose parent requisition they posted.
// PWS §2: employer owns requisition => they own its downstream agent jobs.
async function ownedJobIds(db: any, userId: string): Promise<string[]> {
  const direct = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.employerId, userId));
  const directIds = direct.map((r: any) => r.id);
  if (directIds.length === 0) return [];
  const derivative = await db.select({ id: jobs.id }).from(jobs)
    .where(inArray(jobs.parentRequisitionId, directIds));
  return [...directIds, ...derivative.map((r: any) => r.id)];
}

// Does this employer own (directly or as requisition parent) this job?
async function employerOwnsJob(db: any, userRole: string, userId: string, job: any): Promise<boolean> {
  if (userRole !== "employer") return true; // admin/superadmin bypass
  if (!job) return false;
  if (job.employerId === userId) return true;
  if (job.parentRequisitionId) {
    const [parent] = await db.select({ employerId: jobs.employerId }).from(jobs)
      .where(eq(jobs.id, job.parentRequisitionId)).limit(1);
    return !!parent && parent.employerId === userId;
  }
  return false;
}

// ── Employer's requisitions (jobs they own) with candidate counts ────
router.get("/requisitions", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;

    const myJobs = user.role === "employer"
      ? await db.select().from(jobs).where(eq(jobs.employerId, user.id))
      : await db.select().from(jobs);

    // v0.4.35 (Phase 4): requisition-centric stats — adds agentsPickedUp,
    // daysSincePosted, daysToFirstPlacement so the rewritten employer
    // dashboard can render the scorecard on each requisition card.
    const enriched = await Promise.all(myJobs.map(async (j: any) => {
      const derivatives = await db.select({ id: jobs.id, agentId: jobs.agentId }).from(jobs)
        .where(eq(jobs.parentRequisitionId, j.id));
      const jobIds = [j.id, ...derivatives.map((d: any) => d.id)];
      const apps = await db.select().from(applications).where(inArray(applications.jobId, jobIds));
      const awaitingDecision = apps.filter((a: any) =>
        a.status === "shortlisted" && !a.employerDecision
      ).length;
      const approvedForInterview = apps.filter((a: any) => a.employerDecision === "approved_for_interview").length;
      const placed = apps.filter((a: any) => a.status === "placed").length;
      const selected = apps.filter((a: any) => a.status === "selected").length;

      // v0.4.35: time-to-fill metrics
      const postedAt = j.createdAt ? new Date(j.createdAt) : null;
      const daysSincePosted = postedAt
        ? Math.max(0, Math.floor((Date.now() - postedAt.getTime()) / 86_400_000))
        : null;
      // First placement date (placements join via applicationId)
      let daysToFirstPlacement: number | null = null;
      if (placed > 0 && postedAt) {
        const placedRows = await db.select({ appliedAt: applications.appliedAt }).from(applications)
          .where(and(inArray(applications.jobId, jobIds), eq(applications.status, "placed")))
          .orderBy(applications.appliedAt).limit(1);
        if (placedRows.length && placedRows[0].appliedAt) {
          daysToFirstPlacement = Math.max(0, Math.floor(
            (new Date(placedRows[0].appliedAt).getTime() - postedAt.getTime()) / 86_400_000));
        }
      }
      // Unique agents who've picked up (each derivative typically has one agentId)
      const uniqueAgentIds = new Set(derivatives.map((d: any) => d.agentId).filter(Boolean));

      return {
        ...j,
        stats: {
          totalApplicants: apps.length,
          awaitingDecision,
          approvedForInterview,
          selected,
          placed,
          progressPct: j.targetHires > 0 ? Math.min(100, Math.round(((placed + selected) / j.targetHires) * 100)) : 0,
          // Phase 4 additions
          agentsPickedUp: uniqueAgentIds.size,
          daysSincePosted,
          daysToFirstPlacement,
        },
      };
    }));
    return res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

// ── The employer's review queue: everyone shortlisted or past, across all their jobs ──
router.get("/review-queue", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;

    // Employer owns both their direct postings AND agent derivatives picked up
    // against those requisitions — both flows must be visible in review queue.
    const myJobIds = user.role === "employer"
      ? await ownedJobIds(db, user.id)
      : (await db.select({ id: jobs.id }).from(jobs)).map((r: any) => r.id);
    if (myJobIds.length === 0) return res.json({ success: true, data: [] });

    const rows = await db
      .select({ application: applications, candidate: candidates, job: jobs })
      .from(applications)
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(
        inArray(applications.jobId, myJobIds),
        inArray(applications.status, ["shortlisted", "interview_scheduled", "selected"]),
      ))
      .orderBy(desc(applications.matchScore));

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ── Applicants for one requisition (aggregated across derivatives) ──
// Employer-facing view of a requisition. `:id` is the employer's own jobs
// row. Includes applicants who applied to the direct job AND applicants who
// applied to any derivative (agent pickup). This is the fix for the "Review
// Queue shows 4 candidates on the hero card but the requisition page is
// empty" bug: the hero card aggregates via /employer/review-queue, but the
// detail page was fetching /jobs/:id/applicants which only returns the
// direct-job applicants.
router.get("/requisitions/:id/applicants", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const [req0] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!req0) return res.status(404).json({ success: false });
    if (!(await employerOwnsJob(db, user.role, user.id, req0))) return res.status(403).json({ success: false });

    // Derivative jobs descending from this requisition.
    const derivatives = await db.select({ id: jobs.id }).from(jobs)
      .where(eq(jobs.parentRequisitionId, req0.id));
    const jobIds = [req0.id, ...derivatives.map((d: any) => d.id)];

    // Fetch applicants across all those jobs, with candidate + the job row so
    // the UI can label "picked up by agency X".
    const rows = await db
      .select({ application: applications, candidate: candidates, job: jobs })
      .from(applications)
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(inArray(applications.jobId, jobIds))
      .orderBy(desc(applications.appliedAt));

    // Time-in-stage: same derivation as the agent applicants endpoint. Pulls
    // the most recent application.status_change audit row per app; falls back
    // to appliedAt. Used by the employer UI to surface aging rows (7d amber,
    // 14d red) on the review queue without a schema change.
    const appIds = rows.map((r: any) => r.application.id);
    const stageEntries: Record<string, Date> = {};
    if (appIds.length > 0) {
      const auditRows = await db
        .select({ resourceId: auditLog.resourceId, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(
          eq(auditLog.action, "application.status_change"),
          inArray(auditLog.resourceId, appIds),
        ))
        .orderBy(desc(auditLog.createdAt));
      for (const ar of auditRows as any[]) {
        if (!stageEntries[ar.resourceId]) stageEntries[ar.resourceId] = new Date(ar.createdAt);
      }
    }

    const applicants = rows.map((r: any) => {
      const stageEnteredAt = stageEntries[r.application.id] ?? r.application.appliedAt;
      const daysInStage = stageEnteredAt ? Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000) : null;
      return {
        applicationId: r.application.id,
        status: r.application.status,
        matchScore: r.application.matchScore,
        appliedAt: r.application.appliedAt,
        stageEnteredAt,
        daysInStage,
        employerDecision: r.application.employerDecision,
        employerDecisionAt: r.application.employerDecisionAt,
        employerDecisionNotes: r.application.employerDecisionNotes,
        candidate: {
          id: r.candidate.id,
          fullName: r.candidate.fullName,
          email: r.candidate.email,
          phone: r.candidate.phone,
          location: r.candidate.location,
          experience: r.candidate.experience,
          skills: r.candidate.skills,
          photoUrl: r.candidate.photoUrl,
        },
        via: {
          jobId: r.job.id,
          agentId: r.job.agentId,
          isDerivative: !!r.job.parentRequisitionId,
        },
      };
    });
    res.json({ success: true, data: applicants, total: applicants.length, jobCount: jobIds.length });
  } catch (err) { next(err); }
});

// ── Employer: approve a shortlisted candidate for interview ──────────
router.post("/applications/:id/approve-for-interview", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const { notes } = req.body ?? {};

    const [app] = await db.select().from(applications).where(eq(applications.id, req.params.id)).limit(1);
    if (!app) return res.status(404).json({ success: false });

    // Verify the employer owns the job
    const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId!)).limit(1);
    if (!job || !(await employerOwnsJob(db, user.role, user.id, job))) {
      return res.status(403).json({ success: false });
    }

    await db.update(applications).set({
      employerDecision: "approved_for_interview",
      employerDecisionAt: new Date(),
      employerDecisionNotes: notes || null,
    }).where(eq(applications.id, app.id));

    // Notify the agency
    if (job.agentId) {
      notify({
        userId: job.agentId, type: "application_update",
        title: "Employer approved candidate for interview",
        message: `The employer approved a shortlisted candidate for interview on "${job.title}". Please schedule.`,
        metadata: { applicationId: app.id, jobId: job.id },
      }).catch(() => {});
    }
    logger.info(`Employer ${user.id} approved-for-interview app ${app.id}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Employer: request replacement candidates from the agency ─────────
router.post("/applications/:id/request-replacement", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const { reason } = req.body ?? {};

    const [app] = await db.select().from(applications).where(eq(applications.id, req.params.id)).limit(1);
    if (!app) return res.status(404).json({ success: false });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId!)).limit(1);
    if (!job || !(await employerOwnsJob(db, user.role, user.id, job))) {
      return res.status(403).json({ success: false });
    }

    await db.update(applications).set({
      employerDecision: "replacement_requested",
      employerDecisionAt: new Date(),
      employerDecisionNotes: reason || null,
    }).where(eq(applications.id, app.id));

    // Loud notification to agency — this is an operational signal
    if (job.agentId) {
      notify({
        userId: job.agentId, type: "application_update",
        title: "⚠ Employer requested a replacement candidate",
        message: `Employer didn't find this candidate suitable for "${job.title}". Reason: ${reason || "not specified"}. Please send additional candidates.`,
        metadata: { applicationId: app.id, jobId: job.id, reason },
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Employer: request more candidates (across the requisition) ───────
router.post("/requisitions/:jobId/request-more", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const { count, reason } = req.body ?? {};

    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.jobId)).limit(1);
    if (!job || !(await employerOwnsJob(db, user.role, user.id, job))) {
      return res.status(403).json({ success: false });
    }
    if (job.agentId) {
      notify({
        userId: job.agentId, type: "application_update",
        title: "Employer asked for more candidates",
        message: `"${job.title}" — employer asked for ${count || "additional"} more candidates. ${reason ? `Why: ${reason}` : ""}`.trim(),
        metadata: { jobId: job.id, count, reason },
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Employer: update requisition fields (target hires, deadline, priority) ──
// v0.4.35 (Phase 4): Agency scorecard — per-agency conversion stats
// across THIS employer's requisitions. Helps the employer decide which
// agencies to prioritise for future picks. Optional ?requisitionId=
// scopes to a single requisition; without it, aggregates across all.
router.get("/agency-scorecard", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer" && user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({ success: false });
    }

    const requisitionId = typeof req.query.requisitionId === "string" ? req.query.requisitionId : null;

    // Resolve owned requisitions + derivatives
    const myReqs = user.role === "employer"
      ? await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.employerId, user.id))
      : await db.select({ id: jobs.id }).from(jobs);
    let reqIds = myReqs.map((r: any) => r.id);
    if (requisitionId) {
      reqIds = reqIds.filter((id: string) => id === requisitionId);
      if (reqIds.length === 0) return res.status(404).json({ success: false, message: "Requisition not found" });
    }
    if (reqIds.length === 0) return res.json({ success: true, data: [] });

    // Derivatives (agent-picked) sit on these requisitions
    const derivatives = await db.select().from(jobs).where(inArray(jobs.parentRequisitionId, reqIds));
    // Direct postings (employer-posted) also valid — include them under
    // the original employer "self" entry so the scorecard is complete.
    const allJobIds = [...reqIds, ...derivatives.map((d: any) => d.id)];
    const apps = await db.select().from(applications).where(inArray(applications.jobId, allJobIds));

    // Map jobId → agentId (null for employer-direct postings)
    const jobToAgent: Record<string, string | null> = {};
    for (const d of derivatives as any[]) jobToAgent[d.id] = d.agentId ?? null;
    for (const id of reqIds) jobToAgent[id] = null; // direct postings, no picker

    // Group by agentId
    const agentIds = Array.from(new Set(Object.values(jobToAgent).filter(Boolean))) as string[];
    const agentRows = agentIds.length === 0 ? [] : await db.select().from(recruitmentAgents)
      .where(inArray(recruitmentAgents.userId, agentIds));
    const agentMeta: Record<string, { name: string; verified: boolean | null }> = {};
    for (const a of agentRows as any[]) {
      agentMeta[a.userId!] = { name: a.agencyName, verified: a.verified };
    }

    type Bucket = {
      agencyKey: string; agencyName: string; verified: boolean | null;
      submitted: number; shortlisted: number; interview: number; selected: number; placed: number; rejected: number;
    };
    const buckets: Record<string, Bucket> = {};
    for (const a of apps as any[]) {
      const agentId = jobToAgent[a.jobId] ?? "_employer_direct";
      const key = agentId || "_employer_direct";
      if (!buckets[key]) {
        buckets[key] = {
          agencyKey: key,
          agencyName: key === "_employer_direct" ? "Direct (no agency)" : agentMeta[key]?.name ?? "Unknown agency",
          verified: key === "_employer_direct" ? null : agentMeta[key]?.verified ?? null,
          submitted: 0, shortlisted: 0, interview: 0, selected: 0, placed: 0, rejected: 0,
        };
      }
      buckets[key].submitted++;
      if (a.status === "shortlisted") buckets[key].shortlisted++;
      else if (a.status === "interview_scheduled") buckets[key].interview++;
      else if (a.status === "selected") buckets[key].selected++;
      else if (a.status === "placed") buckets[key].placed++;
      else if (a.status === "rejected") buckets[key].rejected++;
    }
    const data = Object.values(buckets).map((b) => ({
      ...b,
      // Conversion: shortlisted-or-better / submitted. Easy to grok metric.
      conversionPct: b.submitted === 0 ? 0
        : Math.round(((b.shortlisted + b.interview + b.selected + b.placed) / b.submitted) * 100),
      placementRatePct: b.submitted === 0 ? 0
        : Math.round((b.placed / b.submitted) * 100),
    })).sort((x, y) => y.submitted - x.submitted);

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch("/requisitions/:id", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job || (user.role === "employer" && job.employerId !== user.id)) {
      return res.status(403).json({ success: false });
    }
    const { targetHires, hiringDeadline, priority, employerNotes } = req.body ?? {};
    const set: any = {};
    if (targetHires !== undefined) set.targetHires = Number(targetHires);
    if (hiringDeadline !== undefined) set.hiringDeadline = hiringDeadline || null;
    if (priority !== undefined) set.priority = priority;
    if (employerNotes !== undefined) set.employerNotes = employerNotes;
    if (Object.keys(set).length === 0) return res.status(400).json({ success: false, message: "no fields" });
    const [row] = await db.update(jobs).set(set).where(eq(jobs.id, req.params.id)).returning();
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// ── Employer: add a welfare note to a placement ──────────────────────
router.patch("/placements/:id/welfare-note", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const { note } = req.body ?? {};

    // Verify ownership via job
    const [row] = await db
      .select({ p: placements, j: jobs })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(placements.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false });
    if (!(await employerOwnsJob(db, user.role, user.id, row.j))) return res.status(403).json({ success: false });

    await db.update(placements).set({
      employerWelfareNote: note || null,
      employerWelfareNoteAt: new Date(),
    }).where(eq(placements.id, req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────
// v0.4.32 (HPSEDC Item 1): Employer KYB profile + documents
// ─────────────────────────────────────────────────────────────────────

// GET own profile (auto-stubs the row on first read so the client always
// has something to bind to).
router.get("/profile", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });
    const row = await getOrCreateEmployerRow(db, user.id);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// PATCH own profile — accept all KYB fields. Admin can also patch on
// behalf of an employer using the same endpoint via :id (admin route below).
//
// v0.7.5.0 — Post-verification edit policy:
//   CONTACT_FIELDS  → free to edit, verification stays intact
//   REGULATED_FIELDS → editing ANY of these on a verified employer resets
//                      `verified=false`, clears `submittedForReviewAt`, and
//                      writes an audit log entry. HPSEDC must re-approve.
//                      This prevents a verified employer from silently
//                      changing their CIN / GST / PAN / signatory identity.
router.patch("/profile", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });

    const row = await getOrCreateEmployerRow(db, user.id);

    const CONTACT_FIELDS = [
      "industry", "location",
      "registeredAddressLine1", "registeredAddressLine2", "registeredCity",
      "registeredState", "registeredPinCode", "registeredCountry",
      "contactEmail", "contactPhone",
      "authorisedSignatoryDesignation",
    ];
    const REGULATED_FIELDS = [
      "companyName", "cin", "gst", "pan",
      "authorisedSignatoryName", "authorisedSignatoryIdType", "authorisedSignatoryIdNumber",
    ];
    const ALL_FIELDS = [...CONTACT_FIELDS, ...REGULATED_FIELDS];

    const allowed: any = {};
    const regulatedChanges: Record<string, { from: any; to: any }> = {};
    for (const f of ALL_FIELDS) {
      if (req.body[f] === undefined) continue;
      const newVal = req.body[f];
      const oldVal = (row as any)[f];
      // Only record a regulated change if it's actually different.
      if (REGULATED_FIELDS.includes(f) && String(newVal ?? "") !== String(oldVal ?? "")) {
        regulatedChanges[f] = { from: oldVal ?? null, to: newVal ?? null };
      }
      allowed[f] = newVal;
    }
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No updatable fields supplied" } });
    }

    // Length sanity — kept loose; the client form enforces stricter rules.
    if (allowed.companyName && (allowed.companyName.length < 2 || allowed.companyName.length > 150)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Company name must be 2-150 chars" } });
    }

    // If verified AND any regulated field changed → reset verification.
    const requiresReVerification = (row as any).verified === true && Object.keys(regulatedChanges).length > 0;
    if (requiresReVerification) {
      allowed.verified = false;
      allowed.submittedForReviewAt = null;
      allowed.rejectionReason = null;
    }

    const updated = await db.update(employers).set(allowed).where(eq(employers.id, row.id)).returning();

    // Audit-log every regulated change, even when not currently verified.
    if (Object.keys(regulatedChanges).length > 0) {
      const { auditLog } = await import("@shared/schema");
      await db.insert(auditLog).values({
        userId: user.id,
        action: requiresReVerification ? "employer.regulated_edit_reset_verification" : "employer.regulated_edit",
        resourceType: "employer",
        resourceId: row.id,
        details: { changes: regulatedChanges, wasVerified: (row as any).verified === true } as any,
      }).catch(() => {});
    }

    res.json({ success: true, data: updated[0], requiresReVerification });
  } catch (err) { next(err); }
});

// Submit profile + docs for admin review. Flips submittedForReviewAt and
// clears any prior rejection reason. Idempotent — a second call after a
// rejection re-submits. Auto-stubs the employer row so this endpoint is
// always reachable from a freshly-registered account.
router.post("/submit-for-review", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });

    const row = await getOrCreateEmployerRow(db, user.id);
    if (row.verified) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Already verified" } });
    }
    // Require core KYB fields + at least one doc before allowing submit.
    const missing: string[] = [];
    if (!row.companyName || row.companyName === "(pending)") missing.push("Company name");
    if (!row.cin) missing.push("Business registration / trade licence no.");
    if (!row.registeredCountry) missing.push("Country of operation");
    if (!row.contactEmail) missing.push("Contact email");
    if (!row.authorisedSignatoryName) missing.push("Authorised signatory name");
    if (missing.length) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `Complete these first: ${missing.join(", ")}` },
      });
    }
    const docCount = await db.select({ id: employerDocuments.id }).from(employerDocuments)
      .where(eq(employerDocuments.employerId, row.id));
    if (docCount.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "Upload at least one verification document before submitting." },
      });
    }
    await db.update(employers).set({
      submittedForReviewAt: new Date(),
      rejectionReason: null,
    }).where(eq(employers.id, row.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Documents ───────────────────────────────────────────────────────
router.post("/documents",
  employerDocUpload.single("file"), verifyUploadedFile,
  async (req, res, next) => {
    try {
      const db = storage.db;
      if (!db) return res.status(500).json({ success: false });
      const user = (req as any).user;
      if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });
      if (!req.file) return res.status(400).json({ success: false, error: { code: 400, message: "No file uploaded" } });

      const row = await getOrCreateEmployerRow(db, user.id);
      const docType = req.body.type || "other";
      if (!EMPLOYER_DOC_TYPES.includes(docType)) {
        return res.status(400).json({ success: false, error: { code: 400, message: `Invalid type. Must be one of: ${EMPLOYER_DOC_TYPES.join(", ")}` } });
      }

      const inserted = await db.insert(employerDocuments).values({
        employerId: row.id,
        type: docType,
        fileName: req.file.originalname,
        fileUrl: `/uploads/hs/employers/docs/${req.file.filename}`,
        fileSize: req.file.size,
      }).returning();
      logger.info(`Employer doc uploaded: ${inserted[0].id} by employer ${row.id}`);
      res.status(201).json({ success: true, data: inserted[0] });
    } catch (err) { next(err); }
  },
);

router.get("/documents", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });

    const empRows = await db.select().from(employers).where(eq(employers.userId, user.id)).limit(1);
    if (empRows.length === 0) return res.json({ success: true, data: [] });
    const docs = await db.select().from(employerDocuments)
      .where(eq(employerDocuments.employerId, empRows[0].id))
      .orderBy(employerDocuments.uploadedAt);
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
});

router.delete("/documents/:id", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "employer") return res.status(403).json({ success: false, message: "Employer-only" });

    const docRows = await db.select().from(employerDocuments).where(eq(employerDocuments.id, req.params.id)).limit(1);
    if (docRows.length === 0) return res.status(404).json({ success: false });
    const doc = docRows[0];
    // Ownership check via employer row
    const empRows = await db.select().from(employers).where(eq(employers.id, doc.employerId)).limit(1);
    if (!empRows.length || empRows[0].userId !== user.id) {
      return res.status(403).json({ success: false, message: "Not your document" });
    }
    // Can't delete an already-approved doc; admin owns that lifecycle.
    if (doc.status === "approved") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Cannot remove an approved document. Contact admin." } });
    }

    // Disk cleanup (best-effort; URL is /uploads/hs/employers/docs/<file>)
    const rel = (doc.fileUrl || "").replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_EMPLOYER_DOCS_DIR, path.basename(rel));
    try { await fs.unlink(filePath); } catch { /* tolerate */ }

    await db.delete(employerDocuments).where(eq(employerDocuments.id, doc.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get("/documents/:id/download", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const docRows = await db.select().from(employerDocuments).where(eq(employerDocuments.id, req.params.id)).limit(1);
    if (docRows.length === 0) return res.status(404).json({ success: false });
    const doc = docRows[0];
    // Authorisation: the owning employer OR admin/superadmin
    if (user.role === "employer") {
      const empRows = await db.select().from(employers).where(eq(employers.id, doc.employerId)).limit(1);
      if (!empRows.length || empRows[0].userId !== user.id) {
        return res.status(403).json({ success: false });
      }
    } else if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false });
    }
    const rel = (doc.fileUrl || "").replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_EMPLOYER_DOCS_DIR, path.basename(rel));
    try { await fs.access(filePath); } catch { return res.status(404).json({ success: false }); }
    if (req.query.inline === "1" || req.query.preview === "1") {
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
      return res.sendFile(path.resolve(filePath));
    }
    res.download(filePath, doc.fileName);
  } catch (err) { next(err); }
});

// Multer-error catch — registered last so it sees errors from every
// upload route in this file.
router.use(handleUploadErrors);

export default router;
