/**
 * HPSEDC Admin oversight endpoints — compliance aggregates, welfare SLA,
 * policy enforcement, audit log viewer. These are what the regulator
 * actually uses day-to-day.
 */

import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/rbac.middleware";
import { storage } from "../storage";
import {
  candidates, placements, applications, jobs, grievances, auditLog, users,
  recruitmentAgents, countryInfo,
} from "@shared/schema";
import { eq, and, or, sql, isNull, lt, desc, count } from "drizzle-orm";
import { getSetting } from "../services/settings.service";
import { maskAadhaar } from "../lib/safeUser";
import { computeReadiness, pickPrimaryPlacement, type Readiness } from "../services/deployment.service";

const router = Router();
router.use(protect);
router.use(requireRole(["admin", "superadmin"]));

// ── Compliance overview (MEA / Emigration Act policy enforcement) ────
router.get("/compliance", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });

    // All candidates
    const allCandidates = await db.select().from(candidates);
    const total = allCandidates.length;

    // All placements (accepted or active = actually deployed)
    const activePlacements = await db.select().from(placements)
      .where(or(eq(placements.status, "accepted"), eq(placements.status, "active"), eq(placements.status, "completed")));

    // Counts
    const withPassport = allCandidates.filter((c: any) => !!c.passportNumber).length;
    const ecrSet = allCandidates.filter((c: any) => !!c.ecrStatus).length;
    const pccSubmitted = allCandidates.filter((c: any) => c.pccStatus === "submitted").length;
    const medicalFit = allCandidates.filter((c: any) => c.medicalStatus === "fit").length;
    const pdoCompleted = allCandidates.filter((c: any) => c.pdoCompleted).length;
    const pbbyEnrolled = allCandidates.filter((c: any) => c.pbbyInsuranceStatus === "enrolled").length;
    const ieltsRecorded = allCandidates.filter((c: any) => c.ieltsBand != null).length;

    // Passport expiry warnings (within 6 months)
    const sixMonthsMs = 6 * 30 * 86_400_000;
    const now = Date.now();
    const expiringSoon = allCandidates.filter((c: any) => {
      if (!c.passportExpiry) return false;
      const exp = new Date(c.passportExpiry).getTime();
      return exp > now && exp < now + sixMonthsMs;
    });

    // Gaps in active placements (the concerning ones)
    const candById = new Map<string, any>(allCandidates.map((c: any) => [c.id, c]));
    const activeCandidateIds = new Set<string>();
    // Visa pipeline across deployed placements + the per-placement risk list.
    const visaCounts: Record<string, number> = { not_applied: 0, applied: 0, approved: 0, rejected: 0 };
    const placedVisaNotApproved: any[] = [];
    const visaRejected: any[] = [];
    for (const p of activePlacements as any[]) {
      const [app] = await db.select().from(applications).where(eq(applications.id, p.applicationId)).limit(1);
      if (app?.candidateId) {
        activeCandidateIds.add(app.candidateId);
        const cand = candById.get(app.candidateId);
        const v = p.visaStatus || "not_applied";
        visaCounts[v] = (visaCounts[v] ?? 0) + 1;
        const tag = { placementId: p.id, candidateId: app.candidateId, fullName: cand?.fullName, country: p.country, visaStatus: v };
        if (v !== "approved") placedVisaNotApproved.push(tag);
        if (v === "rejected") visaRejected.push(tag);
      }
    }
    const activeCandidates = allCandidates.filter((c: any) => activeCandidateIds.has(c.id));
    const placedMissingPDO = activeCandidates.filter((c: any) => !c.pdoCompleted);
    const placedMissingPBBY = activeCandidates.filter((c: any) => c.pbbyInsuranceStatus !== "enrolled");
    const placedMissingPassport = activeCandidates.filter((c: any) => !c.passportNumber);

    res.json({
      success: true,
      data: {
        totals: { candidates: total, activePlacements: activeCandidates.length },
        coverage: {
          passportOnFile: { count: withPassport, pct: total > 0 ? Math.round((withPassport / total) * 100) : 0 },
          ecrSet: { count: ecrSet, pct: total > 0 ? Math.round((ecrSet / total) * 100) : 0 },
          pccSubmitted: { count: pccSubmitted, pct: total > 0 ? Math.round((pccSubmitted / total) * 100) : 0 },
          medicalFit: { count: medicalFit, pct: total > 0 ? Math.round((medicalFit / total) * 100) : 0 },
          pdoCompleted: { count: pdoCompleted, pct: total > 0 ? Math.round((pdoCompleted / total) * 100) : 0 },
          pbbyEnrolled: { count: pbbyEnrolled, pct: total > 0 ? Math.round((pbbyEnrolled / total) * 100) : 0 },
          ieltsRecorded: { count: ieltsRecorded, pct: total > 0 ? Math.round((ieltsRecorded / total) * 100) : 0 },
        },
        // Visa pipeline across deployed placements (FRS §2.2 — agency-driven).
        visa: {
          counts: visaCounts,
          deployed: activeCandidates.length,
        },
        riskFlags: {
          passportExpiringSoon: expiringSoon.map((c: any) => ({
            id: c.id, fullName: c.fullName, email: c.email, passportExpiry: c.passportExpiry,
          })),
          placedMissingPDO: placedMissingPDO.map((c: any) => ({ id: c.id, fullName: c.fullName, email: c.email })),
          placedMissingPBBY: placedMissingPBBY.map((c: any) => ({ id: c.id, fullName: c.fullName, email: c.email })),
          placedMissingPassport: placedMissingPassport.map((c: any) => ({ id: c.id, fullName: c.fullName, email: c.email })),
          placedVisaNotApproved,
          visaRejected,
        },
      },
    });
  } catch (err) { next(err); }
});

