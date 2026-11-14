import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { pool } from "../config/db";
import { db } from "../config/db";
import { reviewers, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { anthropicKey, getSetting } from "../services/settings";
import { answerAgent } from "../services/askAgent";
import { searchKb, rebuildKnowledgeBase } from "../services/kb";

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
// Model, effort, key and on/off come from Settings (a value in .env still wins).
const model = () => process.env.ASK_MODEL || getSetting("ai.model");
export const aiEnabled = () => !!anthropicKey().key && getSetting("ai.enabled");
let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic({ apiKey: anthropicKey().key! }));
export const resetAiClient = () => { client = null; };

async function me(req: Request) {
  if (!req.session.reviewerId) return null;
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role, name: reviewers.name }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  return r ?? null;
}

const publicQ = (q: any) => ({
  id: q.id, question: q.question, answer: q.answer, status: q.status, contextRef: q.context_ref,
  answeredBy: q.answered_by === "ai" ? "Ask Agentryx" : q.answered_by_name ?? null,
  sources: q.sources, createdAt: q.created_at, answeredAt: q.answered_at, askedBy: q.asked_by_name,
  _reviewerId: q.reviewer_id,
});

// GET /api/ask/status — is AI answering switched on?
askRouter.get("/status", requireAuth, (_req, res) => res.json({ ai: aiEnabled(), model: aiEnabled() ? model() : null }));

// GET /api/ask/search?q= — knowledge-base search (the "Find in guides" tab)
askRouter.get("/search", requireAuth, async (req, res) => {
  const r = await me(req);
  const q = String(req.query.q || "").trim().slice(0, 300);
  if (!q) return res.json([]);
  res.json(await searchKb(q, !!r && INTERNAL.has(r.role), 10, !!r && ADMIN.has(r.role)));
});

type Asker = { id: string; role: string; name: string };
/** Ask the agent (or, with AI off, return the best passages). Shared by ask and retry. */
async function answerQuestion(question: string, contextRef: string | null, r: Asker) {
  const internal = INTERNAL.has(r.role), admin = ADMIN.has(r.role);
  let sources: any[] = [];
  let answer: string | null = null, status = "open", answeredBy: string | null = null, aiError: string | null = null;
  if (aiEnabled()) {
    // Claude looks things up itself (knowledge base, testing data, live portal) — see services/askAgent.ts.
    try {
      const out = await answerAgent(ai(), { model: model(), effort: getSetting("ai.effort"), question, contextRef, internal, admin, asker: r.name });
      sources = out.sources;
      if (out.answer) {
        const needsTeam = out.answer.startsWith("[NEEDS_TEAM]");
        answer = out.answer.replace(/^\[NEEDS_TEAM\]\s*/, "");
        answeredBy = "ai";
        status = needsTeam ? "open" : "answered";
      }
    } catch (e: any) {
      aiError = e instanceof Anthropic.APIError ? `AI unavailable (${e.status})` : "AI unavailable";
      console.error("[ask] agent failed", e?.message);
    }
  }
  if (!answer) {
    const hits = await searchKb(contextRef ? `${contextRef} ${question}` : question, internal, 8, admin);
    sources = hits.map((h, i) => ({ n: i + 1, type: h.source_type, title: h.source_title, heading: h.heading, url: h.url, excerpt: h.body.slice(0, 280) }));
  }
  return { sources, answer, status, answeredBy, aiError };
}

// POST /api/ask/:id/retry — run Ask Agentryx again on a waiting question (the asker or an admin)
askRouter.post("/:id/retry", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  const q = (await pool.query("select a.*, rr.role as asker_role, rr.name as asker_name from ask_questions a join reviewers rr on rr.id = a.reviewer_id where a.id = $1", [req.params.id])).rows[0];
  if (!q) return res.status(404).json({ error: "Not found" });
  if (q.reviewer_id !== r.id && !ADMIN.has(r.role)) return res.status(403).json({ error: "Not your question" });
  if (!aiEnabled()) return res.status(400).json({ error: "AI answers are switched off in Settings" });
  const out = await answerQuestion(q.question, q.context_ref, { id: q.reviewer_id, role: q.asker_role, name: q.asker_name });
  if (!out.answer) return res.status(502).json({ error: out.aiError ?? "No answer" });
  await pool.query("update ask_questions set answer=$1, answered_by=$2, status=$3, sources=$4, answered_at=now() where id=$5",
    [out.answer, out.answeredBy, out.status, JSON.stringify(out.sources), q.id]);
  res.json({ id: q.id, question: q.question, answer: out.answer, status: out.status, sources: out.sources, answeredBy: "Ask Agentryx" });
});

// POST /api/ask { question, contextRef? } — ask; AI answers immediately when configured
askRouter.post("/", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  const question = String(req.body?.question || "").trim().slice(0, 2000);
  if (question.length < 3) return res.status(400).json({ error: "Type a question first" });
  const contextRef = req.body?.contextRef ? String(req.body.contextRef).slice(0, 40) : null;
  const { sources, answer, status, answeredBy, aiError } = await answerQuestion(question, contextRef, r);
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
