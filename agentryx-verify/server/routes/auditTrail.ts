import { Router, type Request, type Response } from "express";
import { pool, db } from "../config/db";
import { reviewers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { audit, ping, SESSION_HOURS, VISIT_GAP_MIN } from "../services/audit";

/**
 * Audit trail & usage (admins). Every list takes the same filters:
 *   from, to   — dates (YYYY-MM-DD), inclusive, in the chosen time zone
 *   tz         — Asia/Kolkata (default) or UTC
 *   group      — day | week | month (charts)
 *   person     — a reviewer id, or empty for everyone
 * plus POST /ping (any signed-in user): the page heartbeat that measures time active.
 */
export const auditRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => { console.error("[audit route]", req.path, e?.message); if (!res.headersSent) res.status(500).json({ error: "Audit query failed" }); });
const ADMIN = new Set(["admin", "delivery"]);
const TZ = new Set(["Asia/Kolkata", "UTC"]);

async function admin(req: Request, res: Response) {
  if (!req.session.reviewerId) { res.status(401).json({ error: "Not signed in" }); return null; }
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  if (!r || !ADMIN.has(r.role)) { res.status(403).json({ error: "Admins only" }); return null; }
  return r;
}

function filters(req: Request) {
  const day = (v: unknown, def: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : def);
  const today = new Date().toISOString().slice(0, 10);
  const tz = TZ.has(String(req.query.tz)) ? String(req.query.tz) : "Asia/Kolkata";
  const group = ["day", "week", "month"].includes(String(req.query.group)) ? String(req.query.group) : "day";
  const person = /^[\w-]{1,40}$/.test(String(req.query.person || "")) ? String(req.query.person) : null;
  return { from: day(req.query.from, today), to: day(req.query.to, today), tz, group, person };
}
// $1 from, $2 to, $3 tz — the window as timestamps; time column is passed in.
const inRange = (col: string) => `${col} >= ($1::date)::timestamp at time zone $3 and ${col} < (($2::date) + 1)::timestamp at time zone $3`;
const ITEM_ACTION = "a.action not like 'auth.%'";

// ── Heartbeat ────────────────────────────────────────────────────────
auditRouter.post("/ping", requireAuth, wrap(async (req, res) => {
  await ping(req, req.body?.visible !== false).catch(() => {});
  res.json({ ok: true });
}));