// ── Welfare SLA monitor (which welfare check-ins are overdue?) ──────
router.get("/welfare-sla", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });

    const rows = await db
      .select({ placement: placements, application: applications, candidate: candidates, job: jobs })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(or(eq(placements.status, "accepted"), eq(placements.status, "active"), eq(placements.status, "completed")));

    const now = Date.now();
    const MS = 86_400_000;
    const overdue: any[] = [];
    // Placements that escaped the monitor before: no start date was ever set,
    // so the 30/60/90 clock could never start. Surface them as their own gap
    // (falling back to created-at) instead of silently dropping them.
    const missingStartDate: any[] = [];
    for (const r of rows) {
      const p: any = r.placement;
      const anchor = p.startDate ?? p.createdAt;
      if (!anchor) continue;
      const usingFallback = !p.startDate;
      if (usingFallback) {
        missingStartDate.push({
          placementId: p.id, candidateId: r.candidate.id, candidateName: r.candidate.fullName,
          jobTitle: r.job.title, company: r.job.company, country: p.country,
        });
      }
      const startMs = new Date(anchor).getTime();
      const daysSinceStart = (now - startMs) / MS;
      const flag = (dueDays: number, milestone: "30" | "60" | "90", recordedValue: any) => {
        if (daysSinceStart >= dueDays && !recordedValue) {
          overdue.push({
            placementId: p.id, milestone, daysOverdue: Math.floor(daysSinceStart - dueDays),
            candidateId: r.candidate.id, candidateName: r.candidate.fullName,
            jobTitle: r.job.title, company: r.job.company, country: p.country,
            startDate: p.startDate, usingFallback,
          });
        }
      };
      flag(30, "30", p.welfare30Day);
      flag(60, "60", p.welfare60Day);
      flag(90, "90", p.welfare90Day);
    }

    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    res.json({ success: true, data: { overdue, missingStartDate } });
  } catch (err) { next(err); }
});

