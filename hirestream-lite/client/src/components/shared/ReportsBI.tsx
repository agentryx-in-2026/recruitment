/**
 * Shared Reports/BI view used by both agent and employer dashboards.
 *
 * Hits GET /api/v1/agent/reports — the endpoint is generic and scopes
 * to the caller via req.user.role (agent → jobs they own; employer →
 * jobs where they are the employer OR own the parent requisition).
 *
 * Extracted from agent-dashboard.tsx in v0.4.30 so the employer
 * Reports tab gets the same v0.4.26-era full BI rendering (drop-off,
 * stale, welfare SLA, compliance, HPSEDC PBBY/PDO/ECR, top employers,
 * skill gap, time-in-stage, period comparison, trend) instead of the
 * old four-tile stub.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, TrendingUp, AlertTriangle, Clock, Activity, Heart, Shield,
  MessageSquare, Building, Star, FolderLock, GraduationCap, Fingerprint, Globe,
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

export function ReportsBI() {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/agent/reports"],
    queryFn: () => fetchJson("/api/v1/agent/reports"),
  });
  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  const empty = {
    jobs: { total: 0, active: 0 },
    applicants: { total: 0, funnel: {}, conversionPct: 0, dropoff: [], stale: { warning: 0, critical: 0 } },
    placements: { total: 0, accepted: 0, avgTimeToPlaceDays: 0, topCountries: [] },
    welfareSla: { due30: 0, due60: 0, due90: 0, overdue: 0 },
    compliance: { passportExpiringSoon: 0, passportExpired: 0, pccPending: 0, medicalPending: 0, ecrPending: 0 },
    hpsedc: { pbbyEnrolled: 0, pbbyPending: 0, pdoCompleted: 0, pdoPending: 0, ecr: 0, ecnr: 0 },
    grievances: { open: 0, avgResolutionDays: 0 },
    topEmployers: [],
    skillGap: [],
    avgTimeInStage: [],
    periodCompare: { thisMonth: 0, lastMonth: 0 },
    trend: [],
  };
  const d = (res?.data ?? empty) as typeof empty;
  const maxTrend = Math.max(1, ...d.trend.map((t: any) => t.count));
  const momDelta = d.periodCompare.lastMonth === 0
    ? null
    : Math.round(((d.periodCompare.thisMonth - d.periodCompare.lastMonth) / d.periodCompare.lastMonth) * 100);

  return (
    <div className="space-y-6">
      {/* ═══ 1. KPI tiles ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportCard label="Jobs (active)" value={`${d.jobs.active} / ${d.jobs.total}`} subtitle="Active of total posted" />
        <ReportCard label="Applicants" value={d.applicants.total} subtitle="Across all your jobs" />
        <ReportCard label="Placements (accepted)" value={d.placements.accepted} subtitle={d.placements.total > d.placements.accepted ? `${d.placements.total} offered · ${d.placements.accepted} accepted` : "Candidates who accepted"} />
        <ReportCard label="Conversion rate" value={`${d.applicants.conversionPct}%`} subtitle="Applied → Accepted placement" />
      </div>

      {/* ═══ 2. Pipeline health ════════════════════════════════════════ */}
      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pipeline health</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" /> Stage drop-off — where candidates fall out
          </h3>
          {d.applicants.dropoff.length === 0 ? (
            <p className="text-xs text-slate-400">Not enough data yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {d.applicants.dropoff.map((s: any) => {
                const pct = s.conversionPct;
                const color = pct >= 70 ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : pct >= 40 ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-red-50 border-red-200 text-red-800";
                return (
                  <div key={`${s.from}-${s.to}`} className={`rounded-lg border p-3 ${color}`}>
                    <div className="text-[10px] uppercase font-bold opacity-75 capitalize truncate">
                      {s.from.replace(/_/g, " ")} → {s.to.replace(/_/g, " ")}
                    </div>
                    <div className="text-2xl font-bold tabular-nums mt-1">{pct}%</div>
                    <div className="text-[11px] mt-0.5 opacity-75">{s.fromCount} → {s.toCount}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Stale applicants
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
              {d.applicants.stale.warning + d.applicants.stale.critical}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="text-amber-700 font-semibold">{d.applicants.stale.warning}</span> ≥7d ·{" "}
              <span className="text-red-700 font-semibold">{d.applicants.stale.critical}</span> ≥14d
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Time to placement
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{d.placements.avgTimeToPlaceDays}<span className="text-base font-medium text-slate-500"> days</span></p>
            <p className="text-[11px] text-slate-400 mt-1">From first application to start date</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
              <Activity className="w-3 h-3" /> This month vs last
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
              {d.periodCompare.thisMonth}
              {momDelta !== null && (
                <span className={`text-xs font-bold ml-2 ${momDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {momDelta >= 0 ? "▲" : "▼"} {Math.abs(momDelta)}%
                </span>
              )}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{d.periodCompare.lastMonth} apps last month</p>
          </div>
        </div>
      </section>

      {/* ═══ 3. Operations — welfare / compliance / grievances ════════ */}
      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Operations &amp; SLA</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-600" /> Welfare check-ins
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">Post-placement check-ins due or overdue (30/60/90 day milestones).</p>
            <div className="space-y-1.5">
              <Row label="30-day due" value={d.welfareSla.due30} tone={d.welfareSla.due30 > 0 ? "warn" : "ok"} />
              <Row label="60-day due" value={d.welfareSla.due60} tone={d.welfareSla.due60 > 0 ? "warn" : "ok"} />
              <Row label="90-day due" value={d.welfareSla.due90} tone={d.welfareSla.due90 > 0 ? "warn" : "ok"} />
              <Row label="Overdue (≥5d late)" value={d.welfareSla.overdue} tone={d.welfareSla.overdue > 0 ? "alert" : "ok"} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" /> Compliance alerts
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">Document expiry &amp; missing clearance on placed candidates.</p>
            <div className="space-y-1.5">
              <Row label="Passport expired" value={d.compliance.passportExpired} tone={d.compliance.passportExpired > 0 ? "alert" : "ok"} />
              <Row label="Passport expiring ≤60d" value={d.compliance.passportExpiringSoon} tone={d.compliance.passportExpiringSoon > 0 ? "warn" : "ok"} />
              <Row label="PCC pending / unset" value={d.compliance.pccPending} tone={d.compliance.pccPending > 0 ? "warn" : "ok"} />
              <Row label="Medical pending" value={d.compliance.medicalPending} tone={d.compliance.medicalPending > 0 ? "warn" : "ok"} />
              <Row label="ECR status unknown" value={d.compliance.ecrPending} tone={d.compliance.ecrPending > 0 ? "warn" : "ok"} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-600" /> Grievances
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">Open complaints from candidates on your jobs.</p>
            <div className="space-y-1.5">
              <Row label="Open / unresolved" value={d.grievances.open} tone={d.grievances.open > 0 ? "alert" : "ok"} />
              <Row label="Avg resolution time" value={`${d.grievances.avgResolutionDays}d`} tone="muted" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 4. Strategic — employers / skills / time-in-stage ════════ */}
      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Strategic insights</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Building className="w-4 h-4 text-purple-600" /> Top employers
            </h3>
            {d.topEmployers.length === 0 ? <p className="text-xs text-slate-400">No employer data yet.</p> : (
              <div className="space-y-1.5">
                {d.topEmployers.map((e: any) => (
                  <div key={e.company} className="flex items-center justify-between text-xs">
                    <span className="text-slate-800 font-medium truncate flex-1">{e.company}</span>
                    <span className="text-slate-500 mx-3">{e.jobs} jobs · {e.applications} apps</span>
                    <span className="font-bold text-emerald-700 tabular-nums w-8 text-right">{e.placements}</span>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">Sorted by placements. Last column = accepted placements.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-600" /> Skill gap — demand vs supply
            </h3>
            {d.skillGap.length === 0 ? <p className="text-xs text-slate-400">No skill data yet.</p> : (
              <div className="space-y-1.5">
                {d.skillGap.map((s: any) => {
                  const max = Math.max(s.demand, s.supply, 1);
                  return (
                    <div key={s.skill} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-800 font-medium capitalize">{s.skill}</span>
                        <span className="text-slate-500">D {s.demand} · S {s.supply}</span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                        <div className="bg-indigo-400" style={{ width: `${(s.demand / max) * 50}%` }} />
                        <div className="bg-emerald-400 ml-px" style={{ width: `${(s.supply / max) * 50}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                  <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full mr-1" /> Demand (jobs that list this skill) ·{" "}
                  <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full mr-1 ml-2" /> Supply (candidates with this skill)
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mt-3">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-600" /> Time in stage — pipeline drag
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {d.avgTimeInStage.map((s: any) => (
              <div key={s.stage} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] uppercase font-bold text-slate-500 capitalize truncate">{s.stage.replace(/_/g, " ")}</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{s.avgDays}<span className="text-xs font-medium text-slate-500"> d</span></p>
                <p className="text-[10px] text-slate-400 mt-0.5">{s.count} in stage</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. HPSEDC compliance — PBBY, PDO, ECR ═══════════════════ */}
      <section>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">HPSEDC compliance (Emigration Act §1983)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <FolderLock className="w-4 h-4 text-indigo-600" /> PBBY Insurance
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">Pravasi Bharatiya Bima Yojana — mandatory before departure.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-emerald-700">Enrolled</p>
                <p className="text-2xl font-bold text-emerald-900 tabular-nums">{d.hpsedc.pbbyEnrolled}</p>
              </div>
              <div className="bg-amber-50 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-amber-700">Pending</p>
                <p className="text-2xl font-bold text-amber-900 tabular-nums">{d.hpsedc.pbbyPending}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-purple-600" /> Pre-Departure Orientation
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">PDO completion is mandatory for ECR-eligible candidates.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-emerald-700">Completed</p>
                <p className="text-2xl font-bold text-emerald-900 tabular-nums">{d.hpsedc.pdoCompleted}</p>
              </div>
              <div className="bg-amber-50 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-amber-700">Pending</p>
                <p className="text-2xl font-bold text-amber-900 tabular-nums">{d.hpsedc.pdoPending}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-amber-600" /> ECR / Non-ECR mix
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">Emigration Check Required vs Not Required.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-100 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-amber-800">ECR</p>
                <p className="text-2xl font-bold text-amber-900 tabular-nums">{d.hpsedc.ecr}</p>
              </div>
              <div className="bg-blue-50 rounded p-2">
                <p className="text-[10px] uppercase font-bold text-blue-700">ECNR</p>
                <p className="text-2xl font-bold text-blue-900 tabular-nums">{d.hpsedc.ecnr}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Trend chart + countries ═══════════════════════════════════ */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-600" /> Top destination countries
          </h3>
          {d.placements.topCountries.length === 0 ? (
            <p className="text-xs text-slate-400">No placements recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {d.placements.topCountries.map((c: any) => (
                <div key={c.country} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{c.country}</span>
                  <span className="font-bold text-slate-900">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" /> Applications over time (last 6 months)
          </h3>
          {d.trend.length === 0 ? (
            <p className="text-xs text-slate-400">Not enough data yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {d.trend.map((t: any) => (
                <div key={t.month} className="flex-1 flex flex-col items-center">
                  <div className="text-[10px] text-slate-500 mb-1 tabular-nums">{t.count}</div>
                  <div className="w-full bg-gradient-to-t from-blue-500 to-indigo-500 rounded-t"
                       style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: "4px" }}
                       title={`${t.month}: ${t.count}`} />
                  <span className="text-[10px] text-slate-400 mt-1">{t.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: any; tone: "ok" | "warn" | "alert" | "muted" }) {
  const cls = tone === "alert" ? "text-red-700 font-bold"
            : tone === "warn"  ? "text-amber-700 font-bold"
            : tone === "muted" ? "text-slate-500"
            : "text-emerald-700 font-semibold";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function ReportCard({ label, value, subtitle }: { label: string; value: any; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">{value}</p>
      {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
