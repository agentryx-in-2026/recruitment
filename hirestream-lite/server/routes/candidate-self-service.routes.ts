/**
 * Candidate self-service endpoints (v1.5 additions):
 *   • Compliance fields they can edit themselves
 *   • Profile PDF download
 *   • Welfare reply (candidate-initiated)
 *   • References CRUD
 *   • ICS for their own interviews
 *   • Offer letter PDF download
 */

import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import {
  candidates, candidateEducation, candidateExperience, documents,
  candidateReferences, placements, applications, interviews, jobs,
  countryInfo, auditLog,
} from "@shared/schema";
import { computeReadiness, readinessSummary, pickPrimaryPlacement } from "../services/deployment.service";
import { eq, and, desc } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { logger } from "../config/logger.config";
import { upload, verifyUploadedFile, handleUploadErrors, UPLOAD_DIR, HS_PHOTOS_DIR, HS_PLACEMENT_DOCS_DIR } from "../middleware/upload.middleware";
import { notify } from "../services/notification.service";
import fsNode from "fs";
import pathNode from "path";

const router = Router();
router.use(protect);

// ── Profile photo upload (candidate-only) ────────────────────────────
// Pipeline: multer writes the file into uploads/hs/candidates/docs/ (its
// default destination for any HireStream upload), magic-byte check validates
// it, then we move it into the photos leaf. Keeping photos in a dedicated
// leaf lets the static-serve mount expose ONLY photos publicly — sensitive
// documents (passport, PCC, offer letters) remain auth-gated at a separate
// URL space. URL format: /uploads/hs/candidates/photos/<file>.
router.post("/photo", upload.single("file"), verifyUploadedFile, async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.mimetype.startsWith("image/")) {
      // Clean up the non-image file that multer already wrote.
      try { fsNode.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ success: false, message: "Profile photo must be an image (JPG or PNG)" });
    }
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false, message: "Profile not found" });

    // Move the file from the docs landing into the photos leaf so the public
    // static-serve mount only exposes this subdir, never docs.
    const dest = pathNode.join(HS_PHOTOS_DIR, req.file.filename);
    try { fsNode.renameSync(req.file.path, dest); } catch (e) {
      logger.warn(`Photo move failed: ${(e as Error).message}`);
    }
    const photoUrl = `/uploads/hs/candidates/photos/${req.file.filename}`;

    // Delete the previous photo from disk to reclaim space.
    const [prev] = await storage.db.select({ photoUrl: candidates.photoUrl })
      .from(candidates).where(eq(candidates.id, candId));
    if (prev?.photoUrl) {
      const prevPath = pathNode.join(UPLOAD_DIR, prev.photoUrl.replace(/^\/uploads\//, ""));
      try { fsNode.unlinkSync(prevPath); } catch {}
    }

    const [row] = await storage.db.update(candidates)
      .set({ photoUrl })
      .where(eq(candidates.id, candId))
      .returning();
    logger.info(`Photo uploaded: candidate=${candId} url=${photoUrl}`);
    res.json({ success: true, data: { photoUrl: row.photoUrl } });
  } catch (err) { next(err); }
});

router.delete("/photo", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false, message: "Profile not found" });
    await storage.db.update(candidates).set({ photoUrl: null }).where(eq(candidates.id, candId));
    res.json({ success: true });
  } catch (err) { next(err); }
});

async function getMyCandidateId(userId: string) {
  if (!storage.db) return null;
  const [row] = await storage.db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
  return row?.id ?? null;
}