// ── Audit log viewer (paginated, filter-able) ────────────────────────
router.get("/audit-log", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const { limit = "50", action, resourceType, userId } = req.query as any;

    const conds: any[] = [];
    if (action) conds.push(eq(auditLog.action, String(action)));
    if (resourceType) conds.push(eq(auditLog.resourceType, String(resourceType)));
    if (userId) conds.push(eq(auditLog.userId, String(userId)));

    const rows = await db
      .select({
        id: auditLog.id, action: auditLog.action, resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId, details: auditLog.details, ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt, username: users.username, userRole: users.role,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(conds.length > 0 ? and(...conds) : undefined as any)
      .orderBy(desc(auditLog.createdAt))
      .limit(Math.min(200, parseInt(String(limit)) || 50));

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ── Agency Reject (for pending-verification queue) — FRS 4.4 ─────────
router.patch("/agencies/:id/reject", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const { reason } = req.body ?? {};
    if (!reason?.trim()) return res.status(400).json({ success: false, message: "reason required" });

    const [a] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, req.params.id)).limit(1);
    if (!a) return res.status(404).json({ success: false });

    // Store rejection on the agency — we'll surface it on the UI + notify the user
    await db.update(recruitmentAgents).set({ verified: false }).where(eq(recruitmentAgents.id, req.params.id));

    // Notification for the agency user
    if (a.userId) {
      const { notify } = await import("../services/notification.service");
      notify({
        userId: a.userId, type: "system",
        title: "Agency registration rejected",
        message: `HPSEDC has rejected your agency "${a.agencyName}". Reason: ${reason}`,
        metadata: { agencyId: a.id, reason },
      }).catch(() => {});
    }

    // Write to audit log
    const user = (req as any).user;
    await db.insert(auditLog).values({
      userId: user.id, action: "reject", resourceType: "agency",
      resourceId: a.id, details: { reason } as any, ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── User management (list + deactivate) ──────────────────────────────
router.get("/users", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const rows = await db.select({
      id: users.id, username: users.username, email: users.email, role: users.role,
      isActive: users.isActive, lastLoginAt: users.lastLoginAt,
    }).from(users).orderBy(desc(users.lastLoginAt));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch("/users/:id/toggle-active", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const [u] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!u) return res.status(404).json({ success: false });
    const [updated] = await db.update(users).set({ isActive: !u.isActive })
      .where(eq(users.id, req.params.id)).returning();
    res.json({ success: true, data: { isActive: updated.isActive } });
  } catch (err) { next(err); }
});

// ── Agency Leaderboard — HPSEDC operational view ──────────────────────
// Ranked by placements with secondary signals (time-to-placement, welfare
// compliance, grievance count). Everything comes from data the portal
// already collects — no new tracking needed.
router.get("/agency-leaderboard", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });

    const agencies = await db.select().from(recruitmentAgents);

    const enriched = await Promise.all(agencies.map(async (a: any) => {
      // All placements that came through jobs owned by this agent user
      const agentPlacements = await db.select({
        placement: placements, application: applications, job: jobs,
      }).from(placements)
        .innerJoin(applications, eq(placements.applicationId, applications.id))
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(eq(jobs.agentId, a.userId!));

      const accepted = agentPlacements.filter((r: any) => r.placement.status === "accepted" || r.placement.status === "active" || r.placement.status === "completed").length;
      const welfareOnTime = agentPlacements.filter((r: any) => r.placement.welfare30DayAt && r.placement.welfare90DayAt).length;

      // Avg days from selected → offered
      const deltas: number[] = [];
      for (const r of agentPlacements as any[]) {
        if (r.placement.createdAt && r.application.appliedAt) {
          const d = (new Date(r.placement.createdAt).getTime() - new Date(r.application.appliedAt).getTime()) / 86400000;
          if (d >= 0 && d < 365) deltas.push(d);
        }
      }
      const avgDaysToOffer = deltas.length ? Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length) : null;

      // Grievances where reason names this agency
      const agencyGrievances = await db.select({ c: count() }).from(grievances)
        .where(sql`${grievances.metadata}->>'agencyId' = ${a.id} OR ${grievances.description} ILIKE ${'%' + (a.agencyName || '') + '%'}`);

      return {
        id: a.id,
        userId: a.userId,
        agencyName: a.agencyName,
        licenseNumber: a.licenseNumber,
        verified: a.verified,
        rating: a.rating,
        placements: a.placements,
        acceptedPlacements: accepted,
        avgDaysToOffer,
        welfareCompliancePct: agentPlacements.length > 0
          ? Math.round((welfareOnTime / agentPlacements.length) * 100)
          : null,
        grievanceCount: Number(agencyGrievances[0]?.c ?? 0),
      };
    }));

    // Rank by accepted placements; ties broken by rating, then fewer grievances.
    enriched.sort((a: any, b: any) => {
      if (b.acceptedPlacements !== a.acceptedPlacements) return b.acceptedPlacements - a.acceptedPlacements;
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      return a.grievanceCount - b.grievanceCount;
    });

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

