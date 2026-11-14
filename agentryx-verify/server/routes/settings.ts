import { Router, type Request } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../config/db";
import { reviewers, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { DEFAULTS, MODELS, SECRET_KEYS, anthropicKey, getSetting, setSetting, type SettingKey } from "../services/settings";
import { resetAiClient } from "./ask";

/** Settings page API (admins only): models and keys, testing configuration. */
export const settingsRouter = Router();
const ADMIN = new Set(["admin", "delivery"]);

async function admin(req: Request) {
  if (!req.session.reviewerId) return null;
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role, name: reviewers.name }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  return r && ADMIN.has(r.role) ? r : null;
}

const mask = (v: string) => (v ? `ends …${v.slice(-4)}` : "");

function snapshot() {
  const values: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) values[k] = SECRET_KEYS.has(k) ? mask(String(getSetting(k) || "")) : getSetting(k);
  const k = anthropicKey();
  return { values, models: MODELS, anthropic: { configured: !!k.key, source: k.source, hint: k.key ? mask(k.key) : null } };
}

settingsRouter.get("/", requireAuth, async (req, res) => {
  if (!(await admin(req))) return res.status(403).json({ error: "Admins only" });
  res.json(snapshot());
});

// PUT /api/settings { key: value, ... } — only known keys; types must match the default
settingsRouter.put("/", requireAuth, async (req, res) => {
  const r = await admin(req);
  if (!r) return res.status(403).json({ error: "Admins only" });
  const body = req.body ?? {};
  for (const [k, v] of Object.entries(body)) {
    if (!(k in DEFAULTS)) return res.status(400).json({ error: `Unknown setting ${k}` });
    const def = (DEFAULTS as any)[k];
    if (Array.isArray(def) ? !Array.isArray(v) : typeof v !== typeof def) return res.status(400).json({ error: `Wrong type for ${k}` });
    if (k === "ai.model" && !MODELS.some((m) => m.id === v)) return res.status(400).json({ error: "Unknown model" });
    if (k === "ai.effort" && !["low", "medium", "high"].includes(String(v))) return res.status(400).json({ error: "Effort must be low, medium or high" });
    if (k === "testing.run_timeout_min" && (Number(v) < 5 || Number(v) > 120)) return res.status(400).json({ error: "Timeout must be 5–120 minutes" });
    if (k === "testing.portal_url" && !/^https?:\/\/\S+$/.test(String(v))) return res.status(400).json({ error: "Portal address must start with https://" });
  }
  for (const [k, v] of Object.entries(body)) {
    await setSetting(k as SettingKey, typeof v === "string" ? v.trim() : v, r.name);
    await db.insert(auditLog).values({ reviewerId: r.id, action: "settings.update", meta: { key: k, value: SECRET_KEYS.has(k as SettingKey) ? "(secret)" : v } });
  }
  if ("ai.anthropic_key" in body) resetAiClient();
  res.json(snapshot());
});

// POST /api/settings/ai/test { model? } — one tiny call to prove the key and model work
settingsRouter.post("/ai/test", requireAuth, async (req, res) => {
  if (!(await admin(req))) return res.status(403).json({ error: "Admins only" });
  const { key } = anthropicKey();
  if (!key) return res.status(400).json({ ok: false, error: "No Anthropic key is set." });
  const model = String(req.body?.model || getSetting("ai.model"));
  const t0 = Date.now();
  try {
    const c = new Anthropic({ apiKey: key });
    const m: any = await c.messages.create({ model, max_tokens: 32, messages: [{ role: "user", content: "Reply with the single word: ready" }] });
    const text = (m.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    res.json({ ok: true, model: m.model ?? model, reply: text.slice(0, 40), ms: Date.now() - t0 });
  } catch (e: any) {
    res.json({ ok: false, model, error: e?.status ? `${e.status}: ${e?.error?.error?.message ?? e.message}` : e.message });
  }
});