// ── Overview ─────────────────────────────────────────────────────────
auditRouter.get("/overview", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  const f = filters(req);
  const args = [f.from, f.to, f.tz, f.person];
  const who = "($4::text is null or a.reviewer_id = $4)";
  const whoS = "($4::text is null or s.reviewer_id = $4)";
  const cards = (await pool.query(
    `select
       (select count(*) from audit_log a where a.action = 'auth.login' and ${inRange("a.created_at")} and ${who})::int as sign_ins,
       (select count(distinct a.reviewer_id) from audit_log a where a.action = 'auth.login' and ${inRange("a.created_at")} and ${who})::int as people,
       (select coalesce(sum(s.active_seconds),0) from user_sessions s where ${inRange("s.signed_in_at")} and ${whoS})::int as active_seconds,
       (select coalesce(sum(s.visits),0) from user_sessions s where ${inRange("s.signed_in_at")} and ${whoS})::int as visits,
       (select count(*) from audit_log a where ${ITEM_ACTION} and ${inRange("a.created_at")} and ${who})::int as actions,
       (select count(*) from audit_log a where a.action = 'auth.login_failed' and ${inRange("a.created_at")} and ${who})::int as failed,
       (select count(distinct s.reviewer_id) from user_sessions s where s.signed_out_at is null and s.last_seen_at > now() - interval '5 minutes' and ${whoS})::int as online`, args)).rows[0];
  const series = (await pool.query(
    `with b as (select generate_series(date_trunc($5, ($1::date)::timestamp), date_trunc($5, ($2::date)::timestamp), ('1 ' || $5)::interval) as bucket)
     select to_char(b.bucket, 'YYYY-MM-DD') as bucket,
       (select count(*) from audit_log a where a.action = 'auth.login' and ${who} and date_trunc($5, a.created_at at time zone $3) = b.bucket and ${inRange("a.created_at")})::int as sign_ins,
       (select coalesce(sum(s.active_seconds),0) from user_sessions s where ${whoS} and date_trunc($5, s.signed_in_at at time zone $3) = b.bucket and ${inRange("s.signed_in_at")})::int as active_seconds,
       (select count(*) from audit_log a where ${ITEM_ACTION} and ${who} and date_trunc($5, a.created_at at time zone $3) = b.bucket and ${inRange("a.created_at")})::int as actions
     from b order by b.bucket`, [...args, f.group])).rows;
  const online = (await pool.query(
    `select r.id, r.name, r.username, r.role, max(s.last_seen_at) as last_seen, (array_agg(s.device order by s.last_seen_at desc))[1] as device
       from user_sessions s join reviewers r on r.id = s.reviewer_id
      where s.signed_out_at is null and s.last_seen_at > now() - interval '5 minutes' and ${whoS.replaceAll("$4", "$1")}
      group by r.id order by last_seen desc`, [f.person])).rows;
  const most = (await pool.query(
    `select r.id, r.name, r.username,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action = 'auth.login' and ${inRange("a.created_at")})::int as sign_ins,
       (select count(*) from audit_log a where a.reviewer_id = r.id and ${ITEM_ACTION} and ${inRange("a.created_at")})::int as actions,
       (select coalesce(sum(s.active_seconds),0) from user_sessions s where s.reviewer_id = r.id and ${inRange("s.signed_in_at")})::int as active_seconds
       from reviewers r where ($4::text is null or r.id = $4)
     order by active_seconds desc, actions desc, sign_ins desc limit 6`, args)).rows.filter((x: any) => x.sign_ins || x.actions || x.active_seconds);
  res.json({ filters: f, cards, series, online, most });
}));

// ── People ───────────────────────────────────────────────────────────
async function peopleRows(f: ReturnType<typeof filters>) {
  return (await pool.query(
    `select r.id, r.name, r.username, r.role,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action = 'auth.login' and ${inRange("a.created_at")})::int as sign_ins,
       (select coalesce(sum(s.visits),0) from user_sessions s where s.reviewer_id = r.id and ${inRange("s.signed_in_at")})::int as visits,
       (select coalesce(sum(s.active_seconds),0) from user_sessions s where s.reviewer_id = r.id and ${inRange("s.signed_in_at")})::int as active_seconds,
       (select min(a.created_at) from audit_log a where a.reviewer_id = r.id and ${inRange("a.created_at")}) as first_seen,
       greatest((select max(a.created_at) from audit_log a where a.reviewer_id = r.id and ${inRange("a.created_at")}),
                (select max(s.last_seen_at) from user_sessions s where s.reviewer_id = r.id and ${inRange("s.last_seen_at")})) as last_seen,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action in ('signoff.created','signoff.updated','signoff.cleared') and ${inRange("a.created_at")})::int as verdicts,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action like 'finding.%' and ${inRange("a.created_at")})::int as findings,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action like 'ask.%' and ${inRange("a.created_at")})::int as questions,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action in ('comment.added','finding.comment') and ${inRange("a.created_at")})::int as comments,
       (select coalesce(sum(coalesce((a.meta->>'files')::int, 0)),0) from audit_log a where a.reviewer_id = r.id and ${inRange("a.created_at")})::int as files,
       (select count(*) from audit_log a where a.reviewer_id = r.id and a.action in ('document.viewed','document.downloaded') and ${inRange("a.created_at")})::int as documents,
       (select count(*) from audit_log a where a.reviewer_id = r.id and ${ITEM_ACTION} and ${inRange("a.created_at")})::int as actions,
       exists (select 1 from user_sessions s where s.reviewer_id = r.id and s.signed_out_at is null and s.last_seen_at > now() - interval '5 minutes') as online
     from reviewers r where ($4::text is null or r.id = $4)
     order by active_seconds desc, actions desc, sign_ins desc`, [f.from, f.to, f.tz, f.person])).rows
    .filter((x: any) => x.sign_ins || x.actions || x.active_seconds || x.last_seen);
}
auditRouter.get("/people", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  res.json(await peopleRows(filters(req)));
}));

