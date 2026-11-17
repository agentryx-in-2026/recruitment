import { useEffect, useMemo, useState } from "react";
import { Link, useSearch, useRoute, useLocation } from "wouter";
import { Flag, Loader2, Search, ArrowLeft, MessageSquare, Pencil, X, Wrench } from "lucide-react";
import { Shell, Page, useWorkspace } from "../components/Shell";
import { ShotPicker } from "../components/ShotPicker";

/**
 * Findings — ad-hoc / exploratory reports outside the test cases (Piyush's request):
 * bugs, UI/UX problems and ideas, each with steps, expected vs actual, screenshots
 * and a status (Open → In progress → Fixed → Closed). Stored in feedback_items.
 */
type F = {
  id: string; referenceCode: string; projectId: string | null; type: string; title: string; description: string; area: string | null;
  status: string; priority: string; adminNotes: string | null; linkedToItemRef: string | null; createdAt: string; updatedAt: string;
  submitterReviewerId: string; submitter?: { name: string } | null; attachmentCount?: number;
  comments?: { id: string; body: string; createdAt: string; reviewer: { name: string } | null }[];
  attachments?: { id: string; originalName: string }[];
};
type Scope = "app" | "verify";
/** Findings about Verify itself have no project and the area "Verify". */
export const isVerifyFinding = (f: { projectId: string | null; area: string | null }) => !f.projectId && f.area === "Verify";
const kindMap = (scope: Scope) => scope === "verify" ? { ...KIND_BASE, enhancement: ["Improvement", "bg-emerald-50 text-emerald-700 border-emerald-200"] as [string, string] } : KIND_BASE;

