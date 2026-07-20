import React, { useState, useEffect } from "react";
import { useFormTimer } from "./useFormTimer";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Landmark, ShieldCheck, AlertTriangle, PhoneCall, Clock, CheckCircle2, HelpCircle, Pause, Play, RotateCcw, Save, Wand2 } from "lucide-react";

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
/**
 * A numbered section band + its fields, as one card.
 *
 * Borrowed from the HP Tourism eServices portal (the homestay registration form
 * we built alongside this one). A thin underline under a heading — what this had
 * before — does not group anything on a 1100px page: the eye reads one long
 * column of inputs. A dark numbered band with the section's purpose under it
 * chunks the form into things a candidate can hold in their head, and the number
 * tells them how far through the page they are.
 */
export function Section({
  n, title, hint, icon: Icon, onAutofill, autofillLabel, children, className = "",
}: {
  n?: number; title: string; hint?: string; icon?: React.ElementType;
  /** Test mode only — fills just THIS section. */
  onAutofill?: () => void; autofillLabel?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    /* Three surfaces, deliberately, because two was flat:
         header  — deep slate, white type. Carries the structure.
         body    — a faint slate wash, NOT white.
         fields  — white, so they lift off the wash and read as "fill me in".
       The all-white version had white cards on a white page holding white
       inputs: nothing had an edge, so the eye had nothing to hold on to and the
       form read as one undifferentiated sheet. A form should look like it has
       somewhere to write. */
    <section className={`mb-5 rounded-2xl border border-slate-200/70 bg-white overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-16px_rgba(15,23,42,0.12)] ${className}`}>
      <div className="flex items-start gap-3.5 px-5 sm:px-6 py-4 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-700">
        {(n !== undefined || Icon) && (
          <span className="shrink-0 w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center ring-1 ring-white/15 backdrop-blur-sm">
            {Icon ? <Icon className="w-[18px] h-[18px]" /> : <span className="text-[15px] font-bold tabular-nums">{n}</span>}
          </span>
        )}
        <div className="min-w-0 pt-0.5 flex-1">
          <h2 className="text-[17px] font-bold text-white tracking-tight leading-tight">
            {n !== undefined && Icon && <span className="text-blue-300/90 font-semibold tabular-nums mr-1.5">{n}.</span>}
            {title}
          </h2>
          {hint && <p className="text-[13.5px] text-slate-300/90 mt-1 leading-snug">{hint}</p>}
        </div>
        {/* Per-SECTION autofill. Page-level filling was too blunt: a tester
            checking the address rules still had to re-key identity and contact
            to get there. Filling one section at a time lets them hand-test the
            part they care about and skip the rest. */}
        {onAutofill && (
          <button type="button" onClick={onAutofill}
            title={autofillLabel} aria-label={autofillLabel}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-[12.5px] font-semibold px-2.5 h-8 transition-colors">
            <Wand2 className="w-3.5 h-3.5" /> {autofillLabel}
          </button>
        )}
      </div>
      <div className="px-5 sm:px-6 pt-5 pb-1 bg-slate-50/60">{children}</div>
    </section>
  );
}

