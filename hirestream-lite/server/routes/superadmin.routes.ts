import { Router } from "express";
import bcrypt from "bcrypt";
import { auditAction } from "../middleware/audit.middleware";
import { sanitizeUser } from "../lib/safeUser";

const router = Router();

// Guard: only superadmin can access these routes
router.use((req, res, next) => {
  const user = req.user as any;
  if (!user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (user.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Super Admin access required" });
  }
  next();
});

// Audit log all super admin mutations (POST, PATCH, DELETE)
router.use(auditAction("superadmin"));

// ─── USER MANAGEMENT ────────────────────────────────────────────────────────
// GET /api/v1/superadmin/users — list all users with optional role filter
router.get("/users", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { role } = req.query;
    const allUsers = role && typeof role === "string"
      ? await storage.db.select().from(users).where(eq(users.role, role))
      : await storage.db.select().from(users);

    // security 2026-07-07 (A02-3): shared serializer — strips password AND
    // twoFactorSecret/twoFactorRecoveryCodes, masks Aadhaar. Previously only
    // the password hash was removed, leaking every user's TOTP seed.
    const safe = allUsers.map((u: any) => sanitizeUser(u));
    res.json({ success: true, data: safe, total: safe.length });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// POST /api/v1/superadmin/users — create a new user (including admins)
router.post("/users", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { users } = await import("@shared/schema");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "username, email, password, role required" });
    }
    const validRoles = ["candidate", "agent", "employer", "admin", "superadmin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${validRoles.join(", ")}` });
    }

    const hashedPw = await bcrypt.hash(password, 10);
    const [newUser] = await storage.db.insert(users).values({
      username, email, password: hashedPw, role,
    }).returning();

    // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
    const safe = sanitizeUser(newUser);
    res.json({ success: true, data: safe });
  } catch (err: any) {
    if (err.message?.includes("duplicate")) {
      return res.status(409).json({ success: false, message: "Username or email already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create user" });
  }
});

// PATCH /api/v1/superadmin/users/:id/role — change a user's role
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { role } = req.body;
    const validRoles = ["candidate", "agent", "employer", "admin", "superadmin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${validRoles.join(", ")}` });
    }

    const [updated] = await storage.db
      .update(users)
      .set({ role })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, message: "User not found" });
    // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
    const safe = sanitizeUser(updated);
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update user role" });
  }
});

// PATCH /api/v1/superadmin/users/:id/active — enable/disable a user
router.patch("/users/:id/active", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be boolean" });
    }

    const [updated] = await storage.db
      .update(users)
      .set({ isActive })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, message: "User not found" });
    // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
    const safe = sanitizeUser(updated);
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update user status" });
  }
});

