import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { UPLOAD_DIR, HS_PHOTOS_DIR } from "./middleware/upload.middleware";
import helmet from "helmet";
import { apiLimiter } from "./middleware/rateLimit.middleware";
import { errorHandler } from "./middleware/errorHandler.middleware";
import { sanitizeRequest } from "./middleware/sanitize.middleware";
import { logger } from "./config/logger.config";
import { env, allowedOrigins } from "./config/env.config";

const app = express();
app.set("trust proxy", 1);

// ── Security Headers (Helmet) ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite needs inline for HMR in dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false, // breaks some image loading
}));

// ── CORS — whitelist driven by ALLOWED_ORIGINS env var ─────────────
// Empty list in production = same-origin only (no cross-origin headers emitted).
app.use((req, res, next) => {
  if (env.NODE_ENV === "production" && allowedOrigins.length > 0) {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    }
  }
  next();
});

// ── Block dangerous HTTP methods (TRACE, OPTIONS in prod) ───────────
app.use((req, res, next) => {
  const blocked = ["TRACE"];
  if (blocked.includes(req.method)) {
    return res.status(405).json({ success: false, error: { code: 405, message: "Method not allowed" } });
  }
  // Handle OPTIONS (CORS preflight) — only allow from whitelisted origins
  if (req.method === "OPTIONS" && env.NODE_ENV === "production" && allowedOrigins.length > 0) {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) {
      return res.status(405).json({ success: false, error: { code: 405, message: "Method not allowed" } });
    }
  }
  next();
});

// ── Body parsing ────────────────────────────────────────────────────
// 2mb (was 1mb): headroom for the Smart Job Importer's max-batch commit
// (up to ~2000 job rows as JSON). Still small enough to bound body-size DoS,
// and all write routes are auth-gated + rate-limited.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// ── Input sanitization (XSS defence-in-depth) ───────────────────────
app.use(sanitizeRequest);

// ── Remove server signature headers ─────────────────────────────────
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});

// ── Public static: candidate profile photos ─────────────────────────
// Only the photos leaf under the HS namespace is exposed. Sensitive documents
// (passport, PCC, offer letters) continue to route through the auth-protected
// /api/v1/candidates/documents/:id/download endpoint, and they live under a
// SEPARATE leaf (uploads/hs/candidates/docs/) so the static handler here can
// never reach them even by accident.
app.use("/uploads/hs/candidates/photos", express.static(HS_PHOTOS_DIR, {
  // no-cache → browser revalidates via ETag each load, so a replaced photo
  // (same filename) is picked up immediately instead of being stuck for a day.
  etag: true,
  index: false,
  fallthrough: false,
  setHeaders: (res) => { res.setHeader("Cache-Control", "no-cache"); },
}));

// ── App version (single source of truth) ────────────────────────────
// Read at startup from /VERSION at the app root so the same file drives
// both the footer pill in the UI and any future health/about endpoints.
// Bumping a release is `echo 0.4.2.0 > VERSION && pm2 restart hirestream`.
// File format: a single 4-segment dotted string. Trailing newline allowed.
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
let APP_VERSION = "0.0.0.0";
try {
  APP_VERSION = readFileSync(resolvePath(process.cwd(), "VERSION"), "utf8").trim() || "0.0.0.0";
} catch {
  // VERSION file missing — keep the placeholder rather than crashing the boot.
}
app.get("/api/v1/version", (_req, res) => {
  res.json({ success: true, data: { version: APP_VERSION } });
});

// ── Rate limiting ───────────────────────────────────────────────────
app.use("/api", apiLimiter);

// ── Cache-Control on API responses (no caching sensitive data) ──────
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ── Request logging ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";

      logger.info(logLine, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    }
  });

  next();
});

import { initSettings } from "./services/settings.service";
import { initControls } from "./services/system-controls.service";
import { seedNotificationTemplates } from "./services/notification-templates.seed";
import { startJobLifecycleCron } from "./services/job-lifecycle.service";
import { startSavedSearchesCron } from "./services/saved-searches-digest.service";
import { startComplianceCrons } from "./services/compliance-crons.service";
import { seedCountryInfo } from "./services/country-info.seed";
import { seedSystemConfig } from "./services/system-config.service";
import { seedDefaultAgency } from "./services/default-agency.seed";
import { loadValidCountries } from "./services/country-validator.service";

(async () => {
  await initSettings().catch((e) => logger.warn(`Settings init skipped: ${e?.message}`));
  await initControls().catch((e) => logger.warn(`System controls init skipped: ${e?.message}`));
  await seedNotificationTemplates().catch((e) => logger.warn(`Template seed skipped: ${e?.message}`));
  await seedCountryInfo().catch((e) => logger.warn(`Country info seed skipped: ${e?.message}`));
  await seedSystemConfig().catch((e) => logger.warn(`System config seed skipped: ${e?.message}`));
  await seedDefaultAgency().catch((e) => logger.warn(`Default agency seed skipped: ${e?.message}`));
  await loadValidCountries().catch((e) => logger.warn(`Country validator load skipped: ${e?.message}`));
  if (env.NODE_ENV !== "test") {
    startJobLifecycleCron();
    startSavedSearchesCron();
    // audit 2026-07-06 (Batch 4B-2): expiry alerts, grievance SLA aging,
    // 30/60/90 welfare prompts. Each task is individually setting-gated.
    startComplianceCrons();
  }
  const server = await registerRoutes(app);

  app.use(errorHandler);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = env.PORT;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    logger.info(`serving on port ${port} in ${env.NODE_ENV} mode`);
    // Start the backup scheduler after listen — it'll tick once a minute and
    // fire a snapshot when (auto_enabled && hour=schedule_hour && not-yet-today).
    // No-op until the admin toggles auto_enabled=true via the UI.
    import("./services/backup.service")
      .then(({ startBackupScheduler }) => startBackupScheduler())
      .catch((e) => logger.warn(`backup scheduler not started: ${e.message}`));
  });
})();
