/**
 * Mobile Auth Routes — /api/v1/mobile/auth/*
 *
 * JWT bearer-token authentication for mobile clients. Coexists alongside
 * the existing passport-local + express-session web auth. Route handlers
 * reuse the same passport-local strategy for credential verification but
 * return JWT tokens instead of setting cookies.
 *
 * Endpoints:
 *   POST /login          — email + password → { accessToken, refreshToken, user }
 *   POST /register       — new candidate    → { accessToken, refreshToken, user }
 *   POST /refresh        — rotate refresh   → { accessToken, refreshToken }
 *   POST /logout         — revoke refresh   → { ok: true }
 *   POST /forgot-password — sends reset email → { ok: true }
 *
 * See: /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §1–§2
 */

import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "../storage";
import { users, candidates, mobileRefreshTokens } from "@shared/schema";
import { validateRequest } from "../middleware/validate.middleware";
import { loginSchema, registerSchema } from "@shared/validators";
import { env } from "../config/env.config";
import { logger } from "../config/logger.config";
import { notify } from "../services/notification.service";
import { sanitizeUser } from "../lib/safeUser";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────

/** Max active refresh tokens per user — prevents token accumulation DoS */
const MAX_REFRESH_TOKENS_PER_USER = 5;

/** SHA-256 hash of a refresh token for storage (not bcrypt — tokens are already high-entropy) */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a 256-bit random refresh token */
function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Sign a short-lived mobile access JWT */
function signAccessToken(userId: string, role: string): string {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign(
    { sub: userId, role, typ: "mobile_access" as const },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL_SEC },
  );
}

/**
 * Create a refresh token row and return the raw token + access token.
 * Also enforces the per-user token cap.
 */
async function issueTokenPair(userId: string, role: string, req: any) {
  const db = storage.db;
  if (!db) throw new Error("Database not available");

  const rawRefresh = generateRefreshToken();
  const tokenHash = hashToken(rawRefresh);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SEC * 1000);

  // Insert the new refresh token
  await db.insert(mobileRefreshTokens).values({
    userId,
    tokenHash,
    deviceId: req.body?.deviceId || null,
    userAgent: req.headers["user-agent"] || null,
    expiresAt,
  });

  // Enforce max active tokens per user — revoke oldest beyond the cap
  const allActive = await db
    .select({ id: mobileRefreshTokens.id, issuedAt: mobileRefreshTokens.issuedAt })
    .from(mobileRefreshTokens)
    .where(and(
      eq(mobileRefreshTokens.userId, userId),
      isNull(mobileRefreshTokens.revokedAt),
    ))
    .orderBy(mobileRefreshTokens.issuedAt);

  if (allActive.length > MAX_REFRESH_TOKENS_PER_USER) {
    const toRevoke = allActive.slice(0, allActive.length - MAX_REFRESH_TOKENS_PER_USER);
    for (const row of toRevoke) {
      await db
        .update(mobileRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(mobileRefreshTokens.id, row.id));
    }
  }

  const accessToken = signAccessToken(userId, role);
  return { accessToken, refreshToken: rawRefresh };
}

/** Strip password from user object before returning to client */
// security 2026-07-07 (A02-3): delegate to the shared serializer so the
// mobile responses also mask users.aadhaarNumber (was returned raw).
function safeUser(user: any) {
  return sanitizeUser(user);
}

