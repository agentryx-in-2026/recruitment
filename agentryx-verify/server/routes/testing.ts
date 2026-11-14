import { Router, type Request } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { pool, db } from "../config/db";
import { reviewers, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { UPLOAD_DIR } from "../middleware/upload";
import { aiEnabled } from "./ask";
import { getSetting } from "../services/settings";

/**
 * Tester workspace API: cases in run order with my result and the latest
 * automated result, and the automated E2E runner.
 *
 * Automated runs execute hirestream-lite/tests/verify-auto/run.sh, which tests
 * the live Lite build against a disposable copy of its database, then reports
 * one result per case ref. Results are a separate signal from the tester's own
 * sign-off: the tester always makes the call.
 */
export const testingRouter = Router();

const LEVELS = new Set(["agentryx", "htis", "hpsedc_staging", "hpsedc_final"]);
const ADMIN = new Set(["admin", "delivery"]);
const AUTO_DIR = "/home/subhash.thakur.india/Projects/Recruitment/hirestream-lite/tests/verify-auto";
export const AUTO_SHOTS = path.join(UPLOAD_DIR, "verify", "auto");
if (!fs.existsSync(AUTO_SHOTS)) fs.mkdirSync(AUTO_SHOTS, { recursive: true });

function coverage(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(path.join(AUTO_DIR, "coverage.json"), "utf8")); } catch { return {}; }
}

async function me(req: Request) {
  if (!req.session.reviewerId) return null;
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role, name: reviewers.name }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  return r ?? null;
}
const levelFor = (role: string) => (LEVELS.has(role) ? role : "agentryx");

// GET /api/testing/overview — everything the tester workspace needs in one call
testingRouter.get("/overview", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  const level = levelFor(r.role);
  const isAdmin = ADMIN.has(r.role);
  const cov = coverage();
  const projects = (await pool.query(
    `select id, slug, name, build_ref, description from projects
      where visible_to_non_admin order by sort_order, name`)).rows;
  const ids = projects.map((p: any) => p.id);
  const cases = (await pool.query(
    `select r.id, r.project_id, r.item_ref, r.section, r.section_title, r.description, r.status as delivery_status,
            r.test_steps, r.expected_result, r.evidence, r.sort_order,
            (select s.decision from signoffs s where s.requirement_id = r.id and s.level = $2) as my_decision,
            (select s.comment from signoffs s where s.requirement_id = r.id and s.level = $2) as my_comment,
            (select s.created_at from signoffs s where s.requirement_id = r.id and s.level = $2) as my_at,
            (select count(*) from comments c where c.requirement_id = r.id)::int as comment_count,
            (select json_build_object('status', a.status, 'detail', a.detail, 'screenshot', a.screenshot, 'at', a.created_at)
               from auto_results a where a.requirement_id = r.id order by a.created_at desc limit 1) as auto
       from requirements r where r.project_id = any($1) order by r.sort_order`, [ids, level])).rows;
  const slugById = new Map(projects.map((p: any) => [p.id, p.slug]));
  const out = cases.map((c: any) => ({
    ...c, projectSlug: slugById.get(c.project_id),
    autoScope: slugById.get(c.project_id) === "hirestream-lite" ? cov[c.item_ref] ?? null : null,
  }));
  const running = (await pool.query("select id, scope, started_at from auto_runs where status = 'running' order by started_at desc limit 1")).rows[0] ?? null;
  const findingsOpen = (await pool.query(
    `select count(*)::int as n from feedback_items where project_id = any($1) and status not in ('shipped','declined','duplicate','closed')`, [ids])).rows[0].n;
  res.json({
    me: { id: r.id, name: r.name, role: r.role, level, isAdmin },
    ai: aiEnabled(),
    config: {
      portalUrl: getSetting("testing.portal_url"), accounts: getSetting("testing.accounts"), password: getSetting("testing.password"),
      testersCanRun: getSetting("testing.testers_can_run"), failNoteRequired: getSetting("testing.fail_note_required"), mobileNote: getSetting("testing.mobile_note"),
    },
    projects: projects.map((p: any) => ({ ...p, cases: out.filter((c: any) => c.project_id === p.id) })),
    running,
    findingsOpen,
  });
});

// ── Automated runs ───────────────────────────────────────────────────
let active: string | null = null;

