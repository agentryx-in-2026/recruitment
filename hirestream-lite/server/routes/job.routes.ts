import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import {
  insertJobSchema, draftJobSchema, jobs, recruitmentAgents, applications,
  candidates, notifications, savedJobs,
  candidateEducation, candidateExperience, documents,
} from "@shared/schema";
import { eq, and, or, ne, ilike, gte, lte, sql, desc, asc, count, inArray, notInArray } from "drizzle-orm";
import { notify } from "../services/notification.service";

const router = Router();

// ── Create Job ──────────────────────────────────────────────────────
router.post("/", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    if (!userId) return res.status(401).json({ success: false, error: { code: 401, message: "Unauthorized" } });

    if (userRole !== "agent" && userRole !== "employer") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only agents and employers can post jobs." } });
    }

    // System Controls: job posting pipeline pause (super-admin runtime toggle)
    const { getControls } = await import("../services/system-controls.service");
    const ctrl = await getControls();
    if (ctrl.jobPostingPaused) {
      return res.status(503).json({
        success: false,
        error: { code: 503, message: ctrl.jobPostingPauseMessage, pipelinePaused: "job_posting" },
      });
    }

    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // If agent, optionally enforce agency verification (runtime-configurable)
    if (userRole === "agent") {
      const { getSetting } = await import("../services/settings.service");
      const requireVerified: boolean = await getSetting("agency.require_verification_to_post");
      // Drafts are allowed while KYB is pending — only publishing is gated
      // (mirrors the employer gate below). Fixes unverified agencies being
      // unable to save a draft requisition.
      const isDraftPost = req.body?.isDraft === true;
      if (requireVerified && !isDraftPost) {
        const agentResult = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, userId)).limit(1);
        if (!agentResult.length || !agentResult[0].verified) {
          return res.status(403).json({ success: false, error: { code: 403, message: "Your agency must be verified before publishing jobs. You can still save drafts." } });
        }
      }
      // Enforce per-agency active-jobs cap
      const maxActive: number = await getSetting("agency.max_active_jobs");
      if (maxActive > 0) {
        const [{ c }] = await db.select({ c: count() }).from(jobs)
          .where(and(eq(jobs.agentId, userId), eq(jobs.status, "active")));
        if (Number(c) >= maxActive) {
          return res.status(403).json({ success: false, error: { code: 403, message: `Agency job limit reached (${maxActive} active jobs). Close an existing posting before adding a new one.` } });
        }
      }
    }

    // v0.4.32 (HPSEDC Item 1): same gate for employers, runtime-configurable
    // via setting `employer.require_verification_to_post`. Drafts are still
    // allowed so an unverified employer can prepare a requisition while their
    // KYB is in review — the publish step is what gets blocked.
    if (userRole === "employer") {
      const { getSetting } = await import("../services/settings.service");
      const requireVerified: boolean = await getSetting("employer.require_verification_to_post");
      const isDraftPost = req.body?.isDraft === true;
      if (requireVerified && !isDraftPost) {
        const { employers } = await import("@shared/schema");
        const empResult = await db.select().from(employers).where(eq(employers.userId, userId)).limit(1);
        if (!empResult.length || !empResult[0].verified) {
          return res.status(403).json({ success: false, error: { code: 403, message: "Your company must be verified before publishing requisitions. You can still save drafts." } });
        }
      }
    }

    const isDraft = req.body?.isDraft === true;
    const { isDraft: _discard, ...payload } = req.body ?? {};
    // safeParse so Zod issues surface as a clean 400 with the first
    // field-level message — `.parse()` threw and the global handler turned it
    // into a 500 with a JSON-stringified blob, which the HTIS regression
    // caught on BUG-008's past-date rejection.
    const parsed = isDraft ? draftJobSchema.safeParse(payload) : insertJobSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues },
      });
    }
    const validatedData = parsed.data as any;

    // Country validation — overseas portal scope. Drafts allowed without
    // country; non-draft posts must be a valid destination in country_info
    // (admin-curated). India is rejected with a scoped error message.
    const { validateCountry } = await import("../services/country-validator.service");
    const countryCheck = validateCountry(validatedData.country);
    if (!countryCheck.ok) {
      return res.status(400).json({
        success: false,
        error: { code: countryCheck.code, message: countryCheck.message },
      });
    }

    // v0.4.31 (HPSEDC Item 8): canonicalise the category against the controlled
    // vocabulary. Required for non-draft posts. We accept any seed key plus an
    // admin-extended key from `job.categories.extra` so HPSEDC can broaden the
    // list at runtime without a redeploy.
    if (validatedData.category !== undefined && validatedData.category !== null && validatedData.category !== "") {
      const { normaliseCategory } = await import("../services/job-categories.seed");
      const canonical = normaliseCategory(String(validatedData.category));
      if (!canonical) {
        return res.status(400).json({
          success: false,
          error: { code: 400, message: "Invalid job category. Pick one from the dropdown." },
        });
      }
      validatedData.category = canonical;
    }

    // PWS §7 / Tier 3: cap drafts per user to prevent sprawl
    if (isDraft) {
      const { getSetting } = await import("../services/settings.service");
      const maxDrafts: number = await getSetting("jobs.max_drafts_per_user");
      if (maxDrafts > 0) {
        const ownerCol = userRole === "agent" ? jobs.agentId : jobs.employerId;
        const [{ c: draftCount }] = await db.select({ c: count() }).from(jobs)
          .where(and(eq(ownerCol, userId), eq(jobs.status, "draft")));
        if (Number(draftCount) >= maxDrafts) {
          return res.status(403).json({
            success: false,
            error: { code: 403, message: `Draft limit reached (${maxDrafts}). Delete or publish an existing draft before creating a new one.` },
          });
        }
      }
    }

    // Drafts can have blank company/location/country (user will fill before publishing).
    // DB columns are NOT NULL, so we store empty strings as placeholders.
    const draftDefaults = isDraft ? {
      company: validatedData.company ?? "",
      location: validatedData.location ?? "",
      country: validatedData.country ?? "",
    } : {};

    // PWS §2: employer-posted jobs are requisitions (agents_only); agent-posted
    // are public by default unless a parentRequisitionId is being set (derivative).
    // Clients may also pass visibility/parentRequisitionId when cloning or drafting.
    //
    // HPSEDC tester report (2026-05-24): employer-posted public jobs were
    // bypassing the agent middleman, producing orphan applications with no
    // owner. FRS §2.2 mandates every candidate-facing job flow through an
    // agent — so when role=employer, we hard-pin visibility to agents_only
    // regardless of what the client sent. Agents keep the existing override
    // freedom (drafts / public direct postings).
    const clientVisibility = (req.body?.visibility as string | undefined);
    const visibility = userRole === "employer"
      ? "agents_only"
      : (clientVisibility === "agents_only" || clientVisibility === "public"
          ? clientVisibility : "public");

    // HP-3b: in single-agency mode every job is owned by the one mega-agency
    // (HPSEDC), whichever staff account created it. Marketplace mode keeps
    // creator ownership (reference behaviour). Falls back to creator ownership
    // if the mega-agency isn't seeded yet.
    let ownership: Record<string, string> = userRole === "agent" ? { agentId: userId } : { employerId: userId };
    {
      const { getSetting: getModeSetting } = await import("../services/settings.service");
      if ((await getModeSetting("capability.agency_mode")) === "single") {
        const { getDefaultAgencyUserId } = await import("../services/default-agency.seed");
        const defaultAgencyUserId = await getDefaultAgencyUserId();
        if (defaultAgencyUserId) ownership = { agentId: defaultAgencyUserId };
      }
    }

    const newJob = await db.insert(jobs).values({
      ...validatedData,
      ...draftDefaults,
      ...ownership,
      visibility,
      status: isDraft ? "draft" : "active",
    }).returning();

    logger.info(`Job ${isDraft ? "draft" : "created"}: ${newJob[0].id} by ${userRole} ${userId}`);

    // PWS §7.20: auto-match notifications for newly published public jobs
    if (!isDraft && newJob[0].visibility === "public" && newJob[0].status === "active") {
      const { fireAutoMatchForJob } = await import("../services/auto-match.service");
      fireAutoMatchForJob(newJob[0]).catch(() => { /* non-blocking */ });
    }

    res.status(201).json({ success: true, data: newJob[0] });
  } catch (err) {
    next(err);
  }
});