// ── POST /login ─────────────────────────────────────────────────────
router.post("/login", validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Reuse the same credential verification logic as passport-local
    const user = await storage.getUserByUsername(username);
    if (!user || user.isActive === false) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "Invalid credentials" },
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "Invalid credentials" },
      });
    }

    // Check single-session enforcement for mobile tokens
    const db = storage.db;
    if (db) {
      try {
        const { getSetting } = await import("../services/settings.service");
        const singleSession = await getSetting<boolean>("auth.single_session_per_user");
        if (singleSession) {
          // Revoke all existing mobile refresh tokens for this user
          await db
            .update(mobileRefreshTokens)
            .set({ revokedAt: new Date() })
            .where(and(
              eq(mobileRefreshTokens.userId, user.id),
              isNull(mobileRefreshTokens.revokedAt),
            ));
        }
      } catch { /* setting missing → default (no kill) */ }
    }

    // Update last login
    if (db) {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).catch(() => {});
    }

    const tokens = await issueTokenPair(user.id, user.role, req);

    logger.info(`Mobile login: user=${user.id} role=${user.role}`);
    return res.json({
      success: true,
      data: {
        ...tokens,
        user: safeUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Mirror of the web register gate (auth.routes.ts) — roles disabled for
// self-registration in this deployment must be rejected on mobile too
// (audit 2026-07-06, S4: mobile omitted this, letting attackers self-register
// as agent/employer on the single-agency HP portal).
const SELF_REGISTER_CAPABILITY: Record<string, string> = {
  employer: "capability.employer_self_registration",
  agent: "capability.agency_self_registration",
};

// ── POST /register ──────────────────────────────────────────────────
router.post("/register", validateRequest(registerSchema), async (req, res, next) => {
  try {
    const { email, password, role, fullName, phone } = req.body;

    // HP-3 (S4): reject self-registration for roles disabled in this deployment.
    const capKey = SELF_REGISTER_CAPABILITY[role];
    if (capKey) {
      const { getSetting } = await import("../services/settings.service");
      if (!(await getSetting<boolean>(capKey))) {
        return res.status(403).json({
          success: false,
          error: { code: 403, message: "This account type is not open for self-registration on this portal." },
        });
      }
    }

    // Check if user exists
    const existing = await storage.getUserByUsername(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: "User already exists with this email" },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await storage.createUser({
      username: email,
      email,
      password: hashedPassword,
      role: role || "candidate",
    });

    // Auto-create candidate profile (same as web registration)
    const db = storage.db;
    if (db && (role === "candidate" || !role)) {
      await db.insert(candidates).values({
        userId: user.id,
        fullName: fullName || email.split("@")[0],
        email,
        phone: phone || null,
      }).catch(() => {}); // ignore if already exists
    }

    const tokens = await issueTokenPair(user.id, user.role, req);

    // Welcome notification
    notify({
      userId: user.id,
      type: "system",
      title: "Welcome to HireStream!",
      message: `Your account has been created as ${user.role}. Complete your profile to get started.`,
    }).catch(() => {});

    logger.info(`Mobile registration: user=${user.id} role=${user.role}`);
    return res.status(201).json({
      success: true,
      data: {
        ...tokens,
        user: safeUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /refresh ───────────────────────────────────────────────────
const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(128),
});

router.post("/refresh", validateRequest(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database unavailable" } });

    const tokenHash = hashToken(refreshToken);

    // Look up the token by hash
    const [row] = await db
      .select()
      .from(mobileRefreshTokens)
      .where(eq(mobileRefreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "Invalid refresh token" },
      });
    }

    // Reuse detection: if the token was already revoked, someone is replaying
    // a stolen token. Revoke the ENTIRE chain for this user-device.
    if (row.revokedAt) {
      logger.warn(`Mobile refresh reuse detected: user=${row.userId} device=${row.deviceId}`);
      await db
        .update(mobileRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(mobileRefreshTokens.userId, row.userId),
          isNull(mobileRefreshTokens.revokedAt),
        ));
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "Refresh token reuse detected — all sessions revoked" },
      });
    }

    // Check expiry
    if (new Date() > row.expiresAt) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "Refresh token expired" },
      });
    }

    // Look up the user to get current role
    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || user.isActive === false) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: "User not found or deactivated" },
      });
    }

    // Rotate: revoke the current token, issue a new pair
    const newRawRefresh = generateRefreshToken();
    const newHash = hashToken(newRawRefresh);
    const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SEC * 1000);

    // Insert new token first
    const [newRow] = await db.insert(mobileRefreshTokens).values({
      userId: row.userId,
      tokenHash: newHash,
      deviceId: row.deviceId,
      userAgent: req.headers["user-agent"] || row.userAgent,
      expiresAt: newExpiresAt,
    }).returning();

    // Revoke old token and link to new one
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date(), rotatedTo: newRow.id })
      .where(eq(mobileRefreshTokens.id, row.id));

    const accessToken = signAccessToken(user.id, user.role);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRawRefresh,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /logout ────────────────────────────────────────────────────
const logoutSchema = z.object({
  refreshToken: z.string().min(32).max(128),
});

router.post("/logout", validateRequest(logoutSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database unavailable" } });

    const tokenHash = hashToken(refreshToken);

    // Revoke the token (idempotent — already revoked is fine)
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(mobileRefreshTokens.tokenHash, tokenHash));

    logger.info("Mobile logout: token revoked");
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

// ── POST /forgot-password ───────────────────────────────────────────
const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(120),
});

router.post("/forgot-password", validateRequest(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database unavailable" } });

    // Always return 200 to prevent email enumeration (same as web)
    const user = await storage.getUserByUsername(email);
    if (!user) {
      return res.json({ success: true, message: "If an account exists with this email, a reset link has been sent." });
    }

    // Reuse the existing password reset flow
    const { passwordResetTokens } = await import("@shared/schema");
    const { sendPasswordResetEmail } = await import("../services/email.service");

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    await sendPasswordResetEmail(email, token);

    logger.info(`Mobile forgot-password: email=${email}`);
    return res.json({ success: true, message: "If an account exists with this email, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
});

export default router;
