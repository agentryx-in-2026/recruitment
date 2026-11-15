import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { GitCommit, Bug, ListChecks, FolderOpen, Bot, ChevronDown, ExternalLink, ArrowRight, Loader2 } from "lucide-react";

/**
 * Product management → Status. The project at a glance, from live data only.
 * Every element leads somewhere: number cards open the filtered list, defect
 * rows expand to the full record, release rows expand to the change note and
 * files changed (with a GitHub link), and the summary cards open their pages.
 */
type Defect = { short_id: string; severity: string; status: string; description: string; resolution: string | null; updated_at: string };
type Overview = {
  projects: {
    id: string; slug: string; name: string; build_ref: string; contractor: string | null; client: string | null; version: string | null;
    cases: { total: number; passed: number; failed: number; waived: number; not_built: number };
    defects: Defect[];
    findings: { open: number; total: number };
    releases: { hash: string; date: string; subject: string }[];
  }[];
  questions: { waiting: number; total: number };
  lastRun: { scope: string; status: string; passed: number; failed: number; started_at: string; finished_at: string | null } | null;
  docs: { category: string; n: number; updated: string }[];
};
type Release = { hash: string; author: string; date: string; subject: string; body: string; files: { add: number; del: number; file: string }[]; fileCount: number; url: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const SEV: Record<string, string> = { blocker: "bg-rose-600 text-white", major: "bg-amber-100 text-amber-900 border border-amber-300", minor: "bg-slate-100 text-slate-700 border border-slate-200" };
const isOpen = (s: string) => s === "open" || s === "in_progress";
const catId = (c: string) => `cat-${c.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
const scrollTo = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

const cardCls = (tone?: string) => `block w-full text-left rounded-lg border bg-white p-3.5 hover:border-slate-400 hover:shadow-sm transition ${tone === "rose" ? "border-rose-300 border-l-4" : tone === "amber" ? "border-amber-300 border-l-4" : tone === "green" ? "border-emerald-300 border-l-4" : "border-slate-200"}`;
function Stat({ n, of, label, tone, href, onClick, title }: { n: number | string; of?: number; label: string; tone?: "rose" | "amber" | "green"; href?: string; onClick?: () => void; title: string }) {
  const inner = (<>
    <div className="flex items-baseline gap-1"><span className="text-2xl font-bold tabular-nums text-slate-900">{n}</span>{of !== undefined && <span className="text-sm text-slate-500">/ {of}</span>}</div>
    <div className="text-xs font-medium text-slate-600 mt-1 flex items-center justify-between gap-1">{label}<ArrowRight className="w-3 h-3 text-slate-300" /></div>
  </>);
  return href ? <Link href={href} title={title} className={cardCls(tone)}>{inner}</Link> : <button onClick={onClick} title={title} className={cardCls(tone)}>{inner}</button>;
}

function DefectRow({ x, slug }: { x: Defect; slug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={isOpen(x.status) ? "" : "opacity-75"}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-left px-5 py-2.5 flex items-start gap-3 text-sm hover:bg-slate-50">
        <span className="font-mono text-xs text-slate-500 w-20 shrink-0 pt-0.5">{x.short_id}</span>
        <span className="flex-1 min-w-0">
          <span className={`block text-slate-900 ${open ? "" : "line-clamp-2"}`}>{x.description}</span>
          {!open && x.resolution && !isOpen(x.status) && <span className="block text-xs text-slate-500 line-clamp-1">Fix: {x.resolution}</span>}
        </span>
        <span className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${SEV[x.severity] ?? SEV.minor}`}>{x.severity}</span>
          <span className={`text-[11px] font-semibold ${isOpen(x.status) ? "text-rose-700" : "text-emerald-700"}`}>{x.status.replace("_", " ")}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-3 pl-[7.25rem] text-sm space-y-2">
          {x.resolution ? <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-slate-800"><b className="text-emerald-800">Resolution.</b> {x.resolution}</div>
            : <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-slate-800">No resolution recorded yet.</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Last change {day(x.updated_at)}</span>
            <Link href={`/p/${slug}`} className="text-indigo-700 hover:underline">Edit in the project's defect log</Link>
            <Link href={`/cases?project=${slug}`} className="text-indigo-700 hover:underline">{slug === "hirestream-lite" ? "Cases, incl. the L6.x retests" : "The app's cases"}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseRow({ c }: { c: { hash: string; date: string; subject: string } }) {
  const [open, setOpen] = useState(false);
  const [rel, setRel] = useState<Release | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    setOpen(!open);
    if (!rel && !open) {
      try { const r = await fetch(`/api/pm/release/${c.hash}`, { credentials: "include" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setRel(j); }
      catch (e: any) { setErr(e.message); }
    }
  };
  return (
    <li>
      <button onClick={toggle} aria-expanded={open} className="w-full text-left px-5 py-2.5 flex gap-3 text-sm hover:bg-slate-50">
        <span className="text-xs text-slate-500 w-24 shrink-0 pt-0.5">{day(c.date)}</span>
        <span className="flex-1 min-w-0 text-slate-800">{c.subject.replace(/^[\w-]+:\s*/, "")}</span>
        <span className="font-mono text-[11px] text-slate-400 shrink-0 pt-0.5">{c.hash}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-3 pl-[8.25rem] text-sm">
          {err ? <p className="text-rose-700">{err}</p> : !rel ? <p className="text-slate-400 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p> : (
            <div className="space-y-2">
              {rel.body && <div className="whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[13px] leading-relaxed">{rel.body}</div>}
              <div className="text-xs text-slate-500">{rel.author} · {new Date(rel.date).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {rel.fileCount} file{rel.fileCount === 1 ? "" : "s"} changed</div>
              <ul className="text-xs font-mono text-slate-600 max-h-48 overflow-y-auto space-y-0.5">
                {rel.files.map((f) => <li key={f.file} className="flex gap-2"><span className="text-emerald-700 w-10 text-right">+{f.add}</span><span className="text-rose-700 w-10 text-right">−{f.del}</span><span className="truncate">{f.file}</span></li>)}
                {rel.fileCount > rel.files.length && <li className="text-slate-400">… and {rel.fileCount - rel.files.length} more</li>}
              </ul>
              <a href={rel.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline">View on GitHub <ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function SummaryCard({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "block w-full text-left bg-white rounded-lg border border-slate-200 p-5 hover:border-slate-400 hover:shadow-sm transition";
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick?.()}>{children}</div>;
}

export function PmStatus({ onDocs, view = "status" }: { onDocs: () => void; view?: "status" | "defects" | "releases" }) {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/pm/overview${view === "releases" ? "?releases=40" : ""}`, { credentials: "include" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message)); }, [view]);
  if (err) return <p className="text-rose-700">{err}</p>;
  if (!d) return <p className="text-slate-400">Loading…</p>;
  const openDocs = (category?: string) => { onDocs(); if (category) setTimeout(() => scrollTo(catId(category)), 400); };

  return (
    <div className="space-y-8">
      {d.projects.map((p) => {
        const open = p.defects.filter((x) => isOpen(x.status));
        const blockers = open.filter((x) => x.severity === "blocker").length;
        const notRun = p.cases.total - p.cases.passed - p.cases.failed - p.cases.waived;
        const q = (show: string) => `/cases?show=${show}&project=${p.slug}`;
        return (
          <section key={p.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link href={`/p/${p.slug}`} className="font-serif text-xl font-bold text-slate-900 hover:underline">{p.name}</Link>
              <span className="text-sm text-slate-500">{p.contractor} → {p.client} · build <span className="font-mono">{p.build_ref}</span>{p.version ? <> · app version <span className="font-mono">{p.version}</span></> : null}</span>
              <Link href={`/p/${p.slug}`} className="text-sm text-indigo-700 hover:underline ml-auto">Sign-off matrix</Link>
            </div>
            {view === "status" && <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              <Stat n={p.cases.passed} of={p.cases.total} label="UAT cases passed" href={q("passed")} title="Open the passed cases" tone={p.cases.total && p.cases.passed === p.cases.total ? "green" : undefined} />
              <Stat n={p.cases.failed} label="Failed" href={q("failed")} title="Open the failed cases" tone={p.cases.failed ? "rose" : undefined} />
              <Stat n={notRun} label="Not run yet" href={q("torun")} title="Open the cases still to run" />
              <Stat n={p.cases.not_built} label="Not built yet" href={q("notbuilt")} title="Open the cases waiting for a build" tone={p.cases.not_built ? "amber" : undefined} />
              <Stat n={open.length} of={p.defects.length} label={`Defects open${blockers ? ` · ${blockers} blocker${blockers > 1 ? "s" : ""}` : ""}`} onClick={() => scrollTo(`defects-${p.slug}`)} title="Jump to the defect log" tone={blockers ? "rose" : open.length ? "amber" : "green"} />
              <Stat n={p.findings.open} label="Findings open" href="/findings" title="Open the findings" />
            </div>}
            {view === "defects" && <p className="text-sm text-slate-600"><b>{open.length}</b> open{blockers ? <> · <b className="text-rose-700">{blockers} blocker{blockers > 1 ? "s" : ""}</b></> : null} · {p.defects.length - open.length} resolved. Click a row for the resolution.</p>}
            <div className={`grid gap-4 items-start ${view === "status" ? "grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))]" : "grid-cols-1"}`}>
              {view !== "releases" && <div id={`defects-${p.slug}`} className="bg-white rounded-lg border border-slate-200 scroll-mt-32">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900 flex items-center gap-2"><Bug className="w-4 h-4 text-slate-500" /> Defect log</span>
                  <Link href={`/p/${p.slug}`} className="text-sm text-indigo-700 hover:underline">Manage defects</Link>
                </div>
                {p.defects.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No defects logged.</p> : (
                  <div className="divide-y divide-slate-100">{p.defects.map((x) => <DefectRow key={x.short_id} x={x} slug={p.slug} />)}</div>
                )}
              </div>}
              {view !== "defects" && <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900 flex items-center gap-2"><GitCommit className="w-4 h-4 text-slate-500" /> Recent releases</span>
                  <a href="https://github.com/agentryx-in-2026/recruitment/commits/main" target="_blank" rel="noreferrer" className="text-sm text-indigo-700 hover:underline inline-flex items-center gap-1">All on GitHub <ExternalLink className="w-3.5 h-3.5" /></a>
                </div>
                {p.releases.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No release history found for this app.</p> : (
                  <ol className="divide-y divide-slate-100">{p.releases.map((c) => <ReleaseRow key={c.hash} c={c} />)}</ol>
                )}
              </div>}
            </div>
          </section>
        );
      })}

      {view === "status" && <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <SummaryCard href="/automation">
          <div className="font-semibold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-slate-500" /> Last automated run <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto" /></div>
          {d.lastRun ? (
            <div className="mt-2 text-sm text-slate-700">
              <div><b className="text-emerald-700">{d.lastRun.passed}</b> passed · <b className={d.lastRun.failed ? "text-rose-700" : ""}>{d.lastRun.failed}</b> failed <span className="text-slate-500">({d.lastRun.scope}, {d.lastRun.status})</span></div>
              <div className="text-xs text-slate-500 mt-1">{day(d.lastRun.started_at)} · open Automated runs</div>
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">No run yet.</p>}
        </SummaryCard>
        <SummaryCard href="/questions">
          <div className="font-semibold text-slate-900 flex items-center gap-2"><ListChecks className="w-4 h-4 text-slate-500" /> Questions <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto" /></div>
          <div className="mt-2 text-sm text-slate-700"><b>{d.questions.waiting}</b> waiting for the team · {d.questions.total} asked in all</div>
          <div className="text-xs text-slate-500 mt-1">Open the Questions inbox</div>
        </SummaryCard>
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <button onClick={() => openDocs()} className="w-full font-semibold text-slate-900 flex items-center gap-2 hover:underline"><FolderOpen className="w-4 h-4 text-slate-500" /> Documents <ArrowRight className="w-3.5 h-3.5 text-slate-300 ml-auto" /></button>
          <ul className="mt-2 text-sm">
            {d.docs.map((x) => (
              <li key={x.category}>
                <button onClick={() => openDocs(x.category)} className="w-full flex justify-between gap-3 rounded px-1.5 py-1 -mx-1.5 hover:bg-slate-50 text-slate-700">
                  <span className="text-indigo-700">{x.category}</span><span className="text-slate-500 tabular-nums">{x.n} · {day(x.updated)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>}
    </div>
  );
}
