import { Router } from "express";
import { storage } from "../storage";
import {
  users, candidates, jobs, applications, recruitmentAgents,
  employers, recruitmentDrives, placements, grievances,
  agencyReviews,
} from "@shared/schema";
import { sql, desc, eq, and, or, lt, isNotNull, isNull, ilike } from "drizzle-orm";
import { sanitizeUser } from "../lib/safeUser";

const router = Router();

// Guard: only superadmin
router.use((req, res, next) => {
  const user = req.user as any;
  if (!user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (user.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Super Admin access required" });
  }
  next();
});

// Track process start for restart detection (in-memory; resets on deploy)
const PROCESS_START = Date.now();
const APP_VERSION = process.env.npm_package_version || "1.2.2";

// Pool stats helper — works with node-postgres pool if available
function getDbPoolStats(): { total: number; idle: number; waiting: number } | null {
  try {
    const s = storage as any;
    const pool = s.pool || s.db?.pool || s.db?._client?.pool;
    if (pool && typeof pool.totalCount === "number") {
      return {
        total: pool.totalCount,
        idle: pool.idleCount ?? 0,
        waiting: pool.waitingCount ?? 0,
      };
    }
  } catch {}
  return null;
}

// ─── OVERVIEW ──────────────────────────────────────────────────────────
// GET /api/v1/superadmin/ops/overview — health score + process + deps + pool
router.get("/overview", async (_req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });

    // Probe DB latency
    const dbStart = Date.now();
    let dbLatency = 0;
    let dbOk = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
      dbOk = true;
    } catch {}

    // External deps — check env or simple probe
    const env = process.env;
    const deps = {
      database: { status: dbOk ? "ok" : "error", latency: `${dbLatency}ms`, label: "Database" },
      smtp: { status: env.SMTP_HOST ? "configured" : "not_set", label: "SMTP" },
      sms: { status: env.SMS_API_KEY ? "configured" : "not_set", label: "SMS" },
      sessions: { status: "active", label: "Sessions" },
      storage: { status: "ok", label: "Storage" },
      aadhaar: { status: env.AADHAAR_API_KEY ? "configured" : "stub", label: "Aadhaar" },
    };

    // Process info
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const process_info = {
      pid: process.pid,
      status: "online",
      uptime_seconds: uptimeSec,
      uptime_display: formatUptime(uptimeSec),
      restarts: 0, // process.env.RESTART_COUNT could be set by PM2
      node_version: process.version,
      app_version: APP_VERSION,
      started_at: new Date(PROCESS_START).toISOString(),
    };

    // Memory info
    const memory = {
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024),
    };

    // DB Pool
    const pool = getDbPoolStats();

    // Compute health score (0-100)
    let score = 100;
    if (!dbOk) score -= 40;
    if (dbLatency > 500) score -= 10;
    if (!env.SMTP_HOST) score -= 5;
    if (memory.heap_used_mb > 500) score -= 10;
    if (uptimeSec < 60) score -= 5; // Recent restart warning

    // Compute alerts count (ties to Signals tab)
    const alerts = await computeSignals(db);
    const warningCount = alerts.filter((a: any) => a.severity === "warning").length;
    const criticalCount = alerts.filter((a: any) => a.severity === "critical").length;
    score -= criticalCount * 10 + warningCount * 3;
    score = Math.max(0, Math.min(100, score));

    res.json({
      success: true,
      data: {
        health: {
          score,
          status: score >= 80 ? "healthy" : score >= 50 ? "degraded" : "unhealthy",
        },
        alerts: {
          total: alerts.length,
          critical: criticalCount,
          warning: warningCount,
          top: alerts.slice(0, 5),
        },
        process: process_info,
        memory,
        dependencies: deps,
        db_pool: pool,
        environment: {
          node_env: env.NODE_ENV,
          port: env.PORT,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ─── SIGNALS (16 smart alerts) ─────────────────────────────────────────
async function computeSignals(db: any): Promise<any[]> {
  const signals: any[] = [];
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400 * 1000);

  try {
    // 1. Stuck applications (>48h no status change)
    const stuckApps = await db.select({ count: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.status, "submitted"), lt(applications.appliedAt, hoursAgo(48))));
    if ((stuckApps[0]?.count || 0) > 0) {
      signals.push({
        id: "stuck_applications",
        severity: "warning",
        title: `${stuckApps[0].count} application(s) stuck in Submitted >48h`,
        description: "Applicants may be waiting for recruiter review",
        category: "pipeline",
      });
    }

    // 2. Agency verification backlog (>7 days pending)
    const agencyBacklog = await db.select({ count: sql<number>`count(*)::int` })
      .from(recruitmentAgents)
      .where(eq(recruitmentAgents.verified, false));
    if ((agencyBacklog[0]?.count || 0) > 0) {
      signals.push({
        id: "agency_verification_backlog",
        severity: (agencyBacklog[0].count || 0) > 5 ? "warning" : "info",
        title: `${agencyBacklog[0].count} agency verification(s) pending`,
        description: "Agencies awaiting HPSEDC approval",
        category: "verification",
      });
    }

    // 3. Drive approval backlog
    const driveBacklog = await db.select({ count: sql<number>`count(*)::int` })
      .from(recruitmentDrives)
      .where(eq(recruitmentDrives.status, "pending"));
    if ((driveBacklog[0]?.count || 0) > 0) {
      signals.push({
        id: "drive_approval_backlog",
        severity: "info",
        title: `${driveBacklog[0].count} drive(s) awaiting approval`,
        description: "Review pending drives in Admin Console",
        category: "approval",
      });
    }

    // 4. Open grievances
    const openGrievances = await db.select({ count: sql<number>`count(*)::int` })
      .from(grievances)
      .where(or(eq(grievances.status, "submitted"), eq(grievances.status, "under_review")));
    if ((openGrievances[0]?.count || 0) > 0) {
      signals.push({
        id: "open_grievances",
        severity: (openGrievances[0].count || 0) > 3 ? "warning" : "info",
        title: `${openGrievances[0].count} open grievance(s)`,
        description: "Grievances awaiting admin resolution",
        category: "grievance",
      });
    }

    // 5. High memory usage
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (heapMB > 500) {
      signals.push({
        id: "high_memory",
        severity: heapMB > 800 ? "critical" : "warning",
        title: `Node heap at ${heapMB}MB`,
        description: "Memory usage approaching limits; consider restart",
        category: "system",
      });
    }

    // 6. Recent restart detection
    const uptimeHours = process.uptime() / 3600;
    if (uptimeHours < 0.5) {
      signals.push({
        id: "recent_restart",
        severity: "info",
        title: `Process restarted ${Math.round(process.uptime() / 60)}m ago`,
        description: "Normal post-deployment behavior",
        category: "system",
      });
    }

    // 7. Zero placements this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthPlacements = await db.select({ count: sql<number>`count(*)::int` })
      .from(placements)
      .where(sql`${placements.createdAt} >= ${monthStart.toISOString()}`);
    if ((monthPlacements[0]?.count || 0) === 0 && now.getDate() > 7) {
      signals.push({
        id: "no_placements_this_month",
        severity: "warning",
        title: "Zero placements this month",
        description: `It's day ${now.getDate()} of ${now.toLocaleString("en-IN", { month: "long" })} — no placements recorded yet`,
        category: "pipeline",
      });
    }

    // 8. Unverified agencies with active jobs
    const unverifiedWithJobs = await db.select({
      count: sql<number>`count(distinct ${recruitmentAgents.id})::int`
    })
      .from(recruitmentAgents)
      .innerJoin(jobs, eq(jobs.agentId, recruitmentAgents.userId))
      .where(and(eq(recruitmentAgents.verified, false), eq(jobs.status, "active")));
    if ((unverifiedWithJobs[0]?.count || 0) > 0) {
      signals.push({
        id: "unverified_agencies_with_jobs",
        severity: "critical",
        title: `${unverifiedWithJobs[0].count} unverified agencies have active jobs`,
        description: "Security concern — verify or suspend their postings",
        category: "security",
      });
    }

    // 9. Jobs with zero applicants >14 days
    const staleJobs = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM jobs j
      WHERE j.status = 'active'
        AND j.created_at < ${daysAgo(14).toISOString()}
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
    `);
    const staleCount = (staleJobs.rows?.[0] as any)?.count || 0;
    if (staleCount > 0) {
      signals.push({
        id: "stale_jobs",
        severity: "info",
        title: `${staleCount} job(s) have zero applicants after 14 days`,
        description: "Consider reviewing job descriptions or promoting them",
        category: "pipeline",
      });
    }

    // 10. Candidates with incomplete profile (no skills)
    const incompleteCandidates = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM candidates c
      WHERE (c.skills IS NULL OR array_length(c.skills, 1) IS NULL)
        AND c.created_at < ${daysAgo(30).toISOString()}
    `);
    const incompleteCount = (incompleteCandidates.rows?.[0] as any)?.count || 0;
    if (incompleteCount > 0) {
      signals.push({
        id: "incomplete_profiles",
        severity: "info",
        title: `${incompleteCount} candidate(s) have no skills after 30+ days`,
        description: "Incomplete profiles reduce match quality",
        category: "pipeline",
      });
    }

    // 11. Employers with no jobs posted
    const idleEmployers = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM employers e
      WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.employer_id = e.user_id)
    `);
    const idleCount = (idleEmployers.rows?.[0] as any)?.count || 0;
    if (idleCount > 0) {
      signals.push({
        id: "idle_employers",
        severity: "info",
        title: `${idleCount} employer(s) registered but never posted a job`,
        description: "Potential onboarding issue; reach out for activation",
        category: "engagement",
      });
    }

    // 12. Database latency
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - dbStart;
    if (latency > 500) {
      signals.push({
        id: "slow_db",
        severity: latency > 2000 ? "critical" : "warning",
        title: `Database latency: ${latency}ms`,
        description: "DB queries running slower than expected",
        category: "system",
      });
    }

    // 13. SMTP not configured — check the runtime admin-config first (the
    // Integrations panel writes provider_config), then fall back to env.
    // Earlier this signal only looked at env, so the panel could light up
    // "SMTP not configured" even after admin saved SMTP2GO credentials.
    const emailCfg = await db.execute(sql`
      SELECT enabled, (config->>'host') AS host
      FROM provider_config WHERE id='email' LIMIT 1
    `);
    const emailEnabled = (emailCfg.rows?.[0] as any)?.enabled === true
      && !!((emailCfg.rows?.[0] as any)?.host);
    if (!emailEnabled && !process.env.SMTP_HOST) {
      signals.push({
        id: "smtp_not_configured",
        severity: "warning",
        title: "SMTP not configured",
        description: "Email notifications logged to console only (dev mode)",
        category: "integration",
      });
    }

    // 14. CAPTCHA stub (no real key)
    if (!process.env.CAPTCHA_SITE_KEY) {
      signals.push({
        id: "captcha_stub",
        severity: "warning",
        title: "CAPTCHA using stub (no real key)",
        description: "Swap to reCAPTCHA/hCaptcha before production launch",
        category: "integration",
      });
    }

    // 15. Drives happening soon (upcoming in 3 days)
    const upcomingDrives = await db.select({ count: sql<number>`count(*)::int` })
      .from(recruitmentDrives)
      .where(and(
        eq(recruitmentDrives.status, "approved"),
        sql`${recruitmentDrives.date} >= ${now.toISOString()}`,
        sql`${recruitmentDrives.date} < ${new Date(now.getTime() + 3 * 86400 * 1000).toISOString()}`,
      ));
    if ((upcomingDrives[0]?.count || 0) > 0) {
      signals.push({
        id: "upcoming_drives",
        severity: "info",
        title: `${upcomingDrives[0].count} drive(s) scheduled in next 3 days`,
        description: "Ensure agency is ready; check candidate notifications",
        category: "pipeline",
      });
    }

    // 16. Rejected applications ratio high
    const rejectedRatio = await db.execute(sql`
      SELECT
        (COUNT(*) FILTER (WHERE status = 'rejected'))::float / NULLIF(COUNT(*), 0) AS ratio,
        COUNT(*)::int AS total
      FROM applications
      WHERE applied_at > ${daysAgo(30).toISOString()}
    `);
    const rr = (rejectedRatio.rows?.[0] as any);
    if (rr && rr.total > 10 && rr.ratio > 0.7) {
      signals.push({
        id: "high_rejection_ratio",
        severity: "warning",
        title: `${Math.round(rr.ratio * 100)}% of recent applications rejected`,
        description: "Match algorithm or job requirements may need review",
        category: "pipeline",
      });
    }
  } catch (err) {
    // Don't let a single signal failure break the whole list
  }

  return signals;
}

router.get("/signals", async (_req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });
    const signals = await computeSignals(db);
    res.json({
      success: true,
      data: signals,
      summary: {
        total: signals.length,
        critical: signals.filter(s => s.severity === "critical").length,
        warning: signals.filter(s => s.severity === "warning").length,
        info: signals.filter(s => s.severity === "info").length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PIPELINE HEALTH ──────────────────────────────────────────────────────
router.get("/pipeline", async (_req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });

    // Stage counts from a consistent snapshot
    const stats = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'candidate') AS registered,
        (SELECT COUNT(*)::int FROM candidates WHERE skills IS NOT NULL AND array_length(skills, 1) > 0) AS profile_complete,
        (SELECT COUNT(DISTINCT candidate_id)::int FROM applications) AS applied,
        (SELECT COUNT(DISTINCT candidate_id)::int FROM applications WHERE status IN ('shortlisted','interview_scheduled','selected','placed')) AS shortlisted,
        (SELECT COUNT(DISTINCT candidate_id)::int FROM applications WHERE status IN ('interview_scheduled','selected','placed')) AS interview,
        (SELECT COUNT(DISTINCT candidate_id)::int FROM applications WHERE status IN ('selected','placed')) AS selected,
        (SELECT COUNT(*)::int FROM placements) AS placed
    `);

    const row = stats.rows?.[0] as any || {};

    const stages = [
      { name: "Registered", count: row.registered || 0, icon: "User" },
      { name: "Profile Complete", count: row.profile_complete || 0, icon: "CheckCircle" },
      { name: "Applied", count: row.applied || 0, icon: "FileText" },
      { name: "Shortlisted", count: row.shortlisted || 0, icon: "Star" },
      { name: "Interview", count: row.interview || 0, icon: "Calendar" },
      { name: "Selected", count: row.selected || 0, icon: "Award" },
      { name: "Placed", count: row.placed || 0, icon: "Globe" },
    ];

    // Compute conversion rates stage-to-stage
    const withConversion = stages.map((s, i) => {
      if (i === 0) return { ...s, conversion: null };
      const prev = stages[i - 1].count;
      const rate = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
      return { ...s, conversion: rate };
    });

    // Find bottleneck (biggest drop)
    let bottleneck = null;
    let maxDrop = 0;
    for (let i = 1; i < stages.length; i++) {
      const drop = stages[i - 1].count - stages[i].count;
      if (drop > maxDrop && stages[i - 1].count > 0) {
        maxDrop = drop;
        bottleneck = {
          from: stages[i - 1].name,
          to: stages[i].name,
          dropped: drop,
          retention: withConversion[i].conversion,
        };
      }
    }

    res.json({
      success: true,
      data: {
        stages: withConversion,
        bottleneck,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── LOOKUP — cross-entity search ─────────────────────────────────────────
router.get("/lookup", async (req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });

    const { q } = req.query as any;
    if (!q || q.length < 2) {
      return res.json({ success: true, data: { users: [], candidates: [], agencies: [], jobs: [], applications: [] } });
    }

    const query = `%${q}%`;

    const [usersFound, candidatesFound, agenciesFound, jobsFound] = await Promise.all([
      db.select().from(users).where(or(
        ilike(users.username, query),
        ilike(users.email, query),
      )).limit(5),
      db.select().from(candidates).where(or(
        ilike(candidates.fullName, query),
        ilike(candidates.email, query),
      )).limit(5),
      db.select().from(recruitmentAgents).where(or(
        ilike(recruitmentAgents.agencyName, query),
        ilike(recruitmentAgents.licenseNumber, query),
      )).limit(5),
      db.select().from(jobs).where(or(
        ilike(jobs.title, query),
        ilike(jobs.company, query),
      )).limit(5),
    ]);

    // security 2026-07-07 (A02-3): shared serializer — strips password AND
    // twoFactorSecret/twoFactorRecoveryCodes, masks Aadhaar.
    const safeUsers = usersFound.map((u: any) => sanitizeUser(u));

    res.json({
      success: true,
      data: {
        users: safeUsers,
        candidates: candidatesFound,
        agencies: agenciesFound,
        jobs: jobsFound,
      },
      totals: {
        users: safeUsers.length,
        candidates: candidatesFound.length,
        agencies: agenciesFound.length,
        jobs: jobsFound.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PRE-BUILT REPORTS ────────────────────────────────────────────────────
const REPORTS: Record<string, { name: string; description: string; sql: string }> = {
  candidates_by_district: {
    name: "Active candidates by district",
    description: "Candidate count grouped by district from their location field",
    sql: `SELECT COALESCE(split_part(location, ',', 1), 'Unknown') AS district, COUNT(*)::int AS candidates
          FROM candidates GROUP BY district ORDER BY candidates DESC LIMIT 20`,
  },
  top_skills_in_jobs: {
    name: "Top skills in job postings",
    description: "Most requested skills across all active jobs",
    sql: `SELECT s AS skill, COUNT(*)::int AS job_count
          FROM jobs, unnest(skills) s WHERE status='active'
          GROUP BY s ORDER BY job_count DESC LIMIT 20`,
  },
  placement_funnel: {
    name: "Placement funnel",
    description: "Application counts by status",
    sql: `SELECT status, COUNT(*)::int AS count
          FROM applications GROUP BY status ORDER BY count DESC`,
  },
  agencies_by_placements: {
    name: "Agencies by placement count",
    description: "Top-performing agencies by number of placements",
    sql: `SELECT a.agency_name, a.placements, a.rating, a.verified
          FROM recruitment_agents a ORDER BY a.placements DESC, a.rating DESC LIMIT 20`,
  },
  jobs_by_country: {
    name: "Jobs by destination country",
    description: "Active job postings grouped by country",
    sql: `SELECT country, COUNT(*)::int AS jobs
          FROM jobs WHERE status='active' GROUP BY country ORDER BY jobs DESC`,
  },
  user_growth: {
    name: "User registration growth (30d)",
    description: "Daily new registrations for the last 30 days",
    sql: `SELECT DATE(last_login_at) AS day, COUNT(*)::int AS signups
          FROM users WHERE last_login_at > NOW() - INTERVAL '30 days'
          GROUP BY day ORDER BY day DESC`,
  },
  application_aging: {
    name: "Application aging",
    description: "How long applications have been in current status",
    sql: `SELECT status, MIN(applied_at) AS oldest, MAX(applied_at) AS newest, COUNT(*)::int AS count
          FROM applications GROUP BY status`,
  },
  system_summary: {
    name: "System summary",
    description: "High-level counts across all entities",
    sql: `SELECT
           (SELECT COUNT(*)::int FROM users) AS total_users,
           (SELECT COUNT(*)::int FROM candidates) AS total_candidates,
           (SELECT COUNT(*)::int FROM recruitment_agents) AS total_agencies,
           (SELECT COUNT(*)::int FROM jobs) AS total_jobs,
           (SELECT COUNT(*)::int FROM jobs WHERE status='active') AS active_jobs,
           (SELECT COUNT(*)::int FROM applications) AS total_applications,
           (SELECT COUNT(*)::int FROM placements) AS total_placements,
           (SELECT COUNT(*)::int FROM grievances WHERE status != 'resolved') AS open_grievances`,
  },
};

router.get("/reports", async (_req, res) => {
  const list = Object.entries(REPORTS).map(([key, r]) => ({ key, name: r.name, description: r.description }));
  res.json({ success: true, data: list });
});

router.get("/reports/:name", async (req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });

    const report = REPORTS[req.params.name];
    if (!report) return res.status(404).json({ success: false, message: "Unknown report" });

    const result = await db.execute(sql.raw(report.sql));
    res.json({
      success: true,
      report: { name: report.name, description: report.description },
      data: result.rows,
      rowCount: result.rows?.length || 0,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
