/**
 * v0.4.33 (Phase 3): Reusable 7-factor match breakdown panel.
 *
 * Renders the explainability surface for the v2 engine. The breakdown
 * object comes from the server — same shape regardless of caller — and
 * we render only the factors with `max > 0` so the v1 fallback (3
 * factors, others zeroed out) still looks clean.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FactorResult {
  score: number;
  max: number;
  detail: string;
}

interface Breakdown {
  total: number;
  engineVersion?: "v1" | "v2";
  skill?: FactorResult;
  experience?: FactorResult;
  qualification?: FactorResult;
  country?: FactorResult;
  language?: FactorResult;
  category?: FactorResult;
  salary?: FactorResult;
}

const FACTOR_META: { key: keyof Breakdown; label: string; gradient: string; bg: string }[] = [
  { key: "skill",         label: "Skills",        gradient: "from-blue-500 to-blue-600",     bg: "bg-blue-50" },
  { key: "experience",    label: "Experience",    gradient: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50" },
  { key: "qualification", label: "Qualification", gradient: "from-violet-500 to-violet-600", bg: "bg-violet-50" },
  { key: "country",       label: "Country",       gradient: "from-amber-500 to-amber-600",   bg: "bg-amber-50" },
  { key: "language",      label: "Language",      gradient: "from-cyan-500 to-cyan-600",     bg: "bg-cyan-50" },
  { key: "category",      label: "Category",      gradient: "from-rose-500 to-rose-600",     bg: "bg-rose-50" },
  { key: "salary",        label: "Salary",        gradient: "from-indigo-500 to-indigo-600", bg: "bg-indigo-50" },
];

interface Props {
  breakdown: Breakdown;
  /** Render compact with collapse toggle (default true) or full open (false). */
  collapsible?: boolean;
  /** Optional title above the panel. */
  title?: string;
}

export function MatchBreakdownPanel({ breakdown, collapsible = true, title }: Props) {
  const [open, setOpen] = useState(!collapsible);
  if (!breakdown) return null;

  const factors = FACTOR_META.map((m) => ({ ...m, result: breakdown[m.key] as FactorResult | undefined }))
    .filter((f) => f.result && f.result.max > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center justify-between p-3 text-left ${collapsible ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`text-2xl font-bold tabular-nums ${
            breakdown.total >= 80 ? "text-emerald-600"
            : breakdown.total >= 60 ? "text-amber-600"
            : "text-slate-500"
          }`}>
            {breakdown.total}<span className="text-xs text-slate-400 font-normal">/100</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{title || "Match breakdown"}</p>
            <p className="text-[11px] text-slate-500">
              {factors.length}-factor scoring · engine {breakdown.engineVersion || "v2"}
            </p>
          </div>
        </div>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />)}
      </button>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {factors.map((f) => {
            const pct = f.result!.max > 0 ? (f.result!.score / f.result!.max) * 100 : 0;
            return (
              <div key={String(f.key)} className={`rounded-lg ${f.bg} p-2.5`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">{f.label}</span>
                  <Badge variant="outline" className="text-[9px] font-mono bg-white">
                    {f.result!.score}/{f.result!.max}
                  </Badge>
                </div>
                <div className="h-1.5 bg-white/60 rounded overflow-hidden mb-1.5">
                  <div className={`h-full bg-gradient-to-r ${f.gradient}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-600 leading-tight">{f.result!.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
