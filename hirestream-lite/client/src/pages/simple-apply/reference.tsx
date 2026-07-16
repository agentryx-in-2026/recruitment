import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BrickWall, Car, Flame, Zap, Wrench, ChefHat, Hammer, PaintRoller,
  ShieldCheck, Sparkles, HeartHandshake, Factory, HardHat, Scissors,
  ConciergeBell, Tractor, Bike, CircleEllipsis, Mic, GraduationCap, Award,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// HP-4c: reference data + tiny shared inputs for the simplified blue-collar flow.
// Everything maps onto the EXISTING candidate schema — no new tables/columns.

// Trade → lucide icon + JOB_CATEGORIES key. `label` is written to skills[0].
export const BLUE_COLLAR_TRADES: {
  key: string; label: string; sub: string; icon: React.ElementType; category: string;
}[] = [
  { key: "mason",        label: "Mason",               sub: "Brick and stone work",      icon: BrickWall,      category: "construction" },
  { key: "driver",       label: "Driver",              sub: "Car, taxi, truck, bus",     icon: Car,            category: "transport" },
  { key: "welder",       label: "Welder",              sub: "Gas and arc welding",       icon: Flame,          category: "construction" },
  { key: "electrician",  label: "Electrician",         sub: "Wiring and repair",         icon: Zap,            category: "construction" },
  { key: "plumber",      label: "Plumber",             sub: "Pipes and fittings",        icon: Wrench,         category: "construction" },
  { key: "cook",         label: "Cook",                sub: "Home, hotel, or mess",      icon: ChefHat,        category: "hospitality" },
  { key: "carpenter",    label: "Carpenter",           sub: "Wood and furniture work",   icon: Hammer,         category: "construction" },
  { key: "painter",      label: "Painter",             sub: "House and site painting",   icon: PaintRoller,    category: "construction" },
  { key: "security",     label: "Security Guard",      sub: "Building or site security", icon: ShieldCheck,    category: "security" },
  { key: "cleaner",      label: "Cleaner",             sub: "Housekeeping and cleaning", icon: Sparkles,       category: "hospitality" },
  { key: "caregiver",    label: "Care Giver",          sub: "Care for elders or sick",   icon: HeartHandshake, category: "healthcare" },
  { key: "factory",      label: "Factory Worker",      sub: "Machine and line work",     icon: Factory,        category: "manufacturing" },
  { key: "helper",       label: "Construction Helper", sub: "Site helper work",          icon: HardHat,        category: "construction" },
  { key: "tailor",       label: "Tailor",              sub: "Stitching and garments",    icon: Scissors,       category: "manufacturing" },
  { key: "steward",      label: "Hotel Steward",       sub: "Waiter and hotel service",  icon: ConciergeBell,  category: "hospitality" },
  { key: "agriculture",  label: "Farm Worker",         sub: "Farming and orchard work",  icon: Tractor,        category: "agriculture" },
  { key: "delivery",     label: "Delivery Worker",     sub: "Parcel and food delivery",  icon: Bike,           category: "transport" },
  { key: "other",        label: "Other Work",          sub: "Tell us what you do",       icon: CircleEllipsis, category: "other" },
];

// Education as levels (not a free-text degree). Maps to profile.qualificationLevel
// + one candidate_education row so matching + admin views keep working.
// `qualificationLevel` values line up with matching's QUAL_ORDER (below_matric
// added server-side in HP-4c so low-education candidates don't score as blank).
export const EDUCATION_LEVELS: {
  key: string; label: string; sub: string; glyph?: string; icon?: React.ElementType;
  qualificationLevel: string;
  eduRow: { type: string; degree: string } | null;
}[] = [
  { key: "none",     label: "No schooling",         sub: "That is okay",     glyph: "—",    qualificationLevel: "below_matric", eduRow: null },
  { key: "primary",  label: "5th class",            sub: "Primary school",   glyph: "5th",  qualificationLevel: "below_matric", eduRow: { type: "school", degree: "5th" } },
  { key: "middle",   label: "8th class",            sub: "Middle school",    glyph: "8th",  qualificationLevel: "below_matric", eduRow: { type: "school", degree: "8th" } },
  { key: "matric",   label: "10th class",           sub: "Matric",           glyph: "10th", qualificationLevel: "school",       eduRow: { type: "school", degree: "10th" } },
  { key: "senior",   label: "12th class",           sub: "Plus two",         glyph: "12th", qualificationLevel: "school",       eduRow: { type: "school", degree: "12th" } },
  { key: "iti",      label: "ITI / Trade training", sub: "Trade certificate", icon: Wrench,  qualificationLevel: "diploma",      eduRow: { type: "certification", degree: "ITI Trade Certificate" } },
  { key: "diploma",  label: "Diploma",              sub: "Polytechnic",      icon: Award,   qualificationLevel: "diploma",      eduRow: { type: "diploma", degree: "Diploma" } },
  { key: "graduate", label: "College degree",       sub: "BA, B.Com, B.Sc…", icon: GraduationCap, qualificationLevel: "bachelor", eduRow: { type: "university", degree: "Graduate" } },
];

export const SIMPLE_LEVELS = [
  { v: "elementary", label: "Little", dots: 1 },
  { v: "intermediate", label: "Good", dots: 2 },
  { v: "professional", label: "Very good", dots: 3 },
];
export const QUICK_LANGUAGES = ["Hindi", "English", "Punjabi", "Pahari", "Nepali", "Urdu", "Arabic"];

// Top Gulf destinations shown as emoji flags (zero image deps). Values match
// DESTINATION_COUNTRIES in @/lib/reference-data.
export const QUICK_COUNTRIES: { name: string; flag: string }[] = [
  { name: "UAE", flag: "🇦🇪" }, { name: "Saudi Arabia", flag: "🇸🇦" }, { name: "Qatar", flag: "🇶🇦" },
  { name: "Kuwait", flag: "🇰🇼" }, { name: "Oman", flag: "🇴🇲" }, { name: "Bahrain", flag: "🇧🇭" },
];

// Text field with WORKING voice input via the Web Speech API. Language-aware:
// listens in Hindi (hi-IN) when the page is in Hindi, else Indian English —
// the single most useful affordance for a low-literacy blue-collar user. The
// mic only appears when the browser actually supports SpeechRecognition (Chrome/
// Edge; needs HTTPS + mic permission), so it's never a dead button.
export function MicField({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
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
    r.lang = i18n.language === "hi" ? "hi-IN" : "en-IN";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const said = e.results?.[0]?.[0]?.transcript?.trim();
      if (said) onChange(value ? `${value} ${said}`.trim().slice(0, 100) : said.slice(0, 100));
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
        placeholder={placeholder} autoFocus={autoFocus} maxLength={100}
        className={`h-14 rounded-xl border-blue-200/80 bg-white text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${supported ? "pr-16" : "pr-4"}`}
      />
      {supported && (
        <button
          type="button" onClick={toggle}
          title={listening ? t("shell.voiceListening") : t("shell.voiceTap")}
          aria-label={listening ? t("shell.voiceListening") : t("shell.voiceTap")}
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl text-white flex items-center justify-center shadow-md active:scale-95 transition-all ${
            listening ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-red-500/30 animate-pulse" : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/25"}`}
        >
          <Mic className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
