import { useState } from "react";
import { Link } from "wouter";
import { PlayCircle, ChevronDown, UserRound, Clock, ArrowRight, Info } from "lucide-react";
import { Shell, Page, useWorkspace, caseState, StatusChip, AutoChip, byHand, type Case } from "../components/Shell";

/**
 * Test run — the phase-1 cases in the order to do them, as numbered sessions.
 * One story end to end (post a job → register and apply → interview → select →
 * documents → accept → aftercare). Each session names the account to use and
 * what to carry into the next one; the session holding the next case opens by itself.
 */
function SessionCard({ s, cases, open, onToggle, isNext }: { s: any; cases: Case[]; open: boolean; onToggle: () => void; isNext: boolean }) {
  const hand = cases.filter(byHand);
  const done = hand.filter((c) => caseState(c) !== "notrun").length;
  const passed = hand.filter((c) => caseState(c) === "passed").length;
  const failed = hand.filter((c) => caseState(c) === "failed").length;
  const complete = hand.length > 0 && done === hand.length;
  const numbered = s.n <= 12;
  return (
    <section className={`bg-white rounded-lg border ${isNext ? "border-[#14213D] ring-1 ring-[#14213D]/20" : "border-slate-200"}`}>
      <button onClick={onToggle} aria-expanded={open} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${complete ? (failed ? "bg-rose-600 text-white" : "bg-emerald-600 text-white") : isNext ? "bg-[#14213D] text-white" : "bg-slate-100 text-slate-600"}`}>
          {numbered ? (complete ? (failed ? "!" : "✓") : s.n) : "·"}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-900">{numbered ? `Session ${s.n} · ` : ""}{s.title}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
            {s.role !== "—" && <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{s.role}</span>}
            {s.account !== "—" && <span className="font-mono">{s.account}</span>}
            {s.minutes > 0 && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{s.minutes} min</span>}
          </span>
        </span>
        {hand.length > 0
          ? <span className="text-sm tabular-nums text-slate-600 whitespace-nowrap">{passed}/{hand.length}{failed ? <span className="text-rose-700"> · {failed}✗</span> : null}</span>
          : <span className="text-xs text-slate-400 whitespace-nowrap">{cases.length} case{cases.length === 1 ? "" : "s"}</span>}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100">
          <div className="px-5 py-3 text-sm text-slate-700 bg-slate-50/70">
            {s.intro}
            {s.carry && <div className="mt-2 flex gap-2 text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /><span><b>Carry forward:</b> {s.carry}</span></div>}
          </div>
          <ol className="divide-y divide-slate-100">
            {cases.map((c) => (
              <li key={c.id}>
                <Link href={`/cases/${c.id}`} className={`flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50 ${byHand(c) ? "" : "opacity-80"}`}>
                  <span className="font-mono text-xs text-slate-500 w-12 shrink-0 pt-0.5">{c.item_ref}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900">{c.description}</span>
                    {c.plan_note && <span className="block text-xs text-slate-500 mt-0.5">{c.plan_note}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-0.5 shrink-0">
                    {byHand(c) ? <StatusChip c={c} /> : <span className="text-[11px] font-semibold rounded-full border px-2 py-0.5 bg-slate-50 text-slate-500 border-slate-200">{({ with: "With another case", auto: "Automated", blocked: "Not ready", later: "Later" } as Record<string, string>)[c.test_plan]}</span>}
                    <AutoChip c={c} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Body() {
  const { data } = useWorkspace();
  const d = data!;
  const all = d.projects.flatMap((p) => p.cases);
  const hand = all.filter(byHand);
  const next = hand.find((c) => caseState(c) === "notrun");
  const nextSession = next?.session ?? null;
  const [open, setOpen] = useState<Record<number, boolean>>(() => (nextSession ? { [nextSession]: true } : {}));
  const bySession = (n: number) => all.filter((c) => c.session === n);
  const passed = hand.filter((c) => caseState(c) === "passed").length;
  const minutesLeft = d.sessions.filter((s) => s.n <= 12 && bySession(s.n).some((c) => byHand(c) && caseState(c) === "notrun")).reduce((m, s) => m + s.minutes, 0);

  return (
    <Page title="Test run — step by step"
      sub={`The phase-1 cases in the order to do them. You follow one applicant from the job they apply to until they are placed, switching between the HPSEDC and applicant accounts as each session says. ${passed} of ${hand.length} done${minutesLeft ? ` · about ${Math.round(minutesLeft / 60 * 10) / 10} hours left` : ""}.`}
      actions={next && <Link href={`/cases/${next.id}`} className="inline-flex items-center gap-2 bg-[#14213D] text-white text-sm font-semibold rounded-md px-3.5 py-2"><PlayCircle className="w-4 h-4" /> Continue: session {next.session}, {next.item_ref}</Link>}>
      <div className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1">
        <span><b>{hand.length}</b> cases by hand, in 12 sessions</span>
        <span className="text-slate-500">{all.filter((c) => c.test_plan === "with").length} checked together with another case</span>
        <span className="text-slate-500">{all.filter((c) => c.test_plan === "auto").length} proved by automation</span>
        <span className="text-slate-500">{all.filter((c) => c.test_plan === "blocked").length} not ready yet</span>
        <span className="text-slate-500">{all.filter((c) => c.test_plan === "later").length} mobile, later</span>
        <span>Passwords: <span className="font-mono">{d.config.password}</span> for the demo accounts</span>
      </div>
      <div className="space-y-3 max-w-5xl">
        {d.sessions.map((s) => {
          const cs = bySession(s.n);
          if (!cs.length) return null;
          return <SessionCard key={s.n} s={s} cases={cs} isNext={s.n === nextSession} open={!!open[s.n]} onToggle={() => setOpen((o) => ({ ...o, [s.n]: !o[s.n] }))} />;
        })}
      </div>
      <p className="text-sm text-slate-500 flex items-center gap-1">Prefer a flat list? <Link href="/cases?show=torun" className="text-indigo-700 hover:underline inline-flex items-center gap-1">All cases to run <ArrowRight className="w-3.5 h-3.5" /></Link></p>
    </Page>
  );
}

export function Run() {
  return <Shell title="Test run"><Body /></Shell>;
}
