import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Landmark, ShieldCheck, AlertTriangle, PhoneCall } from "lucide-react";

/**
 * UAT-05 registration shell — replaces simple-apply/QuestionShell.
 *
 * ── Why this is not just "wider" ────────────────────────────────────────────
 * The old shell hard-capped every screen at `max-w-xl` (576px). On a phone that
 * is correct, and it was a deliberate mobile-first, one-question-per-screen
 * design. But nobody ever made it responsive, so on the 1920px screen the
 * portal was demonstrated on it used 30% of the width and left 70% white —
 * which is what HPSEDC saw and commented on.
 *
 * "Make it wider" is the wrong fix: 20,000 HP applicants will fill this in on a
 * phone, and a 1100px form on a 390px screen is far worse than a narrow one on
 * a desktop. So the column GROWS with the viewport instead of being pinned at
 * either end:
 *   mobile  (<640)  576px, single column      — unchanged; it was already right
 *   tablet  (640+)  768px, single column
 *   desktop (1024+) 1100px, TWO-column fields — see FieldGrid
 *
 * This matters beyond aesthetics: the demo, HPSEDC's own staff, and assisted
 * registration at a facilitation centre are all desktop. The candidate is on a
 * phone. One shell has to serve both; the old one served one.
 *
 * ── Why pages, not questions ────────────────────────────────────────────────
 * The old flow was one-question-per-screen: 10 screens for Standard, 14 for
 * Professional. UAT-05 item 3 asked to "minimise multiple steps and consolidate
 * related information into a single section", so this is four PAGES of grouped
 * sections. A scroll with visible headings beats a gate you have to click
 * through fourteen times.
 */

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

/**
 * Responsive field grid. One column on mobile (a phone cannot usefully show
 * two), two from `lg` up. `wide` spans both columns — for anything that reads
 * as one thing (an address line, a tile grid, a sub-heading).
 */
export function FieldGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5 ${className}`}>{children}</div>;
}

export function Wide({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`lg:col-span-2 ${className}`}>{children}</div>;
}

/** A titled block within a page — the "single section" of item 3. */
export function Section({
  title, hint, children, className = "",
}: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-9 ${className}`}>
      <div className="mb-4 pb-2 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
        {hint && <p className="text-sm text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function RegisterShell({
  step, totalSteps, title, help, children,
  onBack, backLabel, onNext, nextLabel, nextDisabled, loading, onSkip, stepLabels,
}: {
  step: number; totalSteps: number; title: string; help?: string;
  children: React.ReactNode; onBack?: () => void; backLabel?: string; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; loading?: boolean; onSkip?: () => void;
  stepLabels?: string[];
}) {
  const { t } = useTranslation();
  // print:* on the chrome below — page 4 prints an A4 application form, and
  // everything in this shell is screen furniture that must not appear on it.
  // Marked here at the source rather than in ReviewPage's stylesheet: that one
  // targets `header, nav, footer`, which correctly hides the app frame but
  // cannot touch this shell, which is built from divs. Without these the
  // progress bar, screen heading and buttons all printed, and the trust footer
  // landed ON TOP of the candidate's answers.
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col print:min-h-0 print:bg-white">
      {/* Govt trust bar — blue-collar principle 10, carried over from the old shell */}
      <div className="print:hidden flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">
          {t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span>
        </p>
      </div>

      {/* THE fix: 576 -> 768 -> 1100, instead of a hard 576 everywhere. */}
      <div className="flex-1 w-full max-w-xl sm:max-w-3xl lg:max-w-[1100px] mx-auto px-4 sm:px-6 py-6 lg:py-8 flex flex-col print:max-w-none print:p-0">
        {/* Progress. Segmented + countable (never a %) — a candidate needs to
            know how much is left, and "63%" does not answer that. Labels appear
            only where there is room for them; the bar alone carries mobile. */}
        <div className="mb-7 print:hidden">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${totalSteps}`}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                i < step ? "bg-emerald-500" : i === step ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-slate-200"
              }`} />
            ))}
          </div>
          {stepLabels && (
            <div className="hidden sm:flex gap-1.5 mt-2">
              {stepLabels.map((label, i) => (
                <div key={i} className={`flex-1 text-xs font-medium truncate ${
                  i === step ? "text-blue-700" : i < step ? "text-emerald-600" : "text-slate-400"
                }`}>{label}</div>
              ))}
            </div>
          )}
          <p className="sm:hidden text-xs text-slate-500 mt-2">{t("reg.stepOf", { step: step + 1, total: totalSteps })}</p>
        </div>

        <motion.div key={step} variants={fadeUp} initial="initial" animate="animate" className="flex-1 flex flex-col">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight mb-1.5 print:hidden">{title}</h1>
          {help && <p className="text-base text-slate-500 mb-7 lg:max-w-3xl print:hidden">{help}</p>}
          <div className="flex-1">{children}</div>

          <div className="mt-9 pt-6 border-t border-slate-200 print:hidden">
            {/* Actions sit right on desktop (next to the eye, not stretched
                across 1100px) and stay full-width thumb targets on mobile. */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
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
              {onNext && (
                <Button
                  onClick={onNext} disabled={nextDisabled || loading}
                  className="w-full sm:w-auto sm:min-w-[220px] h-14 rounded-xl text-lg font-semibold gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 transition-all"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {nextLabel || t("shell.next")} {!loading && <ArrowRight className="w-5 h-5" />}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Trust footer + the Assisted lifeline.
          "HPSEDC will call me" used to be a TIER — a fork in the road at page
          zero, before the candidate had seen a single question. It is not a
          kind of registration, it is a way out when the form defeats you, so it
          belongs on every page and nowhere in the decision. */}
      <div className="border-t border-slate-100 bg-white/80 print:hidden">
        <div className="max-w-xl sm:max-w-3xl lg:max-w-[1100px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> {t("shell.verified")}
            </span>
            <span className="text-slate-300">|</span>
            <a href="/grievances?type=fraud" className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> {t("shell.reportFraud")}
            </a>
          </div>
          <a href="/start?mode=assisted" className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-800 font-medium">
            <PhoneCall className="w-3.5 h-3.5" /> {t("reg.needHelp")}
          </a>
        </div>
      </div>
    </div>
  );
}
