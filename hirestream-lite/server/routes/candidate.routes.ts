import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import {
  updateCandidateSchema, candidates, applications, jobs, users,
  candidateEducation, candidateExperience, candidateLanguages, documents,
  insertEducationSchema, insertExperienceSchema, insertLanguageSchema, placements, interviews,
} from "@shared/schema";
import { eq, and, ne, count, inArray } from "drizzle-orm";
import { z } from "zod";
import { notify } from "../services/notification.service";
import { userOwnsCandidate } from "../lib/ownership";
import { normalizeQualification } from "@shared/education";

const router = Router();

// Get candidate profile
router.get("/profile", protect, async (req, res, next) => {
  try {
     const userId = (req.user as any)?.id;
     if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
     
     if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });
     
     const result = await storage.db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
     
     if (!result || result.length === 0) {
        return res.status(404).json({ success: false, message: "Candidate profile not found" });
     }
     
     // Fetch username from users table
     const userRow = await storage.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
     const username = userRow?.[0]?.username || null;
     
     res.json({ success: true, data: { ...result[0], username } });
  } catch (err) {
    logger.error(`Error fetching candidate profile: ${err}`);
    next(err);
  }
});

// Update candidate profile
router.patch("/profile", protect, async (req, res, next) => {
  try {
     const userId = (req.user as any)?.id;
     if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

     if ((req.user as any)?.role !== "candidate") {
        return res.status(403).json({ success: false, message: "Only candidates can update their profiles." });
     }

     // safeParse so Zod issues surface as a clean 400 with the first
     // field-level message — the old .parse() path threw, bubbled to the
     // global error handler, and came back to the client as a 500 with a
     // JSON-stringified issues array.
     const parsed = updateCandidateSchema.safeParse(req.body);
     if (!parsed.success) {
       return res.status(400).json({
         success: false,
         message: parsed.error.issues[0]?.message ?? "Invalid input",
         issues: parsed.error.issues,
       });
     }
     const validatedData = parsed.data;
     
     if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

     // Check if candidate exists, otherwise create it
     const existing = await storage.db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);

     if (!existing || existing.length === 0) {
        // Technically, candidate rows should be created on registration, but if not, we create it here
        const newCandidate = await storage.db.insert(candidates).values({
          userId,
          fullName: (req.user as any)?.username || "Unknown",
          email: (req.user as any)?.email || "",
          ...validatedData
        }).returning();
        
        return res.status(200).json({ success: true, data: newCandidate[0] });
     }

     const updated = await storage.db.update(candidates)
         .set(validatedData)
         .where(eq(candidates.userId, userId))
         .returning();

     // If username was provided, also update the users table.
     // audit 2026-07-06 (S8): previously written with only trim() — bypassing
     // length/format and uniqueness. Validate + reject duplicates.
     if (req.body.username && typeof req.body.username === "string") {
       const nextUsername = req.body.username.trim();
       if (nextUsername.length < 3 || nextUsername.length > 100) {
         return res.status(400).json({ success: false, message: "Username must be 3–100 characters." });
       }
       const clash = await storage.db.select({ id: users.id }).from(users)
         .where(and(eq(users.username, nextUsername), ne(users.id, userId))).limit(1);
       if (clash.length > 0) {
         return res.status(409).json({ success: false, message: "That username is already taken." });
       }
       await storage.db.update(users)
         .set({ username: nextUsername })
         .where(eq(users.id, userId));
     }

     res.status(200).json({ success: true, data: updated[0] });
  } catch (err) {
    logger.error(`Error updating candidate profile: ${err}`);
    next(err);
  }
});

