import { Link } from "wouter";
import { ArrowRight, PlayCircle, BookOpen, Bot, Sparkles, ExternalLink } from "lucide-react";
import { Shell, useWorkspace, caseState, type Case } from "../components/Shell";

/** Start here — the tester's landing page: how to work, accounts, next case, progress by act. */
function Body() {
  const { data, askAbout } = useWorkspace();
  const d = data!;
  const lite = d.projects.find((p) => p.slug === "hirestream-lite");
  const mobile = d.projects.find((p) => p.slug !== "hirestream-lite");
  const nextCase = (cases: Case[]) => cases.find((c) => c.delivery_status !== "not_delivered" && caseState(c) === "notrun") ?? cases.find((c) => caseState(c) === "failed");
  const next = lite ? nextCase(lite.cases) : undefined;

  const acts = lite ? Array.from(new Set(lite.cases.map((c) => c.section_title))).map((act) => {
    const cs = lite.cases.filter((c) => c.section_title === act);
    return { act, total: cs.length, passed: cs.filter((c) => caseState(c) === "passed").length, failed: cs.filter((c) => caseState(c) === "failed").length, first: cs[0] };
  }) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-[#14213D] to-[#1E4D3B] text-white p-6 sm:p-8">
        <div className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-300">Phase-1 UAT</div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold mt-2">Namaste {d.me.name.split(" ")[0]} — let’s test HireStream Lite</h1>
        <p className="mt-3 text-slate-200 max-w-2xl">The cases are in the same order as the demo for the Secretary: HPSEDC sets the rules, jobs are published, applicants apply, HPSEDC selects, documents and departure, then oversight. Work top to bottom.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {next && (
            <Link href={`/cases/${next.id}`} className="inline-flex items-center gap-2 bg-amber-400 text-slate-900 font-semibold rounded-lg px-4 py-2.5 hover:bg-amber-300">
              <PlayCircle className="w-5 h-5" /> Continue with {next.item_ref}: {next.description.slice(0, 48)}{next.description.length > 48 ? "…" : ""}
            </Link>
          )}
          <Link href="/resources" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2.5"><BookOpen className="w-5 h-5" /> Guides & videos</Link>
          <button onClick={() => askAbout(null)} className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg px-4 py-2.5"><Sparkles className="w-5 h-5" /> Ask Agentryx</button>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          ["1", "Open the case", "Read the steps and expected result. The test account to use is in the steps."],
          ["2", "Do it on the portal", "Use hirestream-lite.agentryx.dev in another tab — or let the automated check / Claude in Chrome run it while you watch."],
          ["3", "Record what happened", "Pass or Fail. On a fail, say what you saw and attach a screenshot. Then go to the next case."],
        ].map(([n, t, b]) => (
          <div key={n} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="w-8 h-8 rounded-full bg-[#14213D] text-white font-bold flex items-center justify-center">{n}</div>
            <h3 className="font-semibold text-slate-900 mt-3">{t}</h3>
            <p className="text-sm text-slate-600 mt-1">{b}</p>
          </div>
        ))}
      </section>

      <section className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Web portal — the demo, act by act</h2>
            <Link href="/cases?project=hirestream-lite" className="text-sm text-indigo-700 hover:underline">All cases</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {acts.map((a) => (
              <Link key={a.act} href={`/cases/${a.first.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{a.act}</div>
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500" style={{ width: `${(a.passed / a.total) * 100}%` }} />
                    <div className="bg-rose-500" style={{ width: `${(a.failed / a.total) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs text-slate-500 tabular-nums w-16 text-right">{a.passed}/{a.total}{a.failed ? ` · ${a.failed}✗` : ""}</span>
                <ArrowRight className="w-4 h-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900">Test accounts</h2>
            <p className="text-xs text-slate-500 mt-1">Portal: <span className="font-mono">hirestream-lite.agentryx.dev</span></p>
            <table className="w-full text-sm mt-3">
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2 text-slate-600">Placement Cell</td><td className="py-2 font-mono text-slate-900">hpsedc_agency</td></tr>
                <tr><td className="py-2 text-slate-600">Admin</td><td className="py-2 font-mono text-slate-900">demo_admin</td></tr>
                <tr><td className="py-2 text-slate-600">Applicant</td><td className="py-2 font-mono text-slate-900">demo_candidate</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">Password for all three: <span className="font-mono">test123</span>. For a brand-new applicant, use Create Account with any new email.</p>
            <a href="https://hirestream-lite.agentryx.dev/auth" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline">Open the portal <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4" /> Automated help</h2>
            <p className="text-sm text-slate-600 mt-1">Many web cases have an automated check. Run it from <Link href="/automation" className="text-indigo-700 hover:underline">Automated runs</Link> or from a case; the result shows beside yours. You still make the final call.</p>
          </div>
          {mobile && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 text-sm text-amber-900">
              <b>Mobile app:</b> {mobile.cases.length} cases. The app build for the Lite portal is being prepared — start with the web portal; you’ll be told when the app is ready to test.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function Workspace() {
  return <Shell title="Start here"><Body /></Shell>;
}