// ── Candidate self-edit compliance fields ────────────────────────────
router.patch("/compliance", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false, message: "Profile not found" });

    const allowed = [
      "passportNumber", "passportExpiry", "ecrStatus",
      "pccStatus", "pccExpiry", "medicalStatus", "medicalDate",
      "ieltsBand", "languageProficiency",
      "pdoCompleted", "pdoDate",
      "pbbyInsuranceStatus", "pbbyPolicyNumber",
    ];
    const set: any = {};
    for (const k of allowed) if (k in (req.body ?? {})) set[k] = req.body[k];
    if (Object.keys(set).length === 0) return res.status(400).json({ success: false, message: "No valid fields" });

    // readiness 2026-07-16: "not_required" is a WAIVER — HPSEDC's decision, not
    // the candidate's. It now scores as done in the readiness engine, so letting
    // a candidate self-set it would let them waive their own PCC/PBBY and walk
    // to "Compliance Cleared". Candidates may still report submitted/pending.
    // (These columns are declared agent-managed in shared/schema.ts; the wider
    // question of candidates self-reporting medical/PDO is flagged separately.)
    for (const fld of ["pccStatus", "pbbyInsuranceStatus"] as const) {
      if (set[fld] === "not_required") {
        return res.status(403).json({
          success: false,
          message: "Only HPSEDC can mark this as not required. Please contact your agency.",
        });
      }
    }

    // HTIS BUG-006 — passport expiry must be today or future. Same rule on the
    // PCC expiry since it's an identical travel-document expiry field. Null /
    // empty is allowed (unset). Comparison is date-only (strip time-of-day).
    const today = new Date(new Date().toDateString());
    for (const fld of ["passportExpiry", "pccExpiry"] as const) {
      if (set[fld]) {
        const d = new Date(set[fld]);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ success: false, message: `${fld} is not a valid date.` });
        if (d < today) return res.status(400).json({ success: false, message: `${fld === "passportExpiry" ? "Passport" : "PCC"} expiry must be today or a future date.` });
      }
    }

    const [row] = await storage.db.update(candidates).set(set).where(eq(candidates.id, candId)).returning();
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// ── Candidate references — CRUD ──────────────────────────────────────
router.get("/references", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.json({ success: true, data: [] });
    const rows = await storage.db.select().from(candidateReferences)
      .where(eq(candidateReferences.candidateId, candId))
      .orderBy(desc(candidateReferences.createdAt));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post("/references", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false });
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false });
    const { name, relationship, email, phone, organization } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name required" });
    const [row] = await storage.db.insert(candidateReferences).values({
      candidateId: candId, name: name.trim(), relationship, email, phone, organization,
    }).returning();
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.delete("/references/:id", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false });
    const [ref] = await storage.db.select().from(candidateReferences).where(eq(candidateReferences.id, req.params.id)).limit(1);
    if (!ref || ref.candidateId !== candId) return res.status(404).json({ success: false });
    await storage.db.delete(candidateReferences).where(eq(candidateReferences.id, req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Candidate welfare reply (proactive outreach) ─────────────────────
router.post("/placements/:id/welfare-reply", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false });

    // Ensure this placement belongs to the current candidate
    const [row] = await storage.db
      .select({ p: placements, a: applications })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .where(and(eq(placements.id, req.params.id), eq(applications.candidateId, candId)))
      .limit(1);
    if (!row) return res.status(404).json({ success: false });

    const note = String(req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ success: false, message: "note required" });

    await storage.db.update(placements)
      .set({ candidateWelfareNote: note, candidateWelfareNoteAt: new Date() })
      .where(eq(placements.id, req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Candidate pre-departure / deployment dossier ─────────────────────
// Everything the candidate needs to see between offer-accept and travel:
// the best-practice checklist (who owns each step), visa status + history
// + the destination's typical visa timeline, and the welfare check-ins.
router.get("/placements/:id/deployment", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false });

    const [row] = await storage.db
      .select({ p: placements, a: applications, j: jobs })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(eq(placements.id, req.params.id), eq(applications.candidateId, candId)))
      .limit(1);
    if (!row) return res.status(404).json({ success: false });

    const [cand] = await storage.db.select().from(candidates).where(eq(candidates.id, candId)).limit(1);
    const p: any = row.p;

    // Destination visa timeline (matched by country name; null if unknown).
    const [ci] = await storage.db.select().from(countryInfo).where(eq(countryInfo.name, p.country)).limit(1);

    // Visa history (audit_log, newest-first).
    const events = await storage.db
      .select({ details: auditLog.details, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.resourceType, "placement_visa"), eq(auditLog.resourceId, p.id)))
      .orderBy(desc(auditLog.createdAt));

    // audit 2026-07-06 (Batch 4B-2): destination ECR flag drives the
    // conditional eMigrate/PoE checklist step for ECR candidates.
    // readiness 2026-07-07: single readiness object (ring/badge/stage) — the
    // legacy checklist/summary keys below derive from it so existing clients
    // keep working unchanged.
    const readiness = computeReadiness(cand, p, { destinationIsEcr: !!ci?.isEcrCountry });

    res.json({
      success: true,
      data: {
        placement: {
          id: p.id, status: p.status, country: p.country, salary: p.salary,
          startDate: p.startDate, appointmentLetterUrl: p.appointmentLetterUrl,
        },
        jobTitle: row.j.title, company: row.j.company,
        checklist: readiness.items,
        summary: readinessSummary(readiness.items),
        readiness,
        visa: {
          status: p.visaStatus ?? "not_applied",
          timelineDays: ci?.visaTimelineDays ?? null,
          history: events.map((e: any) => ({ visaStatus: e.details?.visaStatus, note: e.details?.note ?? null, at: e.createdAt })),
        },
        welfare: {
          d30: { status: p.welfare30Day, at: p.welfare30DayAt, notes: p.welfare30DayNotes },
          d60: { status: p.welfare60Day, at: p.welfare60DayAt, notes: p.welfare60DayNotes },
          d90: { status: p.welfare90Day, at: p.welfare90DayAt, notes: p.welfare90DayNotes },
          candidateNote: p.candidateWelfareNote, candidateNoteAt: p.candidateWelfareNoteAt,
        },
      },
    });
  } catch (err) { next(err); }
});

