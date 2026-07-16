/**
 * System Config — operator-controlled toggles + URLs for embedded observability
 * features (synthetic monitor, LLM triage, daily digest, Loki, DocuMind,
 * notifications). One row per feature in `system_config`.
 *
 * The Operator Console UI (Phase 4) reads and writes this table; tool scripts
 * (tools/synthetic/, tools/triage/, tools/log-analyzer/) consult it via the
 * `lib/config` helper with env-var fallback.
 *
 * Distinct from `system-controls.service.ts` which manages in-app maintenance
 * pauses — different concept, different table.
 */

import { systemConfig } from "@shared/schema";
import { storage } from "../storage";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";

// All DB ops route through this getter so the in-memory fallback (MemStorage,
// when no DATABASE_URL) raises a clear error rather than crashing with
// "cannot read .insert of undefined".
function getDb() {
  if (!storage.db) {
    throw new Error("system_config: DB not available (running in MemStorage mode?)");
  }
  return storage.db;
}

export type FeatureName =
  | "synthetic_monitor"
  | "llm_triage"
  | "daily_digest"
  | "loki"
  | "notifications";

export const FEATURES: readonly FeatureName[] = [
  "synthetic_monitor",
  "llm_triage",
  "daily_digest",
  "loki",
  "notifications",
] as const;

// Per-feature default config — used at seed time and as the response shape
// for unknown rows. Keep field names lowerCamelCase to match Phase 3 env
// var conventions (LLM_BASE_URL → llmBaseUrl).
export const FEATURE_DEFAULTS: Record<FeatureName, { enabled: boolean; config: Record<string, unknown> }> = {
  synthetic_monitor: {
    enabled: false,
    config: {
      targetUrl: "https://hirestream-stg.agentryx.dev",
      intervalCron: "*/10 * * * *",
      minIntervalSeconds: 480,
      smokeTimeoutMs: 240000,
      slackWebhookUrl: "",                  // empty = no push notifications
    },
  },
  llm_triage: {
    enabled: false,
    config: {
      llmBaseUrl: "https://nexus.osipl.dev/v1",
      llmModel: "mistral-7b-instruct-v0.2.Q4_K_M",
      llmApiKey: "",                         // empty = no auth (self-hosted)
      llmTimeoutMs: 90000,
      maxTokens: 200,
      temperature: 0.2,
      maxClustersPerRun: 10,
      dailyScheduleCron: "5 9 * * *",
    },
  },
  daily_digest: {
    enabled: true,                           // already running; safe default
    config: {
      logPath: "logs/app.log",
      windowHours: 24,
      baselineDays: 7,
      slackWebhookUrl: "",
      dailyScheduleCron: "0 9 * * *",
    },
  },
  loki: {
    enabled: false,                          // operator turns on once stack deployed
    config: {
      lokiUrl: "http://localhost:3100",
      defaultQueryLimit: 50,
      defaultLookbackMinutes: 60,
    },
  },
  notifications: {
    enabled: false,
    config: {
      slackWebhookUrl: "",
      emailFrom: "",
      emailSmtpHost: "",
      emailSmtpPort: 587,
    },
  },
};

export type SystemConfigRow = {
  feature: FeatureName;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: Date;
};

/**
 * Idempotent seed — inserts a row for every known feature that doesn't
 * already have one. Called from server startup. Existing rows are left
 * alone so operator edits survive restarts.
 */
export async function seedSystemConfig(): Promise<void> {
  if (!storage.db) {
    logger.warn("system_config: skip seed — no DB connection");
    return;
  }
  const db = getDb();
  let inserted = 0;
  for (const feature of FEATURES) {
    const defaults = FEATURE_DEFAULTS[feature];
    // INSERT ... ON CONFLICT DO NOTHING keeps operator edits intact
    const result = await db
      .insert(systemConfig)
      .values({
        feature,
        enabled: defaults.enabled,
        config: defaults.config,
      })
      .onConflictDoNothing()
      .returning({ feature: systemConfig.feature });
    if (result.length) inserted++;
  }
  if (inserted > 0) {
    logger.info(`system_config: seeded ${inserted}/${FEATURES.length} feature row(s)`);
  }
}

/**
 * Read one feature's row. Returns FEATURE_DEFAULTS if the row is missing
 * (defensive — seed should make this never happen in practice).
 */
export async function getFeature(feature: FeatureName): Promise<SystemConfigRow> {
  const db = getDb();
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.feature, feature)).limit(1);
  if (rows.length === 0) {
    const defaults = FEATURE_DEFAULTS[feature];
    return {
      feature,
      enabled: defaults.enabled,
      config: defaults.config,
      updatedBy: null,
      updatedAt: new Date(),
    };
  }
  const row = rows[0];
  return {
    feature: row.feature as FeatureName,
    enabled: row.enabled,
    config: (row.config as Record<string, unknown>) ?? {},
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function listFeatures(): Promise<SystemConfigRow[]> {
  const db = getDb();
  const rows: Array<{ feature: string; enabled: boolean; config: unknown; updatedBy: string | null; updatedAt: Date }> =
    await db.select().from(systemConfig);
  // Stable order: by FEATURES array, not DB insertion order
  const byName = new Map(rows.map((r) => [r.feature, r] as const));
  return FEATURES.map((feature) => {
    const r = byName.get(feature);
    if (r) {
      return {
        feature,
        enabled: r.enabled,
        config: (r.config as Record<string, unknown>) ?? {},
        updatedBy: r.updatedBy ?? null,
        updatedAt: r.updatedAt,
      };
    }
    const defaults = FEATURE_DEFAULTS[feature];
    return {
      feature,
      enabled: defaults.enabled,
      config: defaults.config,
      updatedBy: null,
      updatedAt: new Date(),
    };
  });
}

export async function updateFeature(
  feature: FeatureName,
  patch: { enabled?: boolean; config?: Record<string, unknown> },
  updatedBy: string,
): Promise<SystemConfigRow> {
  // Merge new config on top of current (operator may PATCH a single field).
  const current = await getFeature(feature);
  const mergedConfig = { ...current.config, ...(patch.config ?? {}) };
  const enabled = patch.enabled ?? current.enabled;

  const db = getDb();
  await db
    .insert(systemConfig)
    .values({
      feature,
      enabled,
      config: mergedConfig,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemConfig.feature,
      set: {
        enabled,
        config: mergedConfig,
        updatedBy,
        updatedAt: new Date(),
      },
    });
  return getFeature(feature);
}

/**
 * Mask known secret fields in API responses. The DB stores plaintext (v1);
 * column-level encryption is a Phase 5 follow-up. The UI shows `***` and
 * only reveals the full value on explicit operator action (future audit log
 * entry).
 */
const SECRET_FIELD_PATTERNS = [
  /api[_-]?key$/i,
  /webhook[_-]?url$/i,
  /password$/i,
  /token$/i,
  /secret$/i,
];

export function maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const isSecret = SECRET_FIELD_PATTERNS.some((re) => re.test(key));
    if (isSecret && typeof value === "string" && value.length > 0) {
      masked[key] = "***";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