// ─── SYSTEM STATS ───────────────────────────────────────────────────────────
// GET /api/v1/superadmin/stats — system-wide counts
router.get("/stats", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { users } = await import("@shared/schema");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const allUsers = await storage.db.select().from(users);
    const byRole: Record<string, number> = {};
    let active = 0, inactive = 0;
    for (const u of allUsers) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      if (u.isActive !== false) active++; else inactive++;
    }

    res.json({
      success: true,
      data: {
        totalUsers: allUsers.length,
        byRole,
        active,
        inactive,
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
});

// ─── DANGER ZONE: DB RESET / RESEED ────────────────────────────────────────
// POST /api/v1/superadmin/reset — reset all non-user data and reseed demo data
// GET /api/v1/superadmin/reset/options — list the selectable data classes
// so the UI can render the per-entity checkboxes from a single source.
router.get("/reset/options", async (_req, res) => {
  const { DATA_CLASSES } = await import("../services/data-reset.service");
  res.json({
    success: true,
    data: Object.entries(DATA_CLASSES).map(([key, v]) => ({ key, label: v.label, note: v.note })),
  });
});

// POST /api/v1/superadmin/reset — wipe data. v0.4.36: rebuilt on the
// data-reset service (TRUNCATE CASCADE, FK-safe, transactional).
// Body: { confirmation: "RESET_HIRESTREAM", mode: "activity"|"full"|"selective",
//         classes?: string[] }  — `classes` required when mode=selective.
router.post("/reset", async (req, res) => {
  try {
    const { confirmation, mode = "full", classes } = req.body;
    if (confirmation !== "RESET_HIRESTREAM") {
      return res.status(400).json({
        success: false,
        message: "Missing confirmation. Send { confirmation: 'RESET_HIRESTREAM' } to proceed."
      });
    }
    if (!["activity", "full", "selective"].includes(mode)) {
      return res.status(400).json({ success: false, message: "mode must be activity / full / selective" });
    }
    if (mode === "selective" && (!Array.isArray(classes) || classes.length === 0)) {
      return res.status(400).json({ success: false, message: "selective mode needs a non-empty classes[] array" });
    }

    const { resetData } = await import("../services/data-reset.service");
    const result = await resetData({ mode, classes });

    res.json({
      success: true,
      message: mode === "full"
        ? "Full data wipe complete. Superadmin + system config preserved. Use Reset+Reseed to repopulate demo data."
        : mode === "activity"
          ? "Activity data cleared. Users, candidates, agencies, employers and jobs were kept."
          : "Selected data classes cleared.",
      mode: result.mode,
      tablesTruncated: result.tablesTruncated,
      deleted: result.rowsDeleted,
      usersDeleted: result.usersDeleted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Reset failed", error: err.message });
  }
});

// POST /api/v1/superadmin/reseed — reset AND reseed demo data in one call
router.post("/reseed", async (req, res) => {
  try {
    const { confirmation } = req.body;
    if (confirmation !== "RESEED_HIRESTREAM") {
      return res.status(400).json({
        success: false,
        message: "Missing confirmation. Send { confirmation: 'RESEED_HIRESTREAM' } to proceed."
      });
    }

    // Run the seed script programmatically
    const { execSync } = await import("child_process");
    try {
      const output = execSync("npx tsx scripts/seed.ts", {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf-8",
        timeout: 60000,
      });
      res.json({
        success: true,
        message: "Demo data reseeded successfully.",
        output: output.split("\n").slice(-20).join("\n"),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Reseed failed. Check server logs.",
        error: err.message?.slice(0, 500),
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Reseed failed", error: err.message });
  }
});

// ─── FEATURE FLAGS & MAINTENANCE ───────────────────────────────────────────
// Known flags with defaults. Stored as rows in `system_settings`.
const DEFAULT_FLAGS = [
  { key: "feature.captcha_enabled", value: true, description: "Require CAPTCHA on login", category: "feature_flag" },
  { key: "feature.ai_resume_parser_enabled", value: true, description: "AI Resume Parser widget in profile wizard", category: "feature_flag" },
  { key: "feature.agency_reviews_enabled", value: true, description: "Candidates can post agency reviews", category: "feature_flag" },
  { key: "feature.registration_enabled", value: true, description: "Public registration open", category: "feature_flag" },
  { key: "feature.dark_mode_enabled", value: true, description: "Dark mode toggle visible in header", category: "feature_flag" },
  // security 2026-07-07 (A04-1): admin-managed. Default follows environment —
  // ON in dev (so demo login just works), OFF in production (so it's disabled
  // on STG/PROD until an admin explicitly flips it here, e.g. for a live demo).
  // The previous static `true` default silently re-enabled password-less demo
  // login the first time this page loaded; env-aware default keeps prod safe
  // while leaving dev convenient, and the admin toggle overrides either way.
  { key: "feature.quick_login_enabled", value: process.env.NODE_ENV !== "production", description: "Quick one-click demo login on the auth page. Off by default in production; enable here only for demos. Also gates the destructive demo-reset.", category: "feature_flag" },
  { key: "system.maintenance_mode", value: false, description: "Portal in read-only/maintenance. When ON, non-superadmin users see 503.", category: "maintenance" },
  { key: "system.maintenance_message", value: "HireStream is undergoing scheduled maintenance. Please try again shortly.", description: "Message shown during maintenance", category: "maintenance" },
];

async function ensureDefaultFlags(db: any, systemSettings: any) {
  const { eq } = await import("drizzle-orm");
  for (const flag of DEFAULT_FLAGS) {
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, flag.key)).limit(1);
    if (!existing.length) {
      await db.insert(systemSettings).values(flag);
    }
  }
}

// GET /api/v1/superadmin/flags — list all feature flags + maintenance settings
router.get("/flags", async (_req, res) => {
  try {
    const { storage } = await import("../storage");
    const { systemSettings } = await import("@shared/schema");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    await ensureDefaultFlags(storage.db, systemSettings);
    const rows = await storage.db.select().from(systemSettings);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/superadmin/flags/:key — update a flag value
router.patch("/flags/:key", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { systemSettings } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: "value required" });

    const user = req.user as any;
    const [updated] = await storage.db
      .update(systemSettings)
      .set({ value, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(systemSettings.key, req.params.key))
      .returning();

    if (!updated) return res.status(404).json({ success: false, message: "Flag not found" });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── LOGS VIEWER ──────────────────────────────────────────────────────────
// GET /api/v1/superadmin/logs — tail Winston JSON logs with filters
router.get("/logs", async (req, res) => {
  try {
    const fs = await import("fs");
    const path = await import("path");

    const logPath = path.resolve(process.cwd(), "logs/app.log");
    if (!fs.existsSync(logPath)) {
      return res.json({ success: true, data: [], total: 0, message: "Log file not found (may not be configured in this environment)" });
    }

    const { level, module, userId, search, limit = "200" } = req.query as any;
    const maxLines = Math.min(parseInt(limit) || 200, 2000);

    const content = fs.readFileSync(logPath, "utf-8");
    let logs = content
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);

    // Apply filters
    if (level) logs = logs.filter((l: any) => l.level === level);
    if (module) logs = logs.filter((l: any) => l.module === module || (l.path || "").includes(module));
    if (userId) logs = logs.filter((l: any) => l.userId === userId);
    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter((l: any) => JSON.stringify(l).toLowerCase().includes(s));
    }

    const tail = logs.slice(-maxLines).reverse(); // newest first
    res.json({ success: true, data: tail, total: logs.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── INTEGRATION STATUS ───────────────────────────────────────────────────
// GET /api/v1/superadmin/integrations — health check of external integrations
router.get("/integrations", async (_req, res) => {
  try {
    const env = process.env;

    const integrations = [
      {
        name: "SMTP (Email)",
        key: "smtp",
        configured: !!(env.SMTP_HOST && env.SMTP_USER),
        host: env.SMTP_HOST || null,
        port: env.SMTP_PORT || null,
        status: env.SMTP_HOST ? "configured" : "not_configured",
        description: "Transactional email delivery (OTP, password reset, notifications)",
      },
      {
        name: "SMS Provider",
        key: "sms",
        configured: !!env.SMS_API_KEY,
        status: env.SMS_API_KEY ? "configured" : "stub",
        description: "SMS OTP + alerts. Stub logs to console in dev.",
      },
      {
        name: "Aadhaar Verification",
        key: "aadhaar",
        configured: !!env.AADHAAR_API_KEY,
        status: env.AADHAAR_API_KEY ? "configured" : "stub",
        description: "UIDAI eKYC. Endpoint returns 501 until creds provisioned.",
      },
      {
        name: "HIM Access SSO",
        key: "him_access",
        configured: !!env.HIM_ACCESS_CLIENT_ID,
        status: env.HIM_ACCESS_CLIENT_ID ? "configured" : "stub",
        description: "HP Government single sign-on. Endpoint returns 501 until creds provisioned.",
      },
      {
        name: "CAPTCHA",
        key: "captcha",
        configured: !!env.CAPTCHA_SITE_KEY,
        status: env.CAPTCHA_SITE_KEY ? "configured" : "stub",
        description: "reCAPTCHA/hCaptcha. Client stub active until real key provisioned.",
      },
      {
        name: "Database",
        key: "database",
        configured: !!env.DATABASE_URL,
        status: env.DATABASE_URL ? "connected" : "not_configured",
        description: "Postgres connection via Drizzle ORM",
      },
    ];

    res.json({ success: true, data: integrations });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/superadmin/integrations/smtp/test — send test email
router.post("/integrations/smtp/test", async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: "to (email) required" });

    const { sendPasswordResetEmail } = await import("../services/email.service");
    // Reuse password reset as simplest test (dev mode logs to console)
    try {
      await sendPasswordResetEmail(to, "TEST-TOKEN-SUPERADMIN-HEALTH-CHECK");
      res.json({ success: true, message: `Test email dispatched to ${to}. Check inbox or server logs.` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: `SMTP send failed: ${err.message}` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SETTINGS (env snapshot) ───────────────────────────────────────────────
// GET /api/v1/superadmin/settings — read-only env snapshot (secrets redacted)
router.get("/settings", async (_req, res) => {
  try {
    const env = process.env;

    // Redact sensitive values
    const redact = (key: string, val: string | undefined): string => {
      if (!val) return "—";
      const sensitive = /SECRET|PASSWORD|KEY|TOKEN|DATABASE_URL/i;
      if (sensitive.test(key)) {
        return val.length > 8 ? `${val.slice(0, 4)}…${val.slice(-2)} (${val.length} chars)` : "••••";
      }
      return val;
    };

    const groups = [
      {
        group: "Runtime",
        items: [
          { key: "NODE_ENV", value: env.NODE_ENV },
          { key: "PORT", value: env.PORT },
          { key: "Node Version", value: process.version },
          { key: "Process Uptime", value: `${Math.round(process.uptime())}s` },
        ],
      },
      {
        group: "Database",
        items: [
          { key: "DATABASE_URL", value: redact("DATABASE_URL", env.DATABASE_URL) },
          { key: "TEST_DATABASE_URL", value: redact("TEST_DATABASE_URL", env.TEST_DATABASE_URL) },
        ],
      },
      {
        group: "Session",
        items: [
          { key: "SESSION_SECRET", value: redact("SESSION_SECRET", env.SESSION_SECRET) },
          { key: "SESSION_TIMEOUT_MIN", value: "30 (hardcoded, HTIS T5 compliant)" },
        ],
      },
      {
        group: "Email (SMTP)",
        items: [
          { key: "SMTP_HOST", value: env.SMTP_HOST || "—" },
          { key: "SMTP_PORT", value: env.SMTP_PORT || "—" },
          { key: "SMTP_USER", value: env.SMTP_USER || "—" },
          { key: "SMTP_PASSWORD", value: redact("SMTP_PASSWORD", env.SMTP_PASSWORD) },
        ],
      },
      {
        group: "File Upload",
        items: [
          { key: "MAX_FILE_SIZE_MB", value: env.MAX_FILE_SIZE_MB || "5 (default)" },
        ],
      },
      {
        group: "Integrations",
        items: [
          { key: "AADHAAR_API_KEY", value: redact("AADHAAR_API_KEY", env.AADHAAR_API_KEY) },
          { key: "HIM_ACCESS_CLIENT_ID", value: env.HIM_ACCESS_CLIENT_ID || "—" },
          { key: "SMS_API_KEY", value: redact("SMS_API_KEY", env.SMS_API_KEY) },
          { key: "CAPTCHA_SITE_KEY", value: env.CAPTCHA_SITE_KEY || "—" },
        ],
      },
    ];

    res.json({ success: true, data: groups });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── AUDIT LOG FILTER ──────────────────────────────────────────────────────
// GET /api/v1/superadmin/audit?userId=...&action=...&resourceType=...&limit=100
router.get("/audit", async (req, res) => {
  try {
    const { storage } = await import("../storage");
    const { auditLog } = await import("@shared/schema");
    const { eq, and, desc } = await import("drizzle-orm");
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const { userId, action, resourceType, limit = "100" } = req.query as any;
    const maxRows = Math.min(parseInt(limit) || 100, 500);

    const conditions: any[] = [];
    if (userId) conditions.push(eq(auditLog.userId, userId));
    if (action) conditions.push(eq(auditLog.action, action));
    if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));

    const query = conditions.length > 0
      ? storage.db.select().from(auditLog).where(and(...conditions)).orderBy(desc(auditLog.createdAt)).limit(maxRows)
      : storage.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(maxRows);

    const rows = await query;
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── System Controls (full lockdown + pipeline pauses + ETA / bypass key) ──
router.get("/system-controls", async (_req, res) => {
  try {
    const { getControls } = await import("../services/system-controls.service");
    const data = await getControls();
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch("/system-controls", async (req, res) => {
  try {
    const { updateControls } = await import("../services/system-controls.service");
    const user = (req as any).user;
    const data = await updateControls(req.body || {}, user?.id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

export default router;
