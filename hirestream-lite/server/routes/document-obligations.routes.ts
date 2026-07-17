/**
 * "What do I actually owe, and when?" — UAT-05 items 9 + 21, pages 5 and 6.
 *
 * ── The whole point ─────────────────────────────────────────────────────────
 * HPSEDC: "we get 20,000 applications and only 500 are selected. Why collect
 * 20,000 applicants' documents when they are not needed until the candidate is
 * selected?"
 *
 * So documents are owed per (candidate, APPLICATION), never per candidate — and
 * only once that application has reached a stage that justifies the ask:
 *
 *   submitted / reviewed        → nothing. Zero uploads. 20,000 people sit here.
 *   shortlisted / interview     → VERIFY: prove what you claimed at registration.
 *   selected / placed           → DEPLOY: PCC + medical (item 9).
 *
 * A candidate with three applications can owe different things for each, and
 * owe nothing at all for the two that are still `submitted`. That is why this
 * returns a LIST of obligations rather than one document checklist: a single
 * per-candidate list is what forced everyone to upload everything up front.
 *
 * ── Why not compute this on the client ─────────────────────────────────────
 * The old country→documents table WAS client-side, and the server never read
 * it — so the portal told candidates the UK needs IELTS while nothing checked.
 * The resolver lives in shared/documents.ts; this endpoint is the server
 * reading it, which is what makes it a rule rather than a caption.
 */

import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import {
  candidates, applications, jobs, documents, candidateProfessions, professionRequirements,
} from "@shared/schema";
import { resolveRequiredDocs, relevantProfessions, docLabel, type DocStage } from "@shared/documents";
import { eq, inArray } from "drizzle-orm";

const router = Router();

/**
 * Candidate-only. Both routes below answer "what do *I* owe", resolved from the
 * session's own candidate row, so there is nothing here for any other role.
 *
 * Added because the deep-smoke authz matrix flagged agent/employer/admin
 * reaching them. It was not a leak — no candidate row means an empty answer —
 * but "safe by accident" is not the same as "guarded", and the next person to
 * add a candidateId query param would turn it into a real one. HPSEDC oversight
 * of a candidate's documents belongs on an admin-scoped endpoint that takes an
 * explicit id, not on this one.
 */
router.use(protect, (req, res, next) => {
  const role = (req.user as any)?.role;
  if (role !== "candidate") {
    return res.status(403).json({ success: false, error: { code: 403, message: "Candidate-only endpoint" } });
  }
  next();
});

/**
 * Application status → the stage of documents it justifies asking for.
 *
 * Mirrors STATUS_ORDER in application.routes.ts (submitted, reviewed,
 * shortlisted, interview_scheduled, selected, placed). Returns null for the two
 * early states — null means "ask for nothing", which is the default for the
 * ~19,500 applications that never get past them.
 */
export function stageForStatus(status: string | null | undefined): DocStage | null {
  switch (status) {
    case "shortlisted":
    case "interview_scheduled":
      return "verify";
    case "selected":
    case "placed":
      return "deploy";
    default:
      // submitted, reviewed, rejected, withdrawn — nothing owed.
      return null;
  }
}

/** identity_proof has historical aliases; treat any of them as "have it". */
const ID_ALIASES = ["identity_proof", "id", "aadhaar", "national_id", "voter_id"];
const hasDoc = (owned: Set<string>, key: string) =>
  key === "identity_proof" ? ID_ALIASES.some((a) => owned.has(a)) : owned.has(key);

/**
 * GET /api/v1/candidates/documents/obligations
 *
 * One entry per application that currently owes documents. An application that
 * owes nothing is omitted entirely — not returned with an empty list — so the
 * client cannot accidentally render an upload section for a candidate who is
 * still `submitted`. That omission IS item 9.
 */