// ── Search Jobs (with filters + pagination) ─────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const {
      q, country, location, sector, category, minSalary, maxSalary, minExp, maxExp,
      status, sort, order, page = "1", limit = "20",
      mine,  // when "true", restrict to jobs owned by authed agent/employer — unlocks drafts
    } = req.query;

    const authedUserId = (req.user as any)?.id as string | undefined;
    const authedUserRole = (req.user as any)?.role as string | undefined;
    const viewingOwn = mine === "true" && !!authedUserId &&
      (authedUserRole === "agent" || authedUserRole === "employer" || authedUserRole === "admin");

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Build conditions
    const conditions: any[] = [];

    // Status filter. Public search never shows drafts; owners can see their drafts
    // by passing ?mine=true while authenticated as agent/employer/admin.
    const requestedStatus = (status as string) || "active";
    const canSeeDrafts = viewingOwn;

    if (requestedStatus === "draft") {
      if (!canSeeDrafts) {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } });
      }
      conditions.push(eq(jobs.status, "draft"));
    } else if (requestedStatus !== "all") {
      conditions.push(eq(jobs.status, requestedStatus));
    } else if (!canSeeDrafts) {
      conditions.push(ne(jobs.status, "draft"));
    }

    // Visibility enforcement (PWS §3). Agents-only jobs (employer requisitions)
    // must never appear in the generic job search response for candidates or
    // anonymous visitors. Owners viewing their own jobs still see everything.
    const isStaff = authedUserRole === "agent" || authedUserRole === "employer" || authedUserRole === "admin" || authedUserRole === "superadmin";
    if (!viewingOwn && !isStaff) {
      conditions.push(eq(jobs.visibility, "public"));
    } else if (!viewingOwn && isStaff && authedUserRole !== "admin" && authedUserRole !== "superadmin") {
      // Logged-in agent/employer browsing general listings (not own) still shouldn't
      // see other agents-only jobs unless they pass the requisition endpoint.
      conditions.push(eq(jobs.visibility, "public"));
    }

    // UAT-03 #13: hide jobs in countries this candidate was rejected for (visa/
    // country refusal). They should never be shown a destination they can't go to.
    if (authedUserRole === "candidate" && authedUserId) {
      const candRow = await db.select({ rc: candidates.rejectedCountries }).from(candidates).where(eq(candidates.userId, authedUserId)).limit(1);
      const rejected = (candRow[0]?.rc || []).filter(Boolean);
      if (rejected.length) conditions.push(notInArray(jobs.country, rejected));
    }

    // Ownership filter when viewing own jobs
    if (viewingOwn) {
      if (authedUserRole === "agent") conditions.push(eq(jobs.agentId, authedUserId!));
      else if (authedUserRole === "employer") conditions.push(eq(jobs.employerId, authedUserId!));
      // admins see everything; no extra filter
    }

    // Free text search
    if (q && typeof q === "string") {
      const search = `%${q}%`;
      conditions.push(
        or(
          ilike(jobs.title, search),
          ilike(jobs.company, search),
          ilike(jobs.description, search),
        )
      );
    }

    // Country filter
    if (country && typeof country === "string") {
      conditions.push(ilike(jobs.country, `%${country}%`));
    }

    // Location filter
    if (location && typeof location === "string") {
      conditions.push(ilike(jobs.location, `%${location}%`));
    }

    // Sector filter (search in description)
    if (sector && typeof sector === "string") {
      conditions.push(ilike(jobs.description, `%${sector}%`));
    }

    // v0.4.31 (HPSEDC Item 8): category filter — accepts a single key
    // or a comma-separated list (e.g. ?category=driver,electrician).
    // Unknown keys are silently dropped so a stale UI doesn't 500.
    if (category && typeof category === "string") {
      const { JOB_CATEGORY_KEYS } = await import("../services/job-categories.seed");
      const allowed = new Set(JOB_CATEGORY_KEYS);
      const keys = category.split(",").map((k) => k.trim().toLowerCase()).filter((k) => allowed.has(k));
      if (keys.length === 1) conditions.push(eq(jobs.category, keys[0]));
      else if (keys.length > 1) conditions.push(inArray(jobs.category, keys));
    }

    // Experience range
    if (minExp) {
      conditions.push(gte(jobs.experience, parseInt(minExp as string)));
    }
    if (maxExp) {
      conditions.push(lte(jobs.experience, parseInt(maxExp as string)));
    }

    // Salary range (FRS 1.15). Salary is free-text on jobs ("USD 80000",
    // "AED 8000/mo", "SAR 4500-6000"), so we parse the first numeric run
    // at query time via regex. Cheap and good enough for UAT; production
    // should move this to a normalized annual_usd column populated on save.
    if (minSalary || maxSalary) {
      const minN = parseInt(String(minSalary || "0")) || 0;
      const maxN = maxSalary ? (parseInt(String(maxSalary)) || 0) : 0;
      if (minN > 0) {
        conditions.push(sql`
          CASE WHEN ${jobs.salary} ~ '[0-9]'
            THEN (regexp_replace(${jobs.salary}, '[^0-9]+', '', 'g'))::bigint >= ${minN}
            ELSE false END
        `);
      }
      if (maxN > 0) {
        conditions.push(sql`
          CASE WHEN ${jobs.salary} ~ '[0-9]'
            THEN (regexp_replace(${jobs.salary}, '[^0-9]+', '', 'g'))::bigint <= ${maxN}
            ELSE true END
        `);
      }
    }

    // Build where clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const totalResult = await db.select({ c: count() }).from(jobs).where(whereClause);
    const total = totalResult[0]?.c ?? 0;

    // Sort
    let orderBy: any = desc(jobs.createdAt); // default: newest first
    if (sort === "title") orderBy = order === "desc" ? desc(jobs.title) : asc(jobs.title);
    else if (sort === "salary") orderBy = order === "desc" ? desc(jobs.salary) : asc(jobs.salary);
    else if (sort === "date") orderBy = order === "asc" ? asc(jobs.createdAt) : desc(jobs.createdAt);

    // Query
    const results = await db
      .select()
      .from(jobs)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limitNum)
      .offset(offset);

    res.setHeader("X-Total-Count", String(total));
    res.json({
      success: true,
      data: results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Get Single Job ──────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    }
    const job = jobRows[0];

    // Visibility enforcement on direct fetch. The list endpoint already
    // filters by visibility, but a candidate with a requisition ID (or
    // someone guessing UUIDs) was able to pull an agents_only requisition
    // via /jobs/:id — which is a privacy leak: the employer posted a
    // requisition expecting only verified agencies to see it. 404 rather
    // than 403 so we don't confirm the ID exists.
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    if (job.visibility === "agents_only") {
      const isOwner = job.employerId === userId;
      const isAdmin = userRole === "admin" || userRole === "superadmin";
      const isVerifiedAgent = userRole === "agent"; // the list endpoint already restricts to verified agencies; this is a lighter check here
      if (!isOwner && !isAdmin && !isVerifiedAgent) {
        return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
      }
    }
    if (job.status === "draft") {
      const isOwner = job.employerId === userId || job.agentId === userId;
      const isAdmin = userRole === "admin" || userRole === "superadmin";
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
      }
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

// ── Edit Job ────────────────────────────────────────────────────────
router.put("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    }

    const job = jobRows[0];

    // Authorization: only the owner or admin can edit
    if (userRole !== "admin" && job.agentId !== userId && job.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to edit this job" } });
    }

    const isDraft = req.body?.isDraft === true;
    const { id: _, createdAt: __, agentId: ___, employerId: ____, isDraft: _____, ...updateData } = req.body as any;

    // v0.4.31 (HPSEDC Item 8): normalise category on update too. Defensive
    // against clients sending a stale label or a free-typed value.
    if (updateData.category !== undefined && updateData.category !== null && updateData.category !== "") {
      const { normaliseCategory } = await import("../services/job-categories.seed");
      const canonical = normaliseCategory(String(updateData.category));
      if (!canonical) {
        return res.status(400).json({
          success: false,
          error: { code: 400, message: "Invalid job category. Pick one from the dropdown." },
        });
      }
      updateData.category = canonical;
    }

    // Country validation — same rules as create. Drafts can be incomplete;
    // any non-empty country must be a valid overseas destination (not India).
    if (updateData.country !== undefined) {
      const { validateCountry } = await import("../services/country-validator.service");
      const countryCheck = validateCountry(updateData.country);
      if (!countryCheck.ok) {
        return res.status(400).json({
          success: false,
          error: { code: countryCheck.code, message: countryCheck.message },
        });
      }
    }

    // If publishing a draft (was "draft" and isDraft is false), validate fully.
    const becomingActive = job.status === "draft" && !isDraft;
    if (becomingActive) insertJobSchema.parse({ ...job, ...updateData });

    const result = await db.update(jobs).set({
      ...updateData,
      ...(isDraft ? { status: "draft" } : (becomingActive ? { status: "active" } : {})),
    }).where(eq(jobs.id, req.params.id)).returning();

    logger.info(`Job updated: ${req.params.id} by ${userId} (draft=${isDraft})`);
    res.json({ success: true, data: result[0] });
  } catch (err) {
    next(err);
  }
});

