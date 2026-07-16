/**
 * Mobile Config Routes — /api/v1/mobile/*
 *
 * Utility endpoints for mobile clients:
 *   GET /version  — force-update kill switch
 *   GET /config   — feature flags exposed to mobile
 *
 * These are public (no auth required) so the app can check them before login.
 *
 * See: /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §2
 */

import { Router } from "express";
import { env, features } from "../config/env.config";

const router = Router();

// ── GET /version ────────────────────────────────────────────────────
// Returns the minimum supported version and latest version so the mobile
// app can decide whether to force-update, soft-prompt, or do nothing.
router.get("/version", (_req, res) => {
  res.json({
    success: true,
    data: {
      minSupported: env.MOBILE_MIN_SUPPORTED_VERSION,
      latest: env.MOBILE_LATEST_VERSION,
      // forceUpdate is a convenience flag for the client:
      // if the client's version < minSupported, show a blocking screen.
      // The client still needs to compare itself; this is a hint.
      forceUpdate: false,
    },
  });
});

// ── GET /config ─────────────────────────────────────────────────────
// Feature flags exposed to mobile. The app uses these to show/hide UI
// elements without requiring a new build.
router.get("/config", (_req, res) => {
  res.json({
    success: true,
    data: {
      flags: {
        multilingualEnabled: false,    // English-only in v1.0
        photoUploadEnabled: true,
        documentUploadEnabled: true,
        himAccessSsoEnabled: features.himAccess,
        aadhaarVerificationEnabled: features.uidai,
        digilockerEnabled: features.digilocker,
        pushNotificationsEnabled: features.fcm,
      },
    },
  });
});

// ── GET /profile ────────────────────────────────────────────────────
// Returns the authenticated user's profile for the mobile Profile screen.
//
// HIST: the original implementation read req.user.fullName, but `users`
// doesn't have a fullName column — the candidate's name lives on
// `candidates.full_name`. The endpoint silently fell back to username
// (email) and the mobile UI never displayed the real name. Fixed in
// v0.4.11.0 — joins the role-specific table to return canonical data.
router.get("/profile", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }
  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    // For candidates, the displayable identity (name, phone, location, skills)
    // lives on the candidates row, NOT on users. Join + merge so the client
    // sees one flat object.
    let candidateExtras: any = {};
    if (req.user.role === "candidate") {
      const { candidates } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [c] = await db.select().from(candidates).where(eq(candidates.userId, req.user.id)).limit(1);
      if (c) {
        candidateExtras = {
          fullName: c.fullName,
          phoneNumber: c.phone,
          location: c.location,
          experience: c.experience,
          skills: c.skills,
          preferredCountries: c.preferredCountries,
          photoUrl: c.photoUrl,
        };
      }
    }

    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        preferredLanguage: req.user.preferredLanguage || "en",
        aadhaarVerified: req.user.aadhaarVerified || false,
        twoFactorEnabled: req.user.twoFactorEnabled || false,
        isActive: req.user.isActive,
        // Candidate-specific fields (empty object for non-candidates so the
        // mobile client doesn't crash on undefined access).
        fullName: candidateExtras.fullName || req.user.username,
        phoneNumber: candidateExtras.phoneNumber || req.user.phoneNumber || null,
        location: candidateExtras.location || null,
        experience: candidateExtras.experience ?? null,
        skills: candidateExtras.skills || [],
        preferredCountries: candidateExtras.preferredCountries || [],
        photoUrl: candidateExtras.photoUrl || null,
      },
    });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});

// ── GET /notifications ──────────────────────────────────────────────
// Returns the authenticated user's notifications from the database,
// ordered by most recent first.
router.get("/notifications", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }

  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const { notifications } = await import("@shared/schema");
    const { eq, desc } = await import("drizzle-orm");

    let items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    // Auto-seed a welcome notification on first visit
    if (items.length === 0) {
      const welcome = {
        userId: req.user.id,
        type: "system",
        title: "Welcome to HireStream!",
        message: "Your account is set up. Start browsing overseas job opportunities from HPSEDC.",
        severity: "info",
      };
      const profileTip = {
        userId: req.user.id,
        type: "info",
        title: "Complete Your Profile",
        message: "Add your education, work experience, and documents for better job matches.",
        severity: "info",
      };
      await db.insert(notifications).values([welcome, profileTip]);
      items = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
    }

    // Map DB field names to what the mobile client expects
    const mapped = items.map((n: any) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.read ?? false,
      severity: n.severity,
      metadata: n.metadata,
      createdAt: n.createdAt?.toISOString(),
    }));

    res.json({ success: true, data: { notifications: mapped } });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});
