/**
 * Backup service — full-system snapshots.
 *
 * A snapshot bundles, in one .tar.gz:
 *   manifest.json                     — sizes + version + timestamps
 *   hirestream.sql                    — pg_dump of the HireStream DB
 *   agentryx_verify.sql               — pg_dump of the Verify DB (optional)
 *   uploads-hirestream.tar            — tar of hirestream/uploads/
 *   uploads-verify.tar                — tar of agentryx-verify/uploads/ (optional)
 *
 * The Verify pieces are conditional — they're included if we can reach the
 * Verify DB and the uploads dir, otherwise the snapshot is HireStream-only
 * and the manifest records that. We never fail the whole snapshot because
 * Verify was unreachable.
 *
 * Schedule + retention live in `system_settings`:
 *   backup.auto_enabled       boolean   default false
 *   backup.schedule_hour      int 0-23  default 2 (2am)
 *   backup.retention_days     int       default 14
 *   backup.last_run_at        ISO ts
 *   backup.last_run_status    "ok" | error message
 *
 * The scheduler ticks once a minute. When it sees the configured hour and the
 * last successful run wasn't today, it fires a snapshot and prunes anything
 * older than retention_days.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { systemSettings } from "@shared/schema";
import { logger } from "../config/logger.config";

const execFileAsync = promisify(execFile);

// Where finished snapshots land on disk. Process cwd is the hirestream app
// root in production (pm2 ecosystem), so this resolves to
// ~/Projects/Recruitment/hirestream/backups/.
export const BACKUP_DIR = path.resolve(process.cwd(), "backups");

// The two upload roots that hold candidate documents + verify attachments.
// Kept here so they're easy to update if the layout ever changes again.
const HS_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const VERIFY_UPLOADS_DIR = path.resolve(process.cwd(), "..", "agentryx-verify", "uploads");

// HireStream connection from env; Verify has its own DB on the same Postgres
// instance, so we just swap the database name.
const HS_DB_URL = process.env.DATABASE_URL || "";
const VERIFY_DB_URL = HS_DB_URL ? HS_DB_URL.replace(/\/hirestream(\?|$)/, "/agentryx_verify$1") : "";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Slug-safe ISO timestamp for filenames — 2026-05-24T17-32-08
function tsSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── Settings read/write — bypasses the SETTING_SPECS validator so backup ──
// knobs can live in system_settings without bloating the Admin Settings UI.
// Values stored as JSON; we always coerce back on read.
async function readSetting<T = any>(key: string, fallback: T): Promise<T> {
  if (!storage.db) return fallback;
  const [row] = await storage.db.select().from(systemSettings).where(eq(systemSettings.key, key));
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return row.value as any; }
}
async function writeSetting(key: string, value: any) {
  if (!storage.db) return;
  const v = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  // INSERT … ON CONFLICT UPDATE — system_settings uniqueness is on `key`
  const existing = await storage.db.select().from(systemSettings).where(eq(systemSettings.key, key));
  if (existing.length) {
    await storage.db.update(systemSettings).set({ value: v, updatedAt: new Date() }).where(eq(systemSettings.key, key));
  } else {
    await storage.db.insert(systemSettings).values({ key, value: v });
  }
}

export interface BackupSettings {
  autoEnabled: boolean;
  scheduleHour: number;
  retentionDays: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  return {
    autoEnabled:   await readSetting("backup.auto_enabled", false),
    scheduleHour:  await readSetting("backup.schedule_hour", 2),
    retentionDays: await readSetting("backup.retention_days", 14),
    lastRunAt:     await readSetting<string | null>("backup.last_run_at", null),
    lastRunStatus: await readSetting<string | null>("backup.last_run_status", null),
  };
}

export async function updateBackupSettings(patch: Partial<BackupSettings>) {
  if (patch.autoEnabled !== undefined)    await writeSetting("backup.auto_enabled", !!patch.autoEnabled);
  if (patch.scheduleHour !== undefined) {
    const h = Math.max(0, Math.min(23, Number(patch.scheduleHour) | 0));
    await writeSetting("backup.schedule_hour", h);
  }
  if (patch.retentionDays !== undefined) {
    const d = Math.max(1, Math.min(365, Number(patch.retentionDays) | 0));
    await writeSetting("backup.retention_days", d);
  }
  return getBackupSettings();
}

// ── Snapshot creation ────────────────────────────────────────────────
export interface SnapshotResult {
  name: string;
  size_mb: number;
  created_at: string;
  components: Record<string, { size_mb: number; included: boolean; note?: string }>;
  warnings: string[];
}

/** Build a full-system snapshot. Throws on irrecoverable failures (e.g. no
 *  HireStream DB), returns warnings in the result for partial pieces. */