// ── Clone Job (Tier 2, PWS §7.15) ───────────────────────────────────
// Creates a new DRAFT owned by the requesting user, copying all fields except
// ids/timestamps/applicants. Useful for recurring recruitment.
router.post("/:id/clone", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    if (userRole !== "agent" && userRole !== "employer" && userRole !== "admin") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only agents/employers can clone" } });
    }

    const [source] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!source) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    if (userRole !== "admin" && source.agentId !== userId && source.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to clone this job" } });
    }

    // Draft cap on clone too
    const { getSetting } = await import("../services/settings.service");
    const maxDrafts: number = await getSetting("jobs.max_drafts_per_user");
    if (maxDrafts > 0) {
      const ownerCol = userRole === "agent" ? jobs.agentId : jobs.employerId;
      const [{ c }] = await db.select({ c: count() }).from(jobs)
        .where(and(eq(ownerCol, userId), eq(jobs.status, "draft")));
      if (Number(c) >= maxDrafts) {
        return res.status(403).json({ success: false, error: { code: 403, message: `Draft limit reached (${maxDrafts})` } });
      }
    }

    const [cloned] = await db.insert(jobs).values({
      title: source.title,
      company: source.company,
      location: source.location,
      country: source.country,
      salary: source.salary,
      description: source.description,
      requirements: source.requirements,
      skills: source.skills,
      experience: source.experience,
      targetHires: source.targetHires,
      hiringDeadline: null,                 // reset — user sets a new deadline
      priority: source.priority,
      employerNotes: source.employerNotes,
      visibility: userRole === "employer" ? "agents_only" : "public",
      parentRequisitionId: null,
      pinnedAgentId: null,
      status: "draft",
      ...(userRole === "agent" ? { agentId: userId } : { employerId: userId }),
    }).returning();

    logger.info(`Job ${source.id} cloned by ${userId} → ${cloned.id} (draft)`);
    res.status(201).json({ success: true, data: cloned });
  } catch (err) { next(err); }
});

