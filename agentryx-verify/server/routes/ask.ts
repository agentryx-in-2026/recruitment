import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { pool } from "../config/db";
import { db } from "../config/db";
import { reviewers, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { searchKb, rebuildKnowledgeBase, type KbHit } from "../services/kb";

/**
 * Ask Agentryx — testers ask how to do something; the answer comes from the
 * project's own material (guides, video chapters, FRS, coverage plan, test
 * cases) retrieved from the knowledge base. With an Anthropic key configured,
 * Claude writes the answer from those passages and cites them; without one the
 * matching passages are returned directly and the question waits for an admin.
 */
export const askRouter = Router();

const ADMIN = new Set(["admin", "delivery"]);
const INTERNAL = new Set(["admin", "delivery", "agentryx"]);
const MODEL = process.env.ASK_MODEL || "claude-opus-5-5";
export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic());

async function me(req: Request) {
  if (!req.session.reviewerId) return null;
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role, name: reviewers.name }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  return r ?? null;
}

const SYSTEM = `You are Ask Agentryx, the testing assistant for HireStream Lite (the HPSEDC overseas placement portal) and its mobile app.
Testers ask how to run a test case, where a feature is, or what the expected behaviour is.

Answer only from the numbered sources provided with each question. Cite them inline as [1], [2]. If the sources do not cover the question, say so plainly in one sentence and suggest the tester send it to the admin; do not guess.

Keep answers short and practical: the steps to follow, the test account to use, and what should happen. Use a numbered list for steps. Mention the matching test case ID (e.g. L2.6) and, when a video chapter covers it, point to that chapter.`;

function sourcesBlock(hits: KbHit[]) {
  return hits.map((h, i) => `[${i + 1}] (${h.source_type}: ${h.source_title} — ${h.heading})\n${h.body}`).join("\n\n");
}

async function answerWithClaude(question: string, hits: KbHit[]): Promise<string | null> {
  const response: any = await (ai().beta.messages.create as any)({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Sources:\n\n${sourcesBlock(hits)}\n\nQuestion: ${question}` }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = (response.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  return text || null;
}

const publicQ = (q: any) => ({
  id: q.id, question: q.question, answer: q.answer, status: q.status, contextRef: q.context_ref,
  answeredBy: q.answered_by === "ai" ? "Ask Agentryx" : q.answered_by_name ?? null,
  sources: q.sources, createdAt: q.created_at, answeredAt: q.answered_at, askedBy: q.asked_by_name,
  _reviewerId: q.reviewer_id,
});

// GET /api/ask/status — is AI answering switched on?
askRouter.get("/status", requireAuth, (_req, res) => res.json({ ai: aiEnabled(), model: aiEnabled() ? MODEL : null }));

// GET /api/ask/search?q= — knowledge-base search (the "Find in guides" tab)
askRouter.get("/search", requireAuth, async (req, res) => {
  const r = await me(req);
  const q = String(req.query.q || "").trim().slice(0, 300);
  if (!q) return res.json([]);
  res.json(await searchKb(q, !!r && INTERNAL.has(r.role), 10));
});

// POST /api/ask { question, contextRef? } — ask; AI answers immediately when configured
askRouter.post("/", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  const question = String(req.body?.question || "").trim().slice(0, 2000);
  if (question.length < 3) return res.status(400).json({ error: "Type a question first" });
  const contextRef = req.body?.contextRef ? String(req.body.contextRef).slice(0, 40) : null;
  const hits = await searchKb(contextRef ? `${contextRef} ${question}` : question, INTERNAL.has(r.role), 8);
  const sources = hits.map((h, i) => ({ n: i + 1, type: h.source_type, title: h.source_title, heading: h.heading, url: h.url, excerpt: h.body.slice(0, 280) }));

  let answer: string | null = null, status = "open", answeredBy: string | null = null, aiError: string | null = null;
  if (aiEnabled() && hits.length) {
    try {
      answer = await answerWithClaude(question, hits);
      if (answer) { status = "answered"; answeredBy = "ai"; }
    } catch (e: any) {
      aiError = e instanceof Anthropic.APIError ? `AI unavailable (${e.status})` : "AI unavailable";
    }
  }
  const id = nanoid();
  await pool.query(
    `insert into ask_questions (id, reviewer_id, question, context_ref, answer, answered_by, status, sources, answered_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, r.id, question, contextRef, answer, answeredBy, status, JSON.stringify(sources), answer ? new Date() : null]);
  res.json({ id, question, answer, status, sources, aiError, answeredBy: answer ? "Ask Agentryx" : null });
});

// GET /api/ask/mine — my questions; GET /api/ask/all — everyone's (admin)
async function list(where: string, args: any[]) {
  const q = await pool.query(
    `select a.*, ar.name as answered_by_name, rr.name as asked_by_name
       from ask_questions a
       left join reviewers ar on ar.id = a.answered_by
       join reviewers rr on rr.id = a.reviewer_id
      ${where} order by a.created_at desc limit 100`, args);
  return q.rows.map(publicQ);
}
askRouter.get("/mine", requireAuth, async (req, res) => res.json(await list("where a.reviewer_id = $1", [req.session.reviewerId])));
askRouter.get("/all", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r || !ADMIN.has(r.role)) return res.status(403).json({ error: "Admin only" });
  res.json(await list("", []));
});

// GET /api/ask/team — the team's questions (MGC-style panel list). Everyone
// signed in sees them so a tester finds an answer someone already got; for
// non-admins the internal coverage-plan sources are dropped.
askRouter.get("/team", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not signed in" });
  const isAdmin = ADMIN.has(r.role);
  const rows = await list("", []);
  res.json(rows.map(({ _reviewerId, ...q }: any) => ({
    ...q,
    mine: _reviewerId === r.id,
    sources: isAdmin ? q.sources : (q.sources ?? []).filter((s: any) => s.type !== "plan"),
  })));
});

// PATCH /api/ask/:id { answer?, status? } — admin answers; the asker may close
askRouter.patch("/:id", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  const cur = (await pool.query("select * from ask_questions where id = $1", [req.params.id])).rows[0];
  if (!cur) return res.status(404).json({ error: "Not found" });
  const isAdmin = ADMIN.has(r.role);
  if (!isAdmin && cur.reviewer_id !== r.id) return res.status(403).json({ error: "Not yours" });
  if (typeof req.body?.answer === "string" && req.body.answer.trim()) {
    if (!isAdmin) return res.status(403).json({ error: "Only an admin can answer" });
    await pool.query("update ask_questions set answer=$1, answered_by=$2, status='answered', answered_at=now() where id=$3", [req.body.answer.trim(), r.id, cur.id]);
  }
  if (req.body?.status === "closed" || req.body?.status === "open") {
    await pool.query("update ask_questions set status=$1 where id=$2", [req.body.status, cur.id]);
  }
  res.json({ ok: true });
});

// POST /api/ask/reindex — admin rebuilds the knowledge base
askRouter.post("/reindex", requireAuth, async (req: Request, res: Response) => {
  const r = await me(req);
  if (!r || !ADMIN.has(r.role)) return res.status(403).json({ error: "Admin only" });
  const counts = await rebuildKnowledgeBase();
  await db.insert(auditLog).values({ reviewerId: r.id, action: "ask.reindex", meta: counts });
  res.json(counts);
});
