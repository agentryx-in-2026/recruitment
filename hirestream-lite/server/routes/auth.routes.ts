import { Router } from "express";
import crypto from "crypto";
import { passport } from "../config/passport.config";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { validateRequest } from "../middleware/validate.middleware";
import { sensitiveLimiter } from "../middleware/rateLimit.middleware";
import { registerSchema, loginSchema, otpSchema } from "@shared/validators";
import { passwordResetTokens, users } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { createAndSendOtp, verifyOtp } from "../services/otp.service";
import { sendPasswordResetEmail } from "../services/email.service";
import { z } from "zod";
import { notify } from "../services/notification.service";
import { candidates, employers } from "@shared/schema";
import { getSetting } from "../services/settings.service";
import { env } from "../config/env.config";
import { sanitizeUser } from "../lib/safeUser";

const router = Router();

// HP-3: capability flags gate which roles may self-register. The register
// schema still validates the role literal; this rejects roles that are
// architecturally present but disabled for the single-agency HP variant.
// Flip the capability.* settings ON to re-open marketplace self-registration.
const SELF_REGISTER_CAPABILITY: Record<string, string> = {
  employer: "capability.employer_self_registration",
  agent: "capability.agency_self_registration",
};

// ── Register ────────────────────────────────────────────────────────
router.post("/register", validateRequest(registerSchema), async (req, res, next) => {
  try {
    const { email, password, role, fullName, phone } = req.body;

    // HP-3: reject self-registration for roles disabled in this deployment.
    const capKey = SELF_REGISTER_CAPABILITY[role];
    if (capKey && !(await getSetting<boolean>(capKey))) {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: "This account type is not open for self-registration on this portal." },
      });
    }

    // Check if user exists
    const existing = await storage.getUserByUsername(email);
    if (existing) {
      // security 2026-07-07 (A07-1): don't confirm account existence ("User
      // already exists…") — that let anyone probe which emails are registered.
      // Return the same status/shape as a successful registration, minus the
      // session/user object. Duplicate prevention stays server-side; the real
      // owner simply signs in or uses password reset.
      return res.status(201).json({
        success: true,
        data: {
          message:
            "Registration received. If an account already exists for this email, please sign in or use 'Forgot password' instead.",
        },
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await storage.createUser({
      username: email,
      email,
      password: hashedPassword,
      role: role || "candidate",
    });

    // Auto-create role-specific profile record so user can immediately use the portal
    const db = storage.db;
    if (db) {
      if (role === "candidate" || !role) {
        await db.insert(candidates).values({
          userId: user.id,
          fullName: fullName || email.split("@")[0],
          email,
          phone: phone || null,
        }).catch(() => {}); // ignore if already exists
      } else if (role === "employer") {
        await db.insert(employers).values({
          userId: user.id,
          companyName: fullName || email.split("@")[0],
        }).catch(() => {});
      }
    }

    // Auto-login after registration — regenerate session to prevent fixation (CWE-384)
    req.session.regenerate((err) => {
      if (err) return next(err);
      (req.session as any).passport = { user: user.id };
      req.login(user, (err) => {
        if (err) return next(err);
        // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
        const safeUser = sanitizeUser(user);
        logger.info(`User registered and logged in: ${user.id}`);

        notify({
          userId: user.id,
          type: "system",
          title: "Welcome to HireStream!",
          message: `Your account has been created as ${role}. Complete your profile to get started.`,
        }).catch(() => {});

        return res.status(201).json({ success: true, data: safeUser });
      });
    });
  } catch (error) {
    next(error);
  }
});

// ── Login ───────────────────────────────────────────────────────────
router.post("/login", validateRequest(loginSchema), (req, res, next) => {
  passport.authenticate("local", async (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: info?.message || "Invalid credentials" },
      });
    }

    // Single-session enforcement (HTIS T4, opt-in). When OFF, the same user
    // can stay signed in on multiple devices concurrently — standard govt
    // portal behavior. When ON, a new login on any device silently signs
    // the user out everywhere else. Default OFF; admin toggles under
    // Settings → Security.
    const db = storage.db;
    try {
      const { getSetting } = await import("../services/settings.service");
      const singleSession = await getSetting<boolean>("auth.single_session_per_user");
      if (singleSession && db && req.sessionStore && typeof (req.sessionStore as any).pool?.query === "function") {
        // connect-pg-simple stores sessions in "session" table with sess->passport->user = id
        (req.sessionStore as any).pool.query(
          `DELETE FROM session WHERE sess->'passport'->>'user' = $1 AND sid != $2`,
          [user.id, req.sessionID]
        ).catch(() => {});
      }
    } catch { /* setting missing → default (no kill) */ }

    // Regenerate session to prevent fixation (CWE-384)
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.login(user, (err) => {
        if (err) return next(err);
        // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
        const safeUser = sanitizeUser(user);
        logger.info(`User logged in: ${safeUser.id}`);
        return res.json({ success: true, data: safeUser });
      });
    });
  })(req, res, next);
});

