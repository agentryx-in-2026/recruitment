import { AlertTriangle, Check, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReadinessRing } from "./ReadinessRing";
import { TravelReadyBadge, type ReadinessStage } from "./TravelReadyBadge";

// ── Deployment Readiness panel ────────────────────────────────────────
// readiness 2026-07-07: ring + tiered stepper + "what's left" list, rendered
// from the single backend readiness object (server/services/
// deployment.service.ts computeReadiness) so agent/admin/candidate all show
// the same truth.

export interface ReadinessItem {
  key: string;
  label: string;
  status: "done" | "in_progress" | "action_needed" | "pending";
  owner: "you" | "agency";
  detail?: string | null;
  applicable: boolean;
  blocking: boolean;
}

export interface ReadinessData {
  pct: number;
  done: number;
  total: number;
  actionNeeded: number;
  blockers?: number;   // hard problems → red
  warnings?: number;   // soft problems → amber
  pending: { key: string; label: string; owner: "you" | "agency" }[];
  isTravelReady: boolean;
  isComplianceReady: boolean;
  stage: ReadinessStage;
  items: ReadinessItem[];
}

const STAGES: ReadinessStage[] = ["registered", "documents", "compliance", "deployment", "travel_ready"];

// Compact tiered stepper: Registered → Documents → Compliance → Deployment →
// Travel-Ready. Done stages get a check, the current stage is highlighted.
export function ReadinessStepper({ stage, isTravelReady }: { stage: ReadinessStage; isTravelReady: boolean }) {
  const { t } = useTranslation();
  const currentIdx = Math.max(0, STAGES.indexOf(stage));
  return (
    <div className="relative">
      {/* track + progress line behind the step circles */}
      <div className="absolute left-[10%] right-[10%] top-3 h-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <div
        className="absolute left-[10%] top-3 h-0.5 bg-emerald-500 dark:bg-emerald-400 transition-all duration-500"
        style={{ width: `${(currentIdx / (STAGES.length - 1)) * 80}%` }}
        aria-hidden="true"
      />
      <ol className="relative grid grid-cols-5">
        {STAGES.map((s, i) => {
          // readiness 2026-07-07: travel_ready is a terminal stage — when
          // reached, every step (including itself) renders as done.
          const done = i < currentIdx || (isTravelReady && i === currentIdx);
          const current = !done && i === currentIdx;
          return (
            <li key={s} className="flex flex-col items-center gap-1 text-center" aria-current={current ? "step" : undefined}>
              <span
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white dark:bg-emerald-400 dark:border-emerald-400 dark:text-slate-900"
                    : current
                      ? "bg-white border-blue-600 text-blue-700 dark:bg-slate-900 dark:border-blue-400 dark:text-blue-300"
                      : "bg-white border-slate-300 text-slate-400 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-500"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </span>
              <span
                className={`text-[10px] leading-tight font-semibold px-0.5 ${
                  done
                    ? "text-emerald-700 dark:text-emerald-300"
                    : current
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {t(`readiness.stages.${s}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Small owner chip: "you" = the candidate, "agency" = HPSEDC.
export function OwnerChip({ owner }: { owner: "you" | "agency" }) {
  const { t } = useTranslation();
  return owner === "you" ? (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 whitespace-nowrap">
      {t("readiness.ownerYou")}
    </span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 whitespace-nowrap">
      {t("readiness.ownerAgency")}
    </span>
  );
}

export function ReadinessPanel({ readiness, className }: { readiness: ReadinessData; className?: string }) {
  const { t } = useTranslation();
  const r = readiness;
  // Blockers surfaced in the amber callout (e.g. "Passport expired — renew").
  const actionItems = (r.items ?? []).filter((i) => i.applicable && i.status === "action_needed");

  return (
    <section className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t("readiness.title")}</h2>
        <TravelReadyBadge stage={r.stage} isTravelReady={r.isTravelReady} size="sm" />
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <ReadinessRing pct={r.pct} size="md" isTravelReady={r.isTravelReady} blockers={r.blockers} actionNeeded={r.actionNeeded} />

        <div className="flex-1 min-w-0 w-full space-y-4">
          <ReadinessStepper stage={r.stage} isTravelReady={r.isTravelReady} />

          {r.pending.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                {t("readiness.whatsLeft")}
              </p>
              <ul className="space-y-1">
                {r.pending.map((p) => (
                  <li key={p.key} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
                    {/* Stable item keys get a bilingual label; unknown keys fall
                        back to the server-provided English label. */}
                    <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {t(`readiness.items.${p.key}`, { defaultValue: p.label })}
                    </span>
                    <OwnerChip owner={p.owner} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.isTravelReady && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 p-3.5 flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{t("readiness.allClearTitle")}</p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">{t("readiness.allClearBody")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {r.actionNeeded > 0 && (() => {
        // readiness 2026-07-07: a HARD blocker (expired passport, visa rejected)
        // → rose; a soft warning (passport expiring soon) → amber. Matches the
        // ring, so a 67%-with-a-warning candidate isn't shown as alarming red.
        const hasBlocker = (r.blockers ?? 0) > 0;
        const c = hasBlocker
          ? { box: "border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800", icon: "text-rose-600 dark:text-rose-400", title: "text-rose-900 dark:text-rose-200", body: "text-rose-800 dark:text-rose-300", detail: "text-rose-700/80 dark:text-rose-400" }
          : { box: "border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800", icon: "text-amber-600 dark:text-amber-400", title: "text-amber-900 dark:text-amber-200", body: "text-amber-800 dark:text-amber-300", detail: "text-amber-700/80 dark:text-amber-400" };
        return (
          <div className={`mt-4 rounded-xl border ${c.box} p-3.5 flex items-start gap-2.5`}>
            <AlertTriangle className={`w-5 h-5 ${c.icon} shrink-0 mt-0.5`} aria-hidden="true" />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${c.title}`}>{t("readiness.actionTitle")}</p>
              {/* The specific text (e.g. "Passport expired — renew now") comes from
                  the backend checklist verbatim. */}
              {actionItems.map((i) => (
                <p key={i.key} className={`text-sm ${c.body} mt-0.5`}>
                  {i.label}
                  {i.detail ? <span className={c.detail}> — {i.detail}</span> : null}
                </p>
              ))}
            </div>
          </div>
        );
      })()}
    </section>
  );
}
