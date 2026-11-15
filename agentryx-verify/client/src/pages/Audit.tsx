import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Download, Printer, RefreshCw, LogIn, Users, Clock, Activity, MousePointerClick, ShieldAlert, Radio, ArrowRight } from "lucide-react";
import { Shell, Page, useWorkspace } from "../components/Shell";

/**
 * Audit trail & usage (admins): who signed in, what they did and when.
 * Overview · People · Sign-ins · Audit trail, all under one set of filters
 * (period, time zone, group by, person). Every number opens the list behind it.
 */
type Tab = "overview" | "people" | "sessions" | "events";
type F = { from: string; to: string; tz: string; group: string; person: string };

const IST = "Asia/Kolkata";
const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function period(key: string, tz: string): [string, string] {
  const now = new Date(), today = ymd(now, tz);
  const shift = (days: number) => ymd(new Date(now.getTime() - days * 86400000), tz);
  const [y, m] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  switch (key) {
    case "yesterday": return [shift(1), shift(1)];
    case "7d": return [shift(6), today];
    case "30d": return [shift(29), today];
    case "month": return [first(y, m), today];
    case "lastmonth": { const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; return [first(py, pm), lastDay(py, pm)]; }
    default: return [today, today];
  }
}
const PERIODS: [string, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["lastmonth", "Last month"], ["custom", "Custom"]];

const dur = (sec: number) => !sec ? "—" : sec < 60 ? "< 1 min" : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
const fmt = (iso: string | null, tz: string, withDate = true) => !iso ? "—" : new Date(iso).toLocaleString("en-GB", { timeZone: tz, ...(withDate ? { day: "numeric", month: "short", year: "numeric" } : {}), hour: "numeric", minute: "2-digit", hour12: true });

/** What happened, in words. */
export const LABEL: Record<string, string> = {
  "auth.login": "Signed in", "auth.logout": "Signed out", "auth.login_failed": "Failed sign-in", "auth.session_ended": "Ended a sign-in",
  "signoff.created": "Recorded a result", "signoff.updated": "Changed a result", "signoff.cleared": "Cleared a result",
  "comment.added": "Commented on a case", "case.instructions_edited": "Edited case instructions",
  "finding.reported": "Reported a finding", "finding.updated": "Updated a finding", "finding.comment": "Commented on a finding", "finding.screenshots": "Added screenshots to a finding",
  "ask.question": "Asked Ask Agentryx", "ask.answered": "Answered a question", "ask.reindex": "Rebuilt the knowledge base",
  "document.viewed": "Opened a document", "document.downloaded": "Downloaded a document", "document.uploaded": "Uploaded a document", "document.updated": "Changed a document", "document.deleted": "Deleted a document",
  "settings.update": "Changed a setting", "auto.run": "Started an automated run", "project.visibility": "Changed project visibility",
  "defect.logged": "Logged a defect", "defect.updated": "Updated a defect", "audit.exported": "Exported the audit trail",
  "pm.update": "Changed a document", "pm.upload": "Uploaded a document", "pm.delete": "Deleted a document",
};
const DEC: Record<string, string> = { accepted: "Passed", rejected: "Failed", waived: "Waived" };
function detail(a: string, m: any): string {
  if (!m || typeof m !== "object") return "";
  const parts: string[] = [];
  if (a === "auth.login_failed") return [m.reason, m.username ? `username “${m.username}”` : ""].filter(Boolean).join(" · ");
  if (a === "auth.login") return [m.method && m.method !== "password" ? `by ${m.method}` : "", m.device].filter(Boolean).join(" · ");
  if (m.decision) parts.push(DEC[m.decision] ?? m.decision);
  if (m.level) parts.push(`level ${String(m.level).replace("_", " ")}`);
  if (m.comment) parts.push(`“${m.comment}”`);
  if (m.text) parts.push(`“${m.text}”`);
  if (m.question) parts.push(`“${m.question}”`);
  if (m.answered) parts.push(m.answered);
  if (m.answer) parts.push(`answer: “${m.answer}”`);
  if (m.title) parts.push(m.title);
  if (m.status) parts.push(`status → ${m.status}`);
  if (m.note) parts.push(`note: ${m.note}`);
  if (m.severity) parts.push(m.severity);
  if (m.description) parts.push(m.description);
  if (m.files) parts.push(`${m.files} file${m.files > 1 ? "s" : ""}`);
  if (a === "settings.update" && "value" in m) parts.push(`→ ${typeof m.value === "object" ? JSON.stringify(m.value) : String(m.value)}`);
  if (a === "project.visibility") parts.push(m.visibleToTesters ? "testers can see it" : "admins only");
  if (a === "document.updated") { if ("pinned" in m) parts.push(m.pinned ? "starred" : "unstarred"); if (m.audience) parts.push(`audience → ${m.audience}`); }
  if (a === "auto.run" && m.runId) parts.push(`run ${String(m.runId).slice(0, 6)}`);
  if (a === "audit.exported") parts.push(`${m.from} to ${m.to}`);
  if (a.startsWith("document.") && m.category && !parts.length) parts.push(m.category);
  return parts.join(" · ");
}

