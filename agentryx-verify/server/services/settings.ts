import { pool } from "../config/db";

/**
 * Admin settings (Settings page). Stored in app_settings, cached in memory and
 * refreshed on every write. A value in the server's .env wins over the one
 * saved here (same rule as the MGC tracker), so a deploy can always override.
 */
export const DEFAULTS = {
  "ai.enabled": true,
  "ai.anthropic_key": "",
  "ai.model": "claude-opus-5-5",
  "ai.effort": "low",
  "testing.portal_url": "https://hirestream-lite.agentryx.dev",
  "testing.accounts": [
    { role: "Placement Cell", username: "hpsedc_agency" },
    { role: "Admin", username: "demo_admin" },
    { role: "Applicant", username: "demo_candidate" },
  ] as { role: string; username: string }[],
  "testing.password": "test123",
  "testing.testers_can_run": true,
  "testing.run_timeout_min": 30,
  "testing.fail_note_required": true,
  "testing.mobile_note": "The build for the Lite portal is being prepared — start with the web portal.",
  // Notice from the team, shown at the top of every tester's Dashboard. One point per line.
  "testing.notice": "",
  "testing.notice_at": "",
};
export type SettingKey = keyof typeof DEFAULTS;
export const SECRET_KEYS = new Set<SettingKey>(["ai.anthropic_key"]);
export const MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "Most capable; best answers" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "Fast and strong; lower cost" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "Fastest, cheapest" },
];

let cache: Partial<Record<SettingKey, any>> = {};

export async function loadSettings() {
  await pool.query(`create table if not exists app_settings (
    key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by text)`);
  // Findings: a tester confirms a fix by closing it ("closed" was added for the tester workspace).
  await pool.query("alter type feedback_status add value if not exists 'closed'");
  // Starred library documents (sidebar + key documents).
  await pool.query("alter table pm_documents add column if not exists pinned boolean not null default false");
  const rows = (await pool.query("select key, value from app_settings")).rows;
  cache = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
}

export function getSetting<K extends SettingKey>(key: K): (typeof DEFAULTS)[K] {
  return (key in cache ? cache[key] : DEFAULTS[key]) as (typeof DEFAULTS)[K];
}

export async function setSetting(key: SettingKey, value: unknown, by: string) {
  await pool.query(
    `insert into app_settings (key, value, updated_at, updated_by) values ($1, $2::jsonb, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), by]);
  cache[key] = value;
}

/** The Anthropic key in force and where it came from. */
export function anthropicKey(): { key: string | null; source: "env" | "settings" | null } {
  const env = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (env) return { key: env, source: "env" };
  const saved = getSetting("ai.anthropic_key");
  return saved ? { key: saved, source: "settings" } : { key: null, source: null };
}
