import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/rbac.middleware";
import { storage } from "../storage";
import { faq, announcements, trainingEvents, countryInfo } from "@shared/schema";
import { eq, and, desc, lte, gte, sql } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { logger } from "../config/logger.config";

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════

// Public: List FAQs (grouped by category)
router.get("/faq", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(faq).where(eq(faq.isActive, true)).orderBy(faq.category, faq.sortOrder);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Admin: Create FAQ
router.post("/faq", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { question, questionHi, answer, answerHi, category, sortOrder } = req.body;
    if (!question || !answer || !category) {
      return res.status(400).json({ success: false, error: { code: 400, message: "question, answer, and category are required" } });
    }

    const result = await db.insert(faq).values({
      question, questionHi, answer, answerHi, category, sortOrder: sortOrder || 0,
    }).returning();

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Update FAQ
router.put("/faq/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(faq).where(eq(faq.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "FAQ not found" } });

    const { question, questionHi, answer, answerHi, category, sortOrder, isActive } = req.body;
    const updates: any = {};
    if (question !== undefined) updates.question = question;
    if (questionHi !== undefined) updates.questionHi = questionHi;
    if (answer !== undefined) updates.answer = answer;
    if (answerHi !== undefined) updates.answerHi = answerHi;
    if (category !== undefined) updates.category = category;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (typeof isActive === "boolean") updates.isActive = isActive;

    const result = await db.update(faq).set(updates).where(eq(faq.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Delete FAQ
router.delete("/faq/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const deleted = await db.delete(faq).where(eq(faq.id, req.params.id)).returning();
    if (!deleted.length) return res.status(404).json({ success: false, error: { code: 404, message: "FAQ not found" } });

    res.json({ success: true, message: "FAQ deleted" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════

// Public: Active announcements for current user's role
router.get("/announcements", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const now = new Date();
    const rows = await db.select().from(announcements)
      .where(
        and(
          lte(announcements.startDate, now),
          sql`(${announcements.endDate} IS NULL OR ${announcements.endDate} >= ${now})`
        )
      )
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt));

    // Filter by role if user is authenticated
    const user = (req as any).user;
    const filtered = rows.filter((a: any) => !a.targetRole || (user && a.targetRole === user.role));

    res.json({ success: true, data: filtered });
  } catch (error) {
    next(error);
  }
});

// Admin: Create announcement
router.post("/announcements", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { title, titleHi, body, bodyHi, targetRole, startDate, endDate, pinned } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, error: { code: 400, message: "title and body are required" } });
    }

    const result = await db.insert(announcements).values({
      title, titleHi, body, bodyHi,
      targetRole: targetRole || null,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      pinned: pinned || false,
      createdBy: (req.user as any).id,
    }).returning();

    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Update announcement
router.put("/announcements/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(announcements).where(eq(announcements.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Announcement not found" } });

    const { title, titleHi, body, bodyHi, targetRole, startDate, endDate, pinned } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (titleHi !== undefined) updates.titleHi = titleHi;
    if (body !== undefined) updates.body = body;
    if (bodyHi !== undefined) updates.bodyHi = bodyHi;
    if (targetRole !== undefined) updates.targetRole = targetRole;
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
    if (typeof pinned === "boolean") updates.pinned = pinned;

    const result = await db.update(announcements).set(updates).where(eq(announcements.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Delete announcement
router.delete("/announcements/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const deleted = await db.delete(announcements).where(eq(announcements.id, req.params.id)).returning();
    if (!deleted.length) return res.status(404).json({ success: false, error: { code: 404, message: "Announcement not found" } });

    res.json({ success: true, message: "Announcement deleted" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// TRAINING EVENTS
// ═══════════════════════════════════════════════════════════════════

// Public: List upcoming events
router.get("/training", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(trainingEvents)
      .where(gte(trainingEvents.date, new Date()))
      .orderBy(trainingEvents.date);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Admin: Create training event
router.post("/training", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { title, description, date, location, virtualLink, targetAudience, maxParticipants } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, error: { code: 400, message: "title and date are required" } });
    }

    const result = await db.insert(trainingEvents).values({
      title, description, date: new Date(date), location, virtualLink,
      targetAudience: targetAudience || null,
      maxParticipants: maxParticipants || null,
      createdBy: (req.user as any).id,
    }).returning();

    logger.info(`Training event created: ${result[0].id}`);
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Update training event
router.put("/training/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select().from(trainingEvents).where(eq(trainingEvents.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 404, message: "Training event not found" } });

    const { title, description, date, location, virtualLink, targetAudience, maxParticipants } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (date !== undefined) updates.date = new Date(date);
    if (location !== undefined) updates.location = location;
    if (virtualLink !== undefined) updates.virtualLink = virtualLink;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (maxParticipants !== undefined) updates.maxParticipants = maxParticipants;

    const result = await db.update(trainingEvents).set(updates).where(eq(trainingEvents.id, req.params.id)).returning();
    res.json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// Admin: Delete training event
router.delete("/training/:id", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const deleted = await db.delete(trainingEvents).where(eq(trainingEvents.id, req.params.id)).returning();
    if (!deleted.length) return res.status(404).json({ success: false, error: { code: 404, message: "Training event not found" } });

    res.json({ success: true, message: "Training event deleted" });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════
// Save an announcement into a user's saved notifications
// ═══════════════════════════════════════════════════════════════════

// POST /api/v1/content/announcements/:id/save
// Creates a pre-saved notification row for the current user mirroring the
// announcement, so it shows up in their Saved tab in the drawer.
// Idempotent: if already saved, returns the existing row.
router.post("/announcements/:id/save", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ success: false, error: { code: 401, message: "Not signed in" } });

    const { notifications: notifTable } = await import("@shared/schema");
    const { isNotNull } = await import("drizzle-orm");

    const [ann] = await db.select().from(announcements).where(eq(announcements.id, req.params.id)).limit(1);
    if (!ann) return res.status(404).json({ success: false, error: { code: 404, message: "Announcement not found" } });

    // Dedupe: if a saved notif mirroring this announcement already exists,
    // return it instead of duplicating.
    const existing = await db.select().from(notifTable)
      .where(and(
        eq(notifTable.userId, userId),
        eq(notifTable.type, "announcement"),
        isNotNull(notifTable.savedAt),
        sql`${notifTable.metadata}->>'announcementId' = ${ann.id}`,
      ))
      .limit(1);
    if (existing.length > 0) {
      return res.json({ success: true, data: existing[0], deduped: true });
    }

    const [row] = await db.insert(notifTable).values({
      userId,
      type: "announcement",
      title: ann.title,
      message: ann.body,
      severity: (ann as any).severity ?? "info",
      savedAt: new Date(),
      read: true,              // they just clicked save, it's read
      metadata: { announcementId: ann.id, pinned: !!ann.pinned } as any,
    }).returning();

    logger.info(`Announcement ${ann.id} saved to inbox for user ${userId}`);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// COUNTRY INFO — per-destination reference card shown on every overseas
// job (embassy contact, visa timeline, labor-law summary, cost-of-living,
// climate). Public GETs; admin PUT to edit copy.
// ═══════════════════════════════════════════════════════════════════

// Public list (used by admin UI + by job-create dropdowns) + per-country GET
// keyed by ISO code OR by freetext country name (job records store free-text
// country names). `?activeOnly=true` filters to enabled rows — that's the
// query the job-create dropdowns use; the admin Countries panel uses the
// unfiltered list so disabled rows can still be re-enabled.
router.get("/countries", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const activeOnly = String(req.query.activeOnly || "").toLowerCase() === "true";
    let rows;
    if (activeOnly) {
      rows = await db.select().from(countryInfo)
        .where(eq(countryInfo.isActive, true))
        .orderBy(countryInfo.name);
    } else {
      rows = await db.select().from(countryInfo).orderBy(countryInfo.name);
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.get("/countries/:key", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const raw = String(req.params.key || "").trim();
    if (!raw) return res.status(400).json({ success: false, message: "country key required" });

    // Try ISO code first (uppercase), then case-insensitive name match.
    const byCode = await db.select().from(countryInfo).where(eq(countryInfo.code, raw.toUpperCase())).limit(1);
    if (byCode.length) return res.json({ success: true, data: byCode[0] });

    const byName = await db.select().from(countryInfo).where(sql`LOWER(${countryInfo.name}) = LOWER(${raw})`).limit(1);
    if (byName.length) return res.json({ success: true, data: byName[0] });

    return res.status(404).json({ success: false, error: { code: 404, message: "Country info not available yet" } });
  } catch (err) { next(err); }
});

router.put("/countries/:code", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const code = String(req.params.code || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      return res.status(400).json({ success: false, message: "code must be a 2-letter ISO 3166 alpha-2 (e.g. NL, CH, KE)" });
    }
    const body = req.body ?? {};
    const patch: any = { updatedAt: new Date(), updatedBy: (req.user as any)?.id };
    for (const f of ["name","embassyPhone","embassyEmail","embassyAddress","embassyWebsite",
                     "minWageNote","laborLawSummary","costOfLivingNote","climateNote","entryRequirements","emergencyContact"]) {
      if (typeof body[f] === "string") patch[f] = body[f];
    }
    if (typeof body.visaTimelineDays === "number") patch.visaTimelineDays = body.visaTimelineDays;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    // audit 2026-07-06 (Batch 4B): ECR-destination flag (foundation for the
    // eMigrate/PoE checklist step + reporting export in Wave 2).
    if (typeof body.isEcrCountry === "boolean") patch.isEcrCountry = body.isEcrCountry;

    // Guard: reject creating "India" as a destination — overseas portal scope.
    const nameForCheck = String(patch.name ?? "").trim().toLowerCase();
    if (nameForCheck === "india") {
      return res.status(400).json({
        success: false,
        message: "HireStream is the overseas placement portal — India cannot be added as a destination country.",
      });
    }

    const [existing] = await db.select().from(countryInfo).where(eq(countryInfo.code, code)).limit(1);
    let row;
    if (existing) {
      [row] = await db.update(countryInfo).set(patch).where(eq(countryInfo.code, code)).returning();
    } else {
      if (!patch.name) return res.status(400).json({ success: false, message: "name required when creating" });
      [row] = await db.insert(countryInfo).values({ code, ...patch }).returning();
    }
    // Refresh the in-memory country validator cache so the new/renamed/toggled
    // country is immediately valid for job-create without an app restart.
    const { loadValidCountries } = await import("../services/country-validator.service");
    loadValidCountries().catch(() => {});
    return res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// Soft-disable a country (mirrors PUT with isActive=false; kept as a separate
// endpoint for clarity in the admin UI's "Disable destination" button).
router.delete("/countries/:code", protect, requireRole(["admin"]), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const code = String(req.params.code || "").toUpperCase();
    const [row] = await db.update(countryInfo)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: (req.user as any)?.id })
      .where(eq(countryInfo.code, code))
      .returning();
    if (!row) return res.status(404).json({ success: false, message: "country not found" });

    const { loadValidCountries } = await import("../services/country-validator.service");
    loadValidCountries().catch(() => {});
    return res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

export default router;
