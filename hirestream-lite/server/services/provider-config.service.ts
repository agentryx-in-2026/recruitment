/**
 * Provider config service — single entrypoint for SMS/email/SSO/DigiLocker
 * settings. Services call getProviderConfig("email") at send-time; admin UI
 * calls setProviderConfig() to update. Cached in-memory; cache is busted on
 * write so hot paths don't hit the DB.
 */

import { storage } from "../storage";
import { providerConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { env } from "../config/env.config";
import { logger } from "../config/logger.config";
import {
  decryptSecretsRecord, encryptSecretsRecord, EncryptedBlob,
} from "./secrets.service";

export type ProviderId = "email" | "sms" | "aadhaar" | "himaccess" | "digilocker";

// Shape returned to callers: non-secret config + decrypted secrets, or null if
// the integration is disabled / missing and env doesn't provide a fallback.
export interface ResolvedProvider {
  id: ProviderId;
  providerType: string;
  enabled: boolean;
  config: Record<string, any>;
  secrets: Record<string, string>;
  source: "db" | "env" | "none";
}

const PROVIDER_DEFAULTS: Record<ProviderId, { providerType: string; config: Record<string, any>; secretKeys: string[] }> = {
  email: {
    providerType: "smtp",
    config: { host: "", port: 587, from: "noreply@hirestream.osipl.dev", secure: false, user: "" },
    secretKeys: ["pass"],
  },
  sms: {
    providerType: "mock",
    config: { senderId: "HIRESM", endpoint: "" },
    secretKeys: ["apiKey", "apiSecret"],
  },
  aadhaar: {
    providerType: "uidai",
    config: { endpoint: "", authCode: "" },
    secretKeys: ["apiKey", "licenseKey"],
  },
  himaccess: {
    providerType: "oauth2",
    config: { endpoint: "", clientId: "", redirectUri: "", scope: "openid profile" },
    secretKeys: ["clientSecret"],
  },
  digilocker: {
    providerType: "oauth2",
    config: { endpoint: "", clientId: "", redirectUri: "", scope: "files.documents.read" },
    secretKeys: ["clientSecret"],
  },
};

const CACHE: Map<ProviderId, ResolvedProvider> = new Map();

export function invalidateProviderCache(id?: ProviderId) {
  if (id) CACHE.delete(id);
  else CACHE.clear();
}

// Env fallback — keeps local dev + existing deployments working without
// forcing admins to set up the new UI on day one.
function envFallback(id: ProviderId): ResolvedProvider | null {
  if (id === "email" && env.SMTP_HOST) {
    return {
      id, providerType: "smtp",
      enabled: true,
      config: { host: env.SMTP_HOST, port: env.SMTP_PORT || 587, from: env.SMTP_FROM, user: env.SMTP_USER || "" },
      secrets: { pass: env.SMTP_PASS || "" },
      source: "env",
    };
  }
  if (id === "sms" && (env as any).SMS_API_KEY) {
    return {
      id, providerType: (env as any).SMS_PROVIDER || "mock",
      enabled: true,
      config: { senderId: (env as any).SMS_SENDER_ID || "HIRESM" },
      secrets: { apiKey: (env as any).SMS_API_KEY },
      source: "env",
    };
  }
  if (id === "aadhaar" && (env as any).UIDAI_API_KEY) {
    return {
      id, providerType: "uidai",
      enabled: true,
      config: { endpoint: (env as any).UIDAI_API_ENDPOINT || "" },
      secrets: { apiKey: (env as any).UIDAI_API_KEY },
      source: "env",
    };
  }
  if (id === "himaccess" && (env as any).HIM_ACCESS_CLIENT_ID) {
    return {
      id, providerType: "oauth2",
      enabled: true,
      config: {
        clientId: (env as any).HIM_ACCESS_CLIENT_ID,
        redirectUri: (env as any).HIM_ACCESS_REDIRECT_URI || "",
      },
      secrets: { clientSecret: (env as any).HIM_ACCESS_CLIENT_SECRET || "" },
      source: "env",
    };
  }
  if (id === "digilocker" && (env as any).DIGILOCKER_API_KEY) {
    return {
      id, providerType: "oauth2",
      enabled: true,
      config: { endpoint: (env as any).DIGILOCKER_API_ENDPOINT || "" },
      secrets: { apiKey: (env as any).DIGILOCKER_API_KEY },
      source: "env",
    };
  }
  return null;
}

export async function getProviderConfig(id: ProviderId): Promise<ResolvedProvider | null> {
  if (CACHE.has(id)) return CACHE.get(id)!;

  const db = storage.db;
  if (db) {
    try {
      const [row] = await db.select().from(providerConfig).where(eq(providerConfig.id, id)).limit(1);
      if (row?.enabled) {
        const resolved: ResolvedProvider = {
          id,
          providerType: row.providerType,
          enabled: true,
          config: (row.config as any) || {},
          secrets: decryptSecretsRecord(row.secrets as any),
          source: "db",
        };
        CACHE.set(id, resolved);
        return resolved;
      }
    } catch (err) {
      logger.warn(`getProviderConfig(${id}) DB read failed, falling back to env: ${(err as Error).message}`);
    }
  }

  const fb = envFallback(id);
  if (fb) CACHE.set(id, fb);
  return fb;
}

export async function listProvidersForAdmin(): Promise<Array<{
  id: ProviderId;
  providerType: string;
  enabled: boolean;
  config: Record<string, any>;
  secretFieldsPresent: string[]; // which secret fields have a value (without revealing them)
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  source: "db" | "env" | "none";
}>> {
  const db = storage.db;
  const ids: ProviderId[] = ["email", "sms", "aadhaar", "himaccess", "digilocker"];
  const result: any[] = [];
  for (const id of ids) {
    let row: any = null;
    if (db) {
      const [r] = await db.select().from(providerConfig).where(eq(providerConfig.id, id)).limit(1);
      row = r;
    }
    const defaults = PROVIDER_DEFAULTS[id];
    const fb = envFallback(id);
    result.push({
      id,
      providerType: row?.providerType ?? defaults.providerType,
      enabled: row?.enabled ?? false,
      config: (row?.config as any) ?? (fb?.source === "env" ? fb.config : defaults.config),
      secretFieldsPresent: Object.keys((row?.secrets as any) ?? {}),
      lastTestedAt: row?.lastTestedAt ?? null,
      lastTestStatus: row?.lastTestStatus ?? null,
      lastTestError: row?.lastTestError ?? null,
      source: row?.enabled ? "db" : (fb?.source ?? "none"),
    });
  }
  return result;
}

export async function setProviderConfig(
  id: ProviderId,
  input: {
    providerType?: string;
    enabled?: boolean;
    config?: Record<string, any>;
    secrets?: Record<string, string>; // new plain secrets; any empty string clears that field, any missing key preserves existing
  },
  actorUserId?: string,
): Promise<void> {
  const db = storage.db;
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select().from(providerConfig).where(eq(providerConfig.id, id)).limit(1);

  // Merge secrets: keep existing encrypted blobs, overwrite / clear selectively.
  let mergedSecrets: Record<string, EncryptedBlob> = (existing?.secrets as any) || {};
  if (input.secrets) {
    const { encrypt, clear } = (() => {
      const toEncrypt: Record<string, string> = {};
      const toClear: string[] = [];
      for (const [k, v] of Object.entries(input.secrets)) {
        if (v === "") toClear.push(k);
        else if (typeof v === "string") toEncrypt[k] = v;
      }
      return { encrypt: toEncrypt, clear: toClear };
    })();
    mergedSecrets = { ...mergedSecrets, ...encryptSecretsRecord(encrypt) };
    for (const k of clear) delete mergedSecrets[k];
  }

  const values: any = {
    id,
    providerType: input.providerType ?? existing?.providerType ?? PROVIDER_DEFAULTS[id].providerType,
    enabled: input.enabled ?? existing?.enabled ?? false,
    config: input.config ?? existing?.config ?? PROVIDER_DEFAULTS[id].config,
    secrets: mergedSecrets,
    updatedAt: new Date(),
    updatedBy: actorUserId ?? existing?.updatedBy,
  };

  if (existing) {
    await db.update(providerConfig).set(values).where(eq(providerConfig.id, id));
  } else {
    await db.insert(providerConfig).values(values);
  }
  invalidateProviderCache(id);
}

export async function recordTestResult(
  id: ProviderId,
  ok: boolean,
  error?: string,
): Promise<void> {
  const db = storage.db;
  if (!db) return;
  await db.update(providerConfig).set({
    lastTestedAt: new Date(),
    lastTestStatus: ok ? "ok" : "fail",
    lastTestError: ok ? null : (error?.slice(0, 400) ?? "Unknown error"),
  }).where(eq(providerConfig.id, id));
}

// Per-providerType schemas — use each vendor's own terminology so an admin
// comparing the form to the vendor's dashboard (e.g. Twilio Console) sees
// the same field names. The older generic schema in PROVIDER_DEFAULTS stays
// as the fallback for integrations where every providerType takes the same
// shape (Aadhaar, HIM Access, DigiLocker).
//
// Adding a new SMS provider = add an entry here and wire the send path in
// sms.service.ts. Nothing else to change.
const SMS_PROVIDER_SCHEMAS: Record<string, { config: string[]; secrets: string[] }> = {
  twilio:  { config: ["accountSid", "from", "endpoint"],            secrets: ["authToken"] },
  msg91:   { config: ["authkey", "flowId", "senderId", "endpoint"], secrets: ["apiKey"] },
  gupshup: { config: ["userId", "senderId"],                        secrets: ["password"] },
  nic:     { config: ["endpoint", "user", "senderId"],              secrets: ["password"] },
  mock:    { config: [],                                            secrets: [] },
};

export function describeProviderFields(id: ProviderId, providerType?: string): { configFields: string[]; secretFields: string[] } {
  if (id === "sms" && providerType && SMS_PROVIDER_SCHEMAS[providerType]) {
    const s = SMS_PROVIDER_SCHEMAS[providerType];
    return { configFields: s.config, secretFields: s.secrets };
  }
  const d = PROVIDER_DEFAULTS[id];
  return {
    configFields: Object.keys(d.config),
    secretFields: d.secretKeys,
  };
}

// Returns the full per-providerType schema so the admin UI can switch field
// sets client-side when the admin changes the Provider dropdown, without a
// round-trip. Only non-trivial for `sms` today; other integrations return
// a single-key map mirroring their default schema.
export function describeAllProviderFields(id: ProviderId): Record<string, { configFields: string[]; secretFields: string[] }> {
  if (id === "sms") {
    const out: Record<string, { configFields: string[]; secretFields: string[] }> = {};
    for (const [pt, s] of Object.entries(SMS_PROVIDER_SCHEMAS)) {
      out[pt] = { configFields: s.config, secretFields: s.secrets };
    }
    return out;
  }
  const d = PROVIDER_DEFAULTS[id];
  return {
    [d.providerType]: {
      configFields: Object.keys(d.config),
      secretFields: d.secretKeys,
    },
  };
}