// ── My deployment readiness (candidate-facing ring) ──────────────────
// readiness 2026-07-07: GET /api/v1/me/readiness — the candidate's own
// readiness object, computed with the SAME "primary placement" rule as the
// agent candidate-detail and admin fleet views (prefer accepted/active/
// completed, else the most recent, else none), so every role sees the same
// number. Works pre-offer too: with no placement the score reflects only
// the candidate's document compliance (passport/PCC/medical + PDO/PBBY).
router.get("/readiness", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false, message: "Profile not found" });

    const [cand] = await storage.db.select().from(candidates).where(eq(candidates.id, candId)).limit(1);
    if (!cand) return res.status(404).json({ success: false, message: "Profile not found" });

    const rows = await storage.db
      .select({ p: placements })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .where(eq(applications.candidateId, candId));
    const ps = rows.map((r: any) => r.p);
    const primaryPlacement = pickPrimaryPlacement(ps);

    // Destination ECR flag drives the conditional eMigrate/PoE step.
    let destinationIsEcr = false;
    if (primaryPlacement?.country) {
      const [ci] = await storage.db.select({ isEcr: countryInfo.isEcrCountry }).from(countryInfo)
        .where(eq(countryInfo.name, primaryPlacement.country)).limit(1);
      destinationIsEcr = !!ci?.isEcr;
    }

    res.json({ success: true, data: computeReadiness(cand, primaryPlacement, { destinationIsEcr }) });
  } catch (err) { next(err); }
});

// ── Download the candidate's own signed appointment letter ───────────
// Serves the uploaded file, or redirects to an external pasted link.
router.get("/placements/:id/appointment-letter", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).json({ success: false });
    const [row] = await storage.db.select({ p: placements }).from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .where(and(eq(placements.id, req.params.id), eq(applications.candidateId, candId))).limit(1);
    if (!row) return res.status(404).json({ success: false });
    const url: string | null = row.p.appointmentLetterUrl;
    if (!url) return res.status(404).json({ success: false, message: "No appointment letter on file" });
    if (/^https?:\/\//i.test(url)) return res.redirect(url);
    const rel = url.replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/") ? pathNode.join(UPLOAD_DIR, rel) : pathNode.join(HS_PLACEMENT_DOCS_DIR, pathNode.basename(rel));
    if (!fsNode.existsSync(filePath)) return res.status(404).json({ success: false });
    return res.download(filePath, `appointment-letter${pathNode.extname(filePath)}`);
  } catch (err) { next(err); }
});

