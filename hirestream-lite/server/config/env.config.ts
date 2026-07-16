import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // ── Required ──────────────────────────────────────────────────────
  DATABASE_URL: z.string().url("A valid PostgreSQL URL is required in DATABASE_URL"),
  // v0.4.17: no default. A predictable shared session secret would let
  // anyone forge sessions. The startup gate below additionally rejects
  // weak / placeholder values even if NODE_ENV is dev or test.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars (production secret, no default)"),
  PORT: z.string().transform(Number).default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Public URL & CORS ─────────────────────────────────────────────
  // APP_URL: canonical public URL of this deployment (used for emails, links)
  APP_URL: z.string().url().default("http://localhost:5000"),
  // ALLOWED_ORIGINS: comma-separated list of origins permitted by CORS in production.
  // Example: "https://hirestream.osipl.dev,https://hirestream.agentryx.dev"
  ALLOWED_ORIGINS: z.string().default(""),
  // COOKIE_SECURE: override session cookie `secure` flag. Defaults to true in
  // production. Set to "false" when serving over plain HTTP (e.g. new VM
  // without SSL yet) — otherwise the session cookie is dropped and login fails.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),

  // ── Email (SMTP) — optional until Phase 2 ─────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  // ── SMS Gateway — optional until Phase 2 ──────────────────────────
  SMS_PROVIDER: z.enum(["twilio", "nic", "mock"]).optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),

  // ── External Integrations — optional, stubbed until credentials ───
  HIM_ACCESS_CLIENT_ID: z.string().optional(),
  HIM_ACCESS_CLIENT_SECRET: z.string().optional(),
  HIM_ACCESS_REDIRECT_URI: z.string().url().optional(),
  UIDAI_API_ENDPOINT: z.string().url().optional(),
  UIDAI_API_KEY: z.string().optional(),
  DIGILOCKER_API_ENDPOINT: z.string().url().optional(),
  DIGILOCKER_API_KEY: z.string().optional(),

  // ── File Upload ───────────────────────────────────────────────────
  UPLOAD_DIR: z.string().default("/data/uploads"),
  MAX_FILE_SIZE_MB: z.string().transform(Number).default("5"),

  // ── Mobile JWT Auth ──────────────────────────────────────────────
  // Optional — only needed when mobile API surface is active.
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL_SEC: z.string().transform(Number).default("900"),      // 15 min
  JWT_REFRESH_TTL_SEC: z.string().transform(Number).default("2592000"), // 30 days
  // v0.4.17: defaults bumped to match the actual shipped mobile build.
  // The previous "1.0.0" default made /api/v1/mobile/version always say
  // 1.0.0 unless explicitly overridden in env — so the client's force-
  // update check could never trigger. These should be set explicitly in
  // production env, but the default at least matches reality now.
  MOBILE_MIN_SUPPORTED_VERSION: z.string().default("0.4.10.0"),
  MOBILE_LATEST_VERSION: z.string().default("0.4.17.0"),

  // ── Firebase Cloud Messaging (push notifications) ────────────────
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  // ── Test ──────────────────────────────────────────────────────────
  TEST_DATABASE_URL: z.string().url().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("Invalid environment variables:", _env.error.format());
  process.exit(1);
}

export const env = _env.data;

// Parsed helpers
export const allowedOrigins: string[] = env.ALLOWED_ORIGINS
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const cookieSecure: boolean =
  env.COOKIE_SECURE !== undefined
    ? env.COOKIE_SECURE === "true"
    : env.NODE_ENV === "production";

// Helper: check if a feature's env vars are configured
export const features = {
  smtp: Boolean(env.SMTP_HOST && env.SMTP_USER),
  sms: Boolean(env.SMS_PROVIDER && env.SMS_API_KEY),
  himAccess: Boolean(env.HIM_ACCESS_CLIENT_ID),
  uidai: Boolean(env.UIDAI_API_ENDPOINT),
  digilocker: Boolean(env.DIGILOCKER_API_ENDPOINT),
  mobileAuth: Boolean(env.JWT_SECRET),
  fcm: Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY),
} as const;
