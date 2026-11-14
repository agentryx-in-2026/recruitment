import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bot, Loader2, PlayCircle } from "lucide-react";
import { Shell, useWorkspace } from "../components/Shell";

/** Automated E2E runs: start a run, watch progress, see results per case. */
type Run = { id: string; scope: string; status: string; started_at: string; finished_at: string | null; passed: number; failed: number; started_by: string | null; log_tail: string };

const SCOPES: [string, string, string][] = [
  ["all", "Everything", "Admin, Placement Cell and Applicant checks in demo order (about 10–15 minutes)"],
  ["admin", "Admin", "Acts 1–2: configuration, job import, drives"],
  ["agency", "Placement Cell", "Acts 2, 4–6: post job, pipeline, interviews, selection, departure, welfare"],
  ["applicant", "Applicant", "Acts 3–6: register, apply, interview, documents, offer, help"],
];

function Body() {
  const { data, reload } = useWorkspace();
  const [runs, setRuns] = useState<Run[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => fetch("/api/testing/auto/runs", { credentials: "include" }).then((r) => r.json()).then(setRuns).catch(() => {});
  useEffect(() => { load(); }, []);
  const running = runs.find((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => { await load(); }, 5000);
    return () => clearInterval(t);
  }, [running?.id]);
  useEffect(() => { if (!running && data?.running) reload(); }, [running, data?.running, reload]);

  const canRun = data!.me.isAdmin || data!.me.role === "agentryx";
  const lite = data!.projects.find((p) => p.slug === "hirestream-lite");
  const covered = lite?.cases.filter((c) => c.autoScope) ?? [];
  const autoPassed = covered.filter((c) => c.auto?.status === "passed").length;
  const autoFailed = covered.filter((c) => c.auto?.status === "failed").length;

  const start = async (scope: string) => {
    setMsg(null);
    const r = await fetch("/api/testing/auto/run", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
    const j = await r.json();
    if (!r.ok) setMsg(j.error); else { load(); reload(); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900 flex items-center gap-2"><Bot className="w-7 h-7" /> Automated runs</h1>
        <p className="text-slate-600 mt-2 max-w-3xl">Browser checks run the web-portal cases on a fresh copy of the live Lite portal, so test data never touches UAT. Each result shows beside the case; you still record your own Pass or Fail.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-3xl font-serif font-bold">{covered.length}</div><div className="text-sm text-slate-500">cases with an automated check</div></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-3xl font-serif font-bold text-emerald-700">{autoPassed}</div><div className="text-sm text-slate-500">passed on the latest run</div></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-3xl font-serif font-bold text-rose-700">{autoFailed}</div><div className="text-sm text-slate-500">failed on the latest run</div></div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Start a run</h2>
        {!canRun && <p className="text-sm text-slate-500 mt-1">Only Agentryx testers and admins can start runs.</p>}
        {msg && <p className="text-sm text-rose-700 mt-2">{msg}</p>}
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {SCOPES.map(([scope, label, hint]) => (
            <button key={scope} onClick={() => start(scope)} disabled={!canRun || !!running} className="text-left rounded-lg border border-slate-200 p-4 hover:border-slate-400 disabled:opacity-50 disabled:hover:border-slate-200">
              <div className="font-semibold text-slate-900 flex items-center gap-2"><PlayCircle className="w-4 h-4" /> {label}</div>
              <div className="text-xs text-slate-500 mt-1">{hint}</div>
            </button>
          ))}
        </div>
        {running && (
          <div className="mt-4 rounded-lg bg-slate-900 text-slate-100 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="w-4 h-4 animate-spin" /> Running {running.scope} checks — started {new Date(running.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
            <pre className="mt-2 text-xs whitespace-pre-wrap max-h-56 overflow-y-auto text-slate-300">{running.log_tail || "Preparing a copy of the portal…"}</pre>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-slate-900 mb-3">Recent runs</h2>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {runs.length === 0 && <div className="p-5 text-sm text-slate-500">No runs yet.</div>}
          {runs.map((r) => (
            <div key={r.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${r.status === "running" ? "bg-amber-50 text-amber-700" : r.status === "finished" ? (r.failed ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700") : "bg-slate-100 text-slate-600"}`}>
                {r.status === "running" ? "Running" : r.status === "error" ? "Could not finish" : r.failed ? `${r.failed} failed` : "All passed"}
              </span>
              <span className="text-slate-900 capitalize">{r.scope === "agency" ? "Placement Cell" : r.scope}</span>
              <span className="text-slate-500">{r.passed} passed · {r.failed} failed</span>
              <span className="ml-auto text-xs text-slate-400">{new Date(r.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{r.started_by ? ` · ${r.started_by}` : ""}</span>
            </div>
          ))}
        </div>
      </section>

      {covered.length > 0 && (
        <section>
          <h2 className="font-semibold text-slate-900 mb-3">Cases with automated checks</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {covered.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`} className="px-5 py-2.5 flex items-center gap-3 text-sm hover:bg-slate-50">
                <span className="font-mono text-xs text-slate-500 w-12">{c.item_ref}</span>
                <span className="flex-1 min-w-0 truncate text-slate-800">{c.description}</span>
                <span className={`text-xs font-semibold ${c.auto?.status === "passed" ? "text-emerald-700" : c.auto?.status === "failed" ? "text-rose-700" : "text-slate-400"}`}>{c.auto ? (c.auto.status === "passed" ? "✓ passed" : "✗ failed") : "not run"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function Automation() {
  return <Shell title="Automated runs"><Body /></Shell>;
}