// ── Dev / Testing: quick-login as role ──────────────────────────────
// Maps role → demo user and establishes a session. No password required.
// Gated by system_settings feature flag `feature.quick_login_enabled` (default ON in
// non-production, OFF in production). When flag is OFF returns 403.
router.post("/dev-login", async (req, res, next) => {
  try {
    // security 2026-07-07 (A04-1): controlled by the admin-managed feature flag
    // `feature.quick_login_enabled` (Superadmin → Feature Flags). Default is ON
    // in dev, OFF in production — so it's disabled on STG/PROD until an admin
    // explicitly enables it (e.g. for a live demo), and never on by accident.
    const { role, username } = req.body;
    const validRoles = ["candidate", "agent", "employer", "admin"];
    if (!username && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `role must be one of: ${validRoles.join(", ")}` },
      });
    }

    // Check feature flag (default: enabled in dev, disabled in production)
    let enabled = process.env.NODE_ENV !== "production";
    if (storage.db) {
      try {
        const { systemSettings } = await import("@shared/schema");
        const rows = await storage.db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, "feature.quick_login_enabled"))
          .limit(1);
        if (rows.length > 0) {
          enabled = rows[0].value === true;
        }
      } catch {}
    }
    if (!enabled) {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: "Quick login disabled. Use /auth/login with credentials." },
      });
    }

    // Resolve target: an explicit demo-cast username, or the role's default demo user.
    const demoUsername = username ? String(username).trim() : `demo_${role}`;
    if (/super/i.test(demoUsername)) {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: "Superadmin is not available via quick login." },
      });
    }
    const user = await storage.getUserByUsername(demoUsername);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: `Demo user ${demoUsername} not found. Run: npx tsx scripts/seed.ts` },
      });
    }
    if ((user as any).role === "superadmin") {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: "Superadmin is not available via quick login." },
      });
    }

    // Regenerate session to prevent fixation (CWE-384)
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.login(user, (err) => {
        if (err) return next(err);
        // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
        const safeUser = sanitizeUser(user as any);
        logger.info(`Dev login as ${role}: ${safeUser.id}`);
        return res.json({ success: true, data: safeUser });
      });
    });
  } catch (err) {
    next(err);
  }
});

// ── Dev / Testing: is quick-login available? (drives the Demo Switcher UI) ──
router.get("/dev-login", async (_req, res) => {
  // Drives the Demo Switcher UI — reflects the admin-managed feature flag
  // (default ON in dev, OFF in production).
  let enabled = process.env.NODE_ENV !== "production";
  if (storage.db) {
    try {
      const { systemSettings } = await import("@shared/schema");
      const rows = await storage.db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, "feature.quick_login_enabled"))
        .limit(1);
      if (rows.length > 0) enabled = rows[0].value === true;
    } catch {}
  }
  res.json({ success: true, data: { enabled } });
});

