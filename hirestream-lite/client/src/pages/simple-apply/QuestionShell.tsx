import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Landmark, ShieldCheck, AlertTriangle } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// HP-4c: one-question-per-screen wrapper for the simplified blue-collar flow.
// Govt trust chrome top + bottom (blue-collar principle 10), a countable
// segmented progress bar, big 56px primary action.
export function QuestionShell({
  step, totalSteps, question, help, children,
  onBack, backLabel, onNext, nextLabel, nextDisabled, loading, onSkip,
}: {
  step: number; totalSteps: number; question: string; help?: string;
  children: React.ReactNode; onBack?: () => void; backLabel?: string; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; loading?: boolean; onSkip?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      {/* Govt trust bar */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">
          {t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span>
        </p>
      </div>

      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-6 flex flex-col">
        {/* Segmented progress — countable, not a % */}
        <div className="flex gap-1.5 mb-8" aria-label={`Question ${step + 1} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
              i < step ? "bg-emerald-500" : i === step ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-slate-200"
            }`} />
          ))}
        </div>

        <motion.div key={step} variants={fadeUp} initial="initial" animate="animate" className="flex-1 flex flex-col">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-2">{question}</h1>
          {help && <p className="text-base text-slate-500 mb-6">{help}</p>}
          <div className="flex-1">{children}</div>

          <div className="mt-8 pt-6 border-t border-slate-100 space-y-3">
            {onNext && (
              <Button
                onClick={onNext} disabled={nextDisabled || loading}
                className="w-full h-14 rounded-xl text-lg font-semibold gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 transition-all"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {nextLabel || t("shell.next")} {!loading && <ArrowRight className="w-5 h-5" />}
              </Button>
            )}
            <div className="flex items-center justify-between">
              {onBack ? (
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 py-3 px-2 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> {backLabel || t("shell.back")}
                </button>
              ) : <div />}
              {onSkip && (
                <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-600 py-3 px-2 transition-colors">
                  {t("shell.skip")}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-4 py-3 px-4 border-t border-slate-100 bg-white/80 text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" /> {t("shell.verified")}
        </span>
        <span className="text-slate-300">|</span>
        <a href="/grievances?type=fraud" className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" /> {t("shell.reportFraud")}
        </a>
      </div>
    </div>
  );
}
