import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Search } from "lucide-react";
import { Shell, useWorkspace, caseState, StatusChip, AutoChip } from "../components/Shell";

/** Case list — grouped by act, in run order; filters for project and status. */
const ROLE: Record<number, string> = { 1: "Applicant", 2: "Placement Cell", 3: "Employer", 4: "Admin" };

function Body() {
  const { data } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const show = params.get("show") ?? "all";
  const project = params.get("project") ?? "all";
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const projects = data!.projects.filter((p) => project === "all" || p.slug === project);
    return projects.map((p) => {
      let cs = p.cases;
      if (show === "torun") cs = cs.filter((c) => caseState(c) === "notrun" && c.delivery_status !== "not_delivered");
      if (show === "failed") cs = cs.filter((c) => caseState(c) === "failed");
      if (show === "passed") cs = cs.filter((c) => caseState(c) === "passed");
      if (show === "notbuilt") cs = cs.filter((c) => c.delivery_status === "not_delivered");
      if (q.trim()) { const t = q.toLowerCase(); cs = cs.filter((c) => `${c.item_ref} ${c.description} ${c.test_steps ?? ""}`.toLowerCase().includes(t)); }
      const acts: { act: string; cases: typeof cs }[] = [];
      for (const c of cs) {
        const last = acts[acts.length - 1];
        if (last && last.act === c.section_title) last.cases.push(c); else acts.push({ act: c.section_title, cases: [c] });
      }
      return { p, acts, count: cs.length };
    }).filter((g) => g.count > 0);
  }, [data, show, project, q]);

  const heading = { all: "All cases", torun: "To run", failed: "Failed — retest", passed: "Passed", notbuilt: "Not built yet" }[show] ?? "Cases";

  return (
    <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="font-serif text-[26px] font-bold text-slate-900">{heading}</h1>
          <p className="text-sm text-slate-500 mt-1">In run order. Click a case to test it.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="case-search" className="sr-only">Search cases</label>
          <input id="case-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[["all", "All"], ["hirestream-lite", "Web portal"], ...data!.projects.filter((p) => p.slug !== "hirestream-lite").map((p) => [p.slug, "Mobile app"])].map(([slug, label]) => {
          const qs = new URLSearchParams(); if (show !== "all") qs.set("show", show); if (slug !== "all") qs.set("project", slug);
          return <Link key={slug} href={`/cases${qs.toString() ? `?${qs}` : ""}`} className={`rounded-full border px-3 py-1 ${project === slug ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>{label}</Link>;
        })}
      </div>

      {groups.length === 0 && <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{show === "failed" ? "Nothing has failed. 🎉" : "No cases here."}</div>}

      {groups.map(({ p, acts }) => (
        <section key={p.id} className="mt-8">
          {project === "all" && <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{p.name}</h2>}
          <div className="space-y-6">
            {acts.map((a) => (
              <div key={a.act}>
                <div className="text-sm font-semibold text-slate-700 mb-2">{a.act}</div>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {a.cases.map((c) => (
                    <Link key={c.id} href={`/cases/${c.id}`} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-slate-50">
                      <span className="font-mono text-xs text-slate-500 w-12 pt-0.5 shrink-0">{c.item_ref}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] text-slate-900">{c.description}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{ROLE[c.section] ?? "General"}{c.delivery_status === "not_delivered" ? " · not built yet" : c.delivery_status === "partial" ? " · partly built" : ""}{c.comment_count ? ` · ${c.comment_count} comment${c.comment_count > 1 ? "s" : ""}` : ""}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0"><StatusChip c={c} /><AutoChip c={c} /></span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Cases() {
  return <Shell title="Test cases"><Body /></Shell>;
}
