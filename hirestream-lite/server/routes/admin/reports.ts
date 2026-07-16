import { Router } from "express";
import { protect } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { storage } from "../../storage";
import {
  users, candidates, jobs, applications, recruitmentAgents,
  employers, recruitmentDrives, interviews, placements,
  grievances, notifications, documents, countryInfo,
} from "@shared/schema";
import { eq, count, sql, desc, and } from "drizzle-orm";
import { sanitizeUser } from "../../lib/safeUser";

const router = Router();
router.use(protect);
router.use(requireRole(["admin", "superadmin"]));

// ── Dashboard Stats (real aggregated metrics) ───────────────────────
router.get("/dashboard", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const [
      totalUsers,
      totalCandidates,
      totalAgencies,
      verifiedAgencies,
      totalEmployers,
      totalJobs,
      activeJobs,
      totalApplications,
      totalPlacements,
      pendingVerifications,
      pendingDrives,
      openGrievances,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(candidates),
      db.select({ c: count() }).from(recruitmentAgents),
      db.select({ c: count() }).from(recruitmentAgents).where(eq(recruitmentAgents.verified, true)),
      db.select({ c: count() }).from(employers),
      db.select({ c: count() }).from(jobs),
      db.select({ c: count() }).from(jobs).where(eq(jobs.status, "active")),
      db.select({ c: count() }).from(applications),
      // Placements: only count SUCCESSFUL placements (accepted/active/completed).
      // Pending/rejected/withdrawn placements exist but should not inflate the
      // "Placements" card on the Overview — that card implies actual placements
      // achieved. Matches the semantics of the Application Pipeline "Placed"
      // stage in /admin/oversight/funnel.
      db.select({ c: count() }).from(placements).where(sql`${placements.status} IN ('accepted','active','completed')`),
      db.select({ c: count() }).from(recruitmentAgents).where(eq(recruitmentAgents.verified, false)),
      db.select({ c: count() }).from(recruitmentDrives).where(eq(recruitmentDrives.status, "pending")),
      db.select({ c: count() }).from(grievances).where(
        and(
          sql`${grievances.status} != 'resolved'`,
          sql`${grievances.status} != 'escalated'`
        )
      ),
    ]);

    // Application status breakdown
    const statusBreakdown = await db.execute(sql`
      SELECT status, COUNT(*)::int as count FROM applications GROUP BY status ORDER BY count DESC
    `);

    // Recent registrations (last 7 days)
    const recentRegistrations = await db.execute(sql`
      SELECT role, COUNT(*)::int as count FROM users
      WHERE last_login_at IS NULL OR last_login_at > NOW() - INTERVAL '7 days'
      GROUP BY role
    `);

    res.json({
      success: true,
      data: {
        users: { total: Number(totalUsers[0]?.c ?? 0), candidates: Number(totalCandidates[0]?.c ?? 0), agencies: Number(totalAgencies[0]?.c ?? 0), employers: Number(totalEmployers[0]?.c ?? 0) },
        agencies: { total: Number(totalAgencies[0]?.c ?? 0), verified: Number(verifiedAgencies[0]?.c ?? 0), pendingVerification: Number(pendingVerifications[0]?.c ?? 0) },
        jobs: { total: Number(totalJobs[0]?.c ?? 0), active: Number(activeJobs[0]?.c ?? 0) },
        applications: { total: Number(totalApplications[0]?.c ?? 0), statusBreakdown: statusBreakdown.rows },
        placements: { total: Number(totalPlacements[0]?.c ?? 0) },
        drives: { pendingApproval: Number(pendingDrives[0]?.c ?? 0) },
        grievances: { open: Number(openGrievances[0]?.c ?? 0) },
        recentRegistrations: recentRegistrations.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── Report: By District/Location ────────────────────────────────────
router.get("/by-district", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const result = await db.execute(sql`
      SELECT
        COALESCE(c.location, 'Not Specified') as district,
        COUNT(DISTINCT c.id)::int as candidates,
        COUNT(DISTINCT a.id)::int as applications,
        COUNT(DISTINCT CASE WHEN a.status = 'selected' OR a.status = 'placed' THEN a.id END)::int as placements
      FROM candidates c
      LEFT JOIN applications a ON a.candidate_id = c.id
      GROUP BY c.location
      ORDER BY candidates DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// ── Report: By Agency ───────────────────────────────────────────────
router.get("/by-agency", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const result = await db.execute(sql`
      SELECT
        ra.agency_name,
        ra.verified,
        ra.rating,
        COUNT(DISTINCT j.id)::int as total_jobs,
        COUNT(DISTINCT a.id)::int as total_applications,
        COUNT(DISTINCT CASE WHEN a.status = 'selected' THEN a.id END)::int as selections,
        COUNT(DISTINCT p.id)::int as placements,
        ROUND(AVG(a.match_score))::int as avg_match_score
      FROM recruitment_agents ra
      LEFT JOIN users u ON u.id = ra.user_id
      LEFT JOIN jobs j ON j.agent_id = u.id
      LEFT JOIN applications a ON a.job_id = j.id
      LEFT JOIN placements p ON p.application_id = a.id
      GROUP BY ra.id, ra.agency_name, ra.verified, ra.rating
      ORDER BY placements DESC, total_applications DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// ── Report: By Skill ────────────────────────────────────────────────
router.get("/by-skill", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // Skills demanded (from jobs)
    const demand = await db.execute(sql`
      SELECT unnest(skills) as skill, COUNT(*)::int as job_count
      FROM jobs WHERE status = 'active'
      GROUP BY skill ORDER BY job_count DESC LIMIT 20
    `);

    // Skills available (from candidates)
    const supply = await db.execute(sql`
      SELECT unnest(skills) as skill, COUNT(*)::int as candidate_count
      FROM candidates
      GROUP BY skill ORDER BY candidate_count DESC LIMIT 20
    `);

    res.json({ success: true, data: { demand: demand.rows, supply: supply.rows } });
  } catch (error) {
    next(error);
  }
});

// ── Report: By Placement Status (funnel) ────────────────────────────
router.get("/by-placement-status", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // CUMULATIVE funnel — count apps that reached AT LEAST each stage, so the
    // funnel is always monotonic (Placed ≤ Selected ≤ … ≤ Submitted). Using the
    // current status as "furthest stage reached" (the pipeline is forward-only).
    // Rejected/withdrawn apps count only at Submitted (we don't track how far
    // they got before exiting).
    const cum = await db.execute(sql`
      WITH ranked AS (
        SELECT CASE status
          WHEN 'submitted' THEN 1
          WHEN 'reviewed' THEN 2
          WHEN 'shortlisted' THEN 3
          WHEN 'interview_scheduled' THEN 4
          WHEN 'selected' THEN 5
          WHEN 'placed' THEN 6
          ELSE 1
        END AS rk
        FROM applications
      )
      SELECT
        COUNT(*) FILTER (WHERE rk >= 1)::int AS submitted,
        COUNT(*) FILTER (WHERE rk >= 2)::int AS reviewed,
        COUNT(*) FILTER (WHERE rk >= 3)::int AS shortlisted,
        COUNT(*) FILTER (WHERE rk >= 4)::int AS interview_scheduled,
        COUNT(*) FILTER (WHERE rk >= 5)::int AS selected,
        COUNT(*) FILTER (WHERE rk >= 6)::int AS placed
      FROM ranked
    `);
    const row: any = cum.rows[0] ?? {};
    const result = {
      rows: [
        { status: "submitted", count: Number(row.submitted ?? 0) },
        { status: "reviewed", count: Number(row.reviewed ?? 0) },
        { status: "shortlisted", count: Number(row.shortlisted ?? 0) },
        { status: "interview_scheduled", count: Number(row.interview_scheduled ?? 0) },
        { status: "selected", count: Number(row.selected ?? 0) },
        { status: "placed", count: Number(row.placed ?? 0) },
      ],
    };

    const totalCands = await db.select({ c: count() }).from(candidates);
    const totalApps = await db.select({ c: count() }).from(applications);
    // "Placed" = a real placement: accepted, actively deployed, or completed —
    // same definition as the Placements metric card and the compliance views.
    // (Counting only 'accepted' under-counted workers already active abroad.)
    const totalPlaced = await db.select({ c: count() }).from(placements).where(sql`${placements.status} IN ('accepted','active','completed')`);

    res.json({
      success: true,
      data: {
        funnel: result.rows,
        summary: {
          registered: Number(totalCands[0]?.c ?? 0),
          applied: Number(totalApps[0]?.c ?? 0),
          placed: Number(totalPlaced[0]?.c ?? 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── Report: By Country ──────────────────────────────────────────────
router.get("/by-country", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const result = await db.execute(sql`
      SELECT
        j.country,
        COUNT(DISTINCT j.id)::int as total_jobs,
        COUNT(DISTINCT a.id)::int as total_applications,
        COUNT(DISTINCT CASE WHEN a.status IN ('selected', 'placed') THEN a.id END)::int as placements,
        ROUND(AVG(a.match_score))::int as avg_match_score
      FROM jobs j
      LEFT JOIN applications a ON a.job_id = j.id
      GROUP BY j.country
      ORDER BY total_jobs DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// ── Report: By Sector (using job description/company grouping) ──────
router.get("/by-sector", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const result = await db.execute(sql`
      SELECT
        j.company as sector,
        COUNT(DISTINCT j.id)::int as total_jobs,
        COUNT(DISTINCT a.id)::int as total_applications,
        COUNT(DISTINCT CASE WHEN a.status IN ('selected', 'placed') THEN a.id END)::int as placements
      FROM jobs j
      LEFT JOIN applications a ON a.job_id = j.id
      GROUP BY j.company
      ORDER BY total_jobs DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// ── CSV Export ────────────────────────────────────────────────────────
function toCSV(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(";") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

// ── MEA / PoE (eMigrate-aligned) reporting export ─────────────────────
// audit 2026-07-06 (Batch 4B-2): CSV shaped for MEA / Protector-of-Emigrants
// returns: deployed ECR candidates (ECR passport OR ECR-notified destination)
// with passport, destination, employer, contract and clearance status.
// HPSEDC is the Recruiting Agent (RA) on every row — single-agency deployment.
// INTERNAL export only; there is no live eMigrate API submission.
//
// CSV-injection defense (same rule as the Smart Job Importer's defuseCell):
// strip leading formula-trigger characters so cells are inert in Excel/Sheets.
function defuseCsvCell(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/^[=+\-@\t\r]+/, "");
}

// NOTE: registered BEFORE /export/:entity.csv — Express matches in order, and
// the generic :entity pattern would otherwise swallow "mea-emigrate".
router.get("/export/mea-emigrate.csv", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).send("db unavailable");

    const rows = await db
      .select({ placement: placements, application: applications, candidate: candidates, job: jobs, country: countryInfo })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(countryInfo, eq(countryInfo.name, placements.country))
      .where(sql`${placements.status} IN ('accepted','active','completed')`);

    const reportRows = (rows as any[])
      .filter((r) => r.candidate?.ecrStatus === "ecr" || r.country?.isEcrCountry === true)
      .map((r) => ({
        candidate_name: defuseCsvCell(r.candidate.fullName),
        passport_number: defuseCsvCell(r.candidate.passportNumber),
        ecr_status: defuseCsvCell(r.candidate.ecrStatus ?? "unknown"),
        destination_country: defuseCsvCell(r.placement.country),
        destination_is_ecr: r.country?.isEcrCountry === true ? "yes" : "no",
        employer_company: defuseCsvCell(r.job.company),
        job_title: defuseCsvCell(r.job.title),
        contract_salary: defuseCsvCell(r.placement.salary ?? r.job.salary),
        emigration_clearance_status: defuseCsvCell(r.placement.emigrationClearanceStatus ?? "not_recorded"),
        deployment_date: r.placement.startDate ? new Date(r.placement.startDate).toISOString().slice(0, 10) : "",
        placement_status: defuseCsvCell(r.placement.status),
        recruiting_agent: "HPSEDC", // single super-agency — the RA on record
      }));

    // Always emit the header row — an empty ECR return is a valid result HPSEDC
    // still hands to the Protectorate, and a blank file reads as "broken export".
    const MEA_HEADERS = [
      "candidate_name", "passport_number", "ecr_status", "destination_country",
      "destination_is_ecr", "employer_company", "job_title", "contract_salary",
      "emigration_clearance_status", "deployment_date", "placement_status", "recruiting_agent",
    ];
    const csv = reportRows.length ? toCSV(reportRows) : MEA_HEADERS.join(",");
    const filename = `mea-emigrate-return-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/export/:entity.csv", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).send("db unavailable");

    const entityMap: Record<string, any> = {
      candidates, jobs, applications, agencies: recruitmentAgents, employers,
      drives: recruitmentDrives, placements, grievances, users,
    };
    const table = entityMap[req.params.entity];
    if (!table) return res.status(404).send(`Unknown entity: ${req.params.entity}`);

    const rows = await db.select().from(table);

    // security 2026-07-07 (A02-2): the old strip-only-`password` export leaked
    // twoFactorSecret + twoFactorRecoveryCodes + raw Aadhaar for every user
    // (users.csv) — exporting the TOTP seed defeats 2FA portal-wide. The
    // shared serializer removes credential/2FA secrets and masks Aadhaar on
    // any entity that carries those columns; all other columns still export.
    const safeRows = rows.map((r: any) => sanitizeUser(r));

    const csv = toCSV(safeRows);
    const filename = `${req.params.entity}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
