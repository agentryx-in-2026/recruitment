import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// ── Deployment-readiness ring ─────────────────────────────────────────
// readiness 2026-07-07: hand-rolled SVG donut (stroke-dasharray) — deliberately
// NO chart library; it's a simple progress meter. Color encodes STATE, not
// just magnitude:
//   emerald → travel-ready (or 100% with nothing blocking)
//   rose    → a hard blocker exists (action_needed, e.g. expired passport)
//   amber   → in progress (1–99%)
//   slate   → not started (0%)
// All text/arc pairs meet WCAG-AA contrast in light and dark themes
// (darkMode: "class" — the dark: variants activate if the app ever flips it).

export type ReadinessRingSize = "sm" | "md" | "lg";

const SIZES: Record<ReadinessRingSize, { box: number; stroke: number; pctCls: string; captionCls: string }> = {
  sm: { box: 44, stroke: 5, pctCls: "text-[11px]", captionCls: "" },
  md: { box: 96, stroke: 9, pctCls: "text-xl", captionCls: "text-[9px]" },
  lg: { box: 136, stroke: 11, pctCls: "text-3xl", captionCls: "text-[11px]" },
};

export interface ReadinessRingProps {
  pct: number;
  size?: ReadinessRingSize;
  label?: string;
  isTravelReady?: boolean;
  // Rose (hard problem) is driven by `blockers` only — passport expired/missing,
  // visa rejected. A soft `warning` (passport expiring soon) stays amber. Falls
  // back to actionNeeded for callers that haven't been updated.
  blockers?: number;
  actionNeeded?: number;
}

export function ReadinessRing({ pct, size = "md", label, isTravelReady, blockers, actionNeeded }: ReadinessRingProps) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const s = SIZES[size];
  const r = (s.box - s.stroke) / 2;
  const circumference = 2 * Math.PI * r;

  // Animate the arc from 0 to the value on mount / value change.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  // readiness 2026-07-07: 100% is a real milestone and shows GREEN + a badge. It
  // means one of two things, distinguished by the badge (Compliance Cleared vs
  // Cleared for Deployment): all applicable items done. Amber = in progress,
  // rose = hard blocker, slate = not started.
  const hardBlockers = blockers ?? actionNeeded ?? 0;
  const cleared = clamped === 100 && hardBlockers === 0 && (actionNeeded ?? 0) === 0;
  const ready = !!isTravelReady || cleared;   // green
  const blocked = !ready && hardBlockers > 0;
  const tone = ready
    ? { arc: "text-emerald-600 dark:text-emerald-400", num: "text-emerald-700 dark:text-emerald-300", cap: isTravelReady ? "readiness.captionReady" : "readiness.captionCleared" }
    : blocked
      ? { arc: "text-rose-600 dark:text-rose-400", num: "text-rose-700 dark:text-rose-300", cap: "readiness.captionBlocked" }
      : clamped > 0
        ? { arc: "text-amber-500 dark:text-amber-400", num: "text-amber-700 dark:text-amber-300", cap: "readiness.captionProgress" }
        : { arc: "text-slate-400 dark:text-slate-500", num: "text-slate-600 dark:text-slate-300", cap: "readiness.captionIdle" };

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: s.box, height: s.box }}
      role="img"
      aria-label={t("readiness.aria", { pct: clamped })}
    >
      <svg width={s.box} height={s.box} viewBox={`0 0 ${s.box} ${s.box}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={s.box / 2} cy={s.box / 2} r={r} fill="none" strokeWidth={s.stroke}
          stroke="currentColor" className="text-slate-200 dark:text-slate-700"
        />
        <circle
          cx={s.box / 2} cy={s.box / 2} r={r} fill="none" strokeWidth={s.stroke} strokeLinecap="round"
          stroke="currentColor"
          className={`${tone.arc} transition-[stroke-dashoffset] duration-700 ease-out`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (drawn / 100) * circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold tabular-nums leading-none ${s.pctCls} ${tone.num}`}>{clamped}%</span>
        {size !== "sm" && (
          <span className={`mt-0.5 font-semibold uppercase tracking-tight whitespace-nowrap leading-none text-slate-500 dark:text-slate-400 ${s.captionCls}`}>
            {label ?? t(tone.cap)}
          </span>
        )}
      </div>
    </div>
  );
}
