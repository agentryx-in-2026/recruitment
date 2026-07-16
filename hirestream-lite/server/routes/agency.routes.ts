import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { insertRecruitmentAgentSchema, recruitmentAgents, candidates, agencyReviews,
  candidateEducation, candidateExperience, documents, applications, jobs,
  agencyDocuments, placements, auditLog, countryInfo } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { computeReadiness, pickPrimaryPlacement } from "../services/deployment.service";
import { userOwnsCandidate } from "../lib/ownership";
import { maskAadhaar } from "../lib/safeUser";
import {
  agencyDocUpload, verifyUploadedFile, handleUploadErrors,
  HS_AGENCY_DOCS_DIR, UPLOAD_DIR,
} from "../middleware/upload.middleware";

// v0.4.32 (HPSEDC Item 3): the 9 doc classes HPSEDC listed for an MEA RA
// licensed agency, plus "other". Kept inline here so the route file is
// self-contained.
const AGENCY_DOC_TYPES = [
  "mea_ra_license", "incorporation_certificate", "pan_card", "gst_certificate",
  "address_proof", "signatory_id", "labour_permission", "experience_proof",
  "agreement", "other",
];

const router = Router();

// Register a new recruitment agency
router.post("/register", protect, async (req, res, next) => {
  try {
     const userId = (req.user as any)?.id;
     if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

     if ((req.user as any)?.role !== "agent") {
        return res.status(403).json({ success: false, message: "Only agents can register agencies." });
     }

     const parsed = insertRecruitmentAgentSchema.safeParse(req.body);
     if (!parsed.success) {
       return res.status(400).json({
         success: false,
         error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
       });
     }
     const validatedData = parsed.data;

     if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

     const newAgency = await storage.db.insert(recruitmentAgents).values({
       ...validatedData,
       userId,
       verified: false // Needs admin approval
     }).returning();

     res.status(201).json({ success: true, data: newAgency[0] });
  } catch (err) {
    logger.error(`Error registering agency: ${err}`);
    next(err);
  }
});

// Get current agency details
router.get("/me", protect, async (req, res, next) => {
  try {
     const userId = (req.user as any)?.id;
     if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

     if ((req.user as any)?.role !== "agent") {
        return res.status(403).json({ success: false, message: "Only agents have agency profiles." });
     }

     if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

     const existing = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);

     if (!existing || existing.length === 0) {
        return res.status(404).json({ success: false, message: "Agency profile not found" });
     }

     res.status(200).json({ success: true, data: existing[0] });
  } catch (err) {
    logger.error(`Error fetching agency details: ${err}`);
    next(err);
  }
});

// Search candidates (for agents/employers)
// Gate candidate-PII browse for unverified agencies (FRS §2.5). Setting-controlled
// (agency.require_verification_to_view_candidates, default ON) — mirrors the
// job-posting gate. Employers/admins are unaffected. Returns true if the caller
// is an unverified agency that should be blocked.
async function unverifiedAgencyBlocked(req: any): Promise<boolean> {
  if ((req.user as any)?.role !== "agent") return false;
  const { getSetting } = await import("../services/settings.service");
  const requireVerified: boolean = await getSetting("agency.require_verification_to_view_candidates");
  if (!requireVerified) return false;
  const [agent] = await storage.db!.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, (req.user as any).id)).limit(1);
  return !agent || !agent.verified;
}