export async function createSnapshot(): Promise<SnapshotResult> {
  if (!HS_DB_URL) throw new Error("DATABASE_URL not set — cannot dump HireStream DB");
  ensureDir(BACKUP_DIR);

  const ts = tsSlug();
  const stageDir = path.join("/tmp", `hs-snapshot-${ts}`);
  ensureDir(stageDir);

  const warnings: string[] = [];
  const components: Record<string, { size_mb: number; included: boolean; note?: string }> = {};

  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
  const sizeOf = (p: string) => (fs.existsSync(p) ? fs.statSync(p).size : 0);

  // 1. HireStream DB (required)
  const hsSqlPath = path.join(stageDir, "hirestream.sql");
  await execFileAsync("pg_dump", [
    "--no-owner", "--no-acl", "--clean", "--if-exists",
    "-f", hsSqlPath, HS_DB_URL,
  ], { timeout: 5 * 60 * 1000 });
  components.hirestream_db = { size_mb: mb(sizeOf(hsSqlPath)), included: true };

  // 2. Verify DB (optional — skip cleanly if unreachable)
  const verifySqlPath = path.join(stageDir, "agentryx_verify.sql");
  if (VERIFY_DB_URL) {
    try {
      await execFileAsync("pg_dump", [
        "--no-owner", "--no-acl", "--clean", "--if-exists",
        "-f", verifySqlPath, VERIFY_DB_URL,
      ], { timeout: 5 * 60 * 1000 });
      components.agentryx_verify_db = { size_mb: mb(sizeOf(verifySqlPath)), included: true };
    } catch (e: any) {
      warnings.push(`Verify DB dump failed: ${e.message?.slice(0, 120)}`);
      components.agentryx_verify_db = { size_mb: 0, included: false, note: "skipped (unreachable)" };
    }
  } else {
    components.agentryx_verify_db = { size_mb: 0, included: false, note: "no DATABASE_URL" };
  }

  // 3. HireStream uploads (required if dir exists; empty tar otherwise)
  const hsUploadsTar = path.join(stageDir, "uploads-hirestream.tar");
  if (fs.existsSync(HS_UPLOADS_DIR)) {
    await execFileAsync("tar", ["-cf", hsUploadsTar, "-C", path.dirname(HS_UPLOADS_DIR), path.basename(HS_UPLOADS_DIR)], { timeout: 5 * 60 * 1000 });
    components.hirestream_uploads = { size_mb: mb(sizeOf(hsUploadsTar)), included: true };
  } else {
    warnings.push("HireStream uploads dir missing");
    components.hirestream_uploads = { size_mb: 0, included: false, note: "dir not found" };
  }

  // 4. Verify uploads (optional)
  const verifyUploadsTar = path.join(stageDir, "uploads-verify.tar");
  if (fs.existsSync(VERIFY_UPLOADS_DIR)) {
    try {
      await execFileAsync("tar", ["-cf", verifyUploadsTar, "-C", path.dirname(VERIFY_UPLOADS_DIR), path.basename(VERIFY_UPLOADS_DIR)], { timeout: 5 * 60 * 1000 });
      components.agentryx_verify_uploads = { size_mb: mb(sizeOf(verifyUploadsTar)), included: true };
    } catch (e: any) {
      warnings.push(`Verify uploads tar failed: ${e.message?.slice(0, 120)}`);
      components.agentryx_verify_uploads = { size_mb: 0, included: false, note: "tar failed" };
    }
  } else {
    components.agentryx_verify_uploads = { size_mb: 0, included: false, note: "dir not found" };
  }

  // 5. Manifest
  const version = (() => {
    try { return fs.readFileSync(path.resolve(process.cwd(), "VERSION"), "utf8").trim(); }
    catch { return "unknown"; }
  })();
  const manifest = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    app_version: version,
    hostname: os.hostname(),
    components,
    warnings,
  };
  fs.writeFileSync(path.join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // 6. tar.gz the whole staging dir → backups/snapshot-<ts>.tar.gz
  const finalName = `snapshot-${ts}.tar.gz`;
  const finalPath = path.join(BACKUP_DIR, finalName);
  await execFileAsync("tar", ["-czf", finalPath, "-C", stageDir, "."], { timeout: 5 * 60 * 1000 });

  // 7. Cleanup the staging dir
  fs.rmSync(stageDir, { recursive: true, force: true });

  const finalSize = mb(sizeOf(finalPath));
  logger.info(`Backup snapshot created: ${finalName} (${finalSize} MB, ${warnings.length} warnings)`);

  return {
    name: finalName,
    size_mb: finalSize,
    created_at: manifest.created_at,
    components,
    warnings,
  };
}