export function RegisterShell({
  step, totalSteps, title, help, children,
  onBack, backLabel, onNext, nextLabel, nextDisabled, loading, onSkip, submittedNote, submittedHint, candidateId, stepLabels, stepIcons,
  stepProgress, overallProgress, startedAt, onNavigate, maxStepReached,
}: {
  step: number; totalSteps: number; title: string; help?: string;
  children: React.ReactNode; onBack?: () => void; backLabel?: string; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; loading?: boolean; onSkip?: () => void;
  /** Scopes the timer to this person — see useFormTimer. */
  candidateId?: string | null;
  /** Shown beside the action when the application is in, with nothing new to send. */
  submittedNote?: string;
  /** Why the action is disabled. Without it a grey button just looks broken. */
  submittedHint?: string;
  stepLabels?: string[];
  /** One glyph per stage — scannable for a candidate who reads slowly. */
  stepIcons?: React.ElementType[];
  /** 0-100 per page, so each stage shows its OWN completeness. */
  stepProgress?: number[];
  /** 0-100 across the whole form. */
  overallProgress?: number;
  /** Epoch ms the candidate opened the form — drives "time spent". */
  startedAt?: number;
  /** Jump to a stage from the sidebar. */
  onNavigate?: (step: number) => void;
  /** Furthest stage reached — you may revisit, but not skip ahead. */
  maxStepReached?: number;
}) {
  const { t } = useTranslation();
  // "Time spent" is not a nag — it is evidence for the candidate that this form
  // is short. HPSEDC's whole complaint was that registration felt endless; a
  // visible four-minute clock is the counter-argument, and it is the one number a
  // candidate can check against the promise on page 1. It therefore has to
  // SURVIVE leaving and coming back, or it is evidence of nothing.
  const { label: mmss, paused: timerPaused, toggle: toggleTimer, reset: resetTimer } = useFormTimer(candidateId);
  // print:* on the chrome below — page 4 prints an A4 application form, and
  // everything in this shell is screen furniture that must not appear on it.
  // Marked here at the source rather than in ReviewPage's stylesheet: that one
  // targets `header, nav, footer`, which correctly hides the app frame but
  // cannot touch this shell, which is built from divs. Without these the
  // progress bar, screen heading and buttons all printed, and the trust footer
  // landed ON TOP of the candidate's answers.
  return (
    // A soft blue wash rather than flat white. The portal's identity is HPSEDC
    // blue; a page that is pure white makes the white form cards invisible
    // against it, which is why the earlier version read as one undifferentiated
    // slab. The tint is deliberately faint — it should register as "clean", not
    // as a colour.
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,#f6f9fe_0%,#fbfcfe_38%,#f4f7fd_100%)] flex flex-col print:min-h-0 print:bg-white">
      {/* Govt trust bar — blue-collar principle 10, carried over from the old shell */}
      <div className="print:hidden flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-200/70 bg-white/70 backdrop-blur-sm">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">
          {t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span>
        </p>
      </div>

      {/* Two columns from lg up. The single centred column left ~700px of dead
          space on a desktop, and a candidate mid-form has nowhere to see how the
          stages relate or to reach help without abandoning the page. */}
      <div className="flex-1 w-full max-w-xl sm:max-w-3xl lg:max-w-[1360px] mx-auto px-4 sm:px-6 py-6 lg:py-8 flex gap-8 print:max-w-none print:p-0 print:block">

        <FormSidebar
          step={step} totalSteps={totalSteps} stepLabels={stepLabels} stepIcons={stepIcons}
          stepProgress={stepProgress} overallProgress={overallProgress}
          mmss={mmss} showTimer={!!startedAt}
          onNavigate={onNavigate} maxStepReached={maxStepReached ?? step} t={t}
        />

        <div className="flex-1 min-w-0 flex flex-col print:max-w-none">
        {/* Progress — three readings, because they answer different questions:
              · overall %      "how much of the whole form is done"
              · per-stage %    "how much of THIS page is done"   <- the useful one
              · time spent     "is this actually as short as promised"
            Pattern taken from the HP Tourism homestay form. The previous version
            showed only which page you were on, which tells a candidate nothing
            about how much work is left inside it. */}
        <div className="mb-7 print:hidden">
          {/* THE STEPPER BELONGS AT THE TOP.
              It was briefly moved into the sidebar and that was wrong: this is
              the first thing a candidate looks for, it wants the full width to
              breathe, and on a form the horizontal run of stages reads as a
              journey in a way a vertical list does not. The sidebar keeps
              navigation and help; progress lives here. */}
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] px-5 py-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">{t("reg.nav.stages")}</p>
              <div className="flex items-center gap-4">
                <div className={`hidden sm:flex items-center gap-1.5 text-[13px] rounded-lg px-2 py-1 transition-colors ${
                  timerPaused ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "text-slate-500"}`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{timerPaused ? t("reg.timer.paused") : t("reg.timeSpent")}</span>
                  <span className="font-mono font-semibold tabular-nums">{mmss}</span>
                  <button type="button" onClick={toggleTimer}
                    title={timerPaused ? t("reg.timer.resume") : t("reg.timer.pause")}
                    aria-label={timerPaused ? t("reg.timer.resume") : t("reg.timer.pause")}
                    className={`ml-0.5 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                      timerPaused ? "bg-amber-600 text-white hover:bg-amber-700" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
                    {timerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  {/* Reset — for a clean measured run. Confirmed, because the
                      number is the evidence that this form is short and wiping
                      it by accident loses that reading for good. */}
                  <button type="button"
                    onClick={() => { if (window.confirm(t("reg.timer.resetConfirm"))) resetTimer(); }}
                    title={t("reg.timer.reset")} aria-label={t("reg.timer.reset")}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {overallProgress !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-[13px] text-slate-500">{t("reg.nav.overall")}</span>
                    <div className="w-20 sm:w-28 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-500"
                        style={{ width: `${overallProgress}%` }} />
                    </div>
                    <span className="text-[15px] font-bold text-slate-900 tabular-nums w-10 text-right">{overallProgress}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
              aria-label={`Step ${step + 1} of ${totalSteps}`}>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const pct = stepProgress?.[i] ?? (i < step ? 100 : 0);
                const state = i === step ? "current" : i < step ? "done" : "todo";
                const StepIcon = stepIcons?.[i];
                const reachable = i <= (maxStepReached ?? step);
                const done = pct >= 100 && state !== "current";
                return (
                  <button key={i} type="button" disabled={!reachable || !onNavigate}
                    onClick={() => reachable && onNavigate?.(i)}
                    aria-current={state === "current" ? "step" : undefined}
                    className={`text-left group ${reachable && onNavigate ? "cursor-pointer" : "cursor-default"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        done ? "bg-emerald-100 text-emerald-700"
                          : state === "current" ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                          : "bg-slate-100 text-slate-400"}`}>
                        {done ? <CheckCircle2 className="w-4 h-4" />
                          : StepIcon ? <StepIcon className="w-4 h-4" />
                          : <span className="text-[12px] font-bold">{i + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13.5px] font-bold truncate leading-tight ${
                          state === "current" ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>
                          {stepLabels?.[i]}
                        </span>
                        <span className={`block text-[11.5px] tabular-nums leading-tight ${
                          done ? "text-emerald-600 font-semibold" : state === "current" ? "text-blue-600 font-semibold" : "text-slate-400"}`}>
                          {pct}% {t("reg.nav.complete")}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${
                        done ? "bg-emerald-500" : state === "current" ? "bg-gradient-to-r from-blue-500 to-blue-700" : "bg-slate-200"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
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
                <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-1.5">
                  {/* A submitted application says so. Without this the review
                      page offered the same "Submit application" button forever,
                      so a candidate had no way to tell whether theirs had gone
                      in — and pressed it again to be sure. */}
                  {submittedNote && (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{submittedNote}</span>
                    </div>
                  )}
                  <Button
                    onClick={onNext} disabled={nextDisabled || loading}
                    className={`w-full sm:w-auto sm:min-w-[220px] h-14 rounded-xl text-lg font-semibold gap-2 text-white shadow-lg transition-all ${
                      submittedNote
                        ? "bg-slate-300 shadow-none hover:bg-slate-300"
                        : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/25"}`}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {nextLabel || t("shell.next")} {!loading && !submittedNote && <ArrowRight className="w-5 h-5" />}
                  </Button>
                  {submittedHint && (
                    <p className="text-xs text-slate-500 text-right max-w-[320px]">{submittedHint}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
        </div>{/* /main column */}
      </div>{/* /two-column frame */}

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


/**
 * In-form navigation, desktop only.
 *
 * The single centred column left roughly 700px of empty page on a 1920px
 * screen. Filling it with the form's own stages does three things a horizontal
 * bar could not: it shows all four stages and their individual progress at once
 * without competing for width, it lets a candidate jump back to a page they
 * have already done (a horizontal stepper this small was not a credible click
 * target), and it puts help within reach of someone who is stuck — which is
 * exactly when they would otherwise close the tab.
 *
 * Forward jumps are NOT allowed. Each page saves on Next, so skipping ahead
 * would leave earlier pages unsaved and the later ones prefilled from nothing.
 */
function FormSidebar({
  step, totalSteps, stepLabels, stepIcons, stepProgress, overallProgress,
  mmss, showTimer, onNavigate, maxStepReached, t,
}: any) {
  return (
    <aside className="hidden lg:block w-[264px] shrink-0 print:hidden">
      <div className="sticky top-6 space-y-4">

        {/* Progress lives at the TOP of the page, not here — this panel is for
            getting somewhere, not for reading numbers. What is left is the two
            things a candidate stuck mid-form actually reaches for: a way back to
            a page they already did, and a human. */}
        <nav className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          aria-label={t("reg.nav.jump")}>
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t("reg.nav.jump")}
          </p>
          {Array.from({ length: totalSteps }).map((_, i) => {
            const pct = stepProgress?.[i] ?? 0;
            const current = i === step;
            const reachable = i <= (maxStepReached ?? step);
            const Icon = stepIcons?.[i];
            const done = pct >= 100 && !current;
            return (
              <button key={i} type="button" disabled={!reachable || !onNavigate}
                onClick={() => reachable && onNavigate?.(i)}
                aria-current={current ? "step" : undefined}
                className={`w-full text-left rounded-xl px-3 py-2.5 mb-0.5 flex items-center gap-2.5 transition-colors ${
                  current ? "bg-blue-50 ring-1 ring-blue-100"
                    : reachable ? "hover:bg-slate-50 cursor-pointer"
                    : "opacity-40 cursor-not-allowed"}`}>
                <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                  done ? "bg-emerald-100 text-emerald-700"
                    : current ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-400"}`}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : Icon ? <Icon className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </span>
                <span className={`text-[14px] font-semibold truncate flex-1 ${
                  current ? "text-blue-800" : done ? "text-slate-700" : "text-slate-500"}`}>
                  {stepLabels?.[i]}
                </span>
                {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Help — reachable at the moment a candidate is stuck, which is the
            moment they would otherwise leave. */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t("reg.nav.help")}
          </p>
          <a href="/callback" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-emerald-50 transition-colors group">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-100">
              <PhoneCall className="w-4 h-4" />
            </span>
            <span className="text-[14px] font-semibold text-slate-700">{t("reg.nav.callback")}</span>
          </a>
          <a href="/faq" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </span>
            <span className="text-[14px] font-semibold text-slate-700">{t("reg.nav.faq")}</span>
          </a>
          <a href="/grievances?type=fraud" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-rose-50 transition-colors">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <span className="text-[14px] font-semibold text-slate-700">{t("shell.reportFraud")}</span>
          </a>
        </div>

        {/* The one thing a candidate most needs reassuring about. */}
        <div className="flex items-start gap-2 px-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-slate-500 leading-snug">{t("reg.nav.saved")}</p>
        </div>
      </div>
    </aside>
  );
}