const KIND_BASE: Record<string, [string, string]> = {
  bug: ["Bug", "bg-rose-50 text-rose-700 border-rose-200"],
  ux: ["UI / UX", "bg-indigo-50 text-indigo-700 border-indigo-200"],
  enhancement: ["Idea", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  new_feature: ["Idea", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  other: ["Other", "bg-slate-100 text-slate-600 border-slate-200"],
  similar_sw: ["Other", "bg-slate-100 text-slate-600 border-slate-200"],
};
export const KIND = KIND_BASE;
// Tester-facing status: four steps over the stored workflow values.
export const stage = (s: string) => s === "in_progress" ? "progress" : s === "shipped" ? "fixed" : ["declined", "duplicate", "closed"].includes(s) ? "closed" : "open";
const STAGE: Record<string, [string, string]> = {
  open: ["Open", "bg-amber-50 text-amber-800 border-amber-200"],
  progress: ["In progress", "bg-sky-50 text-sky-700 border-sky-200"],
  fixed: ["Fixed — confirm", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  closed: ["Closed", "bg-slate-100 text-slate-500 border-slate-200"],
};
const SEV: Record<string, string> = { low: "Low", normal: "Medium", high: "High", critical: "Critical" };
const AREAS = ["Applicant", "Placement Cell", "Admin", "Sign-in / account", "Mobile app", "General"];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Chip({ map, k }: { map: Record<string, [string, string]>; k: string }) {
  const [l, c] = map[k] ?? [k, "bg-slate-100 text-slate-600 border-slate-200"];
  return <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${c}`}>{l}</span>;
}

/** The structured parts are kept in the description under fixed headings. */
const compose = (p: { summary: string; steps: string; expected: string; actual: string }) =>
  [p.summary.trim(), p.steps.trim() && `## Steps to reproduce\n${p.steps.trim()}`, p.expected.trim() && `## Expected\n${p.expected.trim()}`, p.actual.trim() && `## Actual\n${p.actual.trim()}`].filter(Boolean).join("\n\n");
function parse(d: string) {
  const parts: Record<string, string> = {};
  const [head, ...rest] = d.split(/\n?## /);
  parts.summary = head.trim();
  for (const r of rest) { const [h, ...b] = r.split("\n"); parts[h.trim()] = b.join("\n").trim(); }
  return parts;
}

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white";

const KINDS: Record<Scope, readonly (readonly [string, string])[]> = {
  app: [["bug", "Bug — something is broken"], ["ux", "UI / UX — confusing or hard to use"], ["enhancement", "Idea — could be better"]],
  verify: [["bug", "Bug — something in Verify is broken"], ["enhancement", "Improvement — Verify could be better"]],
};

/** Report a finding, or edit one already reported (initial given). */
function FindingForm({ scope, initial, existing = 0, onDone, onCancel }: { scope: Scope; initial?: F; existing?: number; onDone: (id: string) => void; onCancel: () => void }) {
  const { data } = useWorkspace();
  const projects = data!.projects;
  const was = initial ? parse(initial.description) : null;
  const [f, setF] = useState({
    type: initial?.type ?? "bug", title: initial?.title ?? "", projectId: initial ? initial.projectId ?? "" : projects[0]?.id ?? "",
    area: initial?.area ?? (scope === "verify" ? "Verify" : "Applicant"), priority: initial?.priority ?? "normal", linkedToItemRef: initial?.linkedToItemRef ?? "",
    summary: was?.summary ?? "", steps: was?.["Steps to reproduce"] ?? "", expected: was?.Expected ?? "", actual: was?.Actual ?? "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const isBug = f.type === "bug" || f.type === "ux";

  const submit = async () => {
    setErr(null);
    if (f.title.trim().length < 5) return setErr("Give it a short title (at least 5 characters).");
    const description = compose(f);
    if (isBug && !f.actual.trim()) return setErr("Say what actually happened.");
    if (description.length < 20) return setErr("Add a little more detail (at least 20 characters).");
    if (description.length > 4000) return setErr(`That is ${description.length} characters; the limit is 4,000. Shorten it, or add the rest as a comment.`);
    setBusy(true);
    try {
      const body = { type: f.type, title: f.title.trim(), area: scope === "verify" ? "Verify" : f.area, priority: f.priority, linkedToItemRef: f.linkedToItemRef.trim() || null, description };
      const row = initial
        ? await call(`/api/feedback/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await call("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, projectId: scope === "verify" ? null : f.projectId || null }) });
      if (files.length) { const fd = new FormData(); files.forEach((x) => fd.append("files", x)); await call(`/api/feedback/${row.id}/attachments`, { method: "POST", body: fd }); }
      onDone(row.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5 space-y-4 max-w-4xl">
      <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
        {initial ? <><Pencil className="w-5 h-5 text-indigo-600" /> Edit {initial.referenceCode}</> : scope === "verify" ? <><Wrench className="w-5 h-5 text-indigo-600" /> Report a Verify bug or suggestion</> : <><Flag className="w-5 h-5 text-rose-600" /> Report a finding</>}
      </h2>
      {scope === "verify" && !initial && <p className="text-sm text-slate-600">For problems with this testing portal itself, or ideas to make it easier to use. Problems in HireStream Lite go under Findings.</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
        {KINDS[scope].map(([k, l]) => (
          <button key={k} role="radio" aria-checked={f.type === k} onClick={() => set("type", k)} className={`rounded-md border px-3 py-2 text-sm ${f.type === k ? "border-[#14213D] bg-[#F1F4FA] font-semibold text-[#14213D]" : "border-slate-300 bg-white text-slate-700"}`}>{l}</button>
        ))}
      </div>
      <label className="block"><span className="text-sm font-medium text-slate-700">Title</span>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={150} placeholder={scope === "verify" ? "e.g. Dashboard stays on Loading… after opening Verify" : "e.g. Months of experience is pre-filled with 0"} className={`${input} mt-1`} /></label>
      <div className={`grid gap-3 ${scope === "verify" ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
        {scope === "app" && <>
          <label className="block"><span className="text-sm font-medium text-slate-700">Where</span>
            <select value={f.projectId} disabled={!!initial} onChange={(e) => set("projectId", e.target.value)} className={`${input} mt-1 disabled:bg-slate-50`}>{projects.map((p) => <option key={p.id} value={p.id}>{p.slug === "hirestream-lite" ? "Web portal (Lite)" : "Mobile app"}</option>)}</select></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Area</span>
            <select value={f.area} onChange={(e) => set("area", e.target.value)} className={`${input} mt-1`}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
        </>}
        <label className="block"><span className="text-sm font-medium text-slate-700">Severity</span>
          <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className={`${input} mt-1`}>{Object.entries(SEV).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Related case <span className="text-slate-400 font-normal">(optional)</span></span>
          <input value={f.linkedToItemRef} onChange={(e) => set("linkedToItemRef", e.target.value)} placeholder="e.g. L1.9" className={`${input} mt-1 font-mono`} /></label>
      </div>
      {isBug ? (<>
        <label className="block"><span className="text-sm font-medium text-slate-700">Steps to reproduce</span>
          <textarea rows={3} value={f.steps} onChange={(e) => set("steps", e.target.value)} placeholder={scope === "verify" ? "1. Open the Lite portal\n2. Click Verify in the top bar\n3. …" : "1. Sign in as demo_candidate\n2. Open Complete profile, page 3\n3. …"} className={`${input} mt-1`} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-sm font-medium text-slate-700">Expected</span><textarea rows={3} value={f.expected} onChange={(e) => set("expected", e.target.value)} className={`${input} mt-1`} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Actual</span><textarea rows={3} value={f.actual} onChange={(e) => set("actual", e.target.value)} className={`${input} mt-1`} /></label>
        </div>
        <label className="block"><span className="text-sm font-medium text-slate-700">More details or later observations <span className="text-slate-400 font-normal">(optional)</span></span>
          <textarea rows={2} value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Anything else you noticed, now or on retesting" className={`${input} mt-1`} /></label>
      </>) : (
        <label className="block"><span className="text-sm font-medium text-slate-700">{scope === "verify" ? "Your suggestion" : "Your idea"}</span>
          <textarea rows={4} value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What would be better, and why it matters to the user" className={`${input} mt-1`} /></label>
      )}
      <ShotPicker files={files} onChange={setFiles} existing={existing} label={initial ? "Add screenshots" : "Screenshots"} />
      {err && <p className="text-sm text-rose-700">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-[#14213D] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {initial ? "Save changes" : "Submit"}</button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 bg-white">Cancel</button>
      </div>
    </section>
  );
}

function List({ scope }: { scope: Scope }) {
  const { data, reload } = useWorkspace();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const [rows, setRows] = useState<F[] | null>(null);
  const [filter, setFilter] = useState("open");
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(!!params.get("new"));
  const ids = new Set(data!.projects.map((p) => p.id));
  const base = scope === "verify" ? "/verify-feedback" : "/findings";
  const KINDS_SHOWN = kindMap(scope);
  const load = () => call("/api/feedback").then((r: F[]) => setRows(r.filter((x) => scope === "verify" ? isVerifyFinding(x) : !!x.projectId && ids.has(x.projectId)))).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get("new")) setCreating(true); }, [params.get("new")]);

    const shown = useMemo(() => (rows ?? []).filter((r) =>
    (filter === "all" || (filter === "mine" ? r.submitterReviewerId === data!.me.id : stage(r.status) === filter)) &&
    (!term.trim() || `${r.referenceCode} ${r.title} ${r.description} ${r.linkedToItemRef ?? ""}`.toLowerCase().includes(term.toLowerCase()))), [rows, filter, term]);
  const n = (k: string) => (rows ?? []).filter((r) => k === "all" || (k === "mine" ? r.submitterReviewerId === data!.me.id : stage(r.status) === k)).length;

  return (
    <Page title={scope === "verify" ? "Verify bugs & ideas" : "Findings"}
      sub={scope === "verify"
        ? "Problems with this testing portal itself, and suggestions to make it easier to use. The team works them through Open → In progress → Fixed, and you close each once you have confirmed it."
        : "Bugs, UI/UX problems and ideas found outside the test cases. Report what you notice; the team works it through Open → In progress → Fixed, and you close it once you have confirmed the fix. You can edit a finding after submitting it."}
      actions={!creating && <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-[#14213D] text-white text-sm font-semibold px-3.5 py-2">{scope === "verify" ? <Wrench className="w-4 h-4" /> : <Flag className="w-4 h-4" />} {scope === "verify" ? "Report a Verify bug or idea" : "Report a finding"}</button>}>
      {creating && <FindingForm scope={scope} onCancel={() => { setCreating(false); navigate(base, { replace: true }); }} onDone={(id) => { reload(); navigate(`/findings/${id}`); }} />}
      <div className="flex flex-wrap items-center gap-2">
        {([["open", "Open"], ["progress", "In progress"], ["fixed", "Fixed — confirm"], ["closed", "Closed"], ["mine", "Mine"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>{l} <span className="opacity-70">{n(k)}</span></button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input aria-label="Search findings" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search findings…" className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white" />
        </div>
      </div>
      {rows === null ? <p className="text-slate-400">Loading…</p> : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{rows.length ? "Nothing in this view." : scope === "verify" ? "Nothing reported about Verify yet." : "No findings yet. Use Report a finding when something looks wrong or could be better."}</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2.5 font-semibold">Ref</th><th className="px-4 py-2.5 font-semibold">Finding</th><th className="px-4 py-2.5 font-semibold">Kind</th><th className="px-4 py-2.5 font-semibold">Severity</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Reported</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/findings/${r.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.referenceCode}</td>
                  <td className="px-4 py-3"><Link href={`/findings/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.title}</Link><div className="text-xs text-slate-500 mt-0.5">{r.area ?? "General"}{r.linkedToItemRef ? ` · case ${r.linkedToItemRef}` : ""}{r.attachmentCount ? ` · ${r.attachmentCount} screenshot${r.attachmentCount > 1 ? "s" : ""}` : ""}</div></td>
                  <td className="px-4 py-3"><Chip map={KINDS_SHOWN} k={r.type} /></td>
                  <td className="px-4 py-3 text-slate-700">{SEV[r.priority] ?? r.priority}</td>
                  <td className="px-4 py-3"><Chip map={STAGE} k={stage(r.status)} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{r.submitter?.name ?? "—"}<br />{when(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

function Detail({ id }: { id: string }) {
  const { data, reload } = useWorkspace();
  const [f, setF] = useState<F | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => call(`/api/feedback/${id}`).then((x) => { setF(x); setNote(x.adminNotes ?? ""); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err) return <Page title="Finding"><p className="text-rose-700">{err}</p></Page>;
  if (!f) return <Page title="Finding"><p className="text-slate-400">Loading…</p></Page>;

  const parts = parse(f.description);
  const mine = f.submitterReviewerId === data!.me.id;
  const canTriage = data!.me.isAdmin || data!.me.role === "agentryx" || data!.me.role === "delivery";
  const patch = async (body: any) => { try { await call(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(); reload(); } catch (e: any) { setErr(e.message); } };
  const post = async () => { if (!comment.trim()) return; await call(`/api/feedback/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment.trim() }) }); setComment(""); load(); };
  const st = stage(f.status);
  const project = data!.projects.find((p) => p.id === f.projectId);
  const scope: Scope = isVerifyFinding(f) ? "verify" : "app";
  const canEdit = mine || canTriage;
  const shots = f.attachments?.length ?? 0;
  const removeShot = async (attId: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    try { await call(`/api/feedback/${id}/attachments/${attId}`, { method: "DELETE" }); await load(); } catch (e: any) { setErr(e.message); }
  };
  const addShots = async () => {
    if (!more.length) return;
    setBusy(true);
    try { const fd = new FormData(); more.forEach((x) => fd.append("files", x)); await call(`/api/feedback/${id}/attachments`, { method: "POST", body: fd }); setMore([]); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Page title={f.title} sub={<span className="inline-flex flex-wrap items-center gap-2"><span className="font-mono">{f.referenceCode}</span><Chip map={kindMap(scope)} k={f.type} /><Chip map={STAGE} k={st} /><span>{SEV[f.priority]} severity</span><span>· {scope === "verify" ? "Verify portal" : `${project ? (project.slug === "hirestream-lite" ? "Web portal" : "Mobile app") : ""} · ${f.area ?? "General"}`}</span>{f.linkedToItemRef && <span>· case <b>{f.linkedToItemRef}</b></span>}</span>}
      actions={<>
        {canEdit && !editing && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><Pencil className="w-4 h-4" /> Edit</button>}
        <Link href={scope === "verify" ? "/verify-feedback" : "/findings"} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" /> {scope === "verify" ? "All Verify bugs & ideas" : "All findings"}</Link>
      </>}>
      {editing && <FindingForm scope={scope} initial={f} existing={shots} onCancel={() => setEditing(false)} onDone={async () => { setEditing(false); await load(); reload(); }} />}
      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-start">
        <div className="space-y-4 min-w-0">
          {parts.summary && <section className="bg-white rounded-lg border border-slate-200 p-5"><div className="text-sm text-slate-800 whitespace-pre-wrap">{parts.summary}</div></section>}
          {parts["Steps to reproduce"] && <section className="bg-white rounded-lg border border-slate-200 p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Steps to reproduce</h2><div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{parts["Steps to reproduce"]}</div></section>}
          {(parts.Expected || parts.Actual) && (
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
              <section className="bg-emerald-50/60 rounded-lg border border-emerald-200 p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-emerald-800">Expected</h2><div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{parts.Expected || "—"}</div></section>
              <section className="bg-rose-50 rounded-lg border border-rose-200 p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-rose-700">Actual</h2><div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{parts.Actual || "—"}</div></section>
            </div>
          )}
          {(shots > 0 || canEdit) && (
            <section className="bg-white rounded-lg border border-slate-200 p-5"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Screenshots</h2>
              {shots > 0 ? <div className="mt-3 flex flex-wrap gap-3">{f.attachments!.map((a) => (
                <div key={a.id} className="relative">
                  <a href={`/api/projects/attachments/${a.id}`} target="_blank" rel="noreferrer"><img src={`/api/projects/attachments/${a.id}`} alt={a.originalName} className="h-36 max-w-[260px] rounded border border-slate-200 object-contain bg-white" /></a>
                  {canEdit && <button aria-label={`Remove ${a.originalName}`} onClick={() => removeShot(a.id, a.originalName)} className="absolute -top-2 -right-2 rounded-full bg-white border border-slate-300 p-0.5 text-slate-600 hover:text-rose-700 shadow-sm"><X className="w-3.5 h-3.5" /></button>}
                </div>))}</div> : <p className="mt-2 text-sm text-slate-500">None yet.</p>}
              {canEdit && !editing && shots < 5 && (
                <div className="mt-4 space-y-2">
                  <ShotPicker files={more} onChange={setMore} existing={shots} label="Add screenshots" />
                  {more.length > 0 && <button onClick={addShots} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-[#14213D] text-white text-sm font-semibold px-3.5 py-1.5 disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Upload {more.length} screenshot{more.length > 1 ? "s" : ""}</button>}
                </div>
              )}
            </section>
          )}
          <p className="text-xs text-slate-500">Reported by {f.submitter?.name ?? "—"} · {when(f.createdAt)} · last change {when(f.updatedAt)}</p>
        </div>

        <div className="space-y-4 min-w-0">
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</h2>
            <ol className="mt-3 flex flex-wrap items-center gap-1 text-xs">
              {(["open", "progress", "fixed", "closed"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-1">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${k === st ? "bg-[#14213D] text-white" : "bg-slate-100 text-slate-500"}`}>{STAGE[k][0].replace(" — confirm", "")}</span>
                  {i < 3 && <span className="text-slate-300">→</span>}
                </li>
              ))}
            </ol>
            {f.adminNotes && <div className="mt-4 rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700"><b className="text-slate-900">Team note:</b> {f.adminNotes}</div>}
            <div className="mt-4 flex flex-wrap gap-2">
              {st === "fixed" && (mine || canTriage) && <button onClick={() => patch({ status: "closed" })} className="rounded-md bg-emerald-600 text-white text-sm font-semibold px-3.5 py-2">Confirmed fixed — close</button>}
              {(st === "fixed" || st === "closed") && (mine || canTriage) && <button onClick={() => patch({ status: "submitted" })} className="rounded-md border border-slate-300 bg-white text-sm px-3.5 py-2 text-slate-700">Still broken — reopen</button>}
            </div>
            {canTriage && (
              <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                <div className="text-xs font-semibold text-slate-500">Team: move it along</div>
                <div className="flex flex-wrap gap-2">
                  {([["submitted", "Open"], ["in_progress", "In progress"], ["shipped", "Fixed"], ["declined", "Won't fix"], ["duplicate", "Duplicate"]] as const).map(([v, l]) => (
                    <button key={v} disabled={f.status === v} onClick={() => patch({ status: v, adminNotes: note.trim() || null })} className="rounded-md border border-slate-300 bg-white text-sm px-3 py-1.5 text-slate-700 disabled:bg-slate-100 disabled:text-slate-400">{l}</button>
                  ))}
                </div>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the tester (e.g. fixed in v1.1.1 — please retest)" className={input} aria-label="Team note" />
                <button onClick={() => patch({ adminNotes: note.trim() || null })} className="text-sm text-indigo-700 hover:underline">Save note</button>
              </div>
            )}
          </section>
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Discussion</h2>
            <div className="mt-3 space-y-3">
              {!f.comments?.length && <p className="text-sm text-slate-500">No comments yet.</p>}
              {f.comments?.map((c) => <div key={c.id} className="text-sm"><b className="text-slate-800">{c.reviewer?.name ?? "Reviewer"}</b> <span className="text-xs text-slate-400">{when(c.createdAt)}</span><p className="text-slate-700 whitespace-pre-wrap mt-0.5">{c.body}</p></div>)}
            </div>
            <div className="mt-3 flex gap-2">
              <input aria-label="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} placeholder="Add a comment…" className={input} />
              <button onClick={post} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">Post</button>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

export function Findings() {
  const [m, p] = useRoute("/findings/:id");
  const [verify] = useRoute("/verify-feedback");
  return <Shell title={verify ? "Verify bugs & ideas" : "Findings"}>{m ? <Detail id={p!.id} /> : <List key={verify ? "v" : "a"} scope={verify ? "verify" : "app"} />}</Shell>;
}
