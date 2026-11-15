import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, PlayCircle, Flag, Bot, MessageCircleQuestion, ListChecks, History, Bug, Activity, GitCommit, Users } from "lucide-react";
import { Shell, Page, useWorkspace, caseState, StatusChip, AutoChip, byHand, type Case } from "../components/Shell";
import { KIND, Chip, stage } from "./Findings";
import { LABEL } from "./Audit";

/**
 * Dashboard — the tester's home (MGC dashboard style). From the top:
 * the next case, the key numbers, then panels for everything that needs the
 * tester: up next, failed retests, known defects, findings, questions, the last
 * automated run, recent results, and progress act by act.
 */
const ROLE: Record<number, string> = { 1: "Applicant", 2: "Placement Cell", 3: "Employer", 4: "Admin", 5: "Applicant", 6: "Known defect" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Stat({ n, of, label, sub, href, tone }: { n: ReactNode; of?: number; label: string; sub?: string; href: string; tone?: "rose" | "amber" }) {
  return (
    <Link href={href} className={`block bg-white rounded-lg border p-4 hover:border-slate-400 hover:shadow-sm transition ${tone === "amber" ? "border-amber-300 border-l-4" : tone === "rose" ? "border-rose-300 border-l-4" : "border-slate-200"}`}>
      <div className="flex items-baseline gap-1"><span className={`text-[26px] font-bold leading-none tabular-nums ${tone === "rose" ? "text-rose-700" : "text-slate-900"}`}>{n}</span>{of !== undefined && <span className="text-sm text-slate-500">/ {of}</span>}</div>
      <div className="mt-2 font-semibold text-slate-900 text-[15px]">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Link>
  );
}

function Panel({ title, icon: I, link, children, empty }: { title: string; icon: any; link?: [string, string]; children?: ReactNode; empty?: string }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 flex flex-col min-w-0">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2"><I className="w-4 h-4 text-slate-500" />{title}</h2>
        {link && <Link href={link[0]} className="text-sm text-indigo-700 hover:underline whitespace-nowrap">{link[1]}</Link>}
      </div>
      {children ?? <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

function CaseRow({ c, extra }: { c: Case; extra?: ReactNode }) {
  return (
    <Link href={`/cases/${c.id}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
      <span className="font-mono text-xs text-slate-500 w-11 shrink-0 pt-0.5">{c.item_ref}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-900 truncate">{c.description}</span>
        {extra ?? <span className="block text-xs text-slate-500">{ROLE[c.section] ?? "General"}</span>}
      </span>
      <span className="flex flex-col items-end gap-0.5 shrink-0"><StatusChip c={c} /><AutoChip c={c} /></span>
    </Link>
  );
}

/** Notice from the team (Settings → Testing), shown at the top of the Dashboard. */
function Notice({ admin = false }: { admin?: boolean }) {
  const { data } = useWorkspace();
  const text = (data?.config.notice ?? "").trim();
  if (!text) return admin ? <p className="text-sm text-slate-500">No notice to testers. <Link href="/settings" className="text-indigo-700 hover:underline">Write one in Settings</Link>.</p> : null;
  const at = data!.config.noticeAt ? new Date(data!.config.noticeAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">Notice from the team</h2>
        {at && <span className="text-xs text-amber-800">{at}</span>}
        {admin && <span className="text-xs text-slate-500">Testers see this at the top of their Dashboard · <Link href="/settings" className="text-indigo-700 hover:underline">edit</Link></span>}
      </div>
      <ul className="mt-2 space-y-1.5 text-[15px] text-slate-800">
        {lines.map((l, i) => l.startsWith("- ")
          ? <li key={i} className="flex gap-2"><span className="text-amber-700">•</span><span>{l.slice(2)}</span></li>
          : <li key={i} className="font-medium">{l}</li>)}
      </ul>
    </section>
  );
}

function Body() {
  const { data, askAbout } = useWorkspace();
  const d = data!;
  const [qs, setQs] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [run, setRun] = useState<any | null>(null);
  useEffect(() => {
    const j = (u: string) => fetch(u, { credentials: "include" }).then((r) => r.json());
    j("/api/ask/team").then((x) => setQs(Array.isArray(x) ? x : [])).catch(() => {});
    const ids = new Set(d.projects.map((p) => p.id));
    j("/api/feedback").then((x) => setFindings(Array.isArray(x) ? x.filter((f: any) => ids.has(f.projectId)) : [])).catch(() => {});
    j("/api/testing/auto/runs").then((x) => setRun(Array.isArray(x) ? x[0] ?? null : null)).catch(() => {});
  }, []);

  const lite = d.projects.find((p) => p.slug === "hirestream-lite");
  const mobile = d.projects.find((p) => p.slug !== "hirestream-lite");
  const all = d.projects.flatMap((p) => p.cases);
  const count = (cs: Case[], s: string) => cs.filter((c) => caseState(c) === s).length;
  const todo = (cs: Case[]) => cs.filter((c) => byHand(c) && caseState(c) === "notrun");
  const upNext = todo(lite?.cases ?? []);
  const next = upNext[0];
  const failed = all.filter((c) => caseState(c) === "failed" && c.test_plan !== "later");
  const defects = lite?.cases.filter((c) => c.item_ref.startsWith("L6.")) ?? [];
  const recent = all.filter((c) => c.my_at).sort((a, b) => +new Date(b.my_at!) - +new Date(a.my_at!)).slice(0, 6);
  const withAuto = all.filter((c) => c.autoScope);
  const autoPassed = withAuto.filter((c) => c.auto?.status === "passed").length;
  const openFindings = findings.filter((f) => ["open", "progress", "fixed"].includes(stage(f.status)));
  const toConfirm = findings.filter((f) => stage(f.status) === "fixed" && f.submitterReviewerId === d.me.id).length;
  const myQs = qs.filter((q) => q.mine);
  const waiting = qs.filter((q) => q.status === "open").length;

  // Web portal: progress per test-run session (hand-run cases). Mobile: per section, for later.
  const tracks = d.projects.map((p) => {
    const lite = p.slug === "hirestream-lite";
    const keyOf = (c: Case) => lite ? (c.session ?? 0) : c.section_title;
    const keys = Array.from(new Set(p.cases.filter((c) => !lite || (byHand(c) && (c.session ?? 99) <= 12)).map(keyOf)));
    return {
      p, label: lite ? "Web portal — test-run sessions" : "Mobile app (later)",
      acts: keys.map((k) => {
        const cs = p.cases.filter((c) => keyOf(c) === k && (!lite || byHand(c)));
        const ses = lite ? d.sessions.find((x) => x.n === k) : null;
        return { act: ses ? `${ses.n}. ${ses.title}` : String(k), total: cs.length, passed: count(cs, "passed"), failed: count(cs, "failed"), first: cs[0] };
      }),
    };
  });

  return (
    <Page title="Dashboard"
      sub={`Namaste ${d.me.name.split(" ")[0]}. Where testing stands, and what needs you next. Work the web cases top to bottom, in the order of the demo.`}
      actions={<>
        <Link href="/findings?new=1" className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-md px-3.5 py-2 hover:bg-slate-50"><Flag className="w-4 h-4 text-rose-600" /> Report a finding</Link>
        {next && <Link href={`/cases/${next.id}`} className="inline-flex items-center gap-2 bg-[#14213D] text-white text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-[#1d2d52]"><PlayCircle className="w-4 h-4" /> Continue with {next.item_ref}</Link>}
      </>}>

      <Notice />
      {next && (
        <section className="rounded-lg border border-[#14213D]/20 bg-[#F1F4FA] p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[260px]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#14213D]">Your next case · {(() => { const ses = d.sessions.find((x) => x.n === next.session); return ses ? `Session ${ses.n}: ${ses.title} — sign in as ${ses.account}` : next.section_title; })()}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900"><span className="font-mono text-sm text-slate-500 mr-2">{next.item_ref}</span>{next.description}</div>
            <div className="text-sm text-slate-600 mt-1 line-clamp-1">{next.test_steps}</div>
          </div>
          <div className="text-sm text-slate-600">{upNext.length - 1} more after this · <Link href="/run" className="text-indigo-700 hover:underline">see the whole test run</Link></div>
          <Link href={`/cases/${next.id}`} className="inline-flex items-center gap-2 bg-[#14213D] text-white text-sm font-semibold rounded-md px-4 py-2.5">Open the case <ArrowRight className="w-4 h-4" /></Link>
        </section>
      )}

      <section>
        <div className="flex items-baseline gap-3 mb-2.5"><h2 className="font-serif text-xl font-bold text-slate-900">At a glance</h2><span className="text-sm text-slate-500">Each number opens its list</span></div>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {lite && <Stat n={count(lite.cases, "passed")} of={lite.cases.length} label="Web portal" sub="Cases passed" href="/cases?project=hirestream-lite" />}
          {mobile && <Stat n={count(mobile.cases, "passed")} of={mobile.cases.length} label="Mobile app" sub="Cases passed" href={`/cases?project=${mobile.slug}`} />}
          <Stat n={todo(all).length} label="To run" sub="Not tried yet" href="/cases?show=torun" tone={todo(all).length ? "amber" : undefined} />
          <Stat n={failed.length} label="Failed — retest" sub="Retest when fixed" href="/cases?show=failed" tone={failed.length ? "rose" : undefined} />
          <Stat n={defects.length - count(defects, "passed")} of={defects.length} label="Defects to retest" sub="Fixed; confirm on screen" href={defects[0] ? `/cases/${defects[0].id}` : "/cases"} tone={defects.length > count(defects, "passed") ? "amber" : undefined} />
          <Stat n={autoPassed} of={withAuto.length} label="Automated checks" sub="Passing" href="/automation" />
          <Stat n={openFindings.length} label="Findings open" sub={toConfirm ? `${toConfirm} fixed — confirm` : "Outside the cases"} href="/findings" tone={toConfirm ? "amber" : undefined} />
          <Stat n={waiting} label="Questions waiting" sub="For the team" href="/team-questions" />
        </div>
      </section>

      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start">
        <Panel title="Up next" icon={ListChecks} link={["/run", "Test run"]} empty="Every hand-run case has a result. 🎉">
          {upNext.length > 0 && <div className="divide-y divide-slate-100 py-1">{upNext.slice(0, 6).map((c) => <CaseRow key={c.id} c={c} />)}</div>}
        </Panel>

        <Panel title="Failed — retest" icon={Bug} link={["/cases?show=failed", "All failed"]} empty="Nothing has failed.">
          {failed.length > 0 && <div className="divide-y divide-slate-100 py-1">{failed.slice(0, 6).map((c) => <CaseRow key={c.id} c={c} extra={<span className="block text-xs text-rose-700 truncate">{c.my_comment ? `“${c.my_comment}”` : "No note"}</span>} />)}</div>}
        </Panel>

        <Panel title="Known defects — retest" icon={Bug} link={defects[0] ? [`/cases?project=hirestream-lite`, "In the case list"] : undefined} empty="No known defects listed.">
          {defects.length > 0 && <>
            <p className="px-5 pt-3 text-xs text-slate-500">The team has fixed these. Check each on screen and record Pass, or Fail with what you saw.</p>
            <div className="divide-y divide-slate-100 py-1">{defects.map((c) => <CaseRow key={c.id} c={c} extra={<span className="block text-xs text-slate-500">Known defect</span>} />)}</div>
          </>}
        </Panel>

        <Panel title="Findings" icon={Flag} link={["/findings", "All findings"]} empty="No findings yet. Use Report a finding for anything outside the cases: bugs, confusing screens, ideas.">
          {openFindings.length > 0 && <div className="divide-y divide-slate-100 py-1">{openFindings.slice(0, 5).map((f) => (
            <Link key={f.id} href={`/findings/${f.id}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
              <span className="font-mono text-[11px] text-slate-500 w-24 shrink-0 pt-0.5">{f.referenceCode}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm text-slate-900 truncate">{f.title}</span><span className="block text-xs text-slate-500">{f.area ?? "General"} · {f.submitter?.name ?? ""}</span></span>
              <span className="flex flex-col items-end gap-1 shrink-0"><Chip map={KIND} k={f.type} />{stage(f.status) === "fixed" && <span className="text-[11px] font-semibold text-emerald-700">Fixed — confirm</span>}</span>
            </Link>))}</div>}
        </Panel>

        <Panel title="Questions" icon={MessageCircleQuestion} link={["/team-questions", "Team questions"]}>
          <div className="px-5 py-3 space-y-2.5">
            {myQs.length === 0 && <p className="text-sm text-slate-500">You haven't asked anything yet.</p>}
            {myQs.slice(0, 4).map((q) => (
              <Link key={q.id} href="/team-questions" className="flex items-start justify-between gap-3 text-sm hover:underline">
                <span className="text-slate-800 line-clamp-1">{q.question}</span>
                <span className={`text-[11px] font-semibold whitespace-nowrap ${q.status === "answered" ? "text-emerald-700" : q.status === "open" ? "text-amber-700" : "text-slate-500"}`}>{q.status === "answered" ? "Answered" : q.status === "open" ? "Waiting" : "Closed"}</span>
              </Link>
            ))}
            <button onClick={() => askAbout(null)} className="text-sm font-medium text-indigo-700 hover:underline">Ask a question</button>
          </div>
        </Panel>

        <Panel title="Last automated run" icon={Bot} link={["/automation", "Automated runs"]} empty="No automated run yet. Start one from Automated runs.">
          {run && (
            <div className="px-5 py-4 text-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold rounded-full border px-2.5 py-0.5 text-xs ${run.status === "running" ? "bg-sky-50 text-sky-700 border-sky-200" : run.failed ? "bg-rose-50 text-rose-700 border-rose-200" : run.status === "error" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                  {run.status === "running" ? "Running" : run.status === "error" ? "Stopped with an error" : run.failed ? `${run.failed} failed` : "All passed"}
                </span>
                <span className="text-slate-700">Scope: <b>{run.scope}</b></span>
              </div>
              {run.status !== "running" && <div className="text-slate-700"><b className="text-emerald-700">{run.passed}</b> passed · <b className={run.failed ? "text-rose-700" : ""}>{run.failed}</b> failed</div>}
              <div className="text-xs text-slate-500">Started {when(run.started_at)}{run.started_by ? ` by ${run.started_by}` : ""}{run.finished_at ? ` · finished ${when(run.finished_at)}` : ""}</div>
            </div>
          )}
        </Panel>

        <Panel title="Your recent results" icon={History} link={["/cases?show=passed", "Passed cases"]} empty="No results recorded yet. Open your next case to start.">
          {recent.length > 0 && <div className="divide-y divide-slate-100 py-1">{recent.map((c) => <CaseRow key={c.id} c={c} extra={<span className="block text-xs text-slate-500">{when(c.my_at!)}</span>} />)}</div>}
        </Panel>

        <Panel title="Progress by session" icon={ListChecks} link={["/run", "Test run"]}>
          <div className="py-1">
            {tracks.map((t) => (
              <div key={t.p.id}>
                <div className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.label}</div>
                {t.acts.map((a) => (
                  <Link key={a.act} href={`/cases/${a.first.id}`} className="flex items-center gap-4 px-5 py-2 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 truncate">{a.act}</div>
                      <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex"><div className="bg-emerald-500" style={{ width: `${(a.passed / a.total) * 100}%` }} /><div className="bg-rose-500" style={{ width: `${(a.failed / a.total) * 100}%` }} /></div>
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums w-16 text-right">{a.passed}/{a.total}{a.failed ? ` · ${a.failed}✗` : ""}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="font-serif text-lg font-bold text-slate-900">How to test</h2>
        <ol className="mt-3 grid gap-4 md:grid-cols-4 text-sm text-slate-700">
          {[
            ["Open the case", "Read the steps and the expected result. Accounts are under Test accounts, top right."],
            ["Do it on the portal", "In another tab — or let the automated check, or Claude in Chrome, run it while you watch."],
            ["Record Pass or Fail", "On a fail, say what you saw and attach a screenshot. Then go to the next case."],
            ["Report anything else", "Bugs, confusing screens or ideas outside the cases go in Findings. Questions go to Ask Agentryx."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-3"><span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{i + 1}</span><span><b className="text-slate-900">{t}.</b> {b}</span></li>
          ))}
        </ol>
        {mobile && d.config.mobileNote && <p className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"><b>Mobile app:</b> {d.config.mobileNote}</p>}
      </section>
    </Page>
  );
}

/**
 * Admin dashboard — the whole programme on one page: UAT progress, defects,
 * findings and questions that need an answer, automated checks, who has been
 * testing, recent activity and the latest releases. Every number opens its list.
 */
const istDay = (daysAgo = 0) => new Date(Date.now() - daysAgo * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const hrs = (sec: number) => !sec ? "0" : sec < 3600 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`;
const SEV: Record<string, string> = { blocker: "text-rose-700", critical: "text-rose-700", high: "text-amber-700", major: "text-amber-700" };
const isOpen = (st: string) => st === "open" || st === "in_progress";

function AdminBody() {
  const { data } = useWorkspace();
  const d = data!;
  const [pm, setPm] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [qs, setQs] = useState<any[]>([]);
  useEffect(() => {
    const j = (u: string) => fetch(u, { credentials: "include" }).then((r) => r.json());
    const week = `from=${istDay(6)}&to=${istDay(0)}`;
    j("/api/pm/overview").then(setPm).catch(() => {});
    j(`/api/audit/overview?${week}`).then(setUsage).catch(() => {});
    j(`/api/audit/events?${week}&type=items&limit=8`).then((x) => setEvents(x?.rows ?? [])).catch(() => {});
    const ids = new Set(d.projects.map((p) => p.id));
    j("/api/feedback").then((x) => setFindings(Array.isArray(x) ? x.filter((f: any) => ids.has(f.projectId)) : [])).catch(() => {});
    j("/api/ask/team").then((x) => setQs(Array.isArray(x) ? x : [])).catch(() => {});
  }, []);

  const lite = d.projects.find((p) => p.slug === "hirestream-lite");
  const hand = (lite?.cases ?? []).filter(byHand);
  const passed = hand.filter((c) => caseState(c) === "passed").length;
  const failed = d.projects.flatMap((p) => p.cases).filter((c) => c.test_plan !== "later" && caseState(c) === "failed");
  const pct = hand.length ? Math.round((passed / hand.length) * 100) : 0;
  const defects: any[] = (pm?.projects ?? []).flatMap((p: any) => p.defects.map((x: any) => ({ ...x, app: p.name })));
  const openDefects = defects.filter((x) => isOpen(x.status));
  const blockers = openDefects.filter((x) => x.severity === "blocker").length;
  const openFindings = findings.filter((f) => ["open", "progress"].includes(stage(f.status)));
  const waitingQs = qs.filter((q) => q.status === "open");
  const run = pm?.lastRun;
  const releases: any[] = (pm?.projects ?? []).flatMap((p: any) => p.releases.map((r: any) => ({ ...r, app: p.name })))
    .sort((a: any, b: any) => +new Date(b.date) - +new Date(a.date)).slice(0, 6);
  const sessions = d.sessions.filter((s) => s.n <= 12).map((s) => {
    const cs = hand.filter((c) => c.session === s.n);
    return { s, total: cs.length, passed: cs.filter((c) => caseState(c) === "passed").length, failed: cs.filter((c) => caseState(c) === "failed").length };
  }).filter((x) => x.total);
  const cards = usage?.cards;

  return (
    <Page title="Dashboard" sub="Phase-1 UAT of HireStream Lite for HPSEDC: where testing, defects and the team stand today.">
      <Notice admin />
      <section className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <Stat n={`${pct}%`} label="UAT progress" sub={`${passed} of ${hand.length} hand-run cases passed`} href="/run" />
        <Stat n={failed.length} label="Failed — retest" sub="Waiting on a fix" href="/cases?show=failed" tone={failed.length ? "rose" : undefined} />
        <Stat n={openDefects.length} label="Open defects" sub={blockers ? `${blockers} blocking` : `${defects.length - openDefects.length} resolved`} href="/product?tab=defects" tone={blockers ? "rose" : openDefects.length ? "amber" : undefined} />
        <Stat n={openFindings.length} label="Findings to triage" sub="Reported outside the cases" href="/findings" tone={openFindings.length ? "amber" : undefined} />
        <Stat n={pm?.questions.waiting ?? waitingQs.length} label="Questions waiting" sub="Need an answer from you" href="/questions" tone={(pm?.questions.waiting ?? waitingQs.length) ? "amber" : undefined} />
        <Stat n={run ? `${run.passed}/${run.passed + run.failed}` : "—"} label="Automated checks" sub={run ? `Last run ${ago(run.started_at)}` : "No run yet"} href="/automation" tone={run?.failed ? "rose" : undefined} />
        <Stat n={cards?.people ?? "—"} label="People testing" sub={cards ? `${cards.sign_ins} sign-ins · ${hrs(cards.active_seconds)} active, 7 days` : "Last 7 days"} href="/audit" />
        <Stat n={cards?.online ?? "—"} label="Online now" sub="Active in the last 5 min" href="/audit" />
      </section>

      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start">
        <Panel title="UAT progress by session" icon={ListChecks} link={["/run", "Test run"]}>
          <div className="py-1">
            {sessions.map(({ s, total, passed, failed }) => (
              <Link key={s.n} href="/run" className="flex items-center gap-4 px-5 py-2 hover:bg-slate-50">
                <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{s.n}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900 truncate">{s.title}</div>
                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex"><div className="bg-emerald-500" style={{ width: `${(passed / total) * 100}%` }} /><div className="bg-rose-500" style={{ width: `${(failed / total) * 100}%` }} /></div>
                </div>
                <span className="text-xs text-slate-500 tabular-nums w-16 text-right">{passed}/{total}{failed ? ` · ${failed}✗` : ""}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Needs your answer" icon={MessageCircleQuestion} link={["/questions", "Questions inbox"]} empty="Nothing waiting. Every question and finding has a reply.">
          {(waitingQs.length > 0 || openFindings.length > 0) && <div className="divide-y divide-slate-100 py-1">
            {waitingQs.slice(0, 4).map((q) => (
              <Link key={q.id} href="/questions" className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="text-[11px] font-semibold text-amber-700 w-20 shrink-0 pt-0.5">Question</span>
                <span className="flex-1 min-w-0"><span className="block text-sm text-slate-900 truncate">{q.question}</span><span className="block text-xs text-slate-500">{q.askedBy ?? q.name ?? ""}{q.created_at || q.createdAt ? ` · ${ago(q.created_at ?? q.createdAt)}` : ""}</span></span>
              </Link>))}
            {openFindings.slice(0, 4).map((f) => (
              <Link key={f.id} href={`/findings/${f.id}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="text-[11px] font-semibold text-rose-700 w-20 shrink-0 pt-0.5">Finding</span>
                <span className="flex-1 min-w-0"><span className="block text-sm text-slate-900 truncate">{f.title}</span><span className="block text-xs text-slate-500">{f.referenceCode} · {f.submitter?.name ?? ""}</span></span>
                <Chip map={KIND} k={f.type} />
              </Link>))}
          </div>}
        </Panel>

        <Panel title="Open defects" icon={Bug} link={["/product?tab=defects", "Defect log"]} empty={pm ? "No open defects." : "Loading…"}>
          {openDefects.length > 0 && <div className="divide-y divide-slate-100 py-1">
            {openDefects.slice(0, 6).map((x) => (
              <Link key={x.short_id} href="/product?tab=defects" className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="font-mono text-xs text-slate-500 w-16 shrink-0 pt-0.5">{x.short_id}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm text-slate-900 truncate">{x.description}</span><span className="block text-xs text-slate-500">{x.app} · {x.status.replace("_", " ")}</span></span>
                <span className={`text-[11px] font-semibold capitalize ${SEV[x.severity] ?? "text-slate-500"}`}>{x.severity}</span>
              </Link>))}
          </div>}
        </Panel>

        <Panel title="Who's been testing" icon={Users} link={["/audit", "Audit trail & usage"]} empty={usage ? "Nobody signed in this week." : "Loading…"}>
          {usage?.most?.length > 0 && <div className="divide-y divide-slate-100 py-1">
            {usage.most.map((m: any) => (
              <Link key={m.id} href="/audit" className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="w-7 h-7 shrink-0 rounded-full bg-[#14213D] text-white text-xs font-bold flex items-center justify-center">{(m.name || m.username || "?")[0].toUpperCase()}</span>
                <span className="flex-1 min-w-0 text-sm text-slate-900 truncate">{m.name || m.username}{usage.online?.some((o: any) => o.id === m.id) && <span className="ml-2 text-[11px] font-semibold text-emerald-700">● online</span>}</span>
                <span className="text-xs text-slate-500 tabular-nums">{hrs(m.active_seconds)} active · {m.actions} actions · {m.sign_ins} sign-ins</span>
              </Link>))}
            <p className="px-5 py-2 text-xs text-slate-500">Last 7 days</p>
          </div>}
        </Panel>

        <Panel title="Recent activity" icon={Activity} link={["/audit", "Full audit trail"]} empty={usage ? "No activity this week." : "Loading…"}>
          {events.length > 0 && <div className="divide-y divide-slate-100 py-1">
            {events.map((e) => (
              <Link key={e.id} href="/audit" className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="text-xs text-slate-500 w-20 shrink-0 pt-0.5">{ago(e.created_at)}</span>
                <span className="flex-1 min-w-0 text-sm text-slate-900 truncate"><b className="font-semibold">{e.name || e.username || "System"}</b> {(LABEL[e.action] ?? e.action).toLowerCase()}{e.item ? <span className="text-slate-600"> · {e.item}</span> : null}</span>
              </Link>))}
          </div>}
        </Panel>

        <Panel title="Latest releases" icon={GitCommit} link={["/product?tab=releases", "All releases"]} empty={pm ? "No releases recorded." : "Loading…"}>
          {releases.length > 0 && <div className="divide-y divide-slate-100 py-1">
            {releases.map((r) => (
              <Link key={r.hash} href="/product?tab=releases" className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="font-mono text-xs text-slate-500 w-16 shrink-0 pt-0.5">{r.hash.slice(0, 7)}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm text-slate-900 truncate">{r.subject}</span><span className="block text-xs text-slate-500">{r.app} · {ago(r.date)}</span></span>
              </Link>))}
          </div>}
        </Panel>
      </div>
    </Page>
  );
}

function Home() {
  const { data } = useWorkspace();
  return data?.me.isAdmin ? <AdminBody /> : <Body />;
}

export function Workspace() {
  return <Shell title="Dashboard"><Home /></Shell>;
}
