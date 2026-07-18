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
        <label className="block text-[14.5px] font-semibold text-slate-700 mb-1.5 leading-snug">
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
  //
  // WHITE on the section's tinted body, with a real border and a soft inner
  // shadow — an input has to look like a slot you put something into. Flat white
  // on flat white read as decoration, not as a control.
  "h-12 text-[15px] md:text-[15px] rounded-lg border-slate-300/90 bg-white " +
  "shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] " +
  "hover:border-slate-400/80 " +
  "focus-visible:ring-[3px] focus-visible:ring-blue-500/15 focus-visible:border-blue-500 transition-colors";

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

/**
 * Phone number with a country dial code.
 *
 * A candidate is not necessarily in India when they apply. A large share of this
 * portal's users are ALREADY working overseas and applying for their next
 * placement — a welder in Dubai renewing, a nurse in Muscat moving employer. A
 * bare 10-digit box quietly assumes they are at home, and a Gulf number simply
 * would not fit it.
 *
 * Stored as one string, "+971 501234567", which the server's phoneRegex already
 * accepts — so this is a UI change with no schema or validation change behind it.
 * A legacy value with no code is read as +91 rather than being mangled.
 */
const DIAL_CODES: { code: string; flag: string; name: string }[] = [
  { code: "+91", flag: "🇮🇳", name: "India" },
  // The Gulf first — where this portal actually places people, and therefore
  // where a candidate is most likely to be sitting when they apply again.
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "+974", flag: "🇶🇦", name: "Qatar" },
  { code: "+965", flag: "🇰🇼", name: "Kuwait" },
  { code: "+968", flag: "🇴🇲", name: "Oman" },
  { code: "+973", flag: "🇧🇭", name: "Bahrain" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+353", flag: "🇮🇪", name: "Ireland" },
  { code: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "+1", flag: "🇺🇸", name: "USA / Canada" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "+64", flag: "🇳🇿", name: "New Zealand" },
  { code: "+65", flag: "🇸🇬", name: "Singapore" },
  { code: "+60", flag: "🇲🇾", name: "Malaysia" },
  { code: "+81", flag: "🇯🇵", name: "Japan" },
  { code: "+977", flag: "🇳🇵", name: "Nepal" },
];

/** Split "+971 501234567" into its code and national part. Longest code wins,
 *  so +97 never shadows +971. */
export function splitPhone(value: string | null | undefined): { code: string; number: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { code: "+91", number: "" };
  if (raw.startsWith("+")) {
    const match = [...DIAL_CODES]
      .sort((a, b) => b.code.length - a.code.length)
      .find((c) => raw.startsWith(c.code));
    if (match) return { code: match.code, number: raw.slice(match.code.length).replace(/\D/g, "") };
  }
  // No code, or one we do not list — treat the digits as an Indian number rather
  // than dropping them.
  return { code: "+91", number: raw.replace(/\D/g, "") };
}

export function joinPhone(code: string, number: string): string {
  const n = number.replace(/\D/g, "");
  return n ? `${code} ${n}` : "";
}

export function PhoneInput({
  value, onChange, disabled, autoComplete,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; autoComplete?: string }) {
  const { code, number } = splitPhone(value);
  return (
    <div className="flex gap-2">
      <select
        value={code}
        disabled={disabled}
        onChange={(e) => onChange(joinPhone(e.target.value, number))}
        aria-label="Country code"
        className={`${inputCls} w-[7.5rem] shrink-0 pl-2.5 pr-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {DIAL_CODES.map((c) => (
          <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>
        ))}
      </select>
      <Input
        className={`${inputCls} flex-1 min-w-0`}
        inputMode="tel"
        autoComplete={autoComplete}
        maxLength={15}
        disabled={disabled}
        value={number}
        onChange={(e) => onChange(joinPhone(code, e.target.value))}
      />
    </div>
  );
}
