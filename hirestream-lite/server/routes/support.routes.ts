// HP-6: "Ask HPSEDC" — an async support message thread, distinct from the formal
// Grievance channel. Candidate posts a message; HPSEDC answers from the admin
// inbox. Structured so a Responder (human today, Claude later) or a WhatsApp
// transport can plug in without changing this model.
import { Router } from "express";
import { storage } from "../storage";
import { protect } from "../middleware/auth.middleware";
import { candidates, supportMessages } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { notify } from "../services/notification.service";
import { logger } from "../config/logger.config";

const router = Router();

async function candidateIdForUser(userId: string): Promise<string | null> {
  const db = storage.db;
  if (!db) return null;
  const r = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.userId, userId)).limit(1);
  return r[0]?.id ?? null;
}

// Candidate: post a message to HPSEDC.
router.post("/messages", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (user?.role !== "candidate") return res.status(403).json({ success: false, message: "Only candidates can send support messages." });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ success: false, message: "Message is required" });
    if (body.length > 2000) return res.status(400).json({ success: false, message: "Message is too long" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const candidateId = await candidateIdForUser(user.id);
    if (!candidateId) return res.status(404).json({ success: false, message: "Candidate profile not found" });
    const [row] = await db.insert(supportMessages).values({
      candidateId, senderRole: "candidate", senderUserId: user.id, body, readByAdmin: false, readByCandidate: true,
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (err) { logger.error(`support post: ${err}`); next(err); }
});

// Candidate: my thread (oldest → newest for chat rendering).
router.get("/messages/my", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const candidateId = await candidateIdForUser(user.id);
    if (!candidateId) return res.json({ success: true, data: [] });
    const rows = await db.select().from(supportMessages).where(eq(supportMessages.candidateId, candidateId)).orderBy(supportMessages.createdAt);
    // mark HPSEDC replies as read by the candidate
    await db.update(supportMessages).set({ readByCandidate: true })
      .where(and(eq(supportMessages.candidateId, candidateId), eq(supportMessages.senderRole, "hpsedc")));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Candidate: unread reply count (for a badge).
router.get("/messages/unread", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const candidateId = await candidateIdForUser(user.id);
    if (!candidateId) return res.json({ success: true, data: { unread: 0 } });
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(supportMessages)
      .where(and(eq(supportMessages.candidateId, candidateId), eq(supportMessages.senderRole, "hpsedc"), eq(supportMessages.readByCandidate, false)));
    res.json({ success: true, data: { unread: r?.n ?? 0 } });
  } catch (err) { next(err); }
});

// Admin/agent: list threads (one row per candidate: latest message + unread count).
router.get("/threads", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!["admin", "superadmin", "agent"].includes(user?.role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const rows = await db.execute(sql`
      SELECT m.candidate_id,
             c.full_name AS candidate_name, c.phone AS candidate_phone,
             (SELECT body FROM support_messages x WHERE x.candidate_id = m.candidate_id ORDER BY created_at DESC LIMIT 1) AS last_message,
             MAX(m.created_at) AS last_at,
             COUNT(*) FILTER (WHERE m.sender_role = 'candidate' AND m.read_by_admin = false)::int AS unread
      FROM support_messages m LEFT JOIN candidates c ON c.id = m.candidate_id
      GROUP BY m.candidate_id, c.full_name, c.phone
      ORDER BY last_at DESC`);
    res.json({ success: true, data: (rows as any).rows ?? rows });
  } catch (err) { next(err); }
});

// Admin/agent: full thread for a candidate (+ mark candidate messages read).
router.get("/threads/:candidateId", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!["admin", "superadmin", "agent"].includes(user?.role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const rows = await db.select().from(supportMessages).where(eq(supportMessages.candidateId, req.params.candidateId)).orderBy(supportMessages.createdAt);
    await db.update(supportMessages).set({ readByAdmin: true })
      .where(and(eq(supportMessages.candidateId, req.params.candidateId), eq(supportMessages.senderRole, "candidate")));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Admin/agent: reply to a candidate (notifies the candidate).
router.post("/threads/:candidateId/reply", protect, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!["admin", "superadmin", "agent"].includes(user?.role)) return res.status(403).json({ success: false, message: "Forbidden" });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ success: false, message: "Reply is required" });
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false });
    const [row] = await db.insert(supportMessages).values({
      candidateId: req.params.candidateId, senderRole: "hpsedc", senderUserId: user.id, body, readByAdmin: true, readByCandidate: false,
    }).returning();
    // notify the candidate
    const [cand] = await db.select({ userId: candidates.userId }).from(candidates).where(eq(candidates.id, req.params.candidateId)).limit(1);
    if (cand?.userId) {
      notify({ userId: cand.userId, type: "support_reply", title: "HPSEDC replied to your message",
        message: body.slice(0, 140), severity: "info", metadata: { channel: "support" } }).catch(() => {});
    }
    res.status(201).json({ success: true, data: row });
  } catch (err) { logger.error(`support reply: ${err}`); next(err); }
});

export default router;