async function finishRun(runId: string, status: "finished" | "error", log: string) {
  const resultsPath = path.join(AUTO_DIR, "out", `${runId}.json`);
  let passed = 0, failed = 0;
  if (fs.existsSync(resultsPath)) {
    const results: { ref: string; status: "passed" | "failed"; detail?: string; screenshot?: string }[] = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    const lite = (await pool.query("select id from projects where slug = 'hirestream-lite'")).rows[0];
    for (const x of results) {
      const reqRow = (await pool.query("select id from requirements where project_id = $1 and item_ref = $2", [lite.id, x.ref])).rows[0];
      if (!reqRow) continue;
      let shot: string | null = null;
      if (x.screenshot && fs.existsSync(x.screenshot)) {
        shot = `${runId}-${x.ref.replace(/[^\w.]/g, "_")}.png`;
        fs.copyFileSync(x.screenshot, path.join(AUTO_SHOTS, shot));
      }
      await pool.query("insert into auto_results (run_id, requirement_id, item_ref, status, detail, screenshot) values ($1,$2,$3,$4,$5,$6)",
        [runId, reqRow.id, x.ref, x.status, x.detail?.slice(0, 2000) ?? null, shot]);
      x.status === "passed" ? passed++ : failed++;
    }
  } else status = "error";
  await pool.query("update auto_runs set status=$1, finished_at=now(), passed=$2, failed=$3, log=$4 where id=$5",
    [status, passed, failed, log.slice(-20000), runId]);
  active = null;
}

// POST /api/testing/auto/run { scope } — scope: all | applicant | agency | admin | defects
testingRouter.post("/auto/run", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r) return res.status(401).json({ error: "Not authenticated" });
  if (!(ADMIN.has(r.role) || r.role === "agentryx")) return res.status(403).json({ error: "Only Agentryx testers and admins can start automated runs" });
  if (!ADMIN.has(r.role) && !getSetting("testing.testers_can_run")) return res.status(403).json({ error: "Automated runs are switched off for testers in Settings" });
  const scope = String(req.body?.scope || "all");
  if (!["all", "applicant", "agency", "admin", "defects"].includes(scope)) return res.status(400).json({ error: "Unknown scope" });
  if (active) return res.status(409).json({ error: "An automated run is already in progress", runId: active });
  const runId = nanoid();
  active = runId;
  await pool.query("insert into auto_runs (id, scope, started_by) values ($1,$2,$3)", [runId, scope, r.id]);
  await db.insert(auditLog).values({ reviewerId: r.id, action: "auto.run", meta: { runId, scope } });
  let log = "";
  const child = spawn("bash", [path.join(AUTO_DIR, "run.sh"), scope, runId], { cwd: AUTO_DIR, env: { ...process.env } });
  child.stdout.on("data", (d) => { log += d.toString(); pool.query("update auto_runs set log=$1 where id=$2", [log.slice(-20000), runId]).catch(() => {}); });
  child.stderr.on("data", (d) => { log += d.toString(); });
  const timer = setTimeout(() => { log += `\nStopped: longer than ${getSetting("testing.run_timeout_min")} minutes (Settings, Testing).`; child.kill("SIGTERM"); }, getSetting("testing.run_timeout_min") * 60_000);
  child.on("exit", () => clearTimeout(timer));
  child.on("close", (code) => finishRun(runId, code === 0 ? "finished" : "error", log).catch(() => { active = null; }));
  child.on("error", (e) => finishRun(runId, "error", `${log}\n${e.message}`).catch(() => { active = null; }));
  res.json({ runId, scope });
});

// GET /api/testing/auto/runs — recent runs
testingRouter.get("/auto/runs", requireAuth, async (_req, res) => {
  const rows = (await pool.query(
    `select a.id, a.scope, a.status, a.started_at, a.finished_at, a.passed, a.failed, v.name as started_by,
            right(a.log, 1500) as log_tail
       from auto_runs a left join reviewers v on v.id = a.started_by
      order by a.started_at desc limit 15`)).rows;
  res.json(rows);
});

// GET /api/testing/auto/shot/:file — evidence screenshot
testingRouter.get("/auto/shot/:file", requireAuth, (req, res) => {
  const f = path.join(AUTO_SHOTS, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).send("Not found");
  res.type("png").sendFile(f);
});

// GET /api/testing/videos — walkthrough chapters (title, start, link) from the knowledge base
testingRouter.get("/videos", requireAuth, async (_req, res) => {
  const rows = (await pool.query("select source_title, heading, url from kb_chunks where source_type = 'video' order by id")).rows;
  const byVideo: Record<string, { heading: string; url: string | null }[]> = {};
  for (const r of rows) (byVideo[r.source_title] ??= []).push({ heading: r.heading, url: r.url });
  res.json(Object.entries(byVideo).map(([title, chapters]) => ({ title, chapters })));
});