// ── Profile PDF export (candidate's own portfolio) ───────────────────
router.get("/profile.pdf", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).send("");
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).send("");
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).send("");

    const [c] = await storage.db.select().from(candidates).where(eq(candidates.id, candId)).limit(1);
    const edu = await storage.db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candId));
    const exp = await storage.db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candId));
    const docs = await storage.db.select().from(documents).where(eq(documents.candidateId, candId));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${c.fullName.replace(/\s+/g, "-").toLowerCase()}-portfolio.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.pipe(res);

    // Header
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a").text(c.fullName);
    doc.font("Helvetica").fontSize(10).fillColor("#64748b")
      .text(`${c.email}${c.phone ? ` · ${c.phone}` : ""}${c.location ? ` · ${c.location}` : ""}`);
    if (c.preferredCountries?.length) {
      doc.text(`Preferred destinations: ${c.preferredCountries.join(", ")}`);
    }
    doc.moveDown();

    // Skills
    if (c.skills?.length) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Skills");
      doc.font("Helvetica").fontSize(10).fillColor("#334155").text(c.skills.join(" · "));
      doc.moveDown();
    }

    // Experience
    if (exp.length) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Work Experience");
      doc.moveDown(0.3);
      for (const e of exp) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(e.role ?? "");
        doc.font("Helvetica").fontSize(10).fillColor("#475569")
          .text(`${e.company ?? ""}${e.years ? ` · ${e.years} yrs` : ""}${e.country ? ` · ${e.country}` : ""}`);
        if (e.description) doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(e.description, { align: "justify" });
        doc.moveDown(0.5);
      }
    }

    // Education
    if (edu.length) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Education");
      doc.moveDown(0.3);
      for (const e of edu) {
        doc.font("Helvetica-Bold").fontSize(11).text(e.degree ?? "");
        doc.font("Helvetica").fontSize(10).fillColor("#475569")
          .text(`${e.institution ?? ""}${e.year ? ` · ${e.year}` : ""}${e.percentage ? ` · ${e.percentage}%` : ""}`);
        doc.moveDown(0.4);
      }
    }

    // Compliance summary (overseas-placement essentials)
    const hasCompliance = c.passportNumber || c.ecrStatus || c.pdoCompleted || c.ieltsBand;
    if (hasCompliance) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Pre-Departure Readiness");
      doc.moveDown(0.3);
      const kv = (k: string, v: any) => {
        if (!v && v !== 0) return;
        doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(`${k}: `, { continued: true })
           .font("Helvetica-Bold").fillColor("#0f172a").text(String(v));
      };
      kv("Passport", c.passportNumber);
      kv("ECR status", c.ecrStatus);
      kv("IELTS band", c.ieltsBand);
      kv("PDO completed", c.pdoCompleted ? "Yes" : "No");
      kv("PBBY insurance", c.pbbyInsuranceStatus);
    }

    // Documents list
    if (docs.length) {
      doc.moveDown();
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Documents on file");
      for (const d of docs) {
        doc.font("Helvetica").fontSize(10).fillColor("#475569")
          .text(`  • ${d.fileName}${d.verified ? " ✓ Verified" : ""}`);
      }
    }

    // Footer
    doc.moveDown(2);
    doc.font("Helvetica").fontSize(8).fillColor("#94a3b8")
      .text(`Generated from HireStream · ${new Date().toLocaleDateString("en-IN")} · HPSEDC Overseas Placement Portal`, { align: "center" });

    doc.end();
  } catch (err) { next(err); }
});

