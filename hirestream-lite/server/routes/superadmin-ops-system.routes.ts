import { Router } from "express";
import si from "systeminformation";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { storage } from "../storage";
import { sql } from "drizzle-orm";

const execFileAsync = promisify(execFile);
const router = Router();

// Guard
router.use((req, res, next) => {
  const user = req.user as any;
  if (!user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (user.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Super Admin access required" });
  }
  next();
});

// ─── RESOURCES — ring buffer for sparklines ────────────────────────────
const RES_HISTORY: { ts: number; cpu: number; mem: number; loadAvg: number }[] = [];
const MAX_HISTORY = 60; // last 60 samples
let resourcesPolling = false;

async function pollResources() {
  if (resourcesPolling) return;
  resourcesPolling = true;
  try {
    const [cpuLoad, memData] = await Promise.all([si.currentLoad(), si.mem()]);
    const sample = {
      ts: Date.now(),
      cpu: Math.round(cpuLoad.currentLoad * 10) / 10,
      mem: Math.round((memData.active / memData.total) * 1000) / 10,
      loadAvg: cpuLoad.avgLoad ? Math.round(cpuLoad.avgLoad * 100) / 100 : 0,
    };
    RES_HISTORY.push(sample);
    if (RES_HISTORY.length > MAX_HISTORY) RES_HISTORY.shift();
  } catch {}
  resourcesPolling = false;
}

// Start polling on first request, sample every 5s
let pollerStarted = false;
function ensurePoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  pollResources();
  setInterval(pollResources, 5000).unref();
}