const STATUS: Record<string, [string, string]> = {
  in_progress: ["In progress", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  signed_out: ["Signed out", "bg-slate-100 text-slate-600 border-slate-200"],
  left_open: ["Left open", "bg-amber-50 text-amber-800 border-amber-200"],
  expired: ["Expired", "bg-slate-100 text-slate-500 border-slate-200"],
  ended_by_admin: ["Ended by admin", "bg-rose-50 text-rose-700 border-rose-200"],
};

function Card({ n, label, icon: I, tone, onClick }: { n: ReactNode; label: string; icon: any; tone?: "rose" | "green"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-400 hover:shadow-sm transition">
      <div className={`text-[26px] font-bold leading-none tabular-nums ${tone === "rose" && n ? "text-rose-700" : tone === "green" && n ? "text-emerald-700" : "text-slate-900"}`}>{n}</div>
      <div className="mt-2 text-sm text-slate-600 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><I className="w-4 h-4 text-slate-400" />{label}</span><ArrowRight className="w-3.5 h-3.5 text-slate-300" /></div>
    </button>
  );
}

/** Single-series bar chart: one hue, rounded data-ends on the baseline, light grid, hover tooltip per bar. */
function Bars({ title, data, value, fmtV, empty }: { title: string; data: { bucket: string }[]; value: (d: any) => number; fmtV: (n: number) => string; empty: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map(value), max = Math.max(1, ...vals);
  const ticks = [max, max / 2, 0];
  const label = (b: string) => new Date(b + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-baseline justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3><span className="text-sm text-slate-600 tabular-nums">{fmtV(total)} in all</span></div>
      {!total ? <p className="text-sm text-slate-500 py-10 text-center">{empty}</p> : (
        <div className="mt-4 grid grid-cols-[3.5rem_1fr] gap-2">
          <div className="relative h-44 text-[11px] text-slate-500 tabular-nums">{ticks.map((t, i) => <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 2) * 100}%` }}>{fmtV(t)}</span>)}</div>
          <div className="relative h-44">
            {[0, 50, 100].map((p) => <div key={p} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${p}%` }} />)}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((d, i) => (
                <div key={d.bucket} className="relative flex-1 h-full flex items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div className="audit-bar w-full max-w-[56px] rounded-t-[4px]" style={{ height: `${(vals[i] / max) * 100}%`, minHeight: vals[i] ? 3 : 0 }} />
                  {hover === i && <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-md bg-slate-900 text-white text-xs px-2 py-1 shadow">{label(d.bucket)} · {fmtV(vals[i])}</div>}
                </div>
              ))}
            </div>
          </div>
          <div />
          <div className="flex gap-[2px] text-[11px] text-slate-500">{data.map((d, i) => <span key={d.bucket} className="flex-1 text-center truncate">{data.length <= 16 || i % Math.ceil(data.length / 12) === 0 ? label(d.bucket) : ""}</span>)}</div>
        </div>
      )}
    </section>
  );
}