// ── Job Analytics (PWS §7.19) ───────────────────────────────────────
// Lightweight aggregate metrics computed from existing tables. No new
// instrumentation — owner/admin sees application count, stage breakdown,
// average match score, time-to-first-applicant.
router.get("/:id/analytics", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const [job] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    if (userRole !== "admin" && userRole !== "superadmin" && job.agentId !== userId && job.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    const apps = await db.select().from(applications).where(eq(applications.jobId, req.params.id));
    const totalApplicants = apps.length;
    const stageBreakdown: Record<string, number> = {
      submitted: 0, reviewed: 0, shortlisted: 0, interview_scheduled: 0,
      selected: 0, rejected: 0, placed: 0,
    };
    let scoreSum = 0, scoreN = 0;
    let firstAppliedAt: Date | null = null;
    for (const a of apps) {
      if (a.status && stageBreakdown[a.status] !== undefined) stageBreakdown[a.status]++;
      if (typeof a.matchScore === "number" && a.matchScore >= 0) { scoreSum += a.matchScore; scoreN++; }
      if (a.appliedAt && (!firstAppliedAt || new Date(a.appliedAt) < firstAppliedAt)) firstAppliedAt = new Date(a.appliedAt);
    }
    const avgMatchScore = scoreN > 0 ? Math.round(scoreSum / scoreN) : 0;
    const createdAt = job.createdAt ? new Date(job.createdAt) : null;
    const timeToFirstApplicantHours = (firstAppliedAt && createdAt)
      ? Math.max(0, Math.round((firstAppliedAt.getTime() - createdAt.getTime()) / 3600000))
      : null;
    const daysLive = createdAt
      ? Math.max(1, Math.round((Date.now() - createdAt.getTime()) / 86400000))
      : 1;
    const applicationsPerDay = Number((totalApplicants / daysLive).toFixed(2));

    res.json({
      success: true,
      data: {
        totalApplicants,
        stageBreakdown,
        avgMatchScore,
        timeToFirstApplicantHours,
        daysLive,
        applicationsPerDay,
        firstAppliedAt: firstAppliedAt?.toISOString() ?? null,
        createdAt: createdAt?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

// ── Delete Job ──────────────────────────────────────────────────────
// Owner can delete a draft freely. For active/closed jobs, deletion is only
// allowed when no applications exist — otherwise close-then-archive is the
// correct flow (preserves audit trail for applicants).
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!jobRows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    const job = jobRows[0];

    if (userRole !== "admin" && job.agentId !== userId && job.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    if (job.status !== "draft") {
      const [{ c }] = await db.select({ c: count() }).from(applications).where(eq(applications.jobId, req.params.id));
      if (Number(c) > 0) {
        return res.status(409).json({ success: false, error: { code: 409, message: "This job has applicants. Close it instead of deleting to preserve the audit record." } });
      }
    }

    await db.delete(savedJobs).where(eq(savedJobs.jobId, req.params.id));
    await db.delete(jobs).where(eq(jobs.id, req.params.id));

    logger.info(`Job deleted: ${req.params.id} by ${userId} (status=${job.status})`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Deactivate / Activate Job ───────────────────────────────────────
router.patch("/:id/status", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const { status: newStatus } = req.body;

    if (!["active", "inactive", "closed"].includes(newStatus)) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Status must be: active, inactive, or closed" } });
    }

    const jobRows = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    }

    const job = jobRows[0];
    if (userRole !== "admin" && job.agentId !== userId && job.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    const fromStatus = job.status || "active";
    const result = await db.update(jobs).set({ status: newStatus }).where(eq(jobs.id, req.params.id)).returning();

    // PWS §8: audit every transition.
    const { logTransition } = await import("../services/audit-transitions.service");
    await logTransition({
      actorUserId: userId, actorRole: userRole,
      entityType: job.visibility === "agents_only" ? "requisition" : "job",
      entityId: req.params.id, action: "status_change",
      fromState: fromStatus, toState: newStatus,
      reason: req.body?.reason,
      ipAddress: req.ip,
    });

    // PWS §5: fire job.closed / job.reopened notification to owner + applicants
    if (newStatus !== fromStatus) {
      const { fireEvent } = await import("../services/event-notifications.service");
      const { employers } = await import("@shared/schema");
      const [emp] = job.employerId
        ? await db.select().from(employers).where(eq(employers.userId, job.employerId)).limit(1)
        : [];
      const [ag] = job.agentId
        ? await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, job.agentId)).limit(1)
        : [];
      if (newStatus === "closed") {
        // Notify each candidate with an active application on this job
        const apps = await db.select().from(applications).where(eq(applications.jobId, job.id));
        for (const a of apps) {
          if (!a.candidateId) continue;
          const [cand] = await db.select().from(candidates).where(eq(candidates.id, a.candidateId)).limit(1);
          if (!cand?.userId) continue;
          await fireEvent("job.closed", {
            job,
            application: a,
            candidate: { id: cand.id, userId: cand.userId, fullName: cand.fullName, email: cand.email },
            agent: ag ? { id: ag.id, userId: ag.userId!, agencyName: ag.agencyName } : undefined,
            employer: emp ? { id: emp.id, userId: emp.userId!, companyName: emp.companyName } : undefined,
          });
        }
      }
    }

    // PWS §6: cascading close. If an employer closes a requisition and the setting
    // is on, auto-close all derivative agent jobs.
    let cascadeClosedIds: string[] = [];
    if (newStatus === "closed" && job.visibility === "agents_only") {
      const { getSetting } = await import("../services/settings.service");
      const cascade: boolean = await getSetting("requisition.cascade_close_derivatives");
      if (cascade) {
        const derivatives = await db.select().from(jobs)
          .where(and(eq(jobs.parentRequisitionId, job.id), eq(jobs.status, "active")));
        for (const d of derivatives) {
          await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, d.id));
          cascadeClosedIds.push(d.id);
          await logTransition({
            actorUserId: userId, actorRole: userRole,
            entityType: "job", entityId: d.id, action: "cascade_close",
            fromState: "active", toState: "closed",
            reason: `Parent requisition ${job.id} closed`,
            extra: { parentRequisitionId: job.id },
          });
          // Notify candidates on this derivative
          const { fireEvent } = await import("../services/event-notifications.service");
          const { employers } = await import("@shared/schema");
          const [ag] = d.agentId
            ? await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, d.agentId)).limit(1)
            : [];
          const [emp] = job.employerId
            ? await db.select().from(employers).where(eq(employers.userId, job.employerId)).limit(1)
            : [];
          const apps = await db.select().from(applications).where(eq(applications.jobId, d.id));
          for (const a of apps) {
            if (!a.candidateId) continue;
            const [cand] = await db.select().from(candidates).where(eq(candidates.id, a.candidateId)).limit(1);
            if (!cand?.userId) continue;
            await fireEvent("job.closed", {
              job: d, application: a,
              candidate: { id: cand.id, userId: cand.userId, fullName: cand.fullName, email: cand.email },
              agent: ag ? { id: ag.id, userId: ag.userId!, agencyName: ag.agencyName } : undefined,
              employer: emp ? { id: emp.id, userId: emp.userId!, companyName: emp.companyName } : undefined,
            });
          }
        }
        logger.info(`Cascade-closed ${derivatives.length} derivative(s) from requisition ${job.id}`);
      }
    }

    logger.info(`Job ${req.params.id} status changed to ${newStatus} by ${userId}`);
    res.json({ success: true, data: result[0], cascadeClosedDerivatives: cascadeClosedIds });
  } catch (err) {
    next(err);
  }
});