// ── Dev / Testing: RESET all data to the clean demo master set ──────
// Runs the curated seed (TRUNCATE … CASCADE + rebuild) in a child process so a
// presenter can wipe everything created during a test run and restore the
// pristine demo state. Flag-gated by `feature.quick_login_enabled` (off in prod).
router.post("/demo-reset", async (_req, res) => {
  // security 2026-07-07 (A04-1): gated by the same admin-managed
  // `feature.quick_login_enabled` flag (default OFF in production). NOTE: this
  // is a destructive TRUNCATE-CASCADE reseed — only enable the flag on a
  // demo/UAT box and only during an active demo, never on the real deployment.
  let enabled = process.env.NODE_ENV !== "production";
  if (storage.db) {
    try {
      const { systemSettings } = await import("@shared/schema");
      const rows = await storage.db
        .select().from(systemSettings)
        .where(eq(systemSettings.key, "feature.quick_login_enabled")).limit(1);
      if (rows.length > 0) enabled = rows[0].value === true;
    } catch {}
  }
  if (!enabled) {
    return res.status(403).json({ success: false, error: { code: 403, message: "Demo reset is disabled." } });
  }
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed.ts"],
      { cwd: process.cwd(), env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, error: { code: 500, message: "Reset failed to start: " + err.message } });
    });
    child.on("close", (code) => {
      if (res.headersSent) return;
      if (code === 0) {
        logger.info("Demo data reset to clean master set");
        res.json({ success: true, message: "Demo data reset to the clean master set." });
      } else {
        logger.error(`Demo reset failed (exit ${code}): ${out.slice(-400)}`);
        res.status(500).json({ success: false, error: { code: 500, message: "Reset failed. Check server logs.", detail: out.slice(-400) } });
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 500, message: err?.message || "Reset failed" } });
  }
});

// ── Logout ──────────────────────────────────────────────────────────
router.post("/logout", (req, res, next) => {
  const userId = (req.user as any)?.id;
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      logger.info(`User logged out: ${userId}`);
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });
});

// ── Get Current User ────────────────────────────────────────────────
router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      error: { code: 401, message: "Not authenticated" },
    });
  }
  // security 2026-07-07 (A02-3): shared serializer — never emit 2FA secrets.
  const safeUser = sanitizeUser(req.user as any);
  res.json({ success: true, data: safeUser });
});

// ── Send OTP (real) ─────────────────────────────────────────────────
const sendOtpBodySchema = z.object({
  email: z.string().trim().email().max(120),
  purpose: z.enum(["login", "register", "password_reset"]).default("login"),
  phone: z.string().trim().max(20).optional(),
});

router.post("/send-otp", sensitiveLimiter, validateRequest(sendOtpBodySchema), async (req, res, next) => {
  try {
    const { email, purpose, phone } = req.body;
    const result = await createAndSendOtp(email, purpose, phone);

    if (!result.success) {
      return res.status(500).json({ success: false, error: { code: 500, message: result.message } });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
});

// ── Verify OTP (real) ───────────────────────────────────────────────
router.post("/verify-otp", validateRequest(otpSchema), async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyOtp(email, otp);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: result.message },
      });
    }

    // Mark user's email as verified if they exist
    const db = storage.db;
    if (db) {
      const existingUser = await storage.getUserByUsername(email);
      if (existingUser) {
        await db
          .update(users)
          .set({ phoneVerified: true }) // reuse field for email verification
          .where(eq(users.id, existingUser.id));
      }
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
});

// ── Request Password Reset ──────────────────────────────────────────
const resetRequestSchema = z.object({
  email: z.string().trim().email().max(120),
});

router.post("/request-password-reset", sensitiveLimiter, validateRequest(resetRequestSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // Always return 200 to prevent email enumeration
    const user = await storage.getUserByUsername(email);
    if (!user) {
      return res.json({ success: true, message: "If an account exists with this email, a reset link has been sent." });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    await sendPasswordResetEmail(email, token);

    logger.info(`Password reset requested for: ${email}`);
    res.json({ success: true, message: "If an account exists with this email, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
});

// ── Reset Password (with token) ─────────────────────────────────────
const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

router.post("/reset-password", validateRequest(resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // Find valid token
    const results = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.used, false),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "Invalid or expired reset token" },
      });
    }

    const resetRecord = results[0];

    // Mark token as used FIRST to prevent race condition (two simultaneous requests)
    const consumed = await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(and(eq(passwordResetTokens.id, resetRecord.id), eq(passwordResetTokens.used, false)))
      .returning();
    if (consumed.length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Token already consumed" } });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, resetRecord.userId));

    // Invalidate all existing sessions for this user (CWE-613)
    if (req.sessionStore && typeof (req.sessionStore as any).pool?.query === "function") {
      (req.sessionStore as any).pool.query(
        `DELETE FROM session WHERE sess->'passport'->>'user' = $1`,
        [resetRecord.userId]
      ).catch(() => {});
    }

    logger.info(`Password reset completed for user: ${resetRecord.userId}`);
    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    next(error);
  }
});

