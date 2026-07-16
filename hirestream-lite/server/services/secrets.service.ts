/**
 * Secrets encryption for provider_config.secrets JSONB fields.
 *
 * Uses AES-256-GCM. The master key comes from env INTEGRATION_SECRET_KEY
 * (hex, 32 bytes). If unset, we derive a deterministic key from SESSION_SECRET
 * so the dev/staging boxes keep working — but prod MUST set the dedicated key
 * so rotating SESSION_SECRET doesn't break stored integration credentials.
 *
 * Wire format per-field:
 *   { iv: "<hex>", tag: "<hex>", cipher: "<hex>" }
 */

import crypto from "crypto";
import { env } from "../config/env.config";
import { logger } from "../config/logger.config";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

let warnedAboutFallbackKey = false;

function getKey(): Buffer {
  const raw = (env as any).INTEGRATION_SECRET_KEY as string | undefined;
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // Fallback: derive 32 bytes from SESSION_SECRET. Prints a one-time warning
  // so operators know to set the dedicated key before production rollout.
  if (!warnedAboutFallbackKey) {
    logger.warn("INTEGRATION_SECRET_KEY not set — deriving from SESSION_SECRET. Set a 32-byte hex key in prod.");
    warnedAboutFallbackKey = true;
  }
  return crypto.createHash("sha256").update(env.SESSION_SECRET).digest();
}

export interface EncryptedBlob {
  iv: string;
  tag: string;
  cipher: string;
}

export function encryptSecret(plaintext: string): EncryptedBlob {
  const iv = crypto.randomBytes(IV_BYTES);
  const c = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    iv: iv.toString("hex"),
    tag: c.getAuthTag().toString("hex"),
    cipher: enc.toString("hex"),
  };
}

export function decryptSecret(blob: EncryptedBlob | undefined | null): string | null {
  if (!blob?.iv || !blob?.tag || !blob?.cipher) return null;
  try {
    const d = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(blob.iv, "hex"));
    d.setAuthTag(Buffer.from(blob.tag, "hex"));
    const dec = Buffer.concat([d.update(Buffer.from(blob.cipher, "hex")), d.final()]);
    return dec.toString("utf8");
  } catch (err) {
    logger.error(`decryptSecret failed: ${(err as Error).message}`);
    return null;
  }
}

// Encrypt every string value in an object. Non-string values are dropped.
export function encryptSecretsRecord(secrets: Record<string, string>): Record<string, EncryptedBlob> {
  const out: Record<string, EncryptedBlob> = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === "string" && v.length > 0) out[k] = encryptSecret(v);
  }
  return out;
}

export function decryptSecretsRecord(secrets: Record<string, EncryptedBlob> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!secrets) return out;
  for (const [k, v] of Object.entries(secrets)) {
    const plain = decryptSecret(v);
    if (plain != null) out[k] = plain;
  }
  return out;
}

// Redact secret values for UI display — show "••••" with length hint.
export function redactSecretsRecord(secrets: Record<string, EncryptedBlob> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!secrets) return out;
  for (const k of Object.keys(secrets)) out[k] = "••••••••";
  return out;
}
