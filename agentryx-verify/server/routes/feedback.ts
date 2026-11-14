import { Router } from "express";
import { db } from "../config/db";
import {
  feedbackItems, feedbackComments, reviewers, attachments,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { feedbackUploader } from "../middleware/upload";

export const feedbackRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────

async function currentReviewer(reviewerId: string) {
  const [r] = await db.select().from(reviewers).where(eq(reviewers.id, reviewerId));
  return r;
}

function isAdmin(r: { role?: string | null }) {
  return r?.role === "admin";
}

function canTriage(r: { role?: string | null }) {
  // Admin can change status/assignment. Agentryx (delivery team) can also triage
  // — they're the ones most likely to convert feedback into backlog items.
  return r?.role === "admin" || r?.role === "delivery" || r?.role === "agentryx";
}

// Generate next reference code like FB-2026-0001. Uses year of creation and
// a monotonic counter within that year.
async function nextReferenceCode(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `FB-${year}-`;
  const rows = await db.select({ code: feedbackItems.referenceCode })
    .from(feedbackItems)
    .where(sql`${feedbackItems.referenceCode} LIKE ${prefix + "%"}`);
  let maxN = 0;
  for (const r of rows) {
    const m = r.code.match(/^FB-\d{4}-(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxN + 1).padStart(4, "0")}`;
}

// ── Submit a new feedback item ──────────────────────────────────────
feedbackRouter.post("/", requireAuth, async (req, res) => {
  const reviewerId = req.session.reviewerId!;
  const { projectId, type, title, description, area, similarTo, priority, linkedToItemRef } = req.body ?? {};

  // Basic server-side validation — matches the UI form rules.
  if (!type || !title || !description) {
    return res.status(400).json({ error: "type, title, and description are required" });
  }
  const allowedTypes = ["new_feature", "enhancement", "bug", "ux", "similar_sw", "other"];
  if (!allowedTypes.includes(type)) return res.status(400).json({ error: "Invalid type" });
  if ((title as string).length < 5 || (title as string).length > 150) {
    return res.status(400).json({ error: "Title must be 5–150 characters" });
  }
  if ((description as string).length < 20 || (description as string).length > 4000) {
    return res.status(400).json({ error: "Description must be 20–4000 characters" });
  }
  if (type === "similar_sw" && !similarTo) {
    return res.status(400).json({ error: "similarTo is required when type is similar_sw" });
  }

  const referenceCode = await nextReferenceCode();
  const [row] = await db.insert(feedbackItems).values({
    referenceCode,
    projectId: projectId ?? null,
    submitterReviewerId: reviewerId,
    type,
    title: (title as string).trim(),
    description: (description as string).trim(),
    area: area ?? null,
    similarTo: type === "similar_sw" ? similarTo : null,
    priority: ["low", "normal", "high", "critical"].includes(priority) ? priority : "normal",
    linkedToItemRef: linkedToItemRef ? String(linkedToItemRef).slice(0, 24) : null,
  }).returning();

  res.status(201).json(row);
});

// ── List feedback (scoped to a project, or all) ─────────────────────
// Admin/delivery/agentryx see everything. Other reviewers see only their own
// submissions — protects a reviewer from seeing another reviewer's draft ideas.
feedbackRouter.get("/", requireAuth, async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });

  const { projectId, status, type, mine } = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (projectId) conditions.push(eq(feedbackItems.projectId, projectId));
  if (status) conditions.push(eq(feedbackItems.status, status as any));
  if (type) conditions.push(eq(feedbackItems.type, type as any));

  // Scope visibility
  if (!canTriage(me) || mine === "1") {
    conditions.push(eq(feedbackItems.submitterReviewerId, me.id));
  }

  const rows = await db.select().from(feedbackItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(feedbackItems.createdAt));

  // Join submitter name + attachments count so the list view doesn't need N+1s.
  const subIds = Array.from(new Set(rows.map((r) => r.submitterReviewerId)));
  const subs = subIds.length
    ? await db.select({ id: reviewers.id, name: reviewers.name, role: reviewers.role })
        .from(reviewers).where(inArray(reviewers.id, subIds))
    : [];
  const subByIdx = Object.fromEntries(subs.map((s) => [s.id, s]));

  const ids = rows.map((r) => r.id);
  const atts = ids.length
    ? await db.select().from(attachments)
        .where(and(eq(attachments.ownerType, "feedback"), inArray(attachments.ownerId, ids)))
    : [];
  const attCount: Record<string, number> = {};
  for (const a of atts) attCount[a.ownerId] = (attCount[a.ownerId] ?? 0) + 1;

  res.json(rows.map((r) => ({
    ...r,
    submitter: subByIdx[r.submitterReviewerId] ?? null,
    attachmentCount: attCount[r.id] ?? 0,
  })));
});

// ── Stats for the dashboard card ────────────────────────────────────
feedbackRouter.get("/stats", requireAuth, async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });

  const { projectId } = req.query as Record<string, string | undefined>;
  const conds: any[] = [];
  if (projectId) conds.push(eq(feedbackItems.projectId, projectId));
  // Mirror the list endpoint's visibility scoping so the dashboard count never
  // disagrees with the inbox: non-triage reviewers count only their own.
  if (!canTriage(me)) conds.push(eq(feedbackItems.submitterReviewerId, me.id));
  const rows = await db.select({ status: feedbackItems.status })
    .from(feedbackItems)
    .where(conds.length ? and(...conds) : undefined);
  const counts: Record<string, number> = { submitted: 0, triaged: 0, planned: 0, in_progress: 0, shipped: 0, declined: 0, duplicate: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  res.json({ total: rows.length, byStatus: counts });
});

// ── Detail: feedback item + comments + attachments ─────────────────
feedbackRouter.get("/:id", requireAuth, async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });

  const [item] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });

  // Submitters can always read their own items. Non-triagers can't read others'.
  if (!canTriage(me) && item.submitterReviewerId !== me.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const [submitter] = await db.select({ id: reviewers.id, name: reviewers.name, role: reviewers.role })
    .from(reviewers).where(eq(reviewers.id, item.submitterReviewerId));
  const assigned = item.assignedToId
    ? (await db.select({ id: reviewers.id, name: reviewers.name, role: reviewers.role })
        .from(reviewers).where(eq(reviewers.id, item.assignedToId)))[0]
    : null;
  const thread = await db.select().from(feedbackComments)
    .where(eq(feedbackComments.feedbackId, item.id))
    .orderBy(asc(feedbackComments.createdAt));
  const commenterIds = Array.from(new Set(thread.map((c) => c.reviewerId)));
  const commenters = commenterIds.length
    ? await db.select({ id: reviewers.id, name: reviewers.name, role: reviewers.role })
        .from(reviewers).where(inArray(reviewers.id, commenterIds))
    : [];
  const commenterByIdx = Object.fromEntries(commenters.map((c) => [c.id, c]));
  const threadWithNames = thread.map((c) => ({ ...c, reviewer: commenterByIdx[c.reviewerId] ?? null }));

  const atts = await db.select().from(attachments)
    .where(and(eq(attachments.ownerType, "feedback"), eq(attachments.ownerId, item.id)));

  res.json({
    ...item,
    submitter,
    assignedTo: assigned,
    comments: threadWithNames,
    attachments: atts,
  });
});

// ── Admin: update status / priority / assignment / notes / link ────
feedbackRouter.patch("/:id", requireAuth, async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });
  if (!canTriage(me)) {
    // The reporter may close their own finding once fixed, or reopen it.
    const [own] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, req.params.id));
    const keys = Object.keys(req.body ?? {});
    if (!own || own.submitterReviewerId !== me.id || keys.some((k) => k !== "status") || !["closed", "submitted"].includes(req.body?.status)) {
      return res.status(403).json({ error: "Triage access required" });
    }
  }
  if ("status" in (req.body ?? {}) && !["submitted", "triaged", "planned", "in_progress", "shipped", "declined", "duplicate", "closed"].includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const allowed = ["status", "priority", "assignedToId", "adminNotes", "linkedToItemRef"] as const;
  const patch: Record<string, any> = {};
  for (const k of allowed) if (k in (req.body ?? {})) patch[k] = req.body[k];
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "No updatable fields" });
  patch.updatedAt = new Date();

  const [row] = await db.update(feedbackItems).set(patch)
    .where(eq(feedbackItems.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// ── Comments thread ─────────────────────────────────────────────────
feedbackRouter.post("/:id/comments", requireAuth, async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });
  const body = (req.body?.body ?? "").toString().trim();
  if (body.length < 1 || body.length > 4000) return res.status(400).json({ error: "Comment 1–4000 chars" });

  const [item] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });
  if (!canTriage(me) && item.submitterReviewerId !== me.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const [row] = await db.insert(feedbackComments).values({
    feedbackId: item.id,
    reviewerId: me.id,
    body,
  }).returning();
  res.status(201).json(row);
});

// ── Attachments (images only — reuses the shared polymorphic table) ─
feedbackRouter.post("/:id/attachments", requireAuth, feedbackUploader.array("files", 5), async (req, res) => {
  const me = await currentReviewer(req.session.reviewerId!);
  if (!me) return res.status(401).json({ error: "Reviewer not found" });

  const [item] = await db.select().from(feedbackItems).where(eq(feedbackItems.id, req.params.id));
  if (!item) return res.status(404).json({ error: "Not found" });
  if (!canTriage(me) && item.submitterReviewerId !== me.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) return res.status(400).json({ error: "No files uploaded" });

  const rows = await db.insert(attachments).values(
    files.map((f) => ({
      ownerType: "feedback",
      ownerId: item.id,
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      filesize: f.size,
      uploadedBy: me.id,
    }))
  ).returning();

  res.status(201).json(rows);
});