// ── PATCH /profile ──────────────────────────────────────────────────
// Update the authenticated user's profile fields.
//
// Each field is routed to the correct table:
//   fullName / phoneNumber / location → candidates table (for candidate role)
//   preferredLanguage                  → users table (universal)
//
// HIST: until v0.4.11.0 this endpoint ran `UPDATE users SET fullName = …`
// against a column that doesn't exist. Drizzle silently no-op'd, the
// endpoint returned success, and the mobile UI showed "Saved" while the
// DB row never changed. Fixed by routing each field to its canonical table.
router.patch("/profile", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }

  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const { users, candidates } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    // Split the inbound payload into user-table fields vs candidate-table
    // fields. Whitelisted to avoid accidental writes (no role, no id).
    const userUpdates: Record<string, any> = {};
    const candidateUpdates: Record<string, any> = {};

    if (typeof req.body.preferredLanguage === "string") {
      userUpdates.preferredLanguage = req.body.preferredLanguage;
    }

    if (req.user.role === "candidate") {
      if (typeof req.body.fullName === "string" && req.body.fullName.trim().length >= 2) {
        candidateUpdates.fullName = req.body.fullName.trim();
      }
      if (typeof req.body.phoneNumber === "string") {
        // Same regex as the web profile route (HTIS BUG-002) — digits only,
        // optional +country / spaces / dashes. Empty string clears the field.
        const phone = req.body.phoneNumber.trim();
        if (phone === "" || /^\+?[0-9][0-9\s\-]{5,18}[0-9]$/.test(phone)) {
          candidateUpdates.phone = phone || null;
        } else {
          return res.status(400).json({ success: false, error: { code: 400, message: "Phone must be digits only (optionally with +country code, spaces, or dashes). Example: +91 9876543210" } });
        }
      }
      if (typeof req.body.location === "string") {
        candidateUpdates.location = req.body.location.trim();
      }
    }

    if (Object.keys(userUpdates).length === 0 && Object.keys(candidateUpdates).length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No valid fields to update" } });
    }

    if (Object.keys(userUpdates).length > 0) {
      await db.update(users).set(userUpdates).where(eq(users.id, req.user.id));
    }
    if (Object.keys(candidateUpdates).length > 0) {
      // Update the candidate row in place. Don't create one if missing —
      // the registration flow already creates it, and we don't want silent
      // row-creation here.
      await db.update(candidates).set(candidateUpdates).where(eq(candidates.userId, req.user.id));
    }

    // Re-read so the client sees the canonical post-update state (including
    // any default fills / trims) — no more "looks saved but isn't" UX.
    let candidateRow: any = null;
    if (req.user.role === "candidate") {
      const [c] = await db.select().from(candidates).where(eq(candidates.userId, req.user.id)).limit(1);
      candidateRow = c;
    }

    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        preferredLanguage: userUpdates.preferredLanguage ?? req.user.preferredLanguage ?? "en",
        fullName: candidateRow?.fullName ?? req.user.username,
        phoneNumber: candidateRow?.phone ?? null,
        location: candidateRow?.location ?? null,
      },
    });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});

// ── PATCH /notifications/read-all ───────────────────────────────────
// Mark ALL notifications for the authenticated user as read.
router.patch("/notifications/read-all", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }
  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const { notifications } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, req.user.id), eq(notifications.read, false)));

    res.json({ success: true, data: { message: "All notifications marked as read" } });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});

// ── PATCH /notifications/:id/read ───────────────────────────────────
// Mark a notification as read in the database.
router.patch("/notifications/:id/read", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }
  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const { notifications } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user.id)));

    res.json({ success: true, data: { id: req.params.id, isRead: true } });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});

// ── DELETE /account ─────────────────────────────────────────────────
// Permanently delete the authenticated user's account. Required by
// Play Store + App Store policies.
//
// HIST: v0.4.12.0 fix — the previous version called
//   `UPDATE users SET fullName = "Deleted User", phoneNumber = null`
// but `users` has neither column. Drizzle silently no-op'd those two
// fields, so the candidate's real name + phone survived on the
// `candidates` row after "deletion". This was a real PII / Play Store
// compliance issue. Now: anonymize both users AND the role-specific row.
router.delete("/account", async (req: any, res, next: any) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 401, message: "Not authenticated" } });
  }

  try {
    const { storage } = await import("../storage");
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const { users, candidates } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    // Soft-delete the users row — only fields that actually exist on that
    // table. (No fullName / phoneNumber columns there — those live on the
    // role-specific tables.)
    await db.update(users).set({
      isActive: false,
      email: `deleted-${req.user.id}@hirestream.deleted`,
      username: `deleted-${req.user.id}`,
    }).where(eq(users.id, req.user.id));

    // Anonymize the candidate row if one exists. We null out every PII
    // field but keep the row + its FK chain (applications, education,
    // experience, documents, placements) so audit history isn't broken.
    // The candidate's name becomes "Deleted Candidate" so any historical
    // display surface (admin views, audit trail) reads coherently.
    if (req.user.role === "candidate") {
      await db.update(candidates).set({
        fullName: "Deleted Candidate",
        email: `deleted-${req.user.id}@hirestream.deleted`,
        phone: null,
        location: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        pinCode: null,
        passportNumber: null,
        photoUrl: null,
        skills: [],
        preferredCountries: [],
      }).where(eq(candidates.userId, req.user.id));
    }

    res.json({ success: true, data: { message: "Account deleted successfully" } });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked DB/internal detail to the client.
    next(err);
  }
});

export default router;