// ── Sign-ins (sessions) ──────────────────────────────────────────────
const STATUS = `case
    when s.signed_out_at is not null then coalesce(s.end_reason, 'signed_out')
    when s.last_seen_at < now() - interval '${SESSION_HOURS} hours' then 'expired'
    when s.last_seen_at < now() - interval '${VISIT_GAP_MIN} minutes' then 'left_open'
    else 'in_progress' end`;
async function sessionRows(f: ReturnType<typeof filters>) {
  return (await pool.query(
    `select s.id, s.reviewer_id, r.name, r.username, s.signed_in_at, s.last_seen_at, s.signed_out_at, s.visits, s.active_seconds,
            s.device, s.ip, s.method, ${STATUS} as status,
            (select count(*) from audit_log a where a.session_id = s.id and ${ITEM_ACTION})::int as actions
       from user_sessions s join reviewers r on r.id = s.reviewer_id
      where (${inRange("s.signed_in_at")} or ${inRange("s.last_seen_at")}) and ($4::text is null or s.reviewer_id = $4)
      order by s.signed_in_at desc limit 500`, [f.from, f.to, f.tz, f.person])).rows;
}
auditRouter.get("/sessions", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  const f = filters(req);
  const rows = await sessionRows(f);
  // Left open, from any date, still able to be used (not expired); never the caller's own.
  const stale = (await pool.query(
    `select s.id, r.name, s.signed_in_at, s.last_seen_at, s.device, s.ip from user_sessions s join reviewers r on r.id = s.reviewer_id
      where s.signed_out_at is null and s.last_seen_at < now() - interval '${VISIT_GAP_MIN} minutes'
        and s.last_seen_at > now() - interval '${SESSION_HOURS} hours' and s.id <> coalesce($1, '')
      order by s.last_seen_at`, [req.session.trackId ?? null])).rows;
  res.json({ rows: rows.map((x: any) => ({ ...x, mine: x.id === req.session.trackId })), stale });
}));

async function endOne(req: Request, id: string) {
  const s = (await pool.query("select id, sid, reviewer_id from user_sessions where id = $1 and signed_out_at is null", [id])).rows[0];
  if (!s || s.id === req.session.trackId) return false;
  if (s.sid) await pool.query("delete from verify_session where sid = $1", [s.sid]);
  await pool.query("update user_sessions set signed_out_at = now(), end_reason = 'ended_by_admin' where id = $1", [id]);
  const [r] = await db.select({ name: reviewers.name }).from(reviewers).where(eq(reviewers.id, s.reviewer_id));
  await audit(req, "auth.session_ended", { item: r?.name ?? null, meta: { sessionOf: s.reviewer_id } });
  return true;
}
auditRouter.post("/sessions/:id/end", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  res.json({ ended: (await endOne(req, req.params.id)) ? 1 : 0 });
}));
auditRouter.post("/sessions/end-stale", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  const ids = (await pool.query(
    `select id from user_sessions where signed_out_at is null and last_seen_at < now() - interval '${VISIT_GAP_MIN} minutes'
       and last_seen_at > now() - interval '${SESSION_HOURS} hours' and id <> coalesce($1, '')`, [req.session.trackId ?? null])).rows;
  let n = 0;
  for (const { id } of ids) if (await endOne(req, id)) n++;
  res.json({ ended: n });
}));

