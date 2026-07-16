import { Plane, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

// readiness 2026-07-07: shared stage vocabulary — mirrors ReadinessStage in
// server/services/deployment.service.ts (client can't import server types).
export type ReadinessStage = "registered" | "documents" | "compliance" | "deployment" | "travel_ready";

// Muted tone per stage; the travel-ready pill is the only loud (green) one so
// "Cleared for Deployment" stays visually meaningful.
const STAGE_TONE: Record<ReadinessStage, string> = {
  registered: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  documents: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  compliance: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  deployment: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  travel_ready: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
};

export interface TravelReadyBadgeProps {
  stage: ReadinessStage;
  isTravelReady: boolean;
  size?: "sm" | "md";
}

export function TravelReadyBadge({ stage, isTravelReady, size = "md" }: TravelReadyBadgeProps) {
  const { t } = useTranslation();
  const sizing = size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";
  const iconCls = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  if (isTravelReady) {
    return (
      <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700 ${sizing}`}>
        <Plane className={iconCls} aria-hidden="true" />
        {t("readiness.travelReady")}
      </span>
    );
  }

  // readiness 2026-07-07: a 100%-compliance candidate (all documents done, but
  // not yet placed) reaches the "compliance" stage — a real green milestone,
  // distinct from travel-ready. Give it its own teal "Compliance Cleared" badge
  // so 100% never shows without a badge.
  if (stage === "compliance") {
    return (
      <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-700 ${sizing}`}>
        <CheckCircle2 className={iconCls} aria-hidden="true" />
        {t("readiness.complianceCleared")}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${STAGE_TONE[stage] ?? STAGE_TONE.registered} ${sizing}`}>
      {t(`readiness.stages.${stage}`, { defaultValue: stage.replace(/_/g, " ") })}
    </span>
  );
}
