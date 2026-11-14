import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";
import { pool } from "../config/db";
import { searchKb, type KbHit } from "./kb";

/**
 * Ask Agentryx agent. Claude answers with read-only tools instead of one
 * up-front keyword search, so it can look things up as often as it needs:
 *   search_knowledge   guides, video narration, FRS, SRS/architecture docs, test cases (+ coverage plan for internal)
 *   get_test_case      a case's steps, expected result, sign-offs and latest automated result
 *   testing_status     progress, failed cases, known defects, last automated run
 *   list_findings      exploratory findings and their status
 *   portal_settings    the live Lite portal's configuration (pipeline, features, registration)
 *   portal_jobs        live jobs: title, country, category, salary, deadline, applicants
 *   portal_professions live professions with qualifications and required documents
 *   portal_stats       live counts (candidates, applications by stage, placements) — no personal data
 * Live portal data comes through a separate connection whose transactions are
 * forced read-only, and only through the fixed queries below.
 */
const lite = new pg.Pool({
  connectionString: process.env.LITE_DATABASE_URL || "postgres://hirestream:hirestream@localhost:5432/hirestream_lite",
  options: "-c default_transaction_read_only=on -c statement_timeout=5000",
  max: 3,
});

export type AskSource = { n: number; type: string; title: string; heading: string; url: string | null; excerpt: string };
type Ctx = { internal: boolean; admin: boolean; sources: AskSource[]; seen: Map<string, number> };

const TOOLS: Anthropic.Tool[] = [
  { name: "search_knowledge", description: "Full-text search of the project's reference material: the three Lite user guides (Applicant, HPSEDC Super Agency, Admin), the narration of every walkthrough-video chapter, the contracted FRS, the SRS and architecture documents, and every test case. Returns numbered passages; cite them as [n]. Search several times with different words when the first search is thin.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Keywords, e.g. 'schedule interview reschedule'" }, type: { type: "string", enum: ["guide", "video", "frs", "doc", "case", "plan"], description: "Optional: limit to one kind of source" } }, required: ["query"] } },
  { name: "get_test_case", description: "One test case by its ID (e.g. L2.6, M3.1): steps, expected result, the tester's result and note, and the latest automated check result.",
    input_schema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] } },
  { name: "testing_status", description: "Current UAT progress: passed / failed / not-run counts per project, the failed cases with notes, the known-defect retests, and the last automated run.",
    input_schema: { type: "object", properties: {} } },
  { name: "list_findings", description: "Exploratory findings (bugs, UI/UX, ideas) reported by testers, with status.",
    input_schema: { type: "object", properties: { open_only: { type: "boolean" } } } },
  { name: "portal_settings", description: "The LIVE Lite portal's configuration right now: pipeline profile (which stages exist), feature switches (registration, callback, quick login, captcha…), registration rules.",
    input_schema: { type: "object", properties: {} } },
  { name: "portal_jobs", description: "LIVE jobs on the Lite portal: title, company, country, category, salary, deadline, status and number of applicants.",
    input_schema: { type: "object", properties: { status: { type: "string", description: "e.g. active, closed; omit for all" }, search: { type: "string", description: "Words in the title, country or category" } } } },
  { name: "portal_professions", description: "LIVE professions configured on the Lite portal, with the qualifications and documents each requires.",
    input_schema: { type: "object", properties: {} } },
  { name: "portal_stats", description: "LIVE totals on the Lite portal: candidates, completed profiles, applications by stage, placements, jobs by status. No personal data.",
    input_schema: { type: "object", properties: {} } },
];

const STAGES = "Applied (submitted) → Interview (interview_scheduled) → Selected → Placed in the compact Direct profile; rejected/withdrawn are terminal.";

function cite(ctx: Ctx, h: KbHit): number {
  const key = String(h.id);
  if (ctx.seen.has(key)) return ctx.seen.get(key)!;
  const n = ctx.sources.length + 1;
  ctx.sources.push({ n, type: h.source_type, title: h.source_title, heading: h.heading, url: h.url, excerpt: h.body.slice(0, 280) });
  ctx.seen.set(key, n);
  return n;
}

