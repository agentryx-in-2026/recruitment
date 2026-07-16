/**
 * Operator Console — system_config endpoints.
 *
 *   GET    /api/v1/admin/system-config            → list all features
 *   GET    /api/v1/admin/system-config/:feature   → one feature
 *   PUT    /api/v1/admin/system-config/:feature   → update enabled and/or config patch
 *   POST   /api/v1/admin/system-config/:feature/test → connectivity test
 *
 * Superadmin-only. Secret fields are masked in GET responses (api_key,
 * webhook_url, password, token, secret); the UI shows "***" and can request
 * the raw value via ?reveal=true (logged for future audit).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { protect } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { z } from "zod";
import {
  FEATURES,
  FEATURE_DEFAULTS,
  type FeatureName,
  getFeature,
  listFeatures,
  updateFeature,
  maskSecrets,
} from "../../services/system-config.service";
import { logger } from "../../config/logger.config";

const router = Router();
router.use(protect);
router.use(requireRole(["superadmin"]));

const featureNameSchema = z.enum(FEATURES as unknown as [FeatureName, ...FeatureName[]]);

const updateBodySchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function isFeature(s: unknown): s is FeatureName {
  return typeof s === "string" && (FEATURES as readonly string[]).includes(s);
}

// ── GET list ────────────────────────────────────────────────────────
router.get("/", async (_req, res, next) => {
  try {
    const rows = await listFeatures();
    res.json({
      success: true,
      data: rows.map((r) => ({
        feature: r.feature,
        enabled: r.enabled,
        config: maskSecrets(r.config),
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
        defaults: FEATURE_DEFAULTS[r.feature],
      })),
    });
  } catch (e) { next(e); }
});

// ── GET one ─────────────────────────────────────────────────────────
router.get("/:feature", async (req, res, next) => {
  try {
    const feature = req.params.feature;
    if (!isFeature(feature)) {
      return res.status(404).json({ success: false, error: { code: "UNKNOWN_FEATURE", message: `unknown feature: ${feature}` } });
    }
    const reveal = req.query.reveal === "true";
    const row = await getFeature(feature);
    if (reveal) {
      // Audit hook: future Phase 5 audit_events table will log who/when/which-feature
      logger.warn(`system_config reveal: user=${(req as any).user?.id ?? "?"} feature=${feature}`);
    }
    res.json({
      success: true,
      data: {
        feature: row.feature,
        enabled: row.enabled,
        config: reveal ? row.config : maskSecrets(row.config),
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
        defaults: FEATURE_DEFAULTS[feature],
      },
    });
  } catch (e) { next(e); }
});

// ── PUT update ──────────────────────────────────────────────────────
router.put("/:feature", async (req, res, next) => {
  try {
    const feature = req.params.feature;
    if (!isFeature(feature)) {
      return res.status(404).json({ success: false, error: { code: "UNKNOWN_FEATURE", message: `unknown feature: ${feature}` } });
    }
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", message: parsed.error.message } });
    }
    const userId = (req as any).user?.id;
    const updated = await updateFeature(feature, parsed.data, userId);
    logger.info(`system_config update: user=${userId} feature=${feature} enabled=${updated.enabled}`);
    res.json({
      success: true,
      data: {
        feature: updated.feature,
        enabled: updated.enabled,
        config: maskSecrets(updated.config),
        updatedBy: updated.updatedBy,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) { next(e); }
});

// ── POST connectivity test ──────────────────────────────────────────
router.post("/:feature/test", async (req, res, next) => {
  try {
    const feature = req.params.feature;
    if (!isFeature(feature)) {
      return res.status(404).json({ success: false, error: { code: "UNKNOWN_FEATURE", message: `unknown feature: ${feature}` } });
    }
    const row = await getFeature(feature);
    const start = Date.now();
    const result = await runConnectivityTest(feature, row.config);
    const latencyMs = Date.now() - start;
    res.json({ success: true, data: { ok: result.ok, latencyMs, details: result.details } });
  } catch (e) { next(e); }
});

async function runConnectivityTest(
  feature: FeatureName,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; details: string }> {
  switch (feature) {
    case "llm_triage": {
      const baseUrl = String(config.llmBaseUrl || "");
      const model = String(config.llmModel || "");
      const apiKey = String(config.llmApiKey || "");
      const timeoutMs = Number(config.llmTimeoutMs ?? 90000);
      if (!baseUrl) return { ok: false, details: "llmBaseUrl is empty" };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), Math.min(timeoutMs, 60000));
      try {
        const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST", headers, signal: controller.signal,
          body: JSON.stringify({
            model, max_tokens: 5, temperature: 0,
            messages: [{ role: "user", content: "Reply with exactly OK." }],
          }),
        });
        const body = await r.text();
        if (!r.ok) return { ok: false, details: `HTTP ${r.status}: ${body.slice(0, 200)}` };
        try {
          const parsed = JSON.parse(body);
          const content = parsed.choices?.[0]?.message?.content ?? "(no content)";
          return { ok: true, details: `model="${parsed.model ?? model}" reply="${String(content).slice(0, 80)}"` };
        } catch { return { ok: false, details: `non-JSON response: ${body.slice(0, 200)}` }; }
      } catch (e: any) {
        return { ok: false, details: e?.name === "AbortError" ? "timeout" : String(e) };
      } finally { clearTimeout(t); }
    }
    case "loki": {
      const lokiUrl = String(config.lokiUrl || "");
      if (!lokiUrl) return { ok: false, details: "lokiUrl is empty" };
      try {
        const r = await fetch(`${lokiUrl.replace(/\/$/, "")}/ready`);
        const txt = (await r.text()).trim();
        return { ok: r.ok && txt.includes("ready"), details: `HTTP ${r.status}: ${txt.slice(0, 80)}` };
      } catch (e: any) {
        return { ok: false, details: String(e) };
      }
    }
    case "synthetic_monitor": {
      const targetUrl = String(config.targetUrl || "");
      if (!targetUrl) return { ok: false, details: "targetUrl is empty" };
      try {
        const r = await fetch(`${targetUrl.replace(/\/$/, "")}/api/v1/auth/login`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "__connectivity_probe__", password: "x" }),
        });
        // We expect 401 (target is up and routing). Anything else = healthy enough.
        return { ok: r.status > 0 && r.status < 500, details: `HTTP ${r.status} from /api/v1/auth/login` };
      } catch (e: any) { return { ok: false, details: String(e) }; }
    }
    case "notifications": {
      const slackWebhookUrl = String(config.slackWebhookUrl || "");
      if (!slackWebhookUrl) return { ok: false, details: "no notification channel configured (slackWebhookUrl empty)" };
      try {
        const r = await fetch(slackWebhookUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "HireStream Operator Console connectivity test (ignore)" }),
        });
        return { ok: r.ok, details: `Slack webhook → HTTP ${r.status}` };
      } catch (e: any) { return { ok: false, details: String(e) }; }
    }
    case "daily_digest":
      return { ok: true, details: "no remote service; runs locally via cron. Use /api/v1/admin/operator-console/digest for the latest digest record." };
    default: {
      const _exhaustive: never = feature;
      return { ok: false, details: `unknown feature: ${_exhaustive}` };
    }
  }
}

export default router;