router.get("/candidates", protect, async (req, res, next) => {
  try {
    const userRole = (req.user as any)?.role;
    if (userRole !== "agent" && userRole !== "employer" && userRole !== "admin") {
      return res.status(403).json({ success: false, message: "Only agents, employers, or admins can search candidates." });
    }

    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    if (await unverifiedAgencyBlocked(req)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Your agency must be verified by HPSEDC before viewing candidate profiles." } });
    }

    const allCandidates = await storage.db.select().from(candidates);

    // Client can pass ?skill=React&location=Shimla for filtering
    const { skill, location } = req.query;
    let filtered = allCandidates;

    // security 2026-07-07 (A01-1): mirror the `:id` S6 fix on the LIST route.
    // Employers are foreign companies — previously this returned every
    // candidate's full row (incl. passport + Aadhaar) to any employer. Scope
    // employers to candidates who applied to their jobs (direct or via parent
    // requisition). Agents/admins are HPSEDC staff and keep full access.
    const actor = req.user as any;
    if (actor.role === "employer") {
      const { or, inArray } = await import("drizzle-orm");
      const { alias } = await import("drizzle-orm/pg-core");
      const parentJobs = alias(jobs, "parent_jobs");
      const appRows = await storage.db
        .select({ candidateId: applications.candidateId })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .leftJoin(parentJobs, eq(jobs.parentRequisitionId, parentJobs.id))
        .where(or(eq(jobs.employerId, actor.id), eq(parentJobs.employerId, actor.id)));
      const myApplicantIds = new Set(appRows.map((r: any) => r.candidateId).filter(Boolean));
      filtered = filtered.filter((c: any) => myApplicantIds.has(c.id));
    }

    if (skill && typeof skill === "string") {
      const s = skill.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.skills?.some((sk: string) => sk.toLowerCase().includes(s))
      );
    }

    if (location && typeof location === "string") {
      const l = location.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.location?.toLowerCase().includes(l)
      );
    }

    // security 2026-07-07 (A01-1 + Aadhaar-masking): a browse LIST never needs
    // identity numbers. Strip passport + Aadhaar from every row for every viewer
    // (employers, agents, admins) — the full/masked Aadhaar is available only on
    // the candidate DETAIL view, and only to staff, masked to the last 4 digits.
    filtered = filtered.map((c: any) => {
      const { passportNumber, aadhaarNumber, ...safe } = c;
      return safe;
    });

    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (err) {
    logger.error(`Error searching candidates: ${err}`);
    next(err);
  }
});

