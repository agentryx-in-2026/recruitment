import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";
import { pool } from "../config/db";

/**
 * Audit trail & usage. Every sign-in becomes a row in user_sessions (device,
 * IP, visits, time active, how it ended). Every event — sign-ins, failed
 * sign-ins, sign-outs, and changes to items — is a row in audit_log with who,
 * what, the item, detail, IP and the session it came from.
 *
 *   visit       — starts when someone opens Verify; ends after 30 minutes with no activity
 *   time active — counted from the page's heartbeat, only while the tab is open and in view
 *   left open   — a sign-in not signed out and unused for 30+ minutes
 *   expired     — unused for longer than the 8-hour cookie: the sign-in no longer works
 */
export const VISIT_GAP_MIN = 30;
export const SESSION_HOURS = 8;

declare module "express-session" {
  interface SessionData { trackId?: string }
}

export async function ensureAuditSchema() {
  await pool.query(`create table if not exists user_sessions (
    id text primary key,
    reviewer_id varchar(21) not null references reviewers(id) on delete cascade,
    sid text,
    signed_in_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    last_ping_at timestamptz,
    signed_out_at timestamptz,
    end_reason text,
    ip text, user_agent text, device text,
    visits int not null default 1,
    active_seconds int not null default 0,
    method text)`);
  await pool.query("create index if not exists user_sessions_reviewer_idx on user_sessions (reviewer_id, signed_in_at desc)");
  await pool.query("alter table audit_log add column if not exists ip text, add column if not exists session_id text, add column if not exists item text");
  await pool.query("create index if not exists audit_log_created_idx on audit_log (created_at desc)");
}

export const clientIp = (req: Request) => String(req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");

/** "Chrome on Windows", "Safari on iPhone"… from the user-agent string. */
export function deviceOf(ua = ""): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|node|python|undici|axios/i.test(ua) ? "Script" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Record one event. item = what it was about (case ref, finding code, document title…). */
export async function audit(req: Request, action: string, opts: { item?: string | null; meta?: Record<string, unknown>; reviewerId?: string | null; projectId?: string | null } = {}) {
  try {
    await pool.query(
      "insert into audit_log (id, project_id, reviewer_id, action, meta, item, ip, session_id) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [nanoid(), opts.projectId ?? null, opts.reviewerId === undefined ? req.session?.reviewerId ?? null : opts.reviewerId,
        action, JSON.stringify(opts.meta ?? {}), opts.item ?? null, clientIp(req), req.session?.trackId ?? null]);
  } catch (e) { console.error("[audit] write failed", (e as Error).message); }
}

/** Start tracking a sign-in (call after req.session.reviewerId is set). */
export async function startSession(req: Request, reviewerId: string, method: string) {
  const id = nanoid();
  req.session.trackId = id;
  const ua = String(req.get("user-agent") || "").slice(0, 400);
  await pool.query(
    "insert into user_sessions (id, reviewer_id, sid, ip, user_agent, device, method) values ($1,$2,$3,$4,$5,$6,$7)",
    [id, reviewerId, req.sessionID, clientIp(req), ua, deviceOf(ua), method]);
  await audit(req, "auth.login", { reviewerId, meta: { method, device: deviceOf(ua) } });
}

export async function endSession(trackId: string | undefined, reason: "signed_out" | "ended_by_admin") {
  if (!trackId) return;
  await pool.query("update user_sessions set signed_out_at = coalesce(signed_out_at, now()), end_reason = coalesce(end_reason, $2) where id = $1", [trackId, reason]);
}

/**
 * On every signed-in API call: keep last_seen fresh (at most every 30 s) and
 * start a new visit after a 30-minute gap. A sign-in ended by an admin is
 * refused here, so "End session" takes effect at once.
 */
export async function trackActivity(req: Request, res: Response, next: NextFunction) {
  const id = req.session?.trackId;
  if (!id || !req.session.reviewerId) return next();
  try {
    const r = await pool.query(
      `update user_sessions set
         visits = visits + case when now() - last_seen_at > interval '${VISIT_GAP_MIN} minutes' then 1 else 0 end,
         last_seen_at = now()
       where id = $1 and signed_out_at is null and now() - last_seen_at > interval '30 seconds'
       returning id`, [id]);
    if (!r.rowCount) {
      const ended = await pool.query("select end_reason from user_sessions where id = $1", [id]);
      if (ended.rows[0]?.end_reason === "ended_by_admin") {
        return req.session.destroy(() => res.status(401).json({ error: "Your sign-in was ended by an administrator." }));
      }
    }
  } catch { /* tracking must never block the app */ }
  next();
}

/** Heartbeat from the open page: adds active time only while the tab is in view. */
export async function ping(req: Request, visible: boolean) {
  const id = req.session?.trackId;
  if (!id) return;
  await pool.query(
    `update user_sessions set
       active_seconds = active_seconds + case when $2::boolean and last_ping_at is not null
         then least(greatest(extract(epoch from now() - last_ping_at), 0), 90)::int else 0 end,
       visits = visits + case when now() - last_seen_at > interval '${VISIT_GAP_MIN} minutes' then 1 else 0 end,
       last_ping_at = case when $2::boolean then now() else null end,
       last_seen_at = now()
     where id = $1 and signed_out_at is null`, [id, visible]);
}