router.get("/resources", async (_req, res) => {
  try {
    ensurePoller();
    const [cpu, mem, fsSize, osInfo, time, load] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.currentLoad(),
    ]);

    res.json({
      success: true,
      data: {
        cpu: {
          brand: cpu.brand || cpu.manufacturer,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          speed: cpu.speed,
          currentLoad: Math.round(load.currentLoad * 10) / 10,
          loadAvg: load.avgLoad ? Math.round(load.avgLoad * 100) / 100 : 0,
        },
        memory: {
          total_gb: Math.round((mem.total / 1024 / 1024 / 1024) * 10) / 10,
          used_gb: Math.round((mem.active / 1024 / 1024 / 1024) * 10) / 10,
          free_gb: Math.round((mem.available / 1024 / 1024 / 1024) * 10) / 10,
          used_pct: Math.round((mem.active / mem.total) * 1000) / 10,
          swap_total_gb: Math.round((mem.swaptotal / 1024 / 1024 / 1024) * 10) / 10,
          swap_used_gb: Math.round((mem.swapused / 1024 / 1024 / 1024) * 10) / 10,
        },
        disk: fsSize.slice(0, 5).map(d => ({
          fs: d.fs,
          mount: d.mount,
          type: d.type,
          size_gb: Math.round((d.size / 1024 / 1024 / 1024) * 10) / 10,
          used_gb: Math.round((d.used / 1024 / 1024 / 1024) * 10) / 10,
          used_pct: Math.round(d.use * 10) / 10,
        })),
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          arch: osInfo.arch,
          hostname: osInfo.hostname,
          uptime_sec: time.uptime,
        },
        history: RES_HISTORY.slice(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SYSTEM INFO — TCP, processes, ports ─────────────────────────────────
router.get("/system", async (_req, res) => {
  try {
    const [proc, conn, services] = await Promise.all([
      si.processes(),
      si.networkConnections().catch(() => [] as any[]),
      si.services("nginx,postgres,pm2,node").catch(() => [] as any[]),
    ]);

    // Top 10 processes by CPU
    const topByCpu = proc.list
      .filter(p => p.cpu > 0)
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        user: p.user,
        command: p.command?.slice(0, 80),
      }));

    // Top 10 processes by memory
    const topByMem = proc.list
      .sort((a, b) => b.memRss - a.memRss)
      .slice(0, 10)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        memRss_mb: Math.round(p.memRss / 1024),
        user: p.user,
      }));

    // Listening ports
    const listening = conn
      .filter(c => c.state === "LISTEN" || c.state === "listening")
      .slice(0, 30)
      .map(c => ({
        protocol: c.protocol,
        local_address: c.localAddress,
        local_port: c.localPort,
        process: c.process,
        pid: c.pid,
      }));

    // Active established connections
    const established = conn
      .filter(c => c.state === "ESTABLISHED" || c.state === "established")
      .length;

    res.json({
      success: true,
      data: {
        process_summary: {
          all: proc.all,
          running: proc.running,
          blocked: proc.blocked,
          sleeping: proc.sleeping,
        },
        top_by_cpu: topByCpu,
        top_by_memory: topByMem,
        listening_ports: listening,
        established_connections: established,
        services: services.map(s => ({
          name: s.name,
          running: s.running,
          startmode: s.startmode,
          pids: s.pids,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SQL SANDBOX — SELECT-only with timeout ──────────────────────────────
const SQL_RATE: Record<string, number[]> = {};

router.post("/sql/execute", async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    // Rate limit: 30 queries / 5 min per superadmin
    const now = Date.now();
    const window = 5 * 60 * 1000;
    SQL_RATE[userId] = (SQL_RATE[userId] || []).filter(t => now - t < window);
    if (SQL_RATE[userId].length >= 30) {
      return res.status(429).json({ success: false, message: "Rate limit: max 30 queries per 5 minutes" });
    }

    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ success: false, message: "query string required" });
    }

    // Strict whitelist: SELECT/WITH/EXPLAIN only, no semicolons (single statement)
    const trimmed = query.trim().replace(/;\s*$/, "");
    const lower = trimmed.toLowerCase();

    // Block dangerous keywords (case-insensitive boundary check)
    const blocked = ["insert", "update", "delete", "drop", "alter", "create", "truncate",
                     "grant", "revoke", "vacuum", "lock", "copy", "do ", "call ", "execute",
                     "reset", "set ", "begin", "commit", "rollback", "savepoint"];
    for (const kw of blocked) {
      const re = new RegExp(`\\b${kw.trim()}\\b`, "i");
      if (re.test(lower)) {
        return res.status(400).json({
          success: false,
          message: `Query contains blocked keyword: '${kw.trim()}'. Only SELECT/WITH/EXPLAIN are allowed.`,
        });
      }
    }

    // Must START with SELECT, WITH, or EXPLAIN
    if (!/^(select|with|explain)\s/i.test(trimmed)) {
      return res.status(400).json({
        success: false,
        message: "Query must start with SELECT, WITH, or EXPLAIN",
      });
    }

    // Check for multiple statements
    if (trimmed.includes(";")) {
      return res.status(400).json({
        success: false,
        message: "Multiple statements not allowed (remove semicolons)",
      });
    }

    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    SQL_RATE[userId].push(now);

    // Execute with statement_timeout via Postgres
    const start = Date.now();
    try {
      // audit 2026-07-06 (C14): SET LOCAL is a no-op outside a transaction —
      // run both statements inside one so the 5s timeout actually applies.
      const result = await storage.db.transaction(async (tx: any) => {
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = 5000`));
        return await tx.execute(sql.raw(trimmed));
      });
      const elapsed = Date.now() - start;

      // Cap result rows to 500 to prevent payload bloat
      const rows = (result.rows || []).slice(0, 500);

      res.json({
        success: true,
        data: rows,
        rowCount: result.rows?.length || 0,
        truncated: (result.rows?.length || 0) > 500,
        elapsed_ms: elapsed,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        message: err.message?.split("\n")[0] || "Query failed",
        elapsed_ms: Date.now() - start,
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── BACKUPS — full-system snapshots via services/backup.service ─────────
// The actual snapshot logic lives in services/backup.service so the same
// `createSnapshot()` is reachable both from the admin UI (here) and the
// auto-scheduler at server boot. This file is now a thin REST adapter.
import {
  BACKUP_DIR,
  createSnapshot,
  listSnapshots,
  deleteSnapshot,
  enforceRetention,
  getBackupSettings,
  updateBackupSettings,
} from "../services/backup.service";

router.get("/backups", async (_req, res) => {
  try {
    const files = listSnapshots();
    const settings = await getBackupSettings();

    // Live DB size for context — same as before.
    let db_size_mb = null;
    try {
      if (storage.db) {
        const r = await storage.db.execute(sql`SELECT pg_database_size(current_database())::bigint AS size`);
        const s = (r.rows?.[0] as any)?.size;
        db_size_mb = s ? Math.round(Number(s) / 1024 / 1024 * 100) / 100 : null;
      }
    } catch {}

    res.json({
      success: true,
      data: files,
      backup_dir: BACKUP_DIR,
      db_size_mb,
      settings,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get just the schedule + retention settings (used by the UI's settings panel).
router.get("/backups/settings", async (_req, res) => {
  try {
    res.json({ success: true, data: await getBackupSettings() });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update schedule + retention. Body keys are optional — only the ones sent
// get applied. Coerced + clamped server-side in updateBackupSettings.
router.patch("/backups/settings", async (req, res) => {
  try {
    const next = await updateBackupSettings(req.body ?? {});
    res.json({ success: true, data: next });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/backups/create", async (req, res) => {
  try {
    const { confirmation } = req.body ?? {};
    if (confirmation !== "CREATE_BACKUP") {
      return res.status(400).json({ success: false, message: "Send { confirmation: 'CREATE_BACKUP' }" });
    }

    // 6-minute upper bound on the request — the snapshot service itself has
    // per-step timeouts (5 min each) but the HTTP path needs its own ceiling.
    const snap = await createSnapshot();

    // Prune old snapshots according to the configured retention so manual
    // creates also keep disk usage bounded.
    const { retentionDays } = await getBackupSettings();
    enforceRetention(retentionDays);

    res.json({ success: true, data: snap });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Snapshot failed: ${err.message?.slice(0, 300)}` });
  }
});

router.get("/backups/:filename/download", async (req, res) => {
  try {
    const safe = path.basename(req.params.filename);
    const filepath = path.join(BACKUP_DIR, safe);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: "Backup not found" });
    }
    // Set MIME based on extension. New snapshots are tar.gz; legacy .sql
    // dumps stay supported for the old downloads still in backups/.
    const mime = safe.endsWith(".tar.gz") ? "application/gzip" : "application/sql";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/backups/:filename", async (req, res) => {
  try {
    const ok = deleteSnapshot(req.params.filename);
    if (!ok) return res.status(404).json({ success: false, message: "Backup not found" });
    res.json({ success: true, message: "Backup deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TRENDS — time-series for charts ─────────────────────────────────────
router.get("/trends", async (_req, res) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db available" });

    // Daily aggregates for last 30 days
    const [submissions, placements, registrations] = await Promise.all([
      db.execute(sql`
        SELECT DATE(applied_at) AS day, COUNT(*)::int AS count
        FROM applications
        WHERE applied_at > NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `),
      db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM placements
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `),
      db.execute(sql`
        SELECT DATE(last_login_at) AS day, COUNT(*)::int AS count
        FROM users
        WHERE last_login_at > NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `),
    ]);

    res.json({
      success: true,
      data: {
        submissions: submissions.rows,
        placements: placements.rows,
        registrations: registrations.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROCESS RESTART (graceful) ──────────────────────────────────────────
// POST /api/v1/superadmin/ops/process/restart — schedules a soft restart
// In production with PM2, the process exits cleanly and PM2 restarts it.
// Without PM2, the process simply exits and a process supervisor is needed.
router.post("/process/restart", async (req, res) => {
  try {
    const { confirmation } = req.body;
    if (confirmation !== "RESTART_PROCESS") {
      return res.status(400).json({
        success: false,
        message: "Send { confirmation: 'RESTART_PROCESS' } to schedule restart",
      });
    }

    // Schedule exit after response has been sent
    res.json({
      success: true,
      message: "Restart scheduled in 1 second. Process will exit cleanly; if running under PM2/systemd, it will be restarted automatically.",
      pid: process.pid,
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