// GET /api/v1/agencies/candidates/:id — full candidate profile for agent view
router.get("/candidates/:id", protect, async (req, res, next) => {
  try {
    const userRole = (req.user as any)?.role;
    if (userRole !== "agent" && userRole !== "employer" && userRole !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    if (await unverifiedAgencyBlocked(req)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Your agency must be verified by HPSEDC before viewing candidate profiles." } });
    }

    const [candidate] = await storage.db.select().from(candidates).where(eq(candidates.id, req.params.id)).limit(1);
    if (!candidate) return res.status(404).json({ success: false, message: "Candidate not found" });

    // audit 2026-07-06 (S6): employers are foreign companies. Previously ANY
    // employer could pull a full candidate profile (incl. documents + passport)
    // by ID, for candidates who never applied to their jobs. Scope employers to
    // their own applicants; agents/admins retain full access (they're HPSEDC staff).
    const actor = req.user as any;
    if (actor.role === "employer" && !(await userOwnsCandidate(storage.db, actor, candidate.id))) {
      return res.status(403).json({ success: false, message: "You can only view candidates who applied to your jobs." });
    }

    const education = await storage.db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidate.id));
    const experience = await storage.db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candidate.id));
    const docs = await storage.db.select().from(documents).where(eq(documents.candidateId, candidate.id));

    // Applications by this candidate with basic job info.
    // Sort newest-first so the most recent activity is visible without
    // scrolling — this is what agents actually look for when they open a
    // candidate they just got a notification about.
    const { desc } = await import("drizzle-orm");
    const apps = await storage.db
      .select({ application: applications, job: jobs, placement: placements })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(placements, eq(placements.applicationId, applications.id))
      .where(eq(applications.candidateId, candidate.id))
      .orderBy(desc(applications.appliedAt));
    const applicationsList = apps.map((r: any) => ({
      id: r.application.id,
      status: r.application.status,
      matchScore: r.application.matchScore,
      appliedAt: r.application.appliedAt,
      jobId: r.job.id,
      jobTitle: r.job.title,
      company: r.job.company,
      country: r.job.country,
      placementId: r.placement?.id ?? null,
      visaStatus: r.placement?.visaStatus ?? null,
      placementStatus: r.placement?.status ?? null,
      startDate: r.placement?.startDate ?? null,
      appointmentLetterUrl: r.placement?.appointmentLetterUrl ?? null,
      // Welfare check-ins (already persisted on the placement) so the panel
      // can show what was recorded instead of looking like it vanished.
      welfare: r.placement ? {
        d30: { status: r.placement.welfare30Day, at: r.placement.welfare30DayAt, notes: r.placement.welfare30DayNotes },
        d60: { status: r.placement.welfare60Day, at: r.placement.welfare60DayAt, notes: r.placement.welfare60DayNotes },
        d90: { status: r.placement.welfare90Day, at: r.placement.welfare90DayAt, notes: r.placement.welfare90DayNotes },
      } : null,
      visaHistory: [] as any[],
    }));

    // Attach visa-status history (from the generic audit_log) to each placed app.
    const placementIds = applicationsList.map((a: any) => a.placementId).filter(Boolean) as string[];
    if (placementIds.length > 0) {
      const { inArray, desc } = await import("drizzle-orm");
      const events = await storage.db
        .select({ resourceId: auditLog.resourceId, details: auditLog.details, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(eq(auditLog.resourceType, "placement_visa"), inArray(auditLog.resourceId, placementIds)))
        .orderBy(desc(auditLog.createdAt));
      for (const a of applicationsList) {
        if (!a.placementId) continue;
        a.visaHistory = events
          .filter((e: any) => e.resourceId === a.placementId)
          .map((e: any) => ({ visaStatus: e.details?.visaStatus, note: e.details?.note ?? null, role: e.details?.role ?? null, at: e.createdAt }));
      }
    }

    // readiness 2026-07-07: deployment readiness for the detail header
    // (ring / "Cleared for Deployment" badge / stepper). Primary placement =
    // an accepted/active/completed one if present, else the most recent.
    // Computed from the RAW candidate row (compliance fields intact) — the
    // PII-masked copy below is display-only and must not feed the score.
    const placementRows = apps.map((r: any) => r.placement).filter(Boolean);
    const primaryPlacement = pickPrimaryPlacement(placementRows);
    let destinationIsEcr = false;
    if (primaryPlacement?.country) {
      const [ci] = await storage.db.select({ isEcrCountry: countryInfo.isEcrCountry }).from(countryInfo)
        .where(eq(countryInfo.name, primaryPlacement.country)).limit(1);
      destinationIsEcr = !!ci?.isEcrCountry;
    }
    const readiness = computeReadiness(candidate, primaryPlacement, { destinationIsEcr });

    // S6: minimise PII for employers — no raw identity documents, passport, or
    // Aadhaar numbers.
    // best practice 2026-07-07 (UIDAI/DPDP): staff never need the FULL Aadhaar —
    // agents/admins see it masked to the last 4 digits; employers see none.
    const isEmployer = actor.role === "employer";
    const safeCandidate: any = { ...candidate };
    if (isEmployer) {
      delete safeCandidate.passportNumber;
      delete safeCandidate.aadhaarNumber;
    } else {
      safeCandidate.aadhaarNumber = maskAadhaar(safeCandidate.aadhaarNumber);
    }

    res.json({
      success: true,
      data: {
        ...safeCandidate,
        education, experience,
        documents: isEmployer ? [] : docs,
        applications: applicationsList,
        readiness, // readiness 2026-07-07: agent/admin/employer all render the same truth
      },
    });
  } catch (err) { next(err); }
});

// ─── AGENCY REVIEWS ─────────────────────────────────────────────────────────
// GET /api/v1/agencies/:id/reviews — public: list reviews for an agency
router.get("/:id/reviews", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });
    const reviews = await storage.db.select().from(agencyReviews).where(eq(agencyReviews.agencyId, req.params.id));
    const avg = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
      : 0;
    res.json({
      success: true,
      data: reviews,
      total: reviews.length,
      averageRating: Number(avg.toFixed(2)),
    });
  } catch (err) {
    logger.error(`Error fetching reviews: ${err}`);
    next(err);
  }
});