function Body() {
  const { data } = useWorkspace();
  const [tab, setTab] = useState<Tab>("overview");
  const [per, setPer] = useState("today");
  const [f, setF] = useState<F>(() => { const [from, to] = period("today", IST); return { from, to, tz: IST, group: "day", person: "" }; });
  const [type, setType] = useState("all");
  const [ov, setOv] = useState<any>(null), [people, setPeople] = useState<any[] | null>(null), [ses, setSes] = useState<any>(null), [ev, setEv] = useState<any>(null);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [limit, setLimit] = useState(200);
  const [busy, setBusy] = useState(false), [showStale, setShowStale] = useState(false);
  const qs = useMemo(() => new URLSearchParams({ from: f.from, to: f.to, tz: f.tz, group: f.group, person: f.person }).toString(), [f]);
  const j = (u: string) => fetch(u, { credentials: "include" }).then((r) => r.json());

  const load = async () => {
    setBusy(true);
    try {
      const [o, p, s, e] = await Promise.all([j(`/api/audit/overview?${qs}`), j(`/api/audit/people?${qs}`), j(`/api/audit/sessions?${qs}`), j(`/api/audit/events?${qs}&type=${type}&limit=${limit}`)]);
      setOv(o); setPeople(p); setSes(s); setEv(e);
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [qs, type, limit]);
  useEffect(() => { j("/api/audit/reviewers").then((r) => setReviewers(Array.isArray(r) ? r : [])); }, []);

  if (!data!.me.isAdmin) return <Page title="Audit trail & usage"><p className="text-slate-600">For admins.</p></Page>;

  const pick = (k: string) => { setPer(k); if (k !== "custom") { const [from, to] = period(k, f.tz); setF((x) => ({ ...x, from, to })); } };
  const setTz = (tz: string) => { setF((x) => { const [from, to] = per === "custom" ? [x.from, x.to] : period(per, tz); return { ...x, tz, from, to }; }); };
  const endSession = async (id: string) => { await fetch(`/api/audit/sessions/${id}/end`, { method: "POST", credentials: "include" }); load(); };
  const endStale = async () => { await fetch("/api/audit/sessions/end-stale", { method: "POST", credentials: "include" }); load(); };
  const exportHref = `/api/audit/export.csv?${qs}&tab=${tab === "overview" ? "events" : tab}&type=${type}`;
  const c = ov?.cards ?? {};
  const toEvents = (t: string) => { setType(t); setTab("events"); };
  const chip = "rounded-md px-3 py-1.5 text-sm";
  const head = "px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap";
  const cell = "px-4 py-3 align-top";

  return (
    <Page title="Audit trail & usage" sub={`Who signed in, what they did and when. ${fmt(new Date(f.from + "T00:00:00").toISOString(), f.tz, true).split(",")[0]}${f.from !== f.to ? ` to ${fmt(new Date(f.to + "T00:00:00").toISOString(), f.tz, true).split(",")[0]}` : ""}, times in ${f.tz === IST ? "IST (India)" : "UTC"}.`}
      actions={<>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50"><Printer className="w-4 h-4" /> Print report</button>
        <a href={exportHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#14213D] rounded-md px-3.5 py-2 hover:bg-[#1d2d52]"><Download className="w-4 h-4" /> Export CSV</a>
      </>}>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => pick(k)} className={`${chip} ${per === k ? "bg-[#14213D] text-white font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>{l}</button>)}
        </div>
        {per === "custom" && <span className="inline-flex items-center gap-1.5 text-sm">
          <input type="date" aria-label="From" value={f.from} max={f.to} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 bg-white" />–
          <input type="date" aria-label="To" value={f.to} min={f.from} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 bg-white" />
        </span>}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {[[IST, "IST"], ["UTC", "UTC"]].map(([k, l]) => <button key={k} onClick={() => setTz(k)} className={`${chip} ${f.tz === k ? "bg-slate-200 font-semibold text-slate-900" : "text-slate-600"}`}>{l}</button>)}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">Group by
          <select value={f.group} onChange={(e) => setF((x) => ({ ...x, group: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 bg-white text-slate-900"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">Person
          <select value={f.person} onChange={(e) => setF((x) => ({ ...x, person: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 bg-white text-slate-900 max-w-[220px]">
            <option value="">Everyone</option>{reviewers.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.username})</option>)}
          </select>
        </label>
      </div>

      <div className="flex gap-1 border-b border-slate-200 print:hidden">
        {([["overview", "Overview", null], ["people", "People", people?.length], ["sessions", "Sign-ins", ses?.rows?.length], ["events", "Audit trail", ev?.counts?.all]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? "border-[#14213D] text-slate-900 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}{n != null && <span className="ml-1.5 text-xs text-slate-400">{n}</span>}</button>
        ))}
      </div>

      {tab === "overview" && ov && (<>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(165px,1fr))]">
          <Card n={c.sign_ins} label="Sign-ins" icon={LogIn} onClick={() => toEvents("signins")} />
          <Card n={c.people} label="People signed in" icon={Users} onClick={() => setTab("people")} />
          <Card n={dur(c.active_seconds)} label="Time active" icon={Clock} onClick={() => setTab("sessions")} />
          <Card n={c.visits} label="Visits" icon={Activity} onClick={() => setTab("sessions")} />
          <Card n={c.actions} label="Actions on items" icon={MousePointerClick} onClick={() => toEvents("items")} />
          <Card n={c.failed} label="Failed sign-ins" icon={ShieldAlert} tone="rose" onClick={() => toEvents("failed")} />
          <Card n={c.online} label="Online now" icon={Radio} tone="green" onClick={() => setTab("sessions")} />
        </div>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]">
          <Bars title={`Sign-ins per ${f.group}`} data={ov.series} value={(d) => d.sign_ins} fmtV={(n) => String(Math.round(n))} empty="No sign-ins in this period." />
          <Bars title={`Hours active per ${f.group}`} data={ov.series} value={(d) => d.active_seconds / 3600} fmtV={(n) => `${n.toFixed(1)} h`} empty="No measured activity yet — time active is counted from now on." />
        </div>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]">
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Online now</h3>
            {!ov.online.length ? <p className="text-sm text-slate-500 mt-3">Nobody else is active right now.</p> : ov.online.map((o: any) => (
              <div key={o.id} className="mt-3 flex items-start justify-between gap-3 text-sm">
                <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2" /><b className="text-slate-900">{o.name}</b><span className="block text-xs text-slate-500 ml-4">{o.username} · {o.role}{o.device ? ` · ${o.device}` : ""}</span></span>
                <span className="text-slate-600 whitespace-nowrap">last active {fmt(o.last_seen, f.tz, false)}</span>
              </div>
            ))}
          </section>
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Most active in this period</h3>
            {!ov.most.length ? <p className="text-sm text-slate-500 mt-3">No activity in this period.</p> : ov.most.map((o: any) => (
              <button key={o.id} onClick={() => { setF((x) => ({ ...x, person: o.id })); setTab("sessions"); }} className="w-full mt-1 flex items-start justify-between gap-3 text-sm py-2 border-b border-slate-100 last:border-0 text-left hover:bg-slate-50 rounded px-1">
                <span><b className="text-slate-900">{o.name}</b><span className="block text-xs text-slate-500">{o.sign_ins} sign-in{o.sign_ins === 1 ? "" : "s"}, {o.actions} action{o.actions === 1 ? "" : "s"}</span></span>
                <span className="text-slate-700 tabular-nums">{dur(o.active_seconds)}</span>
              </button>
            ))}
          </section>
        </div>
      </>)}

      {tab === "people" && people && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="border-b border-slate-200"><tr>{["Person", "Role", "Sign-ins", "Visits", "Time active", "First seen", "Last seen", "Results", "Findings", "Questions", "Comments", "Files", "Docs opened", "All actions"].map((h) => <th key={h} className={head}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!people.length && <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-500">Nobody was active in this period.</td></tr>}
              {people.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setF((x) => ({ ...x, person: p.id })); setTab("sessions"); }}>
                  <td className={cell}><span className="font-medium text-slate-900">{p.online && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />}{p.name}</span><span className="block text-xs text-slate-500">{p.username}</span></td>
                  <td className={cell}>{p.role}</td>
                  {[p.sign_ins, p.visits].map((v, i) => <td key={i} className={`${cell} tabular-nums`}>{v}</td>)}
                  <td className={`${cell} tabular-nums whitespace-nowrap`}>{dur(p.active_seconds)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{fmt(p.first_seen, f.tz)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{fmt(p.last_seen, f.tz)}</td>
                  {[p.verdicts, p.findings, p.questions, p.comments, p.files, p.documents].map((v, i) => <td key={i} className={`${cell} tabular-nums`}>{v}</td>)}
                  <td className={`${cell} tabular-nums font-semibold`}>{p.actions}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">Click a person to see their sign-ins. Results are case verdicts (pass / fail / waive); actions count every change to an item. Visits and time active are measured from 15 Nov 2026, when this audit trail started.</p>
        </div>
      )}

      {tab === "sessions" && ses && (<>
        {ses.stale.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
            <span className="text-amber-900"><b>{ses.stale.length} sign-in{ses.stale.length > 1 ? "s" : ""} left open:</b> not used for 30 minutes or more, from any date. Your own stays.</span>
            <button onClick={() => setShowStale(!showStale)} className="text-amber-900 underline">{showStale ? "Hide them" : "Show them"}</button>
            <button onClick={endStale} className="ml-auto rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100">End all {ses.stale.length}</button>
            {showStale && <ul className="basis-full text-amber-900 space-y-0.5">{ses.stale.map((s: any) => <li key={s.id}>{s.name} · signed in {fmt(s.signed_in_at, f.tz)} · last active {fmt(s.last_seen_at, f.tz)} · {s.device} · {s.ip}</li>)}</ul>}
          </div>
        )}
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="border-b border-slate-200"><tr>{["Person", "Signed in", "Last active", "Visits", "Time active", "Actions", "Status", "Device", "IP", ""].map((h, i) => <th key={i} className={head}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!ses.rows.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No sign-ins recorded in this period. Sign-ins are tracked from 15 Nov 2026; earlier ones appear in the Audit trail tab.</td></tr>}
              {ses.rows.map((s: any) => {
                const [l, cls] = STATUS[s.status] ?? [s.status, "bg-slate-100 text-slate-600 border-slate-200"];
                return (
                  <tr key={s.id}>
                    <td className={cell}><span className="font-medium text-slate-900">{s.name}</span><span className="block text-xs text-slate-500">{s.username}{s.method && s.method !== "password" ? ` · ${s.method}` : ""}</span></td>
                    <td className={`${cell} whitespace-nowrap`}>{fmt(s.signed_in_at, f.tz)}</td>
                    <td className={`${cell} whitespace-nowrap`}>{s.status === "in_progress" ? `now, ${fmt(s.last_seen_at, f.tz, false)}` : fmt(s.last_seen_at, f.tz)}</td>
                    <td className={`${cell} tabular-nums`}>{s.visits}</td>
                    <td className={`${cell} tabular-nums whitespace-nowrap`}>{dur(s.active_seconds)}</td>
                    <td className={`${cell} tabular-nums`}>{s.actions}</td>
                    <td className={cell}><span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${cls}`}>{l}</span>{s.signed_out_at && <span className="block text-xs text-slate-500 mt-0.5">{fmt(s.signed_out_at, f.tz)}</span>}</td>
                    <td className={`${cell} whitespace-nowrap`}>{s.device}</td>
                    <td className={`${cell} font-mono text-xs`}>{s.ip}</td>
                    <td className={`${cell} text-right whitespace-nowrap`}>
                      {s.mine ? <span className="text-[11px] font-semibold rounded-full border px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">this browser</span>
                        : (s.status === "in_progress" || s.status === "left_open") && <button onClick={() => endSession(s.id)} className="rounded-md border border-rose-300 text-rose-700 px-2.5 py-1 text-xs hover:bg-rose-50">End session</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">One row per sign-in. A visit starts when someone opens Verify and ends after 30 minutes without activity. Time active counts only while the page is open and in view. A sign-in stops working after 8 hours unused; “End session” signs that browser out at once.</p>
        </div>
      </>)}

      {tab === "events" && ev && (<>
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 print:hidden">
          {([["all", "Everything"], ["signins", "Sign-ins"], ["failed", "Failed sign-ins"], ["account", "Account & settings"], ["items", "Changes to items"], ["documents", "Documents"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setType(k); setLimit(200); }} className={`${chip} ${type === k ? "bg-[#14213D] text-white font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>{l} <span className="opacity-70">{ev.counts?.[k] ?? 0}</span></button>
          ))}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="border-b border-slate-200"><tr>{["Time", "Person", "What happened", "Item", "Detail", "IP"].map((h) => <th key={h} className={head}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!ev.rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nothing recorded for this filter and period.</td></tr>}
              {ev.rows.map((e: any) => (
                <tr key={e.id}>
                  <td className={`${cell} whitespace-nowrap`}>{fmt(e.created_at, f.tz)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{e.name ?? <span className="text-slate-400">—</span>}</td>
                  <td className={`${cell} whitespace-nowrap ${e.action === "auth.login_failed" ? "text-rose-700 font-medium" : "text-slate-900"}`}>{LABEL[e.action] ?? e.action}</td>
                  <td className={`${cell} font-mono text-xs whitespace-nowrap`}>{e.item ? (/^L\d|^M\d/.test(e.item) ? <Link href={`/cases?project=hirestream-lite`} className="text-indigo-700 hover:underline">{e.item}</Link> : e.item) : ""}</td>
                  <td className={`${cell} text-slate-700 max-w-[560px]`}>{detail(e.action, e.meta)}</td>
                  <td className={`${cell} font-mono text-xs`}>{e.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ev.rows.length >= limit && <button onClick={() => setLimit(limit + 300)} className="w-full py-3 text-sm text-indigo-700 hover:bg-slate-50 border-t border-slate-100">Show more</button>}
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">Every event, newest first. Events before 15 Nov 2026 were recorded without IP addresses.</p>
        </div>
      </>)}
    </Page>
  );
}

export function Audit() {
  return <Shell title="Audit trail & usage"><Body /></Shell>;
}