// Get candidate's applications with full job details (JOIN)
router.get("/applications", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    // Find candidate record
    const candidateResult = await storage.db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
    if (!candidateResult || candidateResult.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const candidateId = candidateResult[0].id;

    // Join applications with jobs to get full details
    const result = await storage.db
      .select({
        application: applications,
        job: jobs,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.candidateId, candidateId));

    // Flatten into a clean response
    const appIds = result.map((r: any) => r.application.id);
    // Pull placements + next interview per application so the candidate UI can
    // render offer Accept/Decline and "upcoming interview" without extra calls.
    const placementRows = appIds.length === 0 ? [] : await storage.db
      .select().from(placements).where(inArray(placements.applicationId, appIds));
    const interviewRows = appIds.length === 0 ? [] : await storage.db
      .select().from(interviews).where(inArray(interviews.applicationId, appIds));
    const placementByApp = new Map(placementRows.map((p: any) => [p.applicationId, p]));
    const interviewByApp = new Map(
      interviewRows
        .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .map((i: any) => [i.applicationId, i])
    );

    const enriched = result.map((row: any) => {
      const p: any = placementByApp.get(row.application.id);
      const i: any = interviewByApp.get(row.application.id);
      return {
        id: row.application.id,
        status: row.application.status,
        matchScore: row.application.matchScore,
        rejectionFeedback: row.application.rejectionFeedback,
        appliedAt: row.application.appliedAt,
        jobId: row.job.id,
        jobTitle: row.job.title,
        company: row.job.company,
        location: row.job.location,
        country: row.job.country,
        salary: row.job.salary,
        skills: row.job.skills,
        // Offer data (from placements table) for FRS 1.26 / 1.27
        placement: p ? {
          id: p.id, status: p.status, startDate: p.startDate, country: p.country,
          salary: p.salary, visaStatus: p.visaStatus,
          appointmentLetterUrl: p.appointmentLetterUrl, declineReason: p.declineReason,
        } : null,
        // Next scheduled interview for this application.
        // v0.4.34 (Phase 4): added interviewerName, meetingLink, and the
        // candidate-confirmation workflow fields so the candidate UI can
        // render the full interview panel + Confirm / Reschedule / Decline
        // controls without an extra GET round-trip.
        nextInterview: i ? {
          id: i.id, scheduledAt: i.scheduledAt, location: i.location, mode: i.mode, result: i.result,
          interviewerName: i.interviewerName, meetingLink: i.meetingLink,
          candidateConfirmedStatus: i.candidateConfirmedStatus,
          candidateConfirmedAt: i.candidateConfirmedAt,
          candidateRescheduleReason: i.candidateRescheduleReason,
          candidateProposedAt: i.candidateProposedAt,
          candidateDeclineReason: i.candidateDeclineReason,
        } : null,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error(`Error fetching candidate applications: ${err}`);
    next(err);
  }
});

// NOTE (audit 2026-07-06, S1): the legacy `PUT /applications/:id/status`
// duplicate lived here. It was role-gated but had NO job-ownership check —
// any agent/employer could change any application's status by ID (IDOR),
// and it also bypassed terminal-state locks, backward-transition gates,
// placement auto-create, and audit logging. Its only client caller was a
// dead component (ApplicantManager). Removed in favour of the canonical,
// fully-guarded `PATCH /api/v1/applications/:id/status` in application.routes.ts.

// ═══════════════════════════════════════════════════════════════════
// PDF PROFILE EXPORT
// ═══════════════════════════════════════════════════════════════════

// security 2026-07-07 (A03): HTML-escape user-supplied fields before
// interpolating them into the server-rendered profile HTML (self-XSS —
// sanitizeRequest strips obvious tags, but escape-on-output is the rule).
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.get("/profile/pdf", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const profileRows = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
    const profile = profileRows[0];

    const eduRows = await db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId));
    const expRows = await db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candidateId));

    // Generate HTML resume — all candidate-supplied fields go through
    // escapeHtml (security 2026-07-07, A03).
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(profile.fullName)} - Profile</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #333; }
  h1 { color: #1a56db; margin-bottom: 4px; }
  h2 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 4px; margin-top: 28px; font-size: 16px; }
  .subtitle { color: #666; font-size: 14px; }
  .section { margin-bottom: 20px; }
  .entry { margin-bottom: 12px; }
  .entry-title { font-weight: bold; }
  .entry-detail { color: #555; font-size: 13px; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-tag { background: #e8f0fe; color: #1a56db; padding: 3px 10px; border-radius: 12px; font-size: 12px; }
  .header-line { display: flex; justify-content: space-between; align-items: baseline; }
  .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 12px; }
</style></head><body>

<h1>${escapeHtml(profile.fullName)}</h1>
<p class="subtitle">${escapeHtml(profile.email)}${profile.phone ? ' | ' + escapeHtml(profile.phone) : ''}${profile.location ? ' | ' + escapeHtml(profile.location) : ''}</p>

${profile.skills && profile.skills.length > 0 ? `
<h2>Skills</h2>
<div class="skills">${profile.skills.map((s: string) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}</div>
` : ''}

${profile.preferredCountries && profile.preferredCountries.length > 0 ? `
<h2>Preferred Countries</h2>
<p>${escapeHtml(profile.preferredCountries.join(', '))}</p>
` : ''}

${eduRows.length > 0 ? `
<h2>Education</h2>
${eduRows.map((e: any) => `
<div class="entry">
  <div class="header-line">
    <span class="entry-title">${escapeHtml(e.degree)}</span>
    <span class="entry-detail">${escapeHtml(e.year || '')}</span>
  </div>
  <div class="entry-detail">${escapeHtml(e.institution)}${e.percentage ? ' — ' + escapeHtml(e.percentage) + '%' : ''}</div>
</div>`).join('')}
` : ''}

${expRows.length > 0 ? `
<h2>Work Experience</h2>
${expRows.map((e: any) => `
<div class="entry">
  <div class="header-line">
    <span class="entry-title">${escapeHtml(e.role)}</span>
    <span class="entry-detail">${e.years ? escapeHtml(e.years) + ' yr(s)' : ''}</span>
  </div>
  <div class="entry-detail">${escapeHtml(e.company)}${e.country ? ', ' + escapeHtml(e.country) : ''}</div>
  ${e.description ? `<div class="entry-detail" style="margin-top:4px">${escapeHtml(e.description)}</div>` : ''}
</div>`).join('')}
` : ''}

<p class="footer">Generated from HireStream — HPSEDC Overseas Placement Portal | ${new Date().toLocaleDateString('en-IN')}</p>
</body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="${profile.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_Profile.html"`);
    res.send(html);
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// EDUCATION CRUD
// ═══════════════════════════════════════════════════════════════════

async function getCandidateIdFromUser(userId: string): Promise<string | null> {
  const db = storage.db;
  if (!db) return null;
  const rows = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
  return rows.length > 0 ? rows[0].id : null;
}

// Add education
router.post("/education", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    // Validate year/percentage ranges — HTIS BUG-003 caught out-of-range values
    // being accepted. Validation lives in insertEducationSchema so the same
    // rules apply to PUT below.
    const parsed = insertEducationSchema.safeParse({ ...req.body, candidateId });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues } });
    }
    // UAT-03 Item 5: prevent duplicate education entries (e.g. two "10th Grade").
    //
    // 2026-07-16: this was defeatable and live data defeated it. It required
    // BOTH type and degree to match, but the seed never wrote `type`, so every
    // pre-existing row has type=null. Comparing null against the "school" the
    // wizard sends never matched, and an EXACT duplicate "10th (Matriculation)"
    // was accepted (verified live). Two changes:
    //   1. Degree is the identity — a candidate cannot hold the same
    //      qualification twice regardless of which chip it was filed under, so a
    //      null/absent type can no longer wave a duplicate through.
    //   2. Compare on a normalised form (case, whitespace, punctuation and
    //      common filler) so "10th", "10th Grade" and "10th  grade." collide.
    //      The picker makes new entries canonical; this catches the free-typed
    //      "Other" ones and the legacy rows.
    // Normaliser lives in @shared/education so the picker's "hide what's already
    // added" filter and this 409 can never disagree.
    const normDegree = normalizeQualification;
    const existingEdu = await db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId));
    const incoming = normDegree(parsed.data.degree);
    if (incoming && existingEdu.some((e: any) => normDegree(e.degree) === incoming)) {
      return res.status(409).json({ success: false, error: { code: 409, message: `"${parsed.data.degree}" is already in your profile.` } });
    }
    const result = await db.insert(candidateEducation).values(parsed.data as any).returning();
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// List education
router.get("/education", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.json({ success: true, data: [] });

    const rows = await db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId));
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Update education
router.put("/education/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    // Verify ownership
    const existing = await db.select().from(candidateEducation)
      .where(and(eq(candidateEducation.id, req.params.id), eq(candidateEducation.candidateId, candidateId)))
      .limit(1);
    if (existing.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Education record not found" } });

    const { candidateId: _, id: __, ...updateBody } = req.body;
    // Same validation as POST — BUG-003 applies to edits too.
    const parsed = insertEducationSchema.partial().safeParse(updateBody);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues } });
    }
    const result = await db.update(candidateEducation).set(parsed.data as any).where(eq(candidateEducation.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Delete education
router.delete("/education/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const existing = await db.select().from(candidateEducation)
      .where(and(eq(candidateEducation.id, req.params.id), eq(candidateEducation.candidateId, candidateId)))
      .limit(1);
    if (existing.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Education record not found" } });

    await db.delete(candidateEducation).where(eq(candidateEducation.id, req.params.id));
    res.json({ success: true, message: "Education record deleted" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// LANGUAGES CRUD (UAT-03 Item 12 — first-class language proficiency)
// ═══════════════════════════════════════════════════════════════════

// List languages
router.get("/languages", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const candidateId = await getCandidateIdFromUser((req.user as any).id);
    if (!candidateId) return res.json({ success: true, data: [] });
    const rows = await db.select().from(candidateLanguages).where(eq(candidateLanguages.candidateId, candidateId));
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Add language
router.post("/languages", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const candidateId = await getCandidateIdFromUser((req.user as any).id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const parsed = insertLanguageSchema.safeParse({ ...req.body, candidateId });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues } });
    }
    // Prevent duplicate language for the same candidate.
    const dupe = await db.select().from(candidateLanguages)
      .where(and(eq(candidateLanguages.candidateId, candidateId), eq(candidateLanguages.language, parsed.data.language)))
      .limit(1);
    if (dupe.length) return res.status(409).json({ success: false, error: { code: 409, message: "This language is already added." } });

    const result = await db.insert(candidateLanguages).values(parsed.data as any).returning();
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Delete language
router.delete("/languages/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const candidateId = await getCandidateIdFromUser((req.user as any).id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });
    const existing = await db.select().from(candidateLanguages)
      .where(and(eq(candidateLanguages.id, req.params.id), eq(candidateLanguages.candidateId, candidateId)))
      .limit(1);
    if (existing.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Language not found" } });
    await db.delete(candidateLanguages).where(eq(candidateLanguages.id, req.params.id));
    res.json({ success: true, message: "Language removed" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// EXPERIENCE CRUD
// ═══════════════════════════════════════════════════════════════════

// Add experience
router.post("/experience", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const parsed = insertExperienceSchema.safeParse({ ...req.body, candidateId });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues } });
    }
    const result = await db.insert(candidateExperience).values(parsed.data as any).returning();
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// List experience
router.get("/experience", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.json({ success: true, data: [] });

    const rows = await db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candidateId));
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Update experience
router.put("/experience/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const existing = await db.select().from(candidateExperience)
      .where(and(eq(candidateExperience.id, req.params.id), eq(candidateExperience.candidateId, candidateId)))
      .limit(1);
    if (existing.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Experience record not found" } });

    const { candidateId: _, id: __, ...updateBody } = req.body;
    const parsed = insertExperienceSchema.partial().safeParse(updateBody);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues } });
    }
    const result = await db.update(candidateExperience).set(parsed.data as any).where(eq(candidateExperience.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Delete experience
router.delete("/experience/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found" } });

    const existing = await db.select().from(candidateExperience)
      .where(and(eq(candidateExperience.id, req.params.id), eq(candidateExperience.candidateId, candidateId)))
      .limit(1);
    if (existing.length === 0) return res.status(404).json({ success: false, error: { code: 404, message: "Experience record not found" } });

    await db.delete(candidateExperience).where(eq(candidateExperience.id, req.params.id));
    res.json({ success: true, message: "Experience record deleted" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PROFILE COMPLETION
// ═══════════════════════════════════════════════════════════════════

router.get("/profile/completion", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    const candidateId = await getCandidateIdFromUser(user.id);
    if (!candidateId) {
      return res.json({ success: true, data: { percentage: 0, missing: ["profile", "education", "experience", "idDocument", "passport"] } });
    }

    // Fetch candidate profile
    const profileRows = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
    const profile = profileRows[0];

    // Check each section (8 checkpoints, each worth 12.5%)
    const checks: { name: string; done: boolean }[] = [];

    // 1. Full name
    checks.push({ name: "fullName", done: Boolean(profile.fullName && profile.fullName !== "Unknown") });
    // 2. Email
    checks.push({ name: "email", done: Boolean(profile.email) });
    // 3. Phone
    checks.push({ name: "phone", done: Boolean(profile.phone) });
    // 4. Location
    checks.push({ name: "location", done: Boolean(profile.location) });
    // 5. Skills (at least 1)
    checks.push({ name: "skills", done: Boolean(profile.skills && profile.skills.length > 0) });
    // 6. At least 1 education record
    const eduCount = await db.select({ c: count() }).from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId));
    checks.push({ name: "education", done: (eduCount[0]?.c ?? 0) > 0 });
    // 7. Experience — a detailed record OR the total (the simplified /apply flow
    //    sets candidates.experience_months, not a candidate_experience row).
    const expCount = await db.select({ c: count() }).from(candidateExperience).where(eq(candidateExperience.candidateId, candidateId));
    checks.push({ name: "experience", done: (expCount[0]?.c ?? 0) > 0 || (profile.experienceMonths ?? 0) > 0 || (profile.experience ?? 0) > 0 });
    // 8 + 9. Documents are REQUIRED for overseas placement (HP-4c, per HPSEDC
    //    review): an identity proof (Aadhaar / ID) AND a passport. A profile is
    //    never "ready" (100%) without both — no more "ready" with zero uploads.
    const docRows = await db.select({ type: documents.type }).from(documents).where(eq(documents.candidateId, candidateId));
    const docTypes = new Set(docRows.map((d: { type: string | null }) => String(d.type || "").toLowerCase()));
    const hasIdDoc = ["identity_proof", "id", "aadhaar", "national_id", "voter_id"].some((t) => docTypes.has(t));
    const hasPassportDoc = docTypes.has("passport");
    checks.push({ name: "idDocument", done: hasIdDoc });
    checks.push({ name: "passport", done: hasPassportDoc });

    const completed = checks.filter((c) => c.done).length;
    const percentage = Math.round((completed / checks.length) * 100);
    const missing = checks.filter((c) => !c.done).map((c) => c.name);

    res.json({ success: true, data: { percentage, completed, total: checks.length, missing, checks } });
  } catch (error) {
    next(error);
  }
});

// ── UAT-03 #13: country/visa rejection (agent/admin records; hides those jobs) ──
router.post("/:id/country-rejection", protect, async (req, res, next) => {
  try {
    const role = (req.user as any)?.role;
    if (!["agent", "admin", "superadmin"].includes(role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const country = String(req.body?.country || "").trim();
    if (!country) return res.status(400).json({ success: false, message: "country is required" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const rows = await db.select({ rc: candidates.rejectedCountries }).from(candidates).where(eq(candidates.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, message: "Candidate not found" });
    // security 2026-07-07 (A01-8): per-candidate ownership — the agent must
    // own at least one job this candidate applied to (admins bypass inside).
    if (!(await userOwnsCandidate(db, req.user as any, req.params.id))) {
      return res.status(403).json({ success: false, message: "You can only record rejections for candidates on your own jobs." });
    }
    const set = Array.from(new Set([...(rows[0].rc || []), country]));
    await db.update(candidates).set({ rejectedCountries: set }).where(eq(candidates.id, req.params.id));
    res.json({ success: true, data: { rejectedCountries: set } });
  } catch (e) { next(e); }
});
router.delete("/:id/country-rejection", protect, async (req, res, next) => {
  try {
    const role = (req.user as any)?.role;
    if (!["agent", "admin", "superadmin"].includes(role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const country = String((req.query?.country as string) || "").trim();
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const rows = await db.select({ rc: candidates.rejectedCountries }).from(candidates).where(eq(candidates.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, message: "Candidate not found" });
    // security 2026-07-07 (A01-8): per-candidate ownership (admins bypass inside).
    if (!(await userOwnsCandidate(db, req.user as any, req.params.id))) {
      return res.status(403).json({ success: false, message: "You can only update rejections for candidates on your own jobs." });
    }
    const nextList = (rows[0].rc || []).filter((c: string) => c !== country);
    await db.update(candidates).set({ rejectedCountries: nextList }).where(eq(candidates.id, req.params.id));
    res.json({ success: true, data: { rejectedCountries: nextList } });
  } catch (e) { next(e); }
});

export default router;
