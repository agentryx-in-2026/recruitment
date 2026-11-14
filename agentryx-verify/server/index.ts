import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env, cookieSecure } from "./config/env";
import { pool } from "./config/db";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { exportRouter } from "./routes/export";
import { feedbackRouter } from "./routes/feedback";
import { sprintsRouter } from "./routes/sprints";
import { pmRouter } from "./routes/pm";
import { askRouter } from "./routes/ask";
import { testingRouter } from "./routes/testing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  } : false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const PgSession = connectPgSimple(session);
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({ pool, tableName: "verify_session", createTableIfMissing: true }),
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000, // 8h
  },
}));

// Health
app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

// API
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/pm", pmRouter);
app.use("/api/ask", askRouter);
app.use("/api/testing", testingRouter);
app.use("/api/export", exportRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api", sprintsRouter);  // exposes /api/projects/:slug/sprints and /api/sprints/:id

// Diagnostic route autodiscovery for deep-smoke
if (env.NODE_ENV !== "production" || process.env.DEEP_ROUTES_DEBUG === "1") {
  app.get("/api/__routes", (req, res) => {
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

// JSON error handler for /api so multer errors (size limit, wrong MIME)
// surface as parseable JSON instead of Express's default HTML 500 page.
// Without this, the client's api.signoff throws "500: <!DOCTYPE html..." and
// the reviewer sees no feedback when their screenshot exceeds the size cap.
app.use("/api", (err: any, _req: any, res: any, next: any) => {
  if (!err) return next();
  const status = err.status || err.statusCode ||
    (err.code === "LIMIT_FILE_SIZE" ? 413 :
     err.code === "LIMIT_UNEXPECTED_FILE" ? 400 :
     err.code === "LIMIT_FILE_COUNT" ? 400 : 500);
  const message = err.message || "Server error";
  if (status >= 500) console.error("[api-error]", err);
  res.status(status).json({ error: message, code: err.code });
});

// Magic-link consume runs at /auth/consume (not /api) so it's a clean URL
app.get("/auth/consume", (req, res, next) => {
  // Forward to the auth router's handler
  (authRouter as any).handle({ ...req, url: "/consume" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "") }, res, next);
});

// Static client
const clientDir = path.resolve(__dirname, "../dist/public");
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
} else {
  app.get("*", (_req, res) =>
    res.status(503).type("text/plain").send("Client bundle not built. Run `npm run build`."));
}

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Agentryx Verify on :${env.PORT} (${env.NODE_ENV})`);
});