async function runTool(name: string, input: any, ctx: Ctx): Promise<string> {
  switch (name) {
    case "search_knowledge": {
      let hits = await searchKb(String(input.query || "").slice(0, 300), ctx.internal, 12, ctx.admin);
      if (input.type) hits = hits.filter((h) => h.source_type === input.type);
      hits = hits.filter((h) => ctx.internal || h.source_type !== "plan").slice(0, 7);
      if (!hits.length) return "No passages matched. Try other words.";
      return hits.map((h) => `[${cite(ctx, h)}] (${h.source_type}: ${h.source_title} — ${h.heading})\n${h.body.slice(0, 1800)}`).join("\n\n");
    }
    case "get_test_case": {
      const r = (await pool.query(
        `select r.id, r.item_ref, r.section_title, r.description, r.test_steps, r.expected_result, r.status as delivery, p.name as project,
                (select json_agg(json_build_object('level', s.level, 'decision', s.decision, 'note', s.comment)) from signoffs s where s.requirement_id = r.id) as results,
                (select json_build_object('status', a.status, 'detail', a.detail, 'at', a.created_at) from auto_results a where a.requirement_id = r.id order by a.created_at desc limit 1) as auto
           from requirements r join projects p on p.id = r.project_id
          where p.visible_to_non_admin and upper(r.item_ref) = upper($1) limit 1`, [String(input.ref || "").trim()])).rows[0];
      if (!r) return `No visible test case ${input.ref}.`;
      const n = ctx.sources.length + 1;
      ctx.sources.push({ n, type: "case", title: r.project, heading: `${r.item_ref} ${r.description}`, url: `/cases/${r.id}`, excerpt: (r.expected_result ?? "").slice(0, 280) });
      return `[${n}] ${JSON.stringify(r)}`;
    }
    case "testing_status": {
      const rows = (await pool.query(
        `select p.name, r.item_ref, r.description, r.status as delivery,
                (select s.decision from signoffs s where s.requirement_id = r.id and s.level = 'agentryx') as result,
                (select s.comment from signoffs s where s.requirement_id = r.id and s.level = 'agentryx') as note,
                (select a.status from auto_results a where a.requirement_id = r.id order by a.created_at desc limit 1) as auto
           from requirements r join projects p on p.id = r.project_id where p.visible_to_non_admin order by p.sort_order, r.sort_order`)).rows;
      const byP: Record<string, any> = {};
      for (const x of rows) {
        const t = (byP[x.name] ??= { total: 0, passed: 0, failed: 0, waived: 0, not_run: 0, auto_passed: 0, auto_failed: 0, failed_cases: [] as any[], known_defects: [] as any[] });
        t.total++; x.result === "accepted" ? t.passed++ : x.result === "rejected" ? t.failed++ : x.result === "waived" ? t.waived++ : t.not_run++;
        if (x.auto === "passed") t.auto_passed++;
        if (x.auto === "failed") { t.auto_failed++; (t.auto_failed_cases ??= []).push({ ref: x.item_ref, case: x.description }); }
        if (x.result === "rejected") t.failed_cases.push({ ref: x.item_ref, case: x.description, note: x.note });
        if (/^L6\./.test(x.item_ref)) t.known_defects.push({ ref: x.item_ref, defect: x.description, retest: x.result ?? "not run", built: x.delivery });
      }
      const run = (await pool.query("select scope, status, passed, failed, started_at, finished_at from auto_runs order by started_at desc limit 1")).rows[0] ?? null;
      return JSON.stringify({ projects: byP, last_automated_run: run, level: "Agentryx internal testing" });
    }
    case "list_findings": {
      const rows = (await pool.query(
        `select f.reference_code, f.title, f.type, f.area, f.priority, f.status, f.linked_to_item_ref, f.admin_notes, v.name as reported_by, f.created_at
           from feedback_items f join projects p on p.id = f.project_id left join reviewers v on v.id = f.submitter_reviewer_id
          where p.visible_to_non_admin ${input.open_only ? "and f.status not in ('shipped','declined','duplicate','closed')" : ""}
          order by f.created_at desc limit 40`)).rows;
      return rows.length ? JSON.stringify(rows) : "No findings.";
    }
    case "portal_settings": {
      const rows = (await lite.query("select key, value, description from system_settings where key not like '\\_internal%' and key not like '%user_id%' order by key")).rows;
      return JSON.stringify({ note: `Pipeline stages: ${STAGES}`, settings: rows });
    }
    case "portal_jobs": {
      const args: any[] = []; const where: string[] = [];
      if (input.status) { args.push(String(input.status)); where.push(`j.status = $${args.length}`); }
      if (input.search) { args.push(`%${String(input.search).slice(0, 60)}%`); where.push(`(j.title ilike $${args.length} or j.country ilike $${args.length} or j.category ilike $${args.length} or j.company ilike $${args.length})`); }
      const rows = (await lite.query(
        `select j.title, j.company, j.country, j.location, j.category, j.salary, j.experience_required, j.hiring_deadline, j.status, j.target_hires,
                (select count(*) from applications a where a.job_id = j.id)::int as applicants
           from jobs j ${where.length ? "where " + where.join(" and ") : ""} order by j.created_at desc limit 40`, args)).rows;
      if (!rows.length) return "No jobs match.";
      const count = (k: string) => {
        const m: Record<string, number> = {};
        for (const r of rows) m[r[k] ?? "—"] = (m[r[k] ?? "—"] ?? 0) + 1;
        return Object.entries(m).sort((x, y) => y[1] - x[1]);
      };
      // Totals are computed here so the answer never has to count by hand.
      return JSON.stringify({ total: rows.length, by_status: count("status"), by_country: count("country"), by_category: count("category"), jobs: rows });
    }
    case "portal_professions": {
      const rows = (await lite.query("select label, label_hi, qualifications, required_docs, optional_docs, candidate_note, active from profession_requirements order by display_order")).rows;
      return JSON.stringify(rows);
    }
    case "portal_stats": {
      const one = async (q: string) => (await lite.query(q)).rows;
      return JSON.stringify({
        candidates: (await one("select count(*)::int as total, count(*) filter (where profile_complete)::int as profile_complete from candidates"))[0],
        applications_by_stage: await one("select status, count(*)::int from applications group by 1 order by 2 desc"),
        placements: (await one("select count(*)::int as total from placements"))[0],
        jobs_by_status: await one("select status, count(*)::int from jobs group by 1 order by 2 desc"),
      });
    }
  }
  return `Unknown tool ${name}`;
}

