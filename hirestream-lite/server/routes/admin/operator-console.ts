/**
 * Operator Console — Status tab data endpoints.
 *
 *   GET /api/v1/admin/operator-console/status   → aggregate of synthetic,
 *                                                  digest, triage JSON files
 *   GET /api/v1/admin/operator-console/logs     → proxied Loki query (read-only)
 *
 * Superadmin-only. Read-only by design — config changes go through
 * /api/v1/admin/system-config.
 */

import { Router } from "express";
import { promises as fs } from "fs";
import { resolve } from "path";
import { protect } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { getFeature } from "../../services/system-config.service";

const router = Router();
router.use(protect);
router.use(requireRole(["superadmin"]));

// Server is always launched with cwd = hirestream/ (npm run dev / npm start /
// pm2 start dist/index.js). process.cwd() is reliable here and avoids
// ESM __dirname dance.
const REPO_ROOT = process.cwd();
const SYNTHETIC_PATH = resolve(REPO_ROOT, "logs", "synthetic-latest.json");
const DIGEST_PATH = resolve(REPO_ROOT, "logs", "digest-latest.json");
const TRIAGE_PATH = resolve(REPO_ROOT, "logs", "triage-latest.json");

async function readJsonOrNull(path: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

router.get("/status", async (_req, res, next) => {
  try {
    const [synthetic, digest, triage] = await Promise.all([
      readJsonOrNull(SYNTHETIC_PATH),
      readJsonOrNull(DIGEST_PATH),
      readJsonOrNull(TRIAGE_PATH),
    ]);
    res.json({
      success: true,
      data: { synthetic, digest, triage, generatedAt: new Date().toISOString() },
    });
  } catch (e) { next(e); }
});

router.get("/logs", async (req, res, next) => {
  try {
    const lokiRow = await getFeature("loki");
    if (!lokiRow.enabled) {
      return res.json({
        success: true,
        data: { available: false, reason: "loki feature is disabled in system_config" },
      });
    }
    const lokiUrl = String(lokiRow.config.lokiUrl || "");
    if (!lokiUrl) {
      return res.json({
        success: true,
        data: { available: false, reason: "loki URL is empty in system_config" },
      });
    }
    const query = String(req.query.q || '{job="hirestream"}');
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const lookbackMinutes = Math.min(parseInt(String(req.query.lookback || "60"), 10) || 60, 1440);
    const endNs = BigInt(Date.now()) * BigInt(1_000_000);
    const startNs = endNs - BigInt(lookbackMinutes * 60) * BigInt(1_000_000_000);
    const url = new URL(`${lokiUrl.replace(/\/$/, "")}/loki/api/v1/query_range`);
    url.searchParams.set("query", query);
    url.searchParams.set("start", startNs.toString());
    url.searchParams.set("end", endNs.toString());
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("direction", "backward");

    const r = await fetch(url.toString());
    const body = await r.text();
    if (!r.ok) {
      return res.json({
        success: true,
        data: { available: true, ok: false, status: r.status, error: body.slice(0, 500) },
      });
    }
    let parsed: any;
    try { parsed = JSON.parse(body); } catch {
      return res.json({ success: true, data: { available: true, ok: false, error: "non-JSON response from Loki" } });
    }
    // Flatten streams into a chronological array of {timestamp, labels, line}
    const lines: Array<{ ts: string; labels: Record<string, string>; line: string }> = [];
    for (const stream of parsed.data?.result ?? []) {
      const labels = stream.stream ?? {};
      for (const [tsNs, line] of stream.values ?? []) {
        lines.push({ ts: new Date(Number(BigInt(tsNs) / BigInt(1_000_000))).toISOString(), labels, line });
      }
    }
    lines.sort((a, b) => b.ts.localeCompare(a.ts));
    res.json({
      success: true,
      data: {
        available: true,
        ok: true,
        query,
        lookbackMinutes,
        lines: lines.slice(0, limit),
        resultCount: lines.length,
      },
    });
  } catch (e) { next(e); }
});

export default router;
