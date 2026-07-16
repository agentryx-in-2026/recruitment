import { Router } from "express";
import { protect } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { storage } from "../../storage";
import { auditLog, users } from "@shared/schema";
import { eq, and, desc, count, like } from "drizzle-orm";

const router = Router();
router.use(protect);
router.use(requireRole(["admin"]));

// ── List Audit Log (with filters + pagination) ──────────────────────
router.get("/", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const { action, resourceType, userId, prefix, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [];
    if (action && typeof action === "string") conditions.push(eq(auditLog.action, action));
    if (resourceType && typeof resourceType === "string") conditions.push(eq(auditLog.resourceType, resourceType));
    if (userId && typeof userId === "string") conditions.push(eq(auditLog.userId, userId));
    // v0.4.33 (Phase 3): allow filtering by resourceId prefix so the
    // Matching Engine audit panel can scope to `matching.*` settings.
    if (prefix && typeof prefix === "string") conditions.push(like(auditLog.resourceId, `${prefix}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await db.select({ c: count() }).from(auditLog).where(whereClause);
    const total = totalResult[0]?.c ?? 0;

    const rows = await db
      .select()
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      success: true,
      data: rows,
      pagination: { page: pageNum, limit: limitNum, total: Number(total), totalPages: Math.ceil(Number(total) / limitNum) },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