// POST /api/v1/agencies/:id/reviews — candidate posts a review
router.post("/:id/reviews", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (user.role !== "candidate") {
      return res.status(403).json({ success: false, message: "Only candidates can post reviews" });
    }

    const { rating, title, review } = req.body;
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be a number between 1 and 5" });
    }

    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    // Verify agency exists
    const agency = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, req.params.id)).limit(1);
    if (!agency.length) return res.status(404).json({ success: false, message: "Agency not found" });

    // audit 2026-07-06 (C17): rating-manipulation guard — one review per
    // candidate per agency, and only from candidates with a real relationship
    // (an application to one of this agency's jobs).
    const [existingReview] = await storage.db.select().from(agencyReviews)
      .where(and(eq(agencyReviews.agencyId, req.params.id), eq(agencyReviews.candidateUserId, user.id)))
      .limit(1);
    if (existingReview) {
      return res.status(409).json({ success: false, message: "You have already reviewed this agency" });
    }
    const [myCandidate] = await storage.db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
    const agencyUserId = agency[0].userId;
    const related = (myCandidate && agencyUserId)
      ? await storage.db.select({ id: applications.id }).from(applications)
          .innerJoin(jobs, eq(applications.jobId, jobs.id))
          .where(and(eq(applications.candidateId, myCandidate.id), eq(jobs.agentId, agencyUserId)))
          .limit(1)
      : [];
    if (!related.length) {
      return res.status(403).json({ success: false, message: "You can only review an agency you have applied to or been placed by" });
    }

    let newReview;
    try {
      [newReview] = await storage.db.insert(agencyReviews).values({
        agencyId: req.params.id,
        candidateUserId: user.id,
        rating,
        title: title || null,
        review: review || null,
      }).returning();
    } catch (e: any) {
      // unique-violation from the (agency_id, candidate_user_id) index → friendly 409
      if (e?.code === "23505" || e?.cause?.code === "23505") {
        return res.status(409).json({ success: false, message: "You have already reviewed this agency" });
      }
      throw e;
    }

    // Update agency's aggregate rating
    const allReviews = await storage.db.select().from(agencyReviews).where(eq(agencyReviews.agencyId, req.params.id));
    const avgRating = Math.round(allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length);
    await storage.db.update(recruitmentAgents)
      .set({ rating: avgRating })
      .where(eq(recruitmentAgents.id, req.params.id));

    res.status(201).json({ success: true, data: newReview });
  } catch (err) {
    logger.error(`Error posting review: ${err}`);
    next(err);
  }
});

// GET /api/v1/agencies — list all agencies (for public browsing)
router.get("/", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });
    const agencies = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.verified, true));
    res.json({ success: true, data: agencies, total: agencies.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/agencies/documents — the calling agent's own KYB documents.
// MUST be declared before the public "/:id" route below: "documents" is a
// single path segment, so "/:id" would otherwise capture it as an agency id
// and 404 (this broke the HPSEDC Item 3 agency document list).
router.get("/documents", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false });
    if ((req.user as any)?.role !== "agent") return res.status(403).json({ success: false });
    if (!storage.db) return res.status(500).json({ success: false });
    const agentRows = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);
    if (!agentRows.length) return res.json({ success: true, data: [] });
    const docs = await storage.db.select().from(agencyDocuments)
      .where(eq(agencyDocuments.agencyId, agentRows[0].id))
      .orderBy(agencyDocuments.uploadedAt);
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
});