// ── Events ───────────────────────────────────────────────────────────
const TYPE: Record<string, string> = {
  all: "true",
  signins: "a.action in ('auth.login','auth.logout','auth.session_ended')",
  failed: "a.action = 'auth.login_failed'",
  account: "(a.action like 'auth.%' or a.action like 'settings.%')",
  items: ITEM_ACTION,
  documents: "a.action like 'document.%'",
};
async function eventRows(f: ReturnType<typeof filters>, type: string, limit: number, offset: number) {
  const where = TYPE[type] ?? "true";
  const rows = (await pool.query(
    `select a.id, a.created_at, a.action, a.item, a.meta, a.ip, a.session_id, r.name, r.username
       from audit_log a left join reviewers r on r.id = a.reviewer_id
      where ${where} and ${inRange("a.created_at")} and ($4::text is null or a.reviewer_id = $4)
      order by a.created_at desc limit $5 offset $6`, [f.from, f.to, f.tz, f.person, limit, offset])).rows;
  const counts = (await pool.query(
    `select ${Object.entries(TYPE).map(([k, w]) => `count(*) filter (where ${w})::int as ${k}`).join(", ")}
       from audit_log a where ${inRange("a.created_at")} and ($4::text is null or a.reviewer_id = $4)`, [f.from, f.to, f.tz, f.person])).rows[0];
  return { rows, counts };
}
auditRouter.get("/events", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  const f = filters(req);
  const limit = Math.min(Number(req.query.limit) || 200, 1000), offset = Math.max(Number(req.query.offset) || 0, 0);
  res.json(await eventRows(f, String(req.query.type || "all"), limit, offset));
}));

// ── CSV export ───────────────────────────────────────────────────────
const csv = (rows: Record<string, unknown>[], cols: [string, string][]) =>
  [cols.map((c) => c[1]).join(","), ...rows.map((r) => cols.map(([k]) => {
    const v = r[k] instanceof Date ? (r[k] as Date).toISOString() : r[k] == null ? "" : typeof r[k] === "object" ? JSON.stringify(r[k]) : String(r[k]);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","))].join("\n");
auditRouter.get("/export.csv", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  const f = filters(req);
  const tab = String(req.query.tab || "events");
  let body = "";
  if (tab === "people") body = csv(await peopleRows(f), [["name", "Person"], ["username", "Username"], ["role", "Role"], ["sign_ins", "Sign-ins"], ["visits", "Visits"], ["active_seconds", "Active seconds"], ["first_seen", "First seen"], ["last_seen", "Last seen"], ["verdicts", "Case results"], ["findings", "Findings"], ["questions", "Questions"], ["comments", "Comments"], ["files", "Files"], ["documents", "Documents opened"], ["actions", "All actions"]]);
  else if (tab === "sessions") body = csv(await sessionRows(f), [["name", "Person"], ["username", "Username"], ["signed_in_at", "Signed in"], ["last_seen_at", "Last active"], ["signed_out_at", "Ended"], ["status", "Status"], ["visits", "Visits"], ["active_seconds", "Active seconds"], ["actions", "Actions"], ["device", "Device"], ["ip", "IP"], ["method", "Sign-in method"]]);
  else body = csv((await eventRows(f, String(req.query.type || "all"), 100000, 0)).rows, [["created_at", "Time (UTC)"], ["name", "Person"], ["username", "Username"], ["action", "What happened"], ["item", "Item"], ["meta", "Detail"], ["ip", "IP"], ["session_id", "Session"]]);
  await audit(req, "audit.exported", { item: tab, meta: { from: f.from, to: f.to } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="verify-audit-${tab}-${f.from}_to_${f.to}.csv"`);
  res.send("﻿" + body);
}));

// GET /api/audit/reviewers — everyone, for the Person filter
auditRouter.get("/reviewers", wrap(async (req, res) => {
  if (!(await admin(req, res))) return;
  res.json((await pool.query("select id, name, username, role from reviewers order by name")).rows);
}));
