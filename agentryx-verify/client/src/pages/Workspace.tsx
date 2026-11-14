import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Shell, Page, useWorkspace, caseState, type Case } from "../components/Shell";

/** Start here — MGC-style dashboard: the key numbers, each a click from its page. */
function Stat({ n, of, label, sub, href, onClick, bar, tone }: { n: ReactNode; of?: number; label: string; sub?: string; href?: string; onClick?: () => void; bar?: number; tone?: "rose" | "amber" }) {
  const inner = (
    <>
      <div className="flex items-baseline gap-1">
        <span className={`text-[28px] font-bold leading-none tabular-nums ${tone === "rose" ? "text-rose-700" : "text-slate-900"}`}>{n}</span>
        {of !== undefined && <span className="text-sm text-slate-500">/ {of}</span>}
      </div>
      <div className="mt-2 font-semibold text-slate-900 text-[15px]">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      {bar !== undefined && <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, bar)}%` }} /></div>}
    </>
  );
  const cls = `block text-left bg-white rounded-lg border p-4 hover:border-slate-400 hover:shadow-sm transition ${tone === "amber" ? "border-amber-300 border-l-4" : tone === "rose" ? "border-rose-300 border-l-4" : "border-slate-200"}`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button onClick={onClick} className={cls}>{inner}</button>;
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2.5">
        <h2 className="font-serif text-xl font-bold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-500">{sub}</span>
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">{children}</div>
    </section>
  );
}

function Body() {
  const { data, askAbout } = useWorkspace();
  const d = data!;
  const [qs, setQs] = useState<{ status: string; mine: boolean }[]>([]);
  useEffect(() => { fetch("/api/ask/team", { credentials: "include" }).then((r) => r.json()).then((x) => setQs(Array.isArray(x) ? x : [])).catch(() => {}); }, []);

  const lite = d.projects.find((p) => p.slug === "hirestream-lite");
  const mobile = d.projects.find((p) => p.slug !== "hirestream-lite");
  const all = d.projects.flatMap((p) => p.cases);
  const count = (cs: Case[], s: string) => cs.filter((c) => caseState(c) === s).length;
  const nextCase = (cases: Case[]) => cases.find((c) => c.delivery_status !== "not_delivered" && caseState(c) === "notrun") ?? cases.find((c) => caseState(c) === "failed");
  const next = lite ? nextCase(lite.cases) : undefined;
  const toRun = all.filter((c) => c.delivery_status !== "not_delivered" && caseState(c) === "notrun").length;
  const withAuto = all.filter((c) => c.autoScope);
  const autoPassed = withAuto.filter((c) => c.auto?.status === "passed").length;
  const autoFailed = withAuto.filter((c) => c.auto?.status === "failed").length;
  const defects = lite?.cases.filter((c) => c.item_ref.startsWith("L6.")) ?? [];

  const acts = lite ? Array.from(new Set(lite.cases.map((c) => c.section_title))).map((act) => {
    const cs = lite.cases.filter((c) => c.section_title === act);
    return { act, total: cs.length, passed: count(cs, "passed"), failed: count(cs, "failed"), first: cs[0] };
  }) : [];

  return (
    <Page
      title="Start here"
      sub="Your testing at a glance — each number opens its list. Work the cases top to bottom, in the order of the demo."
      actions={next && (
        <Link href={`/cases/${next.id}`} className="inline-flex items-center gap-2 bg-[#14213D] text-white text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-[#1d2d52]">
          <PlayCircle className="w-4 h-4" /> Continue with {next.item_ref}
        </Link>
      )}>

      <Section title="UAT testing" sub="Cases passed, per track">
        {lite && <Stat n={count(lite.cases, "passed")} of={lite.cases.length} label="Web portal (Lite)" sub={`${lite.cases.length - count(lite.cases, "passed")} still to pass`} href="/cases?project=hirestream-lite" bar={(count(lite.cases, "passed") / lite.cases.length) * 100} />}
        {mobile && <Stat n={count(mobile.cases, "passed")} of={mobile.cases.length} label="Mobile app" sub={`${mobile.cases.length - count(mobile.cases, "passed")} still to pass`} href={`/cases?project=${mobile.slug}`} bar={(count(mobile.cases, "passed") / mobile.cases.length) * 100} />}
        {defects.length > 0 && <Stat n={count(defects, "passed")} of={defects.length} label="Known defects — retest" sub="Fixed; confirm on screen" href={`/cases/${defects[0].id}`} tone={count(defects, "passed") < defects.length ? "amber" : undefined} />}
      </Section>

      <Section title="My work" sub="What is waiting for you">
        <Stat n={toRun} label="To run" sub="Not tried yet" href="/cases?show=torun" tone={toRun ? "amber" : undefined} />
        <Stat n={count(all, "failed")} label="Failed — retest" sub="Retest when a fix is released" href="/cases?show=failed" tone={count(all, "failed") ? "rose" : undefined} />
        <Stat n={count(all, "passed")} of={all.length} label="Passed" sub="Your Pass results" href="/cases?show=passed" />
        <Stat n={count(all, "waived")} label="Waived" sub="Skipped on purpose" href="/cases" />
      </Section>

      <Section title="Automated checks" sub="Browser checks on a safe copy of the portal">
        <Stat n={autoPassed} of={withAuto.length} label="Checks passed" sub={d.running ? "A run is in progress" : "From the last runs"} href="/automation" bar={withAuto.length ? (autoPassed / withAuto.length) * 100 : 0} />
        <Stat n={autoFailed} label="Checks failed" sub="Look at these by hand" href="/automation" tone={autoFailed ? "rose" : undefined} />
        <Stat n={withAuto.length - autoPassed - autoFailed} label="Not run yet" sub="Start a run from Automated runs" href="/automation" />
      </Section>

      <Section title="Help" sub="Questions and answers">
        <Stat n={qs.filter((q) => q.status === "open").length} label="Questions waiting" sub="For the Agentryx team" onClick={() => askAbout(null)} tone={qs.some((q) => q.status === "open") ? "amber" : undefined} />
        <Stat n={qs.filter((q) => q.status === "answered").length} label="Answered" sub="Open Ask Agentryx to read" onClick={() => askAbout(null)} />
        <Stat n={qs.filter((q) => q.mine).length} label="My questions" sub="All you have asked" onClick={() => askAbout(null)} />
        <Stat n="↗" label="Guides & videos" sub="How each role works" href="/resources" />
      </Section>

      <section className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-start">
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-slate-900">Web portal — the demo, act by act</h2>
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
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="font-serif text-lg font-bold text-slate-900">How to test a case</h2>
          <ol className="mt-3 space-y-3 text-sm text-slate-700">
            <li className="flex gap-3"><span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">1</span><span><b className="text-slate-900">Open the case.</b> Read the steps and the expected result. The test account is in the steps (also under <i>Test accounts</i>, top right).</span></li>
            <li className="flex gap-3"><span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">2</span><span><b className="text-slate-900">Do it on the portal</b> in another tab — or let the automated check, or Claude in Chrome, run it while you watch.</span></li>
            <li className="flex gap-3"><span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">3</span><span><b className="text-slate-900">Record Pass or Fail.</b> On a fail, say what you saw and attach a screenshot.</span></li>
          </ol>
          {mobile && d.config.mobileNote && <p className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"><b>Mobile app:</b> {d.config.mobileNote}</p>}
        </div>
      </section>
    </Page>
  );
}

export function Workspace() {
  return <Shell title="Start here"><Body /></Shell>;
}