// ── Get Applicants for a Job ────────────────────────────────────────
router.get("/:id/applicants", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    // Verify job exists
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });
    }

    const job = jobRows[0];

    // Authorization: job owner, agent, or admin
    if (userRole !== "admin" && job.agentId !== userId && job.employerId !== userId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to view applicants" } });
    }

    // Sort order chosen by the client. Defaults to newest-first since that
    // answers "did any new candidates come in today?" — the question an
    // agent is most likely to be asking.
    const sortKey = String(req.query.sort ?? "newest");
    const orderClause =
      sortKey === "oldest"  ? [asc(applications.appliedAt)]
    : sortKey === "match"   ? [desc(applications.matchScore), desc(applications.appliedAt)]
    : /* newest */            [desc(applications.appliedAt)];

    const result = await db
      .select({
        application: applications,
        candidate: candidates,
      })
      .from(applications)
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .where(eq(applications.jobId, req.params.id))
      .orderBy(...orderClause);

    // Derive time-in-stage from the audit log. Most recent
    // application.status_change row per application tells us when the
    // candidate entered the current stage. Falls back to appliedAt.
    // Using inArray instead of sql`= ANY(...)` — drizzle's tagged template
    // doesn't round-trip JS arrays to pg text[] cleanly and was throwing
    // "malformed array literal" on every request to this endpoint.
    const { auditLog } = await import("@shared/schema");
    const appIds = result.map((r: any) => r.application.id);
    const stageEntries: Record<string, Date> = {};
    if (appIds.length > 0) {
      const rows = await db
        .select({ resourceId: auditLog.resourceId, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(
          eq(auditLog.action, "application.status_change"),
          inArray(auditLog.resourceId, appIds),
        ))
        .orderBy(desc(auditLog.createdAt));
      // Client-side DISTINCT ON: first (most recent) per resourceId wins.
      for (const r of rows as any[]) {
        if (!stageEntries[r.resourceId]) stageEntries[r.resourceId] = new Date(r.createdAt);
      }
    }

    // v0.4.34 (Phase 4): batch-fetch the latest interview row per
    // application so the agent UI can show "candidate confirmed / asked
    // to reschedule / declined" badges without N+1 queries.
    const { interviews: interviewsTable } = await import("@shared/schema");
    const latestInterviewByApp: Record<string, any> = {};
    if (appIds.length > 0) {
      const intRows = await db.select().from(interviewsTable)
        .where(inArray(interviewsTable.applicationId, appIds))
        .orderBy(desc(interviewsTable.scheduledAt));
      // First (newest scheduled_at) per application wins
      for (const r of intRows as any[]) {
        if (!latestInterviewByApp[r.applicationId]) latestInterviewByApp[r.applicationId] = r;
      }
    }

    const applicants = result.map((row: any) => {
      const stageEnteredAt = stageEntries[row.application.id] ?? row.application.appliedAt;
      const daysInStage = stageEnteredAt ? Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000) : null;
      const iv = latestInterviewByApp[row.application.id] || null;
      return {
        applicationId: row.application.id,
        status: row.application.status,
        matchScore: row.application.matchScore,
        appliedAt: row.application.appliedAt,
        stageEnteredAt,
        daysInStage,
        candidate: {
          id: row.candidate.id,
          fullName: row.candidate.fullName,
          email: row.candidate.email,
          phone: row.candidate.phone,
          location: row.candidate.location,
          experience: row.candidate.experience,
          skills: row.candidate.skills,
          photoUrl: row.candidate.photoUrl,
        },
        // v0.4.34: latest interview summary so the row can render badges
        // for confirmation status, reschedule requests, and declines.
        interview: iv ? {
          id: iv.id,
          scheduledAt: iv.scheduledAt,
          mode: iv.mode,
          location: iv.location,
          interviewerName: iv.interviewerName,
          meetingLink: iv.meetingLink,
          candidateConfirmedStatus: iv.candidateConfirmedStatus,
          candidateConfirmedAt: iv.candidateConfirmedAt,
          candidateRescheduleReason: iv.candidateRescheduleReason,
          candidateProposedAt: iv.candidateProposedAt,
          candidateDeclineReason: iv.candidateDeclineReason,
        } : null,
      };
    });

    res.json({ success: true, data: applicants, total: applicants.length });
  } catch (err) {
    next(err);
  }
});

