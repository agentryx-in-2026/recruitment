import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { notifications, users } from "@shared/schema";
import { eq, desc, and, count, sql, isNull, isNotNull } from "drizzle-orm";

const router = Router();

// ── List Notifications (with pagination + type filter) ──────────────
router.get("/", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const {
      type,           // filter by type
      unreadOnly,     // "true" to show only unread
      view,           // "active" | "saved" | "all" — default "active" for the drawer
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(notifications.userId, userId)];

    // View filter (PWS notification drawer)
    const v = (view as string) || "active";
    if (v === "active") {
      // Active = not dismissed AND not saved. Saving a notification moves it OUT
      // of the active queue into the Saved tab (it no longer shows in Active).
      conditions.push(isNull(notifications.dismissedAt));
      conditions.push(isNull(notifications.savedAt));
    } else if (v === "saved") {
      conditions.push(isNull(notifications.dismissedAt));
      conditions.push(isNotNull(notifications.savedAt));
    }
    // v === "all" → no extra filter

    if (type && typeof type === "string") {
      conditions.push(eq(notifications.type, type));
    }

    if (unreadOnly === "true") {
      conditions.push(eq(notifications.read, false));
    }

    const whereClause = and(...conditions);

    const totalResult = await db.select({ c: count() }).from(notifications).where(whereClause);
    const total = totalResult[0]?.c ?? 0;

    // Unread count: only ACTIVE (non-dismissed, non-saved) unread — saved items
    // are triaged aside and shouldn't keep the bell badge lit.
    const unreadResult = await db.select({ c: count() }).from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.read, false),
        isNull(notifications.dismissedAt),
        isNull(notifications.savedAt),
      ));
    const unreadCount = unreadResult[0]?.c ?? 0;

    // Saved count for drawer tab badge
    const savedResult = await db.select({ c: count() }).from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        isNull(notifications.dismissedAt),
        isNotNull(notifications.savedAt),
      ));
    const savedCount = savedResult[0]?.c ?? 0;

    const rows = await db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      success: true,
      data: rows,
      unreadCount: Number(unreadCount),
      savedCount: Number(savedCount),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Mark Single Notification as Read ────────────────────────────────
router.patch("/:id/read", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;

    const updated = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Notification not found" } });
    }

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    next(err);
  }
});

// ── Mark All as Read ────────────────────────────────────────────────
router.post("/mark-all-read", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;

    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// ── Get Notification Preferences ────────────────────────────────────
router.get("/preferences", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userRows.length) {
      return res.status(404).json({ success: false, error: { code: 404, message: "User not found" } });
    }

    const user = userRows[0];
    res.json({
      success: true,
      data: {
        email: user.notifyEmail ?? true,
        sms: user.notifySms ?? true,
        inApp: user.notifyInApp ?? true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Update Notification Preferences ─────────────────────────────────
router.patch("/preferences", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;
    const { email, sms, inApp } = req.body;

    const updates: any = {};
    if (typeof email === "boolean") updates.notifyEmail = email;
    if (typeof sms === "boolean") updates.notifySms = sms;
    if (typeof inApp === "boolean") updates.notifyInApp = inApp;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "Provide at least one preference: email, sms, or inApp" } });
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    res.json({ success: true, data: { email: updates.notifyEmail, sms: updates.notifySms, inApp: updates.notifyInApp }, message: "Preferences updated" });
  } catch (err) {
    next(err);
  }
});

// ── Dismiss (user hit ×) — never resurfaces in Active view ──────────
router.post("/:id/dismiss", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    const updated = await db
      .update(notifications)
      .set({ dismissedAt: new Date(), read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .returning();
    if (!updated.length) return res.status(404).json({ success: false, error: { code: 404, message: "Notification not found" } });
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
});

// ── Save / Unsave (bookmark for later) ──────────────────────────────
router.post("/:id/save", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    const [current] = await db.select().from(notifications)
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .limit(1);
    if (!current) return res.status(404).json({ success: false, error: { code: 404, message: "Notification not found" } });
    const nextSaved = current.savedAt ? null : new Date();
    const [updated] = await db
      .update(notifications)
      .set({ savedAt: nextSaved })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .returning();
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Mark ALL active notifications as read (lightweight; doesn't dismiss) ─
// Existing /mark-all-read kept. Adding /dismiss-all so a user can clear the inbox.
router.post("/dismiss-all", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    await db.update(notifications)
      .set({ dismissedAt: new Date(), read: true })
      .where(and(
        eq(notifications.userId, userId),
        isNull(notifications.dismissedAt),
        isNull(notifications.savedAt),  // never auto-dismiss saved items
      ));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Delete a Notification ───────────────────────────────────────────
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const userId = (req.user as any)?.id;

    const deleted = await db
      .delete(notifications)
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)))
      .returning();

    if (!deleted.length) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Notification not found" } });
    }

    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
