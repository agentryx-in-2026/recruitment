import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Shell } from "../components/Shell";
import { useRequireAuth } from "../lib/useRequireAuth";
import { ROADMAP, statsAllPhases, statsForPhase, type FeatureStatus, type RoadmapPhase } from "@shared/roadmap";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, Circle, Sparkles, Map } from "lucide-react";

// ── Status visuals (match the markdown checklist legend) ─────────────
const STATUS_META: Record<FeatureStatus, { icon: string; label: string; color: string; pillClass: string }> = {
  shipped:     { icon: "✅", label: "shipped",     color: "emerald", pillClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  in_progress: { icon: "🟡", label: "in progress", color: "amber",   pillClass: "bg-amber-100 text-amber-800 border-amber-200" },
  planned:     { icon: "⚪", label: "planned",     color: "slate",   pillClass: "bg-slate-100 text-slate-700 border-slate-200" },
  future:      { icon: "🔵", label: "future",      color: "indigo",  pillClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

export function Roadmap() {
  const { reviewer, loading } = useRequireAuth();
  const [, setLocation] = useLocation();
  const [tipDismissed, setTipDismissed] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem("verify-roadmap-tip-dismissed") === "1"
  );

  // Admin / delivery only — non-admin reviewers shouldn't see the strategic
  // roadmap. Redirect them to home rather than 404, since the link doesn't
  // appear in their header anyway (defence-in-depth).
  useEffect(() => {
    if (!loading && reviewer && !["admin", "delivery"].includes(reviewer.role)) {
      setLocation("/");
    }
  }, [loading, reviewer, setLocation]);

  const overall = useMemo(() => statsAllPhases(ROADMAP), []);

  if (loading) return <Shell title="Verify roadmap"><div className="p-10 text-slate-400">Loading…</div></Shell>;
  if (!reviewer || !["admin", "delivery"].includes(reviewer.role)) {
    return <Shell title="Verify roadmap"><div className="p-10 text-slate-400">Redirecting…</div></Shell>;
  }

  return (
    <Shell title="Verify roadmap">
      <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-agentryx-600 to-indigo-600 flex items-center justify-center shadow-sm">
                <Map className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-serif text-[26px] font-bold text-slate-900">Product Roadmap</h1>
            </div>
            <div className="text-sm text-slate-500 mt-2 max-w-2xl">{ROADMAP.vision}</div>
            <div className="text-xs text-slate-400 mt-1">
              {ROADMAP.productName} · current build <span className="font-mono text-slate-600">{ROADMAP.currentVersion}</span>
            </div>
          </div>
          <OverallProgressCard stats={overall} />
        </div>

        {/* First-time visitor explainer (dismissible) */}
        {!tipDismissed && (
          <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 px-5 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="text-sm text-amber-900">
                  <div className="font-semibold mb-0.5">How to read this roadmap</div>
                  <div className="text-amber-800/90 text-xs leading-relaxed">
                    Phase 0 is everything live in the product today. Phases 1–9 are the planned expansion path. Each phase
                    has features marked <span className="font-semibold">{STATUS_META.shipped.icon} shipped</span>,
                    <span className="font-semibold"> {STATUS_META.in_progress.icon} in progress</span>,
                    <span className="font-semibold"> {STATUS_META.planned.icon} planned</span>, or
                    <span className="font-semibold"> {STATUS_META.future.icon} future</span>.
                    Click any phase to expand its feature list. This is what the product is and what it is becoming —
                    share it with your team or with potential customers to set expectations.
                  </div>
                </div>
              </div>
              <button onClick={() => { setTipDismissed(true); window.localStorage.setItem("verify-roadmap-tip-dismissed", "1"); }}
                className="text-amber-400 hover:text-amber-700 text-xs px-2 py-0.5 rounded transition shrink-0">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Roll-up summary band */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryPill label="Shipped"     count={overall.shipped}     status="shipped" />
          <SummaryPill label="In progress" count={overall.inProgress}  status="in_progress" />
          <SummaryPill label="Planned"     count={overall.planned}     status="planned" />
          <SummaryPill label="Future"      count={overall.future}      status="future" />
        </div>

        {/* Phase cards */}
        <div className="mt-8 space-y-4">
          {ROADMAP.phases.map((p) => <PhaseCard key={p.number} phase={p} />)}
        </div>

        {/* Roll-up table at the bottom (matches markdown source) */}
        <div className="mt-10 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900">Roll-up across all phases</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500 bg-slate-50/50">
              <tr>
                <th className="text-left px-4 py-2">Phase</th>
                <th className="text-left px-4 py-2">Theme</th>
                <th className="text-right px-3 py-2">Shipped</th>
                <th className="text-right px-3 py-2">In progress</th>
                <th className="text-right px-3 py-2">Planned</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {ROADMAP.phases.map((p) => {
                const s = statsForPhase(p);
                return (
                  <tr key={p.number} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{p.number}</td>
                    <td className="px-4 py-2 text-slate-700">{p.title}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-mono">{s.shipped || ""}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-mono">{s.inProgress || ""}</td>
                    <td className="px-3 py-2 text-right text-slate-600 font-mono">{s.planned || ""}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 font-mono">{s.total}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2 text-slate-900">Total</td>
                <td className="px-4 py-2"></td>
                <td className="px-3 py-2 text-right text-emerald-700 font-mono">{overall.shipped}</td>
                <td className="px-3 py-2 text-right text-amber-700 font-mono">{overall.inProgress}</td>
                <td className="px-3 py-2 text-right text-slate-700 font-mono">{overall.planned + overall.future}</td>
                <td className="px-3 py-2 text-right text-slate-900 font-mono">{overall.total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-[11px] text-slate-400 text-center">
          Source of truth: <span className="font-mono">PMD-Final wrapup/Agentryx-Verify-Roadmap/Roadmap_Dev_Checklist.md</span>
          {" · "}
          mirrored in <span className="font-mono">shared/roadmap.ts</span>
        </div>
      </div>
    </Shell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function OverallProgressCard({ stats }: { stats: ReturnType<typeof statsAllPhases> }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm min-w-[280px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Overall completion</span>
        <span className="text-2xl font-bold text-slate-900 tabular-nums">{stats.pctShipped}%</span>
      </div>
      <div className="mt-2 relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{ width: `${stats.pctShipped}%`, background: "linear-gradient(90deg, #10b981, #34d399 80%)" }} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-900 tabular-nums">{stats.shipped}</span> shipped ·
        <span className="text-amber-700 ml-0.5"> {stats.inProgress}</span> in flight ·
        <span className="text-slate-600 ml-0.5"> {stats.planned + stats.future}</span> planned
        <span className="text-slate-400"> · </span>
        <span className="font-semibold tabular-nums">{stats.total} total</span>
      </div>
    </div>
  );
}

function SummaryPill({ label, count, status }: { label: string; count: number; status: FeatureStatus }) {
  const m = STATUS_META[status];
  return (
    <div className={`rounded-lg border px-4 py-3 ${m.pillClass}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-75">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{count}</div>
    </div>
  );
}

function PhaseCard({ phase }: { phase: RoadmapPhase }) {
  // Phase 0 (baseline) defaults collapsed since it's the longest list.
  // Phase 1 (in progress) defaults expanded so the active work is visible.
  const [expanded, setExpanded] = useState(phase.status === "in_progress");
  const stats = statsForPhase(phase);
  const meta = STATUS_META[phase.status];

  // Border accent shifts with status so the eye lands on in-progress phases first.
  const borderClass =
    phase.status === "shipped"     ? "border-l-emerald-400" :
    phase.status === "in_progress" ? "border-l-amber-500"   :
    phase.status === "planned"     ? "border-l-slate-300"   :
                                     "border-l-indigo-300";

  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${borderClass} rounded-xl overflow-hidden shadow-sm`}>
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50 text-left">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Phase {phase.number}</span>
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${meta.pillClass}`}>
              {meta.icon} {meta.label}
            </span>
            {phase.effort && <span className="text-[10px] text-slate-400">· {phase.effort}</span>}
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900">{phase.title}</div>
          <div className="mt-1 text-xs text-slate-500">{phase.theme}</div>
          {phase.visibleShip && (
            <div className="mt-2 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 inline-block max-w-full">
              <span className="font-semibold uppercase text-[9px] tracking-wide text-slate-500 mr-1">Visible ship</span>
              {phase.visibleShip}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Progress</div>
            <div className="text-base font-bold text-slate-900 tabular-nums">{stats.shipped}/{stats.total}</div>
            <div className="mt-1 h-1 w-24 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stats.pctShipped}%` }} />
            </div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <ul className="space-y-1.5">
            {phase.features.map((f, idx) => {
              const fm = STATUS_META[f.status];
              return (
                <li key={idx} className="flex items-start gap-2.5 text-sm">
                  <span className="shrink-0 mt-0.5">
                    {f.status === "shipped"     ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                     f.status === "in_progress" ? <Clock className="w-4 h-4 text-amber-600" /> :
                                                  <Circle className="w-4 h-4 text-slate-300" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`${f.status === "shipped" ? "text-slate-900" : "text-slate-700"}`}>{f.title}</span>
                      {f.shippedIn && (
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
                          {f.shippedIn}
                        </span>
                      )}
                      {f.status !== "shipped" && (
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1 py-0.5 rounded ${fm.pillClass}`}>
                          {fm.label}
                        </span>
                      )}
                    </div>
                    {f.notes && <div className="text-[11px] text-slate-500 italic mt-0.5">{f.notes}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