// ── Change Password (authenticated user) ────────────────────────────
// Requires the current password (defence-in-depth against session-hijack +
// CSRF + stolen laptop scenarios) and enforces the same strong-password rules
// as registration. On success, all OTHER sessions for this user are destroyed
// so a compromised session elsewhere cannot continue. The current session
// stays logged-in (preserves the user's flow).
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

router.post("/change-password", sensitiveLimiter, validateRequest(changePasswordSchema), async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!user?.id) return res.status(401).json({ success: false, error: { code: 401, message: "Not signed in" } });

    const { currentPassword, newPassword } = req.body;
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: { code: 400, message: "New password must differ from current" } });
    }

    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: { code: 404, message: "User not found" } });

    const ok = await bcrypt.compare(currentPassword, row.password);
    if (!ok) return res.status(403).json({ success: false, error: { code: 403, message: "Current password is incorrect" } });

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));

    // Destroy OTHER sessions (keep the current one alive so UX continues smoothly).
    // Await the delete so callers see a consistent state immediately after.
    if (req.sessionStore && typeof (req.sessionStore as any).pool?.query === "function") {
      try {
        await (req.sessionStore as any).pool.query(
          `DELETE FROM session WHERE sess->'passport'->>'user' = $1 AND sid != $2`,
          [user.id, req.sessionID]
        );
      } catch { /* non-blocking */ }
    }

    // Audit trail
    try {
      const { logTransition } = await import("../services/audit-transitions.service");
      await logTransition({
        actorUserId: user.id, actorRole: user.role,
        entityType: "agency",  // re-use enum slot for "user security event"
        entityId: user.id, action: "password_changed",
        ipAddress: req.ip,
      });
    } catch { /* non-blocking */ }

    logger.info(`Password changed: user=${user.id} role=${user.role}`);
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
});

// ── HIM Access SSO ──────────────────────────────────────────────────
// Reads config from provider_config (admin-editable). If no config saved,
// returns 501 with a clear message. Actual OAuth handshake will be wired up
// once HP IT provides endpoint + client_id + secret.
router.get("/sso/himaccess", async (_req, res) => {
  const { getProviderConfig } = await import("../services/provider-config.service");
  const p = await getProviderConfig("himaccess");
  if (!p?.enabled || !p.config.clientId || !p.config.endpoint) {
    return res.status(501).json({
      success: false,
      error: { code: 501, message: "HIM Access SSO not configured. Admin can set it up in Admin → Integrations." },
    });
  }
  const state = Math.random().toString(36).slice(2);
  const redirect = encodeURIComponent(p.config.redirectUri || "");
  const scope = encodeURIComponent(p.config.scope || "openid profile");
  return res.redirect(`${p.config.endpoint}?client_id=${encodeURIComponent(p.config.clientId)}&response_type=code&scope=${scope}&redirect_uri=${redirect}&state=${state}`);
});

router.get("/sso/himaccess/callback", async (_req, res) => {
  const { getProviderConfig } = await import("../services/provider-config.service");
  const p = await getProviderConfig("himaccess");
  if (!p?.enabled) {
    return res.status(501).json({ success: false, error: { code: 501, message: "HIM Access SSO not configured." } });
  }
  // TODO — exchange code for token once HP IT provides the token endpoint.
  return res.status(501).json({
    success: false,
    error: { code: 501, message: "HIM Access token exchange not yet implemented. Credentials on file; token-endpoint handshake pending HP IT sign-off." },
  });
});

// ── Aadhaar Verification ────────────────────────────────────────────
const aadhaarSchema = z.object({
  aadhaarNumber: z.string().length(12, "Aadhaar number must be 12 digits"),
});

router.post("/verify-aadhaar", validateRequest(aadhaarSchema), async (req, res) => {
  const { getProviderConfig } = await import("../services/provider-config.service");
  const p = await getProviderConfig("aadhaar");
  if (!p?.enabled || !p.config.endpoint) {
    return res.status(501).json({
      success: false,
      error: { code: 501, message: "Aadhaar verification not configured. Admin can set UIDAI credentials in Admin → Integrations." },
    });
  }
  // TODO — call UIDAI endpoint with the aadhaarNumber + license key once HPSEDC
  // issues the license for this deployment. The call is hand-off-ready: the
  // provider-config layer already gives us endpoint + apiKey + licenseKey.
  return res.status(501).json({
    success: false,
    error: { code: 501, message: "Aadhaar verification config present but UIDAI integration awaiting HPSEDC license key before go-live." },
  });
});

export default router;
