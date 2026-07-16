/**
 * Candidate saved searches + digest scheduling.
 * Endpoints are candidate-only (role check in protect middleware).
 */

import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { savedSearches } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();
router.use(protect);
router.use((req, res, next) => {
  const user = (req as any).user;
  if (user.role !== "candidate") {
    return res.status(403).json({ success: false, message: "Candidate only" });
  }
  next();
});

// GET /api/v1/me/saved-searches
router.get("/", async (req, res, next) => {
  try {
    const user = (req as any).user;
    const db = storage.db!;
    const rows = await db.select().from(savedSearches)
      .where(eq(savedSearches.userId, user.id))
      .orderBy(desc(savedSearches.createdAt));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/v1/me/saved-searches
router.post("/", async (req, res, next) => {
  try {
    const user = (req as any).user;
    const db = storage.db!;
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    const filters = req.body?.filters ?? {};
    const frequency = ["daily", "weekly", "off"].includes(req.body?.frequency) ? req.body.frequency : "weekly";
    if (!name) return res.status(400).json({ success: false, message: "name required" });

    // Cap at 10 saved searches per user so UI and cron stay fast.
    const existing = await db.select().from(savedSearches).where(eq(savedSearches.userId, user.id));
    if (existing.length >= 10) {
      return res.status(400).json({ success: false, message: "Maximum of 10 saved searches. Delete one to add another." });
    }

    const [row] = await db.insert(savedSearches).values({
      userId: user.id, name, filters, frequency,
    }).returning();
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// PATCH /api/v1/me/saved-searches/:id (rename or change frequency)
router.patch("/:id", async (req, res, next) => {
  try {
    const user = (req as any).user;
    const db = storage.db!;
    const patch: any = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name.slice(0, 80);
    if (["daily", "weekly", "off"].includes(req.body?.frequency)) patch.frequency = req.body.frequency;
    if (req.body?.filters) patch.filters = req.body.filters;
    if (Object.keys(patch).length === 0) return res.status(400).json({ success: false, message: "no fields to update" });
    const [row] = await db.update(savedSearches).set(patch)
      .where(and(eq(savedSearches.id, req.params.id), eq(savedSearches.userId, user.id)))
      .returning();
    if (!row) return res.status(404).json({ success: false });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// DELETE /api/v1/me/saved-searches/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const user = (req as any).user;
    const db = storage.db!;
    await db.delete(savedSearches)
      .where(and(eq(savedSearches.id, req.params.id), eq(savedSearches.userId, user.id)));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
