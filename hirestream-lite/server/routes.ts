import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { passport } from "./config/passport.config";
import authRouter from "./routes/auth.routes";
import candidateRouter from "./routes/candidate.routes";
import adminRouter from "./routes/admin.routes";
import superadminRouter from "./routes/superadmin.routes";
import superadminOpsRouter from "./routes/superadmin-ops.routes";
import superadminOpsSystemRouter from "./routes/superadmin-ops-system.routes";
import resumeParserRouter from "./routes/resume-parser.routes";
import twoFaRouter from "./routes/twofa.routes";
import agencyRouter from "./routes/agency.routes";
import jobRouter from "./routes/job.routes";
import notificationRouter from "./routes/notification.routes";
import documentRouter from "./routes/document.routes";
import applicationRouter from "./routes/application.routes";
import driveRouter from "./routes/drive.routes";
import reportsRouter from "./routes/admin/reports";
import auditRouter from "./routes/admin/audit";
import grievanceRouter from "./routes/grievance.routes";
import contentRouter from "./routes/content.routes";
import agentProductivityRouter from "./routes/agent-productivity.routes";
import candidateSelfServiceRouter from "./routes/candidate-self-service.routes";
import employerRouter from "./routes/employer.routes";
import matchingRouter from "./routes/matching.routes";
import jobImportRouter from "./routes/job-import.routes";
import adminOversightRouter from "./routes/admin-oversight.routes";
import systemConfigRouter from "./routes/admin/system-config";
import operatorConsoleRouter from "./routes/admin/operator-console";
import savedSearchesRouter from "./routes/saved-searches.routes";
import publicStatusRouter from "./routes/public-status.routes";
import publicConfigRouter from "./routes/public-config.routes";
import postPlacementRouter from "./routes/post-placement.routes";
import supportRouter from "./routes/support.routes";
import { authLimiter } from "./middleware/rateLimit.middleware";
import { env, cookieSecure } from "./config/env.config";
// ── Mobile API surface ──────────────────────────────────────────────
import { mobileBearer } from "./middleware/mobileBearer.middleware";
import mobileAuthRouter from "./routes/mobile-auth.routes";
import mobilePushRouter from "./routes/mobile-push.routes";
import mobileConfigRouter from "./routes/mobile-config.routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Use PostgreSQL session store in production, memory in test
  let sessionStore: session.Store | undefined;

  if (env.NODE_ENV !== "test") {
    const PgSession = connectPgSimple(session);
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    sessionStore = new PgSession({
      pool,
      tableName: "session", // auto-created by connect-pg-simple
      createTableIfMissing: true,
    });
  }

  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // v0.4.36.3: `rolling: true` makes the 30-min window an IDLE timeout
      // (the cookie's maxAge is reset on every response) instead of an
      // ABSOLUTE one. Without it, a user was hard-logged-out 30 minutes
      // after LOGIN even while actively working — surfaced as a surprise
      // "Authentication required" 401 mid-task. Idle-timeout is the
      // intended reading of the HTIS T5 "30-minute session timeout"
      // requirement: 30 min of inactivity, not 30 min of wall-clock.
      rolling: true,
      store: sessionStore,
      cookie: {
        secure: cookieSecure,
        httpOnly: true,
        sameSite: "strict",
        maxAge: 30 * 60 * 1000, // 30 min idle timeout (HTIS T5 compliance)
      },
    })
  );

  // Mobile bearer auth — runs BEFORE passport session so Bearer tokens
  // get processed first. If no Bearer header, falls through to session.
  app.use(mobileBearer);
  app.use(passport.initialize());
  app.use(passport.session());

  // Maintenance mode — blocks non-superadmin API calls when toggled ON
  const { maintenanceMode } = await import("./middleware/maintenance.middleware");
  app.use(maintenanceMode);

  // Diagnostic route autodiscovery for deep-smoke
  if (env.NODE_ENV !== "production" || process.env.DEEP_ROUTES_DEBUG === "1") {
    app.get("/api/v1/__routes", (req, res) => {
      const token = req.header("X-Deep-Smoke-Token");
      if (!token || token !== process.env.DEEP_SMOKE_TOKEN) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      function getRoutes(router: any, basePath = ''): Array<{method: string, path: string}> {
        let endpoints: Array<{method: string, path: string}> = [];
        if (router && router.stack) {
          router.stack.forEach((layer: any) => {
            if (layer.route) {
              const path = layer.route.path;
              const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]).map(m => m.toUpperCase());
              methods.forEach(method => {
                let fullPath = basePath + (path === '/' ? '' : path);
                fullPath = fullPath.replace(/\/+/g, '/');
                if (fullPath === '') fullPath = '/';
                endpoints.push({ method, path: fullPath });
              });
            } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
              let prefix = '';
              if (layer.regexp && !layer.regexp.fast_slash) {
                let str = layer.regexp.toString();
                str = str.replace(/^\/\^/, '').replace(/\\\/\?\(\?\=\\\/\|\$\)\/i$/, '').replace(/\\\/\?\(\?\=\/\|\$\)\/i$/, '');
                prefix = str.replace(/\\\//g, '/');
                if (!prefix.startsWith('/')) prefix = '/' + prefix;
              }
              endpoints = endpoints.concat(getRoutes(layer.handle, basePath + prefix));
            }
          });
        }
        return endpoints;
      }

      const allRoutes = getRoutes((app as any)._router);
      const getRoutesList = allRoutes.filter(r => r.method === 'GET');

      return res.json({ success: true, data: getRoutesList });
    });
  }

  // Register API routes
  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/candidates", candidateRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/superadmin", superadminRouter);
  app.use("/api/v1/superadmin/ops", superadminOpsRouter);
  app.use("/api/v1/superadmin/ops", superadminOpsSystemRouter);
  app.use("/api/v1/resume", resumeParserRouter);
  app.use("/api/v1/2fa", twoFaRouter);
  app.use("/api/v1/agencies", agencyRouter);
  app.use("/api/v1/jobs", jobRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/candidates/documents", documentRouter);
  app.use("/api/v1/applications", applicationRouter);
  app.use("/api/v1/drives", driveRouter);
  app.use("/api/v1/admin/reports", reportsRouter);
  app.use("/api/v1/admin/audit", auditRouter);
  app.use("/api/v1/grievances", grievanceRouter);
  app.use("/api/v1/content", contentRouter);
  app.use("/api/v1/agent", agentProductivityRouter);
  app.use("/api/v1/me", candidateSelfServiceRouter);
  app.use("/api/v1/me/saved-searches", savedSearchesRouter);
  app.use("/api/v1/public/status", publicStatusRouter);
  app.use("/api/v1/config", publicConfigRouter);
  app.use("/api/v1/post-placement", postPlacementRouter);
  app.use("/api/v1/support", supportRouter);
  app.use("/api/v1/employer", employerRouter);
  app.use("/api/v1/admin/job-import", jobImportRouter);
  app.use("/api/v1/admin/oversight", adminOversightRouter);
  app.use("/api/v1/admin/system-config", systemConfigRouter);
  app.use("/api/v1/admin/operator-console", operatorConsoleRouter);
  app.use("/api/v1/matching", matchingRouter);

  // ── Mobile API routes ───────────────────────────────────────────────
  app.use("/api/v1/mobile/auth", authLimiter, mobileAuthRouter);
  app.use("/api/v1/mobile/push", mobilePushRouter);
  app.use("/api/v1/mobile", mobileConfigRouter);

  const httpServer = createServer(app);

  return httpServer;
}