// ── Apply to a Job ──────────────────────────────────────────────────
router.post("/:id/apply", protect, async (req, res, next) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: { code: 401, message: "Unauthorized" } });

    if ((req.user as any)?.role !== "candidate") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only candidates can apply to jobs." } });
    }

    // System Controls: applications pipeline pause
    const { getControls } = await import("../services/system-controls.service");
    const ctrl = await getControls();
    if (ctrl.applicationsPaused) {
      return res.status(503).json({
        success: false,
        error: { code: 503, message: ctrl.applicationsPauseMessage, pipelinePaused: "applications" },
      });
    }

    const jobId = req.params.id;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // Get candidate profile
    const candidateResult = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
    if (!candidateResult.length) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Complete your profile before applying." } });
    }

    const candidate = candidateResult[0];

    // Enforce configurable profile-completion threshold
    const { getSetting } = await import("../services/settings.service");
    const minProfilePct: number = await getSetting("application.profile_completion_required_pct");
    if (minProfilePct > 0) {
      // Inline completion calc: 8 checks, same weights as /profile/completion endpoint
      const [eduC, expC, docC] = await Promise.all([
        db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidate.id)),
        db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candidate.id)),
        db.select().from(documents).where(eq(documents.candidateId, candidate.id)),
      ]);
      const checks = [
        !!candidate.fullName && candidate.fullName !== "Unknown",
        !!candidate.email, !!candidate.phone, !!candidate.location,
        (candidate.skills?.length ?? 0) > 0,
        eduC.length > 0, expC.length > 0, docC.length > 0,
      ];
      const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
      if (pct < minProfilePct) {
        return res.status(403).json({ success: false, error: { code: 403, message: `Your profile is ${pct}% complete. Reach ${minProfilePct}% before applying.` } });
      }
    }

    // Ensure job exists and is active
    const jobResult = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.status, "active"))).limit(1);
    if (!jobResult.length) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found or inactive." } });
    }

    const job = jobResult[0];

    // FRS visibility — candidates must never apply to agents_only requisitions
    // even if they have the UUID (e.g. from an old link). Return the same 404
    // shape as the list-side filter to avoid leaking the resource's existence.
    // Mirrors the v0.8.6 fix on GET /jobs/:id. Caught one DB row where a
    // candidate had applied to an agents_only "Riker" job on 2026-04-22.
    if (job.visibility === "agents_only") {
      return res.status(404).json({ success: false, error: { code: 404, message: "Job not found or inactive." } });
    }

    // audit 2026-07-06 (Batch 4B): enforce rejectedCountries at apply-time.
    // The list-side filter already hides these jobs, but a direct link (or a
    // country added after browsing) could still let the candidate apply to a
    // destination they marked as visa-refused. Case-insensitive compare.
    const jobCountry = (job.country || "").trim().toLowerCase();
    if (jobCountry && (candidate.rejectedCountries ?? []).some((c: string) => (c || "").trim().toLowerCase() === jobCountry)) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `You marked ${job.country} as visa-refused; you cannot apply to jobs in this country. Update your profile if this has changed.` },
      });
    }

    // audit 2026-07-06 (Batch 4B): 6-month passport-validity rule. Reference
    // date is the job's hiring deadline when set (proxy for travel timing),
    // else today. Default is warn-only; compliance.enforce_passport_validity
    // flips it to a hard block.
    const warnings: string[] = [];
    {
      const { passportValidityIssue } = await import("../services/deployment.service");
      const reference = job.hiringDeadline ? new Date(job.hiringDeadline) : new Date();
      const issue = passportValidityIssue(candidate.passportExpiry, reference);
      if (issue) {
        const msg = issue === "expired"
          ? "Your passport has expired. Overseas placement requires a valid passport — please renew it."
          : "Your passport expires within 6 months of this job's timeline. Most destination countries require at least 6 months of passport validity — please renew it soon.";
        const enforce: boolean = await getSetting("compliance.enforce_passport_validity");
        if (enforce) {
          return res.status(400).json({ success: false, error: { code: 400, message: msg } });
        }
        warnings.push(msg);
      }
    }

    // Duplicate check — same candidate + same job
    const existing = await db.select().from(applications)
      .where(and(eq(applications.candidateId, candidate.id), eq(applications.jobId, jobId)))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: { code: 409, message: "You have already applied to this job." } });
    }

    // Cross-job dedupe: warn (not block) if candidate recently applied to
    // a very similar job (same company + same title within 30 days). This
    // catches candidates accidentally applying to duplicated listings.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const similar = await db.select({ job: jobs, app: applications }).from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(
        eq(applications.candidateId, candidate.id),
        eq(jobs.title, job.title),
        eq(jobs.company, job.company),
      ));
    const recentDup = similar.find((s: any) => s.app.appliedAt && new Date(s.app.appliedAt) > thirtyDaysAgo);
    if (recentDup) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: `You applied to "${job.title}" at ${job.company}" ${Math.round((Date.now() - new Date(recentDup.app.appliedAt).getTime()) / 86400_000)} days ago. Track the existing application in your dashboard.` },
      });
    }

    // v0.4.33 (Phase 3): score via the shared v2 matching service so the
    // recorded matchScore reflects the same weights/policy admins see in
    // the Parameters Module — not a duplicate inline implementation.
    const { calculateMatchScore: matchV2 } = await import("../services/matching.service");
    const matchScore = await matchV2(candidate, job);

    // audit 2026-07-06 (C4): the pre-check above is racy (read-then-insert);
    // the unique index on (candidate_id, job_id) is the real guard — map its
    // violation to the same friendly 409 instead of a 500.
    let newApp;
    try {
      newApp = await db.insert(applications).values({
        candidateId: candidate.id,
        jobId,
        status: "submitted",
        matchScore,
      }).returning();
    } catch (e: any) {
      if (e?.code === "23505" || e?.cause?.code === "23505") {
        return res.status(409).json({ success: false, error: { code: 409, message: "You have already applied to this job." } });
      }
      throw e;
    }

    // Notify candidate (with email)
    notify({
      userId,
      type: "application_update",
      title: "Application Submitted",
      message: `Your application for "${job.title}" at ${job.company} has been submitted. Match score: ${matchScore}%.`,
      metadata: { jobId, applicationId: newApp[0].id },
    }).catch(() => {});

    // Notify job owner (with email)
    const ownerId = job.agentId || job.employerId;
    if (ownerId) {
      notify({
        userId: ownerId,
        type: "new_application",
        title: "New Application Received",
        message: `${candidate.fullName} applied for "${job.title}". Match score: ${matchScore}%.`,
        metadata: { jobId, applicationId: newApp[0].id },
      }).catch(() => {});
    }

    logger.info(`Application created: ${newApp[0].id} for job ${jobId}`);
    // audit 2026-07-06 (Batch 4B): surface soft compliance warnings (e.g.
    // passport validity) alongside the created application so the UI can toast
    // them without blocking the apply.
    res.status(201).json({ success: true, data: newApp[0], ...(warnings.length ? { warnings } : {}) });
  } catch (err) {
    next(err);
  }
});