// ── Pipeline Funnel Analytics ─────────────────────────────────────────
// Counts applications at each pipeline stage, drop-off %, sliceable by
// country / agency / quarter. Powers LinkedIn/SEEK-style funnel charts.
router.get("/funnel", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });

    const { country, agentId, since } = req.query as any;
    const conds: any[] = [];
    if (country && country !== "all") conds.push(eq(jobs.country, String(country)));
    if (agentId && agentId !== "all") conds.push(eq(jobs.agentId, String(agentId)));
    if (since) conds.push(sql`${applications.appliedAt} >= ${new Date(String(since))}`);

    const rows = await db.select({
      status: applications.status,
      c: count(),
    }).from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(conds.length ? and(...conds) : undefined as any)
      .groupBy(applications.status);

    // Collapse into the canonical funnel stages. We treat all terminal
    // rejection / selection states as end-points, not intermediate stages.
    const byStatus: Record<string, number> = {};
    for (const r of rows as any[]) byStatus[String(r.status)] = Number(r.c);

    // Add a "placed" count from placements where accepted/active/completed
    const placementsCount = await db.select({ c: count() }).from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(and(
        sql`${placements.status} IN ('accepted','active','completed')`,
        conds.length ? and(...conds) : undefined as any,
      ));

    // CUMULATIVE funnel — every app that reached a later stage also passed
    // through the earlier ones, so each stage includes all downstream apps
    // (including `placed`). This keeps the funnel monotonic: Placed ≤ Selected
    // ≤ … ≤ Submitted. (The old version omitted `placed` from the upstream
    // stages, which made Placed appear larger than Selected.)
    const sub = byStatus.submitted ?? 0;
    const rev = byStatus.reviewed ?? 0;
    const sho = byStatus.shortlisted ?? 0;
    const intv = byStatus.interview_scheduled ?? 0;
    const sel = byStatus.selected ?? 0;
    const plc = byStatus.placed ?? 0;
    const rej = byStatus.rejected ?? 0;
    const funnel = [
      { stage: "submitted",            count: sub + rev + sho + intv + sel + plc + rej },
      { stage: "reviewed",             count: rev + sho + intv + sel + plc },
      { stage: "shortlisted",          count: sho + intv + sel + plc },
      { stage: "interview_scheduled",  count: intv + sel + plc },
      { stage: "selected",             count: sel + plc },
      { stage: "placed",               count: plc },
    ];
    // Attach drop-off % relative to the previous stage.
    for (let i = 0; i < funnel.length; i++) {
      const prev = i === 0 ? funnel[0].count : funnel[i - 1].count;
      (funnel[i] as any).dropPct = prev > 0 ? Math.round(((prev - funnel[i].count) / prev) * 100) : 0;
    }

    // Top-line summary for the 3 colored boxes above the funnel chart in
    // admin-dashboard.tsx. Counts are scoped by the same country/agent filters
    // as the rest of the endpoint so cards stay coherent with the chart.
    const candidateConds: any[] = [];
    // (no candidate-level filter for country/agent — registered = all candidates)
    const [registeredRow] = await db.select({ c: count() }).from(candidates);
    const [appliedRow] = await db.select({ c: count() }).from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(conds.length ? and(...conds) : undefined as any);
    const summary = {
      registered: Number(registeredRow?.c ?? 0),
      applied: Number(appliedRow?.c ?? 0),
      placed: Number(placementsCount[0]?.c ?? 0),
    };

    res.json({ success: true, data: { funnel, raw: byStatus, summary } });
  } catch (err) { next(err); }
});

