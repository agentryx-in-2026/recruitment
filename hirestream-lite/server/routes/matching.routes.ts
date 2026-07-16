/**
 * v0.4.33 (Phase 3): Public matching-engine metadata endpoint + admin
 * test-preview endpoint.
 *
 * - GET /api/v1/matching/version
 *   Read-only metadata about the live engine: version, weights, policy,
 *   threshold, IELTS country list. Anyone can hit it (used by client UIs
 *   to render the explainability panel labels correctly when weights are
 *   tuned). Not gated by role.
 *
 * - POST /api/v1/matching/preview
 *   Admin-only. Pass { candidateId, jobId } and get the live breakdown
 *   that the engine would compute right now — used by the Parameters
 *   Module's "Live preview" panel so admin can see weight changes in
 *   action against real data.
 */
import { Router } from "express";
import { storage } from "../storage";
import { protect } from "../middleware/auth.middleware";
import { candidates, jobs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { calculateMatchBreakdown, getEngineVersionInfo } from "../services/matching.service";

const router = Router();

router.get("/version", async (_req, res, next) => {
  try {
    const info = await getEngineVersionInfo();
    res.json({ success: true, data: info });
  } catch (err) { next(err); }
});

router.post("/preview", protect, async (req, res, next) => {
  try {
    const user = (req.user as any);
    if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Admin-only" });
    }
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const { candidateId, jobId } = req.body || {};
    if (!candidateId || !jobId) {
      return res.status(400).json({ success: false, error: { code: 400, message: "candidateId and jobId required" } });
    }
    const [c] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
    const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!c || !j) return res.status(404).json({ success: false, message: "Candidate or job not found" });
    const bd = await calculateMatchBreakdown(c, j);
    res.json({ success: true, data: bd });
  } catch (err) { next(err); }
});

export default router;