/**
 * Basic match score calculator.
 * Skill overlap (50%) + Experience match (30%) + Country preference (20%)
 */
// v0.4.33 (Phase 3): the legacy inline calculateMatchScore was retired
// here. All scoring routes through server/services/matching.service.ts so
// weights/policy/version come from settings.

// ── Save/Unsave Job (toggle) ────────────────────────────────────────
router.post("/:id/save", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const jobId = req.params.id;

    // Check if already saved
    const existing = await db.select().from(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId))).limit(1);

    if (existing.length > 0) {
      // Unsave
      await db.delete(savedJobs).where(eq(savedJobs.id, existing[0].id));
      return res.json({ success: true, saved: false, message: "Job removed from saved" });
    } else {
      // Save
      await db.insert(savedJobs).values({ userId, jobId });
      return res.json({ success: true, saved: true, message: "Job saved" });
    }
  } catch (error) {
    next(error);
  }
});

// ── Get Saved Jobs ──────────────────────────────────────────────────
router.get("/saved/my", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;

    const result = await db
      .select({ savedJob: savedJobs, job: jobs })
      .from(savedJobs)
      .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
      .where(eq(savedJobs.userId, userId))
      .orderBy(desc(savedJobs.createdAt));

    const data = result.map((r: any) => ({
      ...r.job,
      savedAt: r.savedJob.createdAt,
      savedId: r.savedJob.id,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Similar jobs (Phase 1d) ─────────────────────────────────────────
// Given a job id, returns up to `limit` other active public jobs that share
// country + at least one skill + similar experience band. Cheap heuristic —
// no ML here, just "jobs like this" the way Indeed / SEEK do it.
router.get("/:id/similar", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || "5")) || 5), 12);

    const [seed] = await db.select().from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!seed) return res.status(404).json({ success: false, error: { code: 404, message: "Job not found" } });

    // Only public, active jobs, same country, not the seed itself.
    const candidates = await db.select().from(jobs)
      .where(and(
        eq(jobs.visibility, "public"),
        eq(jobs.status, "active"),
        eq(jobs.country, seed.country),
        ne(jobs.id, seed.id),
      ))
      .limit(50); // cap before scoring

    const seedSkills = new Set((seed.skills || []).map((s: string) => s.toLowerCase()));
    const seedExp = seed.experience || 0;

    const scored = candidates.map((j: any) => {
      const overlap = (j.skills || []).filter((s: string) => seedSkills.has(s.toLowerCase())).length;
      const expDelta = Math.abs((j.experience || 0) - seedExp);
      const score = overlap * 10 - expDelta;
      return { ...j, _score: score, _overlap: overlap };
    }).filter((j: any) => j._overlap > 0 || seedSkills.size === 0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, _overlap, ...j }: any) => j);

    res.json({ success: true, data: scored });
  } catch (error) {
    next(error);
  }
});

export default router;