// ── Duplicate candidate detection ───────────────────────────────────
// Flags candidates sharing the same aadhaar (preferred), phone, or email.
// Returns groups of suspected duplicates so the admin can review + merge.
router.get("/duplicate-candidates", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    // Cheap detection: exact match on aadhaar / phone / email. More
    // expensive fuzzy matching (nicknames, typos) is deferred — the exact
    // cases are the ones that actually pollute funnel analytics.
    const rows = await db.execute(sql`
      WITH grouped AS (
        SELECT
          LOWER(COALESCE(c.email, '')) AS norm_email,
          REGEXP_REPLACE(COALESCE(c.phone, ''), '\\D', '', 'g') AS norm_phone,
          COALESCE(u.aadhaar_number, '') AS norm_aadhaar,
          c.id, c.full_name, c.email, c.phone, c.user_id, u.aadhaar_number,
          c.created_at
        FROM candidates c
        LEFT JOIN users u ON u.id = c.user_id
      )
      SELECT
        'aadhaar' AS match_type, norm_aadhaar AS match_value,
        array_agg(json_build_object(
          'id', id, 'fullName', full_name, 'email', email, 'phone', phone,
          'userId', user_id, 'aadhaar', aadhaar_number, 'createdAt', created_at
        ) ORDER BY created_at) AS candidates
      FROM grouped
      WHERE norm_aadhaar <> ''
      GROUP BY norm_aadhaar HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'phone' AS match_type, norm_phone AS match_value,
        array_agg(json_build_object(
          'id', id, 'fullName', full_name, 'email', email, 'phone', phone,
          'userId', user_id, 'aadhaar', aadhaar_number, 'createdAt', created_at
        ) ORDER BY created_at)
      FROM grouped
      WHERE LENGTH(norm_phone) >= 8
      GROUP BY norm_phone HAVING COUNT(*) > 1
      UNION ALL
      SELECT
        'email' AS match_type, norm_email AS match_value,
        array_agg(json_build_object(
          'id', id, 'fullName', full_name, 'email', email, 'phone', phone,
          'userId', user_id, 'aadhaar', aadhaar_number, 'createdAt', created_at
        ) ORDER BY created_at)
      FROM grouped
      WHERE norm_email <> '' AND norm_email LIKE '%@%'
      GROUP BY norm_email HAVING COUNT(*) > 1
      ORDER BY match_type
    `);
    const groups = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    // best practice 2026-07-07 (UIDAI/DPDP): never surface a full Aadhaar in the
    // UI. Grouping/detection above uses the raw value in SQL; the response only
    // ever shows the last 4 digits (XXXX-XXXX-1234).
    for (const g of groups as any[]) {
      if (g.match_type === "aadhaar") g.match_value = maskAadhaar(g.match_value);
      if (Array.isArray(g.candidates)) g.candidates.forEach((c: any) => { c.aadhaar = maskAadhaar(c.aadhaar); });
    }
    res.json({ success: true, data: groups });
  } catch (err) { next(err); }
});

