/**
 * Feature config reader for standalone tool scripts.
 *
 * Priority order:
 *   1. system_config table (source of truth — Operator Console UI writes here)
 *   2. envFallback parameter (env vars on the cron host)
 *   3. Hardcoded defaults inside the caller
 *
 * Scripts that consume this:
 *   - tools/synthetic/run-prod-smoke.mjs   (feature: synthetic_monitor)
 *   - tools/triage/triage.mjs              (feature: llm_triage)
 *   - tools/log-analyzer/digest.mjs        (feature: daily_digest)
 *
 * DB connection is one-shot (no pool kept around) — scripts are cron-launched
 * and exit quickly. If DATABASE_URL is unset OR the DB is unreachable, the
 * helper silently returns envFallback. This is intentional: a cron host
 * without DB access (e.g. an external monitoring VM) must still be able to
 * run the scripts via env vars.
 */

import pg from "pg";

const { Pool } = pg;

/**
 * @param {string} feature  - one of the FEATURES enum values in
 *                            server/services/system-config.service.ts
 * @param {object} envFallback - { enabled, ...config }; used when DB
 *                               unavailable or row missing. The caller is
 *                               responsible for filling this from env vars.
 * @returns {Promise<{enabled: boolean, source: 'db'|'env'} & Record<string, any>>}
 *          Merged config + an `enabled` boolean + a `source` indicator. The
 *          source field is for log lines ("triage: config from db" vs "from env")
 *          so operators can tell which path was taken.
 */
export async function getFeatureConfig(feature, envFallback) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { ...envFallback, source: "env" };
  }
  let pool;
  try {
    pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 3000 });
    const res = await pool.query(
      "SELECT enabled, config FROM system_config WHERE feature = $1 LIMIT 1",
      [feature],
    );
    if (res.rows.length === 0) {
      return { ...envFallback, source: "env" };  // row missing — use env
    }
    const row = res.rows[0];
    // DB wins for `enabled` (UI is source of truth); config object merges
    // env underneath so any field missing from DB falls back to env defaults.
    return {
      ...envFallback,
      ...(row.config || {}),
      enabled: row.enabled,
      source: "db",
    };
  } catch (e) {
    // DB unreachable or query failed — never crash; fall back to env.
    process.stderr.write(`[config] DB read failed for "${feature}" (${e.message}); using env fallback\n`);
    return { ...envFallback, source: "env" };
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