// GET /api/v1/agencies/:id — public agency profile (candidate-facing).
// Includes reviews, recent active jobs, and the set of countries this agency
// has posted jobs in — the three signals candidates weigh when deciding
// whether to trust an agency (GulfTalent / Bayt-style public profile).
router.get("/:id", async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });
    const [agency] = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, req.params.id)).limit(1);
    if (!agency) return res.status(404).json({ success: false, message: "Agency not found" });

    const reviews = await storage.db.select().from(agencyReviews).where(eq(agencyReviews.agencyId, agency.id));
    const avgRating = reviews.length ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;

    // Active public jobs posted by this agency (candidates can click through).
    const { jobs } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    const activeJobs = await storage.db.select().from(jobs)
      .where(and(
        eq(jobs.agentId, agency.userId!),
        eq(jobs.visibility, "public"),
        eq(jobs.status, "active"),
      )).limit(20);
    const countriesServed = Array.from(new Set(activeJobs.map((j: any) => j.country).filter(Boolean))).sort();

    res.json({
      success: true,
      data: {
        ...agency,
        reviews,
        reviewCount: reviews.length,
        averageRating: Number(avgRating.toFixed(2)),
        activeJobs: activeJobs.slice(0, 8),
        activeJobCount: activeJobs.length,
        countriesServed,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/agencies/leaderboard — top agencies by composite score
// Score = placements × 10 + rating × 5 (favours both volume and quality)
router.get("/leaderboard/top", async (_req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { getSetting } = await import("../services/settings.service");
    const placementWeight: number = await getSetting("leaderboard.placement_weight");
    const ratingWeight: number = await getSetting("leaderboard.rating_weight");

    const agencies = await storage.db
      .select()
      .from(recruitmentAgents)
      .where(eq(recruitmentAgents.verified, true));

    // Compute review counts in parallel
    const withReviews = await Promise.all(agencies.map(async (a: any) => {
      const reviews = await storage.db!.select().from(agencyReviews).where(eq(agencyReviews.agencyId, a.id));
      const reviewCount = reviews.length;
      const avgRating = reviewCount > 0
        ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviewCount
        : 0;
      const score = (a.placements || 0) * placementWeight + Math.round(avgRating * ratingWeight);
      return {
        id: a.id,
        agencyName: a.agencyName,
        licenseNumber: a.licenseNumber,
        specializations: a.specializations,
        verified: a.verified,
        placements: a.placements || 0,
        averageRating: Number(avgRating.toFixed(2)),
        reviewCount,
        score,
        // Badges
        badges: [
          ...(a.placements >= 50 ? ["top_placer"] : []),
          ...(avgRating >= 4.5 && reviewCount >= 5 ? ["five_star"] : []),
          ...(reviewCount >= 20 ? ["well_reviewed"] : []),
        ],
      };
    }));

    // Sort by composite score, desc
    const ranked = withReviews
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 50)
      .map((a: any, i: number) => ({ ...a, rank: i + 1 }));

    res.json({
      success: true,
      data: ranked,
      total: ranked.length,
      scoring: {
        formula: "placements * 10 + averageRating * 5",
        weights: { placements: 10, rating: 5 },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────
// v0.4.32 (HPSEDC Item 3): Agency KYB profile updates + documents
// ─────────────────────────────────────────────────────────────────────

// PATCH /me — agent updates their KYB fields (post-register fill-in).
// v0.7.5.0 — Post-verification edit policy (mirrors employer):
//   CONTACT_FIELDS  → free to edit, verification stays intact
//   REGULATED_FIELDS → editing any of these on a verified agency resets
//                      `verified=false`, writes audit log entry. HPSEDC
//                      must re-approve. Critical because licenseNumber +
//                      meaLicenseExpiry + signatory identity are the
//                      regulatory anchor for the agency.
router.patch("/me", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false });
    if ((req.user as any)?.role !== "agent") {
      return res.status(403).json({ success: false, message: "Only agents have agency profiles." });
    }
    if (!storage.db) return res.status(500).json({ success: false });

    const existing = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);
    if (!existing.length) return res.status(404).json({ success: false, message: "Register the agency first." });

    const CONTACT_FIELDS = [
      "specializations",
      "contactEmail", "contactPhone",
      "registeredAddressLine1", "registeredAddressLine2", "registeredCity",
      "registeredState", "registeredPinCode",
      "authorisedSignatoryDesignation",
    ];
    const REGULATED_FIELDS = [
      "agencyName", "licenseNumber", "meaLicenseExpiry",
      "authorisedSignatoryName",
    ];
    const ALL_FIELDS = [...CONTACT_FIELDS, ...REGULATED_FIELDS];

    const row = existing[0] as any;
    const update: any = {};
    const regulatedChanges: Record<string, { from: any; to: any }> = {};
    for (const f of ALL_FIELDS) {
      if (req.body[f] === undefined) continue;
      const newVal = req.body[f];
      const oldVal = row[f];
      if (REGULATED_FIELDS.includes(f) && String(newVal ?? "") !== String(oldVal ?? "")) {
        regulatedChanges[f] = { from: oldVal ?? null, to: newVal ?? null };
      }
      update[f] = newVal;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: "No updatable fields supplied" });
    }

    const requiresReVerification = row.verified === true && Object.keys(regulatedChanges).length > 0;
    if (requiresReVerification) {
      update.verified = false;
      update.submittedForReviewAt = null;
      update.rejectionReason = null;
    }

    const updated = await storage.db.update(recruitmentAgents).set(update)
      .where(eq(recruitmentAgents.id, row.id)).returning();

    if (Object.keys(regulatedChanges).length > 0) {
      const { auditLog } = await import("@shared/schema");
      await storage.db.insert(auditLog).values({
        userId,
        action: requiresReVerification ? "agency.regulated_edit_reset_verification" : "agency.regulated_edit",
        resourceType: "agency",
        resourceId: row.id,
        details: { changes: regulatedChanges, wasVerified: row.verified === true } as any,
      }).catch(() => {});
    }

    res.json({ success: true, data: updated[0], requiresReVerification });
  } catch (err) { next(err); }
});

