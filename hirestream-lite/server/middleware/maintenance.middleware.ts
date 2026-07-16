/**
 * Maintenance middleware — reads the centralized System Controls record and
 * enforces full-site lockdown with bypass-key support. The richer version
 * replaces an earlier simple flag-based guard.
 */
import type { Request, Response, NextFunction } from "express";
import { getControls } from "../services/system-controls.service";

// Paths that must remain reachable even during a full lockdown so the
// super-admin can still sign in and lift the lockdown.
const ALWAYS_OPEN_API = [
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/superadmin\//,
  /^\/api\/v1\/admin\/health/,
  /^\/api\/v1\/content\/(announcements|faq)/,
];

export async function maintenanceMode(req: Request, res: Response, next: NextFunction) {
  try {
    const ctrl = await getControls();
    if (!ctrl.fullLockdownEnabled) return next();

    // Non-API: always serve the lockdown splash except /auth (login route) + static assets
    const isApi = req.path.startsWith("/api/");
    if (isApi && ALWAYS_OPEN_API.some((rx) => rx.test(req.path))) return next();
    if (!isApi && (req.path === "/auth" || req.path.startsWith("/assets/") || req.path.startsWith("/uploads/") || /\.(js|css|png|jpg|svg|ico|woff2?)$/i.test(req.path))) {
      return next();
    }

    const user = (req as any).user;
    if (user && (user.role === "superadmin" || user.role === "admin")) return next();

    // Bypass key via ?access_key=, header, or cookie
    const providedKey =
      String(req.query.access_key ?? "") ||
      String(req.headers["x-bypass-key"] ?? "") ||
      (req.headers.cookie?.match(/(?:^|;\s*)hs_bypass=([^;]+)/)?.[1] ?? "");
    if (providedKey && providedKey === ctrl.lockdownBypassKey) {
      res.setHeader("Set-Cookie", `hs_bypass=${ctrl.lockdownBypassKey}; Path=/; Max-Age=${4 * 60 * 60}; SameSite=Lax`);
      return next();
    }

    if (isApi) {
      return res.status(503).json({
        success: false,
        maintenance: {
          message: ctrl.lockdownMessage,
          eta: ctrl.showEta ? ctrl.lockdownEta : null,
          enabledAt: ctrl.showDowntime ? ctrl.lockdownEnabledAt : null,
        },
      });
    }

    res.status(503).type("html").send(renderLockdownHtml(ctrl));
  } catch (err) {
    next(err);
  }
}

function renderLockdownHtml(ctrl: Awaited<ReturnType<typeof getControls>>) {
  const eta = ctrl.showEta && ctrl.lockdownEta
    ? `<p class="eta">Back by ${new Date(ctrl.lockdownEta).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>`
    : "";
  const since = ctrl.showDowntime && ctrl.lockdownEnabledAt
    ? `<p class="since">Down since ${new Date(ctrl.lockdownEnabledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>`
    : "";
  const safeMsg = ctrl.lockdownMessage.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HireStream — Under Maintenance</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#581c87 100%);color:#fff;padding:24px}
  .card{max-width:520px;text-align:center;background:rgba(255,255,255,0.06);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:48px 32px;box-shadow:0 20px 60px rgba(0,0,0,0.35)}
  .icon{width:72px;height:72px;margin:0 auto 24px;border-radius:20px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:32px}
  h1{font-size:28px;font-weight:700;margin-bottom:12px}
  p{font-size:16px;opacity:0.9;line-height:1.5;margin-bottom:12px}
  .eta{margin-top:24px;padding:12px 20px;border-radius:12px;background:rgba(255,255,255,0.12);display:inline-block;font-weight:600}
  .since{font-size:13px;opacity:0.6;margin-top:12px}
  .brand{font-size:11px;opacity:0.5;margin-top:32px;letter-spacing:0.1em;text-transform:uppercase}
</style></head>
<body>
  <div class="card">
    <div class="icon">🛠️</div>
    <h1>We'll be right back</h1>
    <p>${safeMsg}</p>
    ${eta}
    ${since}
    <div class="brand">HireStream · HPSEDC Overseas Placement</div>
  </div>
</body></html>`;
}
