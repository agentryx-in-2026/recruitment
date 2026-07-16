/**
 * Mobile Push Registration Routes — /api/v1/mobile/push/*
 *
 * Endpoints for registering and unregistering FCM/APNs device tokens.
 * These require authentication (mobileBearer middleware will have already
 * populated req.user by the time these routes run).
 *
 * Endpoints:
 *   POST   /register  — stores FCM/APNs token for the logged-in user
 *   DELETE /register  — removes current device's token (on logout / opt-out)
 *
 * See: /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §2
 */

import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { mobilePushTokens } from "@shared/schema";
import { validateRequest } from "../middleware/validate.middleware";
import { protect } from "../middleware/auth.middleware";
import { logger } from "../config/logger.config";

const router = Router();

// All push routes require authentication
router.use(protect);

// ── POST /register — store a push token ─────────────────────────────
const registerPushSchema = z.object({
  platform: z.enum(["android", "ios"]),
  token: z.string().min(10).max(500),
  deviceId: z.string().max(200).optional(),
  appVersion: z.string().max(20).optional(),
});

router.post("/register", validateRequest(registerPushSchema), async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!user?.id) return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });

    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database unavailable" } });

    const { platform, token, deviceId, appVersion } = req.body;

    // Upsert: if this token already exists (possibly for a different user
    // after re-install), update it to the current user
    const existing = await db
      .select()
      .from(mobilePushTokens)
      .where(eq(mobilePushTokens.token, token))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(mobilePushTokens)
        .set({
          userId: user.id,
          platform,
          deviceId: deviceId || null,
          appVersion: appVersion || null,
          lastSeenAt: new Date(),
        })
        .where(eq(mobilePushTokens.token, token));
    } else {
      await db.insert(mobilePushTokens).values({
        userId: user.id,
        platform,
        token,
        deviceId: deviceId || null,
        appVersion: appVersion || null,
      });
    }

    logger.info(`Push token registered: user=${user.id} platform=${platform}`);
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

// ── DELETE /register — remove a push token ──────────────────────────
const deletePushSchema = z.object({
  token: z.string().min(10).max(500),
});

router.delete("/register", validateRequest(deletePushSchema), async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!user?.id) return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });

    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database unavailable" } });

    const { token } = req.body;

    await db
      .delete(mobilePushTokens)
      .where(and(
        eq(mobilePushTokens.token, token),
        eq(mobilePushTokens.userId, user.id),
      ));

    logger.info(`Push token removed: user=${user.id}`);
    return res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
