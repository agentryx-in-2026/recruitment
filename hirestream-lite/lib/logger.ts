import { createHash } from "node:crypto";
import { logger as winstonLogger } from "../server/config/logger.config";
import fs from "node:fs";
import path from "node:path";

// ── Build-time + env-time anchors ─────────────────────────────────────
const APP = "hirestream";
const ENV = (process.env.NODE_ENV === "production" ? "prod"
            : process.env.NODE_ENV === "test"       ? "ci"
            : process.env.NODE_ENV === "staging"    ? "stg"
            : "local") as "local" | "ci" | "stg" | "prod";

let BUILD_REF = process.env.BUILD_REF || "v0.0.0";
try {
  const versionFile = path.resolve(process.cwd(), "VERSION");
  if (fs.existsSync(versionFile)) {
    BUILD_REF = fs.readFileSync(versionFile, "utf-8").trim() || "v0.0.0";
  }
} catch {
  // ignore errors on file read
}

// ── Redact paths (forbidden-in-logs from doc §3.3) ──────────────
// As the project uses Winston rather than Pino, we implement redaction here
const REDACT_KEYS = [
  "password", "token", "accessToken", "refreshToken", "secret",
  "email", "passportNumber", "aadhaar", "phone",
  "cookie", "authorization", "set-cookie"
];

function redact(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Buffer.isBuffer(obj)) return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      redacted[key] = "<REDACTED>";
    } else {
      redacted[key] = redact(value);
    }
  }
  return redacted;
}

// ── Helpers ───────────────────────────────────────────────────────────
export function hashUserId(userId: string | null | undefined): string {
  if (!userId) return "sha-anon";
  return "sha-" + createHash("sha256").update(userId).digest("hex").slice(0, 4);
}
export function hashEmail(email: string | null | undefined): string {
  if (!email) return "email:none";
  return "email:sha-" + createHash("sha256").update(email.toLowerCase().trim()).digest("hex").slice(0, 8);
}

// ── Typed log shapes ──────────────────────────────────────────────────
export type RequestEndFields = {
  requestId: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userRole: "candidate" | "agent" | "employer" | "admin" | "superadmin" | "anon";
  userIdHash?: string;
  msg?: string;
  errorClass?: string;
  errorStack?: string;
  targetId?: string;
  dbQueryMs?: number;
  cacheHit?: boolean;
};

// ── Typed methods (the public API) ────────────────────────────────────
function logWithMeta(level: string, msg: string, meta: Record<string, any>) {
  const sanitizedMeta = redact({ ...meta, app: APP, env: ENV, buildRef: BUILD_REF });
  winstonLogger.log(level, msg, sanitizedMeta);
}

export const log = {
  requestEnd(f: RequestEndFields): void {
    const level = f.statusCode >= 500 ? "error"
                : f.statusCode >= 400 ? "warn"
                : "info";
    const { msg, ...meta } = f;
    logWithMeta(level, msg || "Request end", meta);
  },

  lifecycle(msg: string, extra: Record<string, unknown> = {}): void {
    logWithMeta("info", msg, extra);
  },

  error(msg: string, err: unknown, extra: Record<string, unknown> = {}): void {
    const e = err instanceof Error ? { errorClass: err.name, errorStack: err.stack } : { errorClass: String(err) };
    logWithMeta("error", msg, { ...e, ...extra });
  },

  warn(msg: string, extra: Record<string, unknown> = {}): void {
    logWithMeta("warn", msg, extra);
  },

  info(msg: string, extra: Record<string, unknown> = {}): void {
    logWithMeta("info", msg, extra);
  },
};

export default log;