// ── List + delete + retention ────────────────────────────────────────
export function listSnapshots() {
  ensureDir(BACKUP_DIR);
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".tar.gz") || f.endsWith(".sql") || f.endsWith(".sql.gz"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        name: f,
        size_mb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
        created_at: stat.mtime.toISOString(),
        kind: f.endsWith(".tar.gz") ? "snapshot" : "legacy_sql",
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function deleteSnapshot(filename: string) {
  ensureDir(BACKUP_DIR);
  const safe = path.basename(filename);
  const filepath = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(filepath)) return false;
  fs.unlinkSync(filepath);
  return true;
}

/** Delete snapshots older than `keepDays`. Returns the list of removed names. */
export function enforceRetention(keepDays: number): string[] {
  ensureDir(BACKUP_DIR);
  const cutoff = Date.now() - keepDays * 86400 * 1000;
  const removed: string[] = [];
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.endsWith(".tar.gz") && !f.endsWith(".sql") && !f.endsWith(".sql.gz")) continue;
    const fp = path.join(BACKUP_DIR, f);
    if (fs.statSync(fp).mtime.getTime() < cutoff) {
      fs.unlinkSync(fp);
      removed.push(f);
    }
  }
  if (removed.length) logger.info(`Backup retention: removed ${removed.length} expired files`);
  return removed;
}

// ── Scheduler ────────────────────────────────────────────────────────
// Tick once a minute. Fire the snapshot when (a) auto-backup is enabled,
// (b) the current hour matches schedule_hour, and (c) we haven't already
// run today. Synchronous-checked but the work itself runs async.

let schedulerStarted = false;

export function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // First tick on a 60s delay so we don't race the boot-time DB pool.
  setTimeout(() => runTick(), 60_000);
  setInterval(runTick, 60_000);
  logger.info("Backup scheduler started — checking once per minute.");
}

async function runTick() {
  try {
    const cfg = await getBackupSettings();
    if (!cfg.autoEnabled) return;

    const now = new Date();
    if (now.getHours() !== cfg.scheduleHour) return;

    // Skip if we already ran today (any status; we don't want to retry-spam
    // if pg_dump is broken — admin needs to see the error and fix it).
    if (cfg.lastRunAt) {
      const last = new Date(cfg.lastRunAt);
      if (last.toDateString() === now.toDateString()) return;
    }

    logger.info("Auto-backup tick fired — creating snapshot…");
    try {
      const r = await createSnapshot();
      enforceRetention(cfg.retentionDays);
      await writeSetting("backup.last_run_at", new Date().toISOString());
      await writeSetting("backup.last_run_status", `ok (${r.size_mb} MB${r.warnings.length ? `, ${r.warnings.length} warnings` : ""})`);
    } catch (e: any) {
      await writeSetting("backup.last_run_at", new Date().toISOString());
      await writeSetting("backup.last_run_status", `error: ${e.message?.slice(0, 200)}`);
      logger.error(`Auto-backup failed: ${e.message}`);
    }
  } catch (e: any) {
    // Defensive — settings read shouldn't throw, but we don't want a single
    // bad tick to kill the scheduler.
    logger.warn(`Backup tick error: ${e.message}`);
  }
}
