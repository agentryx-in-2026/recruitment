// UAT-03 #16 + #19: post-placement support module.
//  - A placed candidate raises a support ISSUE (within the 3-month window) or
//    files a monthly CHECK-IN ("still there / need help").
//  - HPSEDC admin works the queue: lists everything, updates status.
import { Router } from "express";
import { storage } from "../storage";
import { protect } from "../middleware/auth.middleware";
import { candidates, postPlacementSupport, insertPostPlacementSchema, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../config/logger.config";

const router = Router();

async function candidateIdForUser(userId: string): Promise<string | null> {
  const db = storage.db;
  if (!db) return null;
  const rows = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.userId, userId)).limit(1);
  return rows[0]?.id ?? null;
}

// Candidate: raise an issue or file a monthly check-in.
router.post("/", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (user?.role !== "candidate") return res.status(403).json({ success: false, message: "Only candidates can submit post-placement support." });
    const parsed = insertPostPlacementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? "Invalid input", issues: parsed.error.issues });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const candidateId = await candidateIdForUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, message: "Candidate profile not found" });
    const status = parsed.data.kind === "checkin" ? (parsed.data.category === "needs_help" ? "needs_help" : "ok") : "open";
    const inserted = await db.insert(postPlacementSupport).values({
      candidateId,
      placementId: parsed.data.placementId ?? null,
      kind: parsed.data.kind,
      category: parsed.data.category ?? null,
      message: parsed.data.message ?? null,
      country: parsed.data.country ?? null,
      status,
    }).returning();
    res.status(201).json({ success: true, data: inserted[0] });
  } catch (err) { logger.error(`post-placement create: ${err}`); next(err); }
});

// Candidate: my own tickets + check-ins (newest first).
router.get("/my", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const candidateId = await candidateIdForUser(user.id);
    if (!candidateId) return res.json({ success: true, data: [] });
    const rows = await db.select().from(postPlacementSupport).where(eq(postPlacementSupport.candidateId, candidateId)).orderBy(desc(postPlacementSupport.createdAt));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Admin/agent: the whole queue with candidate name/phone for follow-up.
router.get("/", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!["admin", "superadmin", "agent"].includes(user?.role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const rows = await db
      .select({
        id: postPlacementSupport.id, kind: postPlacementSupport.kind, category: postPlacementSupport.category,
        status: postPlacementSupport.status, message: postPlacementSupport.message, country: postPlacementSupport.country,
        createdAt: postPlacementSupport.createdAt, resolvedAt: postPlacementSupport.resolvedAt,
        candidateId: postPlacementSupport.candidateId, candidateName: candidates.fullName, candidatePhone: candidates.phone,
      })
      .from(postPlacementSupport)
      .leftJoin(candidates, eq(postPlacementSupport.candidateId, candidates.id))
      .orderBy(desc(postPlacementSupport.createdAt));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Admin: update status (open → in_progress → resolved).
router.patch("/:id", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!["admin", "superadmin", "agent"].includes(user?.role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const status = String(req.body?.status || "").trim();
    if (!["open", "in_progress", "resolved", "ok", "needs_help"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, message: "No db" });
    const patch: any = { status, updatedAt: new Date() };
    if (status === "resolved") patch.resolvedAt = new Date();
    const updated = await db.update(postPlacementSupport).set(patch).where(eq(postPlacementSupport.id, req.params.id)).returning();
    if (!updated.length) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
});

export default router;