const SYSTEM = `You are Ask Agentryx, the assistant inside Agentryx Verify — the testing workspace for HireStream Lite (the HPSEDC overseas placement portal, hirestream-lite.agentryx.dev) and its mobile app. Agentryx built the portal; testers such as Piyush run the UAT cases here before the demo for the HPSEDC Secretary.

How to answer:
- Use the tools. For how-to and expected behaviour, search_knowledge (search more than once with different words if needed). For "what is set up right now" or numbers, use the live portal tools. For testing progress, cases and findings, use the testing tools.
- Cite knowledge passages inline as [n], using the numbers the tools return. Say when a fact comes from the live portal ("live on the portal now").
- If the sources and live data do not settle it, start your reply with the exact marker [NEEDS_TEAM], then say in one sentence what you could not find; the question then stays open for the Agentryx team. Never guess at behaviour.
- Greetings and questions about yourself: answer briefly, then say what you can help with.
- Be short and practical: the steps, the test account to use (accounts: hpsedc_agency = Placement Cell, demo_admin = Admin, demo_candidate = Applicant; password test123), what should happen, and the matching test case ID and video chapter when there is one. Use numbered steps. Format with short paragraphs, **bold** and lists only — no tables or headings (the panel is narrow).
- The live portal data is read-only. Never reveal personal data about candidates.`;

export async function answerAgent(client: Anthropic, opts: { model: string; effort: string; question: string; contextRef: string | null; internal: boolean; admin: boolean; asker: string }) {
  const ctx: Ctx = { internal: opts.internal, admin: opts.admin, sources: [], seen: new Map() };
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${opts.contextRef ? `(Asked from test case ${opts.contextRef}.) ` : ""}${opts.question}\n\n— asked by ${opts.asker}` }];
  const toolsUsed: string[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const response: any = await (client.messages.create as any)({
      model: opts.model,
      max_tokens: 8000,
      output_config: { effort: opts.effort },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    if (response.stop_reason === "refusal") return { answer: null, sources: ctx.sources, toolsUsed };
    if (response.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: response.content }); continue; }
    const uses = response.content.filter((b: any) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !uses.length) {
      const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return { answer: text || null, sources: ctx.sources, toolsUsed };
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      toolsUsed.push(u.name);
      let out: string; let isError = false;
      try { out = await runTool(u.name, u.input ?? {}, ctx); } catch (e: any) { out = `Tool error: ${e.message}`; isError = true; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: out.slice(0, 30000), is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "I couldn't finish looking this up. The question has gone to the Agentryx team.", sources: ctx.sources, toolsUsed };
}