router.get("/obligations", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const candRows = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
    if (candRows.length === 0) return res.json({ success: true, data: { obligations: [] } });
    const candidateId = candRows[0].id;

    const appRows = await db
      .select({ application: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.candidateId, candidateId));

    const live = appRows.filter((r: any) => stageForStatus(r.application.status) !== null);
    if (live.length === 0) return res.json({ success: true, data: { obligations: [] } });

    const myProfs = await db.select().from(candidateProfessions).where(eq(candidateProfessions.candidateId, candidateId));
    const professionKeys = myProfs.map((p: { professionKey: string }) => p.professionKey);

    const reqRows = professionKeys.length
      ? await db.select().from(professionRequirements).where(inArray(professionRequirements.professionKey, professionKeys))
      : [];
    const professionReqs = Object.fromEntries(reqRows.map((r: any) => [r.professionKey, r]));

    const docRows = await db.select({ type: documents.type, id: documents.id, fileName: documents.fileName, verified: documents.verified })
      .from(documents).where(eq(documents.candidateId, candidateId));
    const owned = new Set<string>(docRows.map((d: any) => String(d.type || "").toLowerCase()));
    const byType: Record<string, any> = Object.fromEntries(docRows.map((d: any) => [String(d.type || "").toLowerCase(), d]));

    const lang = String(req.query.lang || "en");

    const obligations = live.map((r: any) => {
      const stage = stageForStatus(r.application.status) as DocStage;
      // Scope to the trades THIS vacancy cares about — a mason job must not ask
      // a nurse-and-mason candidate for a Nursing Council registration.
      const relevant = relevantProfessions(professionKeys, professionReqs, r.job.category);
      const resolved = resolveRequiredDocs({
        stage,
        professionKeys: relevant,
        professionReqs,
        country: r.job.country,
        jobAdditional: r.job.additionalRequiredDocs,
      });
      const decorate = (keys: string[]) => keys.map((k) => ({
        key: k,
        label: docLabel(k, lang),
        have: hasDoc(owned, k),
        // `verified` is the agent/admin sign-off on an uploaded file. Surfaced so
        // the candidate can tell "uploaded" from "accepted" — the old UI showed
        // only the first and left them guessing why nothing moved.
        verified: hasDoc(owned, k) ? Boolean(byType[k]?.verified) : false,
        reasons: resolved.reasons[k] || [],
      }));
      const required = decorate(resolved.required);
      return {
        applicationId: r.application.id,
        jobId: r.job.id,
        jobTitle: r.job.title,
        company: r.job.company,
        country: r.job.country,
        status: r.application.status,
        stage,
        required,
        optional: decorate(resolved.optional),
        missing: required.filter((d) => !d.have).map((d) => d.key),
        complete: required.every((d) => d.have),
      };
    });

    res.json({ success: true, data: { obligations } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/candidates/documents/preview?jobId=...
 *
 * "If I applied for this job, what would I eventually be asked for?" — for the
 * job detail page. Informational ONLY: it never asks for an upload and it never
 * depends on an application existing.
 *
 * Item 9 hides the PCC/medical SECTIONS until shortlisting; it does not require
 * us to hide the FACT that a job eventually needs them. Telling someone up front
 * that a Gulf job will need a medical after selection helps them plan and costs
 * them nothing; making them buy one to apply is what item 9 objects to. So this
 * returns both stages, clearly separated, with nothing to upload.
 */
router.get("/preview", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const jobId = String(req.query.jobId || "");
    if (!jobId) return res.status(400).json({ success: false, error: { code: 400, message: "jobId is required" } });

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (jobRows.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    const job = jobRows[0];

    const userId = (req.user as any)?.id;
    const candRows = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
    const candidateId = candRows[0]?.id;

    let professionKeys: string[] = [];
    let professionReqs: Record<string, any> = {};
    let owned = new Set<string>();
    if (candidateId) {
      const myProfs = await db.select().from(candidateProfessions).where(eq(candidateProfessions.candidateId, candidateId));
      professionKeys = myProfs.map((p: { professionKey: string }) => p.professionKey);
      if (professionKeys.length) {
        const reqRows = await db.select().from(professionRequirements).where(inArray(professionRequirements.professionKey, professionKeys));
        professionReqs = Object.fromEntries(reqRows.map((r: any) => [r.professionKey, r]));
      }
      const docRows = await db.select({ type: documents.type }).from(documents).where(eq(documents.candidateId, candidateId));
      owned = new Set<string>(docRows.map((d: any) => String(d.type || "").toLowerCase()));
    }

    const lang = String(req.query.lang || "en");
    const relevant = relevantProfessions(professionKeys, professionReqs, job.category);
    const shape = (stage: DocStage) => {
      const r = resolveRequiredDocs({ stage, professionKeys: relevant, professionReqs, country: job.country, jobAdditional: job.additionalRequiredDocs });
      return r.required.map((k) => ({ key: k, label: docLabel(k, lang), have: hasDoc(owned, k), reasons: r.reasons[k] || [] }));
    };

    res.json({ success: true, data: { jobId, country: job.country, ifShortlisted: shape("verify"), ifSelected: shape("deploy") } });
  } catch (error) {
    next(error);
  }
});

export default router;
