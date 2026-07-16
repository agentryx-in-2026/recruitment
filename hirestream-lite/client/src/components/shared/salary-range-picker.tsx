import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type SalaryPeriod = "annual" | "monthly" | "hourly";

interface Currency { code: string; symbol: string; flag: string; }

const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$",   flag: "🇺🇸" },
  { code: "GBP", symbol: "£",   flag: "🇬🇧" },
  { code: "EUR", symbol: "€",   flag: "🇪🇺" },
  { code: "AED", symbol: "د.إ", flag: "🇦🇪" },
  { code: "SAR", symbol: "﷼",   flag: "🇸🇦" },
  { code: "QAR", symbol: "﷼",   flag: "🇶🇦" },
  { code: "OMR", symbol: "﷼",   flag: "🇴🇲" },
  { code: "KWD", symbol: "د.ك", flag: "🇰🇼" },
  { code: "BHD", symbol: "د.ب", flag: "🇧🇭" },
  { code: "CAD", symbol: "$",   flag: "🇨🇦" },
  { code: "AUD", symbol: "$",   flag: "🇦🇺" },
  { code: "NZD", symbol: "$",   flag: "🇳🇿" },
  { code: "SGD", symbol: "$",   flag: "🇸🇬" },
  { code: "MYR", symbol: "RM",  flag: "🇲🇾" },
  { code: "JPY", symbol: "¥",   flag: "🇯🇵" },
  { code: "INR", symbol: "₹",   flag: "🇮🇳" },
];

// Practical amount tiers per period. Candidates from HP going overseas typically
// see these bands across gulf, europe, and asia-pacific postings.
const TIERS: Record<SalaryPeriod, number[]> = {
  annual:  [10000, 15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 120000, 150000, 180000, 220000, 275000],
  monthly: [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12500, 15000, 20000, 25000, 30000],
  hourly:  [8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60, 75, 100, 125, 150],
};

const PERIOD_LABEL: Record<SalaryPeriod, string> = {
  annual: "/ year",
  monthly: "/ month",
  hourly: "/ hour",
};

function formatAmount(n: number) {
  if (n >= 1000) return (n / 1000).toString().replace(/\.0$/, "") + "k";
  return String(n);
}

function formatSalaryString(currency: string, period: SalaryPeriod, min: number, max: number, note: string) {
  const suffix = PERIOD_LABEL[period];
  const range = `${currency} ${min.toLocaleString()} – ${max.toLocaleString()}`;
  const extra = note.trim() ? ` · ${note.trim()}` : "";
  return `${range} ${suffix}${extra}`;
}

// Loose parser for an incoming free-text value from older postings. Tries to
// recover currency + amounts; falls back to the defaults if the pattern doesn't
// match so the user can correct it.
function parseExisting(value: string | undefined) {
  if (!value) return null;
  const currencyMatch = value.match(/\b(USD|GBP|EUR|AED|SAR|QAR|OMR|KWD|BHD|CAD|AUD|NZD|SGD|MYR|JPY|INR)\b/i);
  const nums = Array.from(value.matchAll(/(\d[\d,]*)/g)).map(m => parseInt(m[1].replace(/,/g, ""), 10)).filter(n => n >= 10);
  if (!currencyMatch || nums.length < 2) return null;
  const period: SalaryPeriod = /\/?\s*(hr|hour)/i.test(value) ? "hourly"
    : /\/?\s*(mo|month)/i.test(value) ? "monthly"
    : "annual";
  return { currency: currencyMatch[1].toUpperCase(), period, min: nums[0], max: nums[1] };
}

export function SalaryRangePicker({
  value, onChange, defaultCurrency = "USD",
}: { value?: string; onChange: (next: string) => void; defaultCurrency?: string }) {
  const parsed = useMemo(() => parseExisting(value), [value]);
  const [currency, setCurrency] = useState(parsed?.currency ?? defaultCurrency);
  const [period, setPeriod] = useState<SalaryPeriod>(parsed?.period ?? "annual");
  const [min, setMin] = useState<number>(parsed?.min ?? TIERS.annual[4]);
  const [max, setMax] = useState<number>(parsed?.max ?? TIERS.annual[7]);
  const [note, setNote] = useState("");

  const tiers = TIERS[period];

  useEffect(() => {
    // When period changes, snap min/max into the new tier space
    const closest = (n: number) => tiers.reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p, tiers[0]);
    const nextMin = closest(min);
    let nextMax = closest(max);
    if (nextMax <= nextMin) nextMax = tiers[Math.min(tiers.length - 1, tiers.indexOf(nextMin) + 2)] ?? nextMin;
    if (nextMin !== min) setMin(nextMin);
    if (nextMax !== max) setMax(nextMax);
  }, [period]);

  useEffect(() => {
    onChange(formatSalaryString(currency, period, min, max, note));
  }, [currency, period, min, max, note]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="mr-1">{c.flag}</span>{c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as SalaryPeriod)}>
          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">Per year</SelectItem>
            <SelectItem value="monthly">Per month</SelectItem>
            <SelectItem value="hourly">Per hour</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(min)} onValueChange={(v) => {
          const n = parseInt(v, 10);
          setMin(n);
          if (max <= n) {
            const nextIdx = Math.min(tiers.length - 1, tiers.indexOf(n) + 2);
            setMax(tiers[nextIdx] ?? n);
          }
        }}>
          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {tiers.map(n => (
              <SelectItem key={n} value={String(n)}>Min {formatAmount(n)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(max)} onValueChange={(v) => setMax(parseInt(v, 10))}>
          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {tiers.filter(n => n > min).map(n => (
              <SelectItem key={n} value={String(n)}>Max {formatAmount(n)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} maxLength={80}
        placeholder="Optional note e.g. tax-free, + accommodation, negotiable"
        className="h-9 text-xs" />
      <p className="text-[11px] text-slate-500">
        Preview: <span className="font-mono text-slate-700">{formatSalaryString(currency, period, min, max, note)}</span>
      </p>
    </div>
  );
}

// ── Experience year options (practical presets) ─────────────────────
export const EXPERIENCE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Fresher (0 yrs)" },
  { value: 1, label: "1 year" },
  { value: 2, label: "2 years" },
  { value: 3, label: "3 years" },
  { value: 4, label: "4 years" },
  { value: 5, label: "5 years" },
  { value: 6, label: "6 years" },
  { value: 7, label: "7 years" },
  { value: 8, label: "8 years" },
  { value: 10, label: "10+ years" },
  { value: 15, label: "15+ years" },
  { value: 20, label: "20+ years (senior)" },
];