// Merge two candidate records. Keeps `primaryId`; reassigns all foreign
// references from `secondaryId` to primaryId; deletes secondary candidate.
// Audit logged. Admin-only.
router.post("/candidates/merge", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const user = (req as any).user;
    const primaryId = String(req.body?.primaryId || "");
    const secondaryId = String(req.body?.secondaryId || "");
    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      return res.status(400).json({ success: false, message: "primaryId and secondaryId must both be provided and differ" });
    }
    const [primary] = await db.select().from(candidates).where(eq(candidates.id, primaryId)).limit(1);
    const [secondary] = await db.select().from(candidates).where(eq(candidates.id, secondaryId)).limit(1);
    if (!primary || !secondary) return res.status(404).json({ success: false, message: "One of the candidate records not found" });

    // Re-point all applications from secondary → primary. Skip duplicate
    // applications (same jobId already applied under primary).
    const secondaryApps = await db.select().from(applications).where(eq(applications.candidateId, secondaryId));
    for (const app of secondaryApps as any[]) {
      const [existing] = await db.select().from(applications)
        .where(and(eq(applications.candidateId, primaryId), eq(applications.jobId, app.jobId))).limit(1);
      if (existing) continue; // primary already applied to this job
      await db.update(applications).set({ candidateId: primaryId }).where(eq(applications.id, app.id));
    }

    // Delete whatever didn't migrate (the skipped duplicates).
    await db.delete(applications).where(eq(applications.candidateId, secondaryId));
    // Then delete the secondary candidate.
    await db.delete(candidates).where(eq(candidates.id, secondaryId));

    await db.insert(auditLog).values({
      userId: user.id, action: "merge", resourceType: "candidate",
      resourceId: primaryId,
      details: { primaryId, secondaryId, migratedApps: secondaryApps.length } as any,
    });
    res.json({ success: true, data: { primaryId, mergedApplications: secondaryApps.length } });
  } catch (err) { next(err); }
});

// ── Fraud / anomaly watchlist ────────────────────────────────────────
// Surfaces recent fraud reports plus agencies with a grievance spike.
// Pure SQL over the grievances table — no new collection needed.
router.get("/fraud-watchlist", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });

    const recentReports = await db.select({
      id: grievances.id,
      createdAt: grievances.createdAt,
      subject: grievances.subject,
      description: grievances.description,
      metadata: grievances.metadata,
      status: grievances.status,
      userId: grievances.userId,
      username: users.username,
    }).from(grievances)
      .leftJoin(users, eq(users.id, grievances.userId))
      .where(eq(grievances.category, "fraud_report"))
      .orderBy(desc(grievances.createdAt))
      .limit(50);

    // Agencies with a grievance spike (≥ 3 grievances in last 30 days).
    const agencyCounts = await db.execute(sql`
      SELECT a.id AS agency_id, a.agency_name AS agency_name, a.license_number AS license_number,
             COUNT(g.id)::int AS grievance_count
      FROM recruitment_agents a
      LEFT JOIN grievances g
        ON (g.metadata->>'agencyId' = a.id OR g.description ILIKE '%' || a.agency_name || '%')
        AND g.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY a.id, a.agency_name, a.license_number
      HAVING COUNT(g.id) >= 3
      ORDER BY COUNT(g.id) DESC
    `);

    res.json({
      success: true,
      data: {
        recentReports,
        flaggedAgencies: Array.isArray(agencyCounts) ? agencyCounts : (agencyCounts as any).rows ?? [],
      },
    });
  } catch (err) { next(err); }
});

