/**
 * Form primitives for the registration flow.
 *
 * ── Why these exist ─────────────────────────────────────────────────────────
 * The first cut of /register laid every field out by hand: a <Label>, an
 * <Input>, and sometimes a hint <p>, repeated ~40 times. Three problems fell out
 * of that, all visible on screen:
 *   1. ROWS DID NOT ALIGN. A cell with hint text is taller than one without, so
 *      in a 2-column grid the next row started at a ragged edge.
 *   2. EVERY FIELD WAS THE SAME WIDTH. A PIN code and a full street address both
 *      got half the page, which is what made the form feel sparse AND heavy at
 *      once — acres of empty input next to cramped labels.
 *   3. THERE WAS NOWHERE TO PUT AN ERROR. So per-field validation messages —
 *      which the old flow had — silently didn't get rebuilt, and a candidate
 *      with a bad Aadhaar just saw a greyed-out Next with no explanation.
 *
 * One `Field` fixes all three: it owns the label/hint/error stack, reserves the
 * message row so heights match, and takes a column span so a date can be 3
 * columns and an address 12.
 */
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Mic, AlertCircle } from "lucide-react";

/** 12-column grid. Lets short fields be short — see Field's `span`. */
export function FormGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-12 gap-x-5 gap-y-1 ${className}`}>{children}</div>;
}

const SPAN: Record<number, string> = {
  2: "col-span-6 sm:col-span-3 lg:col-span-2",
  3: "col-span-6 sm:col-span-4 lg:col-span-3",
  4: "col-span-12 sm:col-span-6 lg:col-span-4",
  5: "col-span-12 sm:col-span-6 lg:col-span-5",
  6: "col-span-12 lg:col-span-6",
  8: "col-span-12 lg:col-span-8",
  12: "col-span-12",
};

export function Field({
  label, required, hint, error, span = 6, children, className = "",
}: {
  label?: string; required?: boolean; hint?: string; error?: string | null;
  span?: 2 | 3 | 4 | 5 | 6 | 8 | 12; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`${SPAN[span]} ${className} pb-4`}>
      {label && (
        <label className="block text-[15px] font-semibold text-slate-800 mb-1.5 leading-snug">
          {label}{required && <span className="text-blue-600 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {/* One message row, always present in the layout when there is something
          to say. Error wins over hint — a hint under a wrong value is noise. */}
      {error ? (
        <p className="mt-1.5 text-[13px] text-rose-600 flex items-start gap-1 leading-snug">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />{error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-slate-500 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

/** Full-width sub-heading inside a grid (e.g. "Permanent address"). */
export function GridHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-12 pt-2 pb-2">
      <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wide">{children}</p>
    </div>
  );
}

/** A checkbox row that sits in the grid without breaking row alignment. */
export function GridCheckbox({
  checked, onChange, label, span = 12,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; span?: 6 | 12 }) {
  return (
    <div className={`${SPAN[span]} pb-4`}>
      <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          className="w-[18px] h-[18px] rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30 cursor-pointer" />
        <span className="text-[15px] text-slate-700">{label}</span>
      </label>
    </div>
  );
}

/** Standard input sizing for the flow — one place, so every box matches. */
export const inputCls =
  // `md:text-[15px]` is not redundant: ui/input ends its class list with
  // `md:text-sm`, which wins at >=768px and silently shrank every field on this
  // form back to 14px. The desktop override has to be explicit.
  "h-12 text-[15px] md:text-[15px] rounded-lg border-slate-300 bg-white focus-visible:ring-2 focus-visible:ring-blue-500/25 focus-visible:border-blue-400";

/**
 * Text field with voice input (Web Speech API), restored from the flow this one
 * replaced. Listens in Hindi when the page is in Hindi, else Indian English.
 *
 * This is the single most useful affordance for a low-literacy applicant, and
 * dropping it in the rebuild was a real loss — HP's blue-collar candidates are
 * exactly who it was built for. The mic only renders when the browser genuinely
 * supports SpeechRecognition (Chrome/Edge, HTTPS, mic permission), so it is
 * never a dead button.
 */
export function MicInput({
  value, onChange, placeholder, maxLength = 120, className = "",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
    return () => { try { recogRef.current?.stop(); } catch { /* noop */ } };
  }, []);

  const toggle = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { try { recogRef.current?.stop(); } catch { /* noop */ } setListening(false); return; }
    const r = new SR();
    r.lang = i18n.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const said = e.results?.[0]?.[0]?.transcript?.trim();
      if (said) onChange((value ? `${value} ${said}`.trim() : said).slice(0, maxLength));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  return (
    <div className="relative">
      <Input
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className={`${inputCls} ${supported ? "pr-14" : ""} ${className}`}
      />
      {supported && (
        <button
          type="button" onClick={toggle}
          title={listening ? t("shell.voiceListening") : t("shell.voiceTap")}
          aria-label={listening ? t("shell.voiceListening") : t("shell.voiceTap")}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg text-white flex items-center justify-center shadow active:scale-95 transition-all ${
            listening ? "bg-gradient-to-br from-rose-500 to-red-600 animate-pulse" : "bg-gradient-to-br from-blue-500 to-blue-600"}`}
        >
          <Mic className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