// ── My interviews — ICS (for candidate's own calendar) ───────────────
router.get("/interviews/:id.ics", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).send("");
    const user = (req as any).user;
    const candId = await getMyCandidateId(user.id);
    if (!candId) return res.status(404).send("");

    const [row] = await storage.db
      .select({ interview: interviews, application: applications, candidate: candidates, job: jobs })
      .from(interviews)
      .innerJoin(applications, eq(interviews.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(eq(interviews.id, req.params.id), eq(candidates.id, candId))).limit(1);
    if (!row) return res.status(404).send("");
    const i = row.interview, j = row.job;

    const dt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const start = new Date(i.scheduledAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HireStream//Candidate//EN",
      "BEGIN:VEVENT",
      `UID:${i.id}@hirestream.agentryx.dev`,
      `DTSTAMP:${dt(new Date())}`,
      `DTSTART:${dt(start)}`,
      `DTEND:${dt(end)}`,
      `SUMMARY:Interview — ${j.title} at ${j.company}`,
      `LOCATION:${(i.location || "TBD").replace(/\n/g, " ")}`,
      `DESCRIPTION:Interview for ${j.title} at ${j.company}. Mode: ${i.mode || "in_person"}.`,
      "END:VEVENT", "END:VCALENDAR",
    ];
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="interview-${i.id}.ics"`);
    res.send(lines.join("\r\n"));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────
// v0.4.34 (Phase 4): Candidate interview workflow
// ─────────────────────────────────────────────────────────────────────
// Three actions a candidate can take once an interview has been
// scheduled: confirm attendance, request reschedule (with reason +
// proposed alternate time), or decline (with reason). Each action
// writes back to the interviews row + drops an in-app notification on
// the agent (and employer, if the job is a derivative requisition).

async function loadOwnedInterview(userId: string, interviewId: string) {
  if (!storage.db) return null;
  const candId = await getMyCandidateId(userId);
  if (!candId) return null;
  const [row] = await storage.db
    .select({ interview: interviews, application: applications, job: jobs })
    .from(interviews)
    .innerJoin(applications, eq(interviews.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(eq(interviews.id, interviewId), eq(applications.candidateId, candId))).limit(1);
  return row || null;
}

async function notifyAgentOfInterviewAction(row: any, action: "confirmed" | "reschedule_requested" | "declined", reason?: string) {
  if (!storage.db) return;
  const j = row.job;
  // Recipient: agent owner (always), employer owner (if a requisition is involved)
  const recipients = new Set<string>();
  if (j.agentId) recipients.add(j.agentId);
  if (j.employerId) recipients.add(j.employerId);
  if (j.parentRequisitionId) {
    const [parent] = await storage.db.select({ employerId: jobs.employerId }).from(jobs)
      .where(eq(jobs.id, j.parentRequisitionId)).limit(1);
    if (parent?.employerId) recipients.add(parent.employerId);
  }
  const verb = action === "confirmed" ? "confirmed" : action === "declined" ? "declined" : "requested a reschedule for";
  for (const r of recipients) {
    notify({
      userId: r,
      type: "application_update",
      title: `Candidate ${verb} interview`,
      message: `Candidate has ${verb} the interview for "${j.title}".${reason ? ` Reason: ${reason}` : ""}`,
      severity: action === "confirmed" ? "positive" : "warning",
      metadata: { interviewId: row.interview.id, applicationId: row.application.id, jobId: j.id, action },
    }).catch(() => { /* notifications are best-effort */ });
  }
}

// POST /api/v1/me/interviews/:id/confirm — candidate confirms attendance
router.post("/interviews/:id/confirm", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const row = await loadOwnedInterview(user.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Interview not found" });
    if (row.interview.candidateConfirmedStatus === "confirmed") {
      return res.json({ success: true, data: row.interview, alreadyConfirmed: true });
    }
    const updated = await storage.db!.update(interviews).set({
      candidateConfirmedStatus: "confirmed",
      candidateConfirmedAt: new Date(),
      candidateRescheduleReason: null,
      candidateProposedAt: null,
      candidateDeclineReason: null,
    }).where(eq(interviews.id, req.params.id)).returning();
    await notifyAgentOfInterviewAction(row, "confirmed");
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/me/interviews/:id/reschedule — candidate requests reschedule
router.post("/interviews/:id/reschedule", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const { reason, proposedAt } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Reason required (min 5 chars)." } });
    }
    const proposed = proposedAt ? new Date(proposedAt) : null;
    if (proposedAt && (Number.isNaN(proposed!.getTime()) || proposed! < new Date())) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Proposed time must be in the future." } });
    }
    const row = await loadOwnedInterview(user.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Interview not found" });
    const updated = await storage.db!.update(interviews).set({
      candidateConfirmedStatus: "reschedule_requested",
      candidateConfirmedAt: new Date(),
      candidateRescheduleReason: String(reason).slice(0, 1000),
      candidateProposedAt: proposed,
      candidateDeclineReason: null,
    }).where(eq(interviews.id, req.params.id)).returning();
    await notifyAgentOfInterviewAction(row, "reschedule_requested", String(reason).slice(0, 200));
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/me/interviews/:id/decline — candidate declines (effectively withdraws from this round)
router.post("/interviews/:id/decline", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false, message: "Candidate-only" });
    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Reason required (min 5 chars)." } });
    }
    const row = await loadOwnedInterview(user.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Interview not found" });
    const updated = await storage.db!.update(interviews).set({
      candidateConfirmedStatus: "declined",
      candidateConfirmedAt: new Date(),
      candidateDeclineReason: String(reason).slice(0, 1000),
      candidateRescheduleReason: null,
      candidateProposedAt: null,
    }).where(eq(interviews.id, req.params.id)).returning();
    await notifyAgentOfInterviewAction(row, "declined", String(reason).slice(0, 200));
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
});

// GET /api/v1/me/interviews/:id — full interview details for the candidate panel
router.get("/interviews/:id", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (user.role !== "candidate") return res.status(403).json({ success: false });
    const row = await loadOwnedInterview(user.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Interview not found" });
    res.json({ success: true, data: row.interview });
  } catch (err) { next(err); }
});

// ── Offer letter PDF (candidate downloading their own) ───────────────
router.get("/placements/:id/offer-letter.pdf", async (req, res, next) => {
  // Delegate to the agent endpoint — it already allows candidate-owner download.
  // Keeping a candidate-facing URL for discoverability.
  // v0.4.16: preserve `?token=` query param across the redirect so the
  // mobile media-download path (Linking.openURL → device browser, no
  // Authorization header) still authenticates after the redirect.
  const token = typeof req.query.token === "string" ? req.query.token : null;
  const target = `/api/v1/agent/placements/${req.params.id}/offer-letter.pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  res.redirect(target);
});

// Catch multer-specific errors (LIMIT_FILE_SIZE → 413; file-filter type
// rejection → 400) before they hit the global handler as 500s. Same pattern
// used in document.routes.ts. Without this, the photo upload returned a
// generic 500 with code:"LIMIT_FILE_SIZE" instead of the friendly 413 with
// "File too large. Limit is 5 MB." text.
router.use(handleUploadErrors);

export default router;