// ── Deployment-readiness fleet view (HPSEDC cohort) ──────────────────
// readiness 2026-07-07: one readiness object per placement-holding candidate
// (placements ARE the deployment-relevant set — a candidate with no offer has
// nothing to deploy against). Primary placement = an accepted/active/completed
// one if present, else the most recent — same rule as the agent candidate-
// detail view, so both surfaces show the same number.
async function computeReadinessFleet(db: NonNullable<typeof storage.db>) {
  const rows = await db
    .select({ placement: placements, candidate: candidates })
    .from(placements)
    .innerJoin(applications, eq(placements.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id));

  // Batch-load the ECR destination flags once (no per-row country lookups).
  const ciRows = await db.select({ name: countryInfo.name, isEcr: countryInfo.isEcrCountry }).from(countryInfo);
  const ecrByCountry = new Map<string, boolean>(ciRows.map((r: any) => [r.name, !!r.isEcr]));

  // Group placements per candidate, then score the primary one.
  const byCandidate = new Map<string, { candidate: any; placementRows: any[] }>();
  for (const r of rows as any[]) {
    const entry = byCandidate.get(r.candidate.id) ?? { candidate: r.candidate, placementRows: [] };
    entry.placementRows.push(r.placement);
    byCandidate.set(r.candidate.id, entry);
  }

  const fleet = Array.from(byCandidate.values()).map(({ candidate: c, placementRows: ps }) => {
    const primary = pickPrimaryPlacement(ps) ?? ps[0];
    const readiness: Readiness = computeReadiness(c, primary, {
      destinationIsEcr: ecrByCountry.get(primary.country) === true,
    });
    return { candidateId: c.id, fullName: c.fullName, destination: primary.country, readiness };
  });

  // Travel-ready first, then most-complete first.
  fleet.sort((a, b) =>
    Number(b.readiness.isTravelReady) - Number(a.readiness.isTravelReady)
    || b.readiness.pct - a.readiness.pct);
  return fleet;
}

router.get("/deployment-readiness", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const fleet = await computeReadinessFleet(db);

    const counts = {
      travelReady: fleet.filter((f) => f.readiness.isTravelReady).length,
      inCompliance: fleet.filter((f) => f.readiness.isComplianceReady).length,
      blocked: fleet.filter((f) => f.readiness.blockers > 0).length, // hard blockers (expired passport, visa rejected) — not soft warnings
      total: fleet.length,
    };
    const byStage: Record<string, number> = {
      registered: 0, documents: 0, compliance: 0, deployment: 0, travel_ready: 0,
    };
    for (const f of fleet) byStage[f.readiness.stage] = (byStage[f.readiness.stage] ?? 0) + 1;

    res.json({
      success: true,
      data: {
        counts,
        byStage,
        candidates: fleet.map((f) => ({
          candidateId: f.candidateId,
          fullName: f.fullName,
          destination: f.destination,
          pct: f.readiness.pct,
          stage: f.readiness.stage,
          isTravelReady: f.readiness.isTravelReady,
          actionNeeded: f.readiness.actionNeeded,
          blockers: f.readiness.blockers,
          warnings: f.readiness.warnings,
          pending: f.readiness.pending.map((p) => p.label),
        })),
      },
    });
  } catch (err) { next(err); }
});

// CSV export of the same fleet — spreadsheet-ready for the HPSEDC deployment
// cell. CSV-injection defense mirrors admin/reports.ts defuseCsvCell: strip
// leading formula-trigger characters so cells are inert in Excel/Sheets.
function defuseCsvCell(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/^[=+\-@\t\r]+/, "");
}

router.get("/deployment-readiness/export.csv", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).send("db unavailable");
    const fleet = await computeReadinessFleet(db);

    const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [
      ["candidate_name", "destination_country", "readiness_pct", "stage", "travel_ready", "pending_items"].join(","),
    ];
    for (const f of fleet) {
      lines.push([
        escape(defuseCsvCell(f.fullName)),
        escape(defuseCsvCell(f.destination)),
        String(f.readiness.pct),
        f.readiness.stage,
        f.readiness.isTravelReady ? "yes" : "no",
        escape(defuseCsvCell(f.readiness.pending.map((p) => p.label).join("; "))),
      ].join(","));
    }

    const filename = `deployment-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\n"));
  } catch (err) { next(err); }
});

export default router;
