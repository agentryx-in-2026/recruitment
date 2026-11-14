import { useEffect, useState } from "react";
import { Link } from "wouter";
import { GitCommit, Bug, ListChecks, FolderOpen, Bot } from "lucide-react";

/**
 * Product management → Status. The project at a glance, from live data only:
 * per app — build and version, UAT progress, the defect log (open first),
 * findings and recent releases (git); plus questions, the last automated run
 * and the document library by category.
 */
type Overview = {
  projects: {
    id: string; slug: string; name: string; build_ref: string; contractor: string | null; client: string | null; version: string | null;
    cases: { total: number; passed: number; failed: number; waived: number; not_built: number };
    defects: { short_id: string; severity: string; status: string; description: string; resolution: string | null; updated_at: string }[];
    findings: { open: number; total: number };
    releases: { hash: string; date: string; subject: string }[];
  }[];
  questions: { waiting: number; total: number };
  lastRun: { scope: string; status: string; passed: number; failed: number; started_at: string; finished_at: string | null } | null;
  docs: { category: string; n: number; updated: string }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const SEV: Record<string, string> = { blocker: "bg-rose-600 text-white", major: "bg-amber-100 text-amber-900 border border-amber-300", minor: "bg-slate-100 text-slate-700 border border-slate-200" };
const isOpen = (s: string) => s === "open" || s === "in_progress";

function Stat({ n, of, label, tone }: { n: number | string; of?: number; label: string; tone?: "rose" | "amber" | "green" }) {
  return (
    <div className={`rounded-lg border bg-white p-3.5 ${tone === "rose" ? "border-rose-300 border-l-4" : tone === "amber" ? "border-amber-300 border-l-4" : tone === "green" ? "border-emerald-300 border-l-4" : "border-slate-200"}`}>
      <div className="flex items-baseline gap-1"><span className="text-2xl font-bold tabular-nums text-slate-900">{n}</span>{of !== undefined && <span className="text-sm text-slate-500">/ {of}</span>}</div>
      <div className="text-xs font-medium text-slate-600 mt-1">{label}</div>
    </div>
  );
}

export function PmStatus({ onDocs }: { onDocs: () => void }) {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/pm/overview", { credentials: "include" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-rose-700">{err}</p>;
  if (!d) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-8">
      {d.projects.map((p) => {
        const open = p.defects.filter((x) => isOpen(x.status));
        const blockers = open.filter((x) => x.severity === "blocker").length;
        const notRun = p.cases.total - p.cases.passed - p.cases.failed - p.cases.waived;
        return (
          <section key={p.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-serif text-xl font-bold text-slate-900">{p.name}</h2>
              <span className="text-sm text-slate-500">{p.contractor} → {p.client} · build <span className="font-mono">{p.build_ref}</span>{p.version ? <> · app version <span className="font-mono">{p.version}</span></> : null}</span>
              <Link href={`/p/${p.slug}`} className="text-sm text-indigo-700 hover:underline ml-auto">Sign-off matrix</Link>
            </div>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              <Stat n={p.cases.passed} of={p.cases.total} label="UAT cases passed" tone={p.cases.total && p.cases.passed === p.cases.total ? "green" : undefined} />
              <Stat n={p.cases.failed} label="Failed" tone={p.cases.failed ? "rose" : undefined} />
              <Stat n={notRun} label="Not run yet" />
              <Stat n={p.cases.not_built} label="Not built yet" tone={p.cases.not_built ? "amber" : undefined} />
              <Stat n={open.length} of={p.defects.length} label={`Defects open${blockers ? ` · ${blockers} blocker${blockers > 1 ? "s" : ""}` : ""}`} tone={blockers ? "rose" : open.length ? "amber" : "green"} />
              <Stat n={p.findings.open} label="Findings open" />
            </div>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-start">
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900 flex items-center gap-2"><Bug className="w-4 h-4 text-slate-500" /> Defect log</div>
                {p.defects.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No defects logged.</p> : (
                  <div className="divide-y divide-slate-100">
                    {p.defects.map((x) => (
                      <div key={x.short_id} className={`px-5 py-2.5 flex items-start gap-3 text-sm ${isOpen(x.status) ? "" : "opacity-70"}`}>
                        <span className="font-mono text-xs text-slate-500 w-20 shrink-0 pt-0.5">{x.short_id}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-slate-900 line-clamp-2">{x.description}</span>
                          {x.resolution && !isOpen(x.status) && <span className="block text-xs text-slate-500 line-clamp-1">Fix: {x.resolution}</span>}
                        </span>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${SEV[x.severity] ?? SEV.minor}`}>{x.severity}</span>
                          <span className={`text-[11px] font-semibold ${isOpen(x.status) ? "text-rose-700" : "text-emerald-700"}`}>{x.status.replace("_", " ")}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900 flex items-center gap-2"><GitCommit className="w-4 h-4 text-slate-500" /> Recent releases</div>
                {p.releases.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">No release history found for this app.</p> : (
                  <ol className="divide-y divide-slate-100">
                    {p.releases.map((c) => (
                      <li key={c.hash} className="px-5 py-2.5 flex gap-3 text-sm">
                        <span className="text-xs text-slate-500 w-24 shrink-0 pt-0.5">{day(c.date)}</span>
                        <span className="flex-1 min-w-0 text-slate-800">{c.subject.replace(/^[\w-]+:\s*/, "")}</span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0 pt-0.5">{c.hash}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="font-semibold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-slate-500" /> Last automated run</div>
          {d.lastRun ? (
            <div className="mt-2 text-sm text-slate-700">
              <div><b className="text-emerald-700">{d.lastRun.passed}</b> passed · <b className={d.lastRun.failed ? "text-rose-700" : ""}>{d.lastRun.failed}</b> failed <span className="text-slate-500">({d.lastRun.scope}, {d.lastRun.status})</span></div>
              <div className="text-xs text-slate-500 mt-1">{day(d.lastRun.started_at)}</div>
              <Link href="/automation" className="text-sm text-indigo-700 hover:underline mt-2 inline-block">Automated runs</Link>
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">No run yet.</p>}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="font-semibold text-slate-900 flex items-center gap-2"><ListChecks className="w-4 h-4 text-slate-500" /> Questions</div>
          <div className="mt-2 text-sm text-slate-700"><b>{d.questions.waiting}</b> waiting for the team · {d.questions.total} asked in all</div>
          <Link href="/questions" className="text-sm text-indigo-700 hover:underline mt-2 inline-block">Questions inbox</Link>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="font-semibold text-slate-900 flex items-center gap-2"><FolderOpen className="w-4 h-4 text-slate-500" /> Documents</div>
          <ul className="mt-2 text-sm text-slate-700 space-y-1">
            {d.docs.map((x) => <li key={x.category} className="flex justify-between gap-3"><span>{x.category}</span><span className="text-slate-500 tabular-nums">{x.n} · {day(x.updated)}</span></li>)}
          </ul>
          <button onClick={onDocs} className="text-sm text-indigo-700 hover:underline mt-2">Open the library</button>
        </div>
      </section>
    </div>
  );
}