// Submit for admin review — same shape as employer flow.
router.post("/submit-for-review", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false });
    if ((req.user as any)?.role !== "agent") {
      return res.status(403).json({ success: false, message: "Only agents" });
    }
    if (!storage.db) return res.status(500).json({ success: false });

    const rows = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, message: "Register the agency first." });
    if (rows[0].verified) return res.status(400).json({ success: false, error: { code: 400, message: "Already verified" } });

    // Require MEA RA license doc before submit
    const docs = await storage.db.select().from(agencyDocuments)
      .where(eq(agencyDocuments.agencyId, rows[0].id));
    const hasLicense = docs.some((d: any) => d.type === "mea_ra_license");
    if (!hasLicense) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "Upload your MEA RA Licence before submitting for review." },
      });
    }
    await storage.db.update(recruitmentAgents).set({
      submittedForReviewAt: new Date(),
      rejectionReason: null,
    }).where(eq(recruitmentAgents.id, rows[0].id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Documents (agent uploads, lists, deletes) ──
router.post("/documents",
  protect, agencyDocUpload.single("file"), verifyUploadedFile,
  async (req, res, next) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ success: false });
      if ((req.user as any)?.role !== "agent") return res.status(403).json({ success: false });
      if (!storage.db) return res.status(500).json({ success: false });
      if (!req.file) return res.status(400).json({ success: false, error: { code: 400, message: "No file uploaded" } });

      const agentRows = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);
      if (!agentRows.length) return res.status(404).json({ success: false, message: "Register the agency first." });

      const docType = req.body.type || "other";
      if (!AGENCY_DOC_TYPES.includes(docType)) {
        return res.status(400).json({ success: false, error: { code: 400, message: `Invalid type. Must be one of: ${AGENCY_DOC_TYPES.join(", ")}` } });
      }
      const inserted = await storage.db.insert(agencyDocuments).values({
        agencyId: agentRows[0].id,
        type: docType,
        fileName: req.file.originalname,
        fileUrl: `/uploads/hs/agencies/docs/${req.file.filename}`,
        fileSize: req.file.size,
      }).returning();
      logger.info(`Agency doc uploaded: ${inserted[0].id} by agency ${agentRows[0].id}`);
      res.status(201).json({ success: true, data: inserted[0] });
    } catch (err) { next(err); }
  },
);

router.delete("/documents/:id", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false });
    if ((req.user as any)?.role !== "agent") return res.status(403).json({ success: false });
    if (!storage.db) return res.status(500).json({ success: false });

    const docRows = await storage.db.select().from(agencyDocuments).where(eq(agencyDocuments.id, req.params.id)).limit(1);
    if (!docRows.length) return res.status(404).json({ success: false });
    const doc = docRows[0];
    const agentRows = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, doc.agencyId)).limit(1);
    if (!agentRows.length || agentRows[0].userId !== userId) {
      return res.status(403).json({ success: false, message: "Not your document" });
    }
    if (doc.status === "approved") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Cannot remove an approved document. Contact admin." } });
    }
    const rel = (doc.fileUrl || "").replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_AGENCY_DOCS_DIR, path.basename(rel));
    try { await fs.unlink(filePath); } catch { /* tolerate */ }
    await storage.db.delete(agencyDocuments).where(eq(agencyDocuments.id, doc.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get("/documents/:id/download", protect, async (req, res, next) => {
  try {
    if (!storage.db) return res.status(500).json({ success: false });
    const user = req.user as any;
    const docRows = await storage.db.select().from(agencyDocuments).where(eq(agencyDocuments.id, req.params.id)).limit(1);
    if (!docRows.length) return res.status(404).json({ success: false });
    const doc = docRows[0];
    if (user.role === "agent") {
      const agentRows = await storage.db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, doc.agencyId)).limit(1);
      if (!agentRows.length || agentRows[0].userId !== user.id) {
        return res.status(403).json({ success: false });
      }
    } else if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false });
    }
    const rel = (doc.fileUrl || "").replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_AGENCY_DOCS_DIR, path.basename(rel));
    try { await fs.access(filePath); } catch { return res.status(404).json({ success: false }); }
    if (req.query.inline === "1" || req.query.preview === "1") {
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
      return res.sendFile(path.resolve(filePath));
    }
    res.download(filePath, doc.fileName);
  } catch (err) { next(err); }
});

router.use(handleUploadErrors);

export default router;

