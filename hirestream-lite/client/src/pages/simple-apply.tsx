import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, X, Plus, Minus, Pencil, ShieldCheck, GraduationCap, ArrowRight } from "lucide-react";
import { formatAadhaar, maskAadhaar, stripAadhaar, isValidAadhaar } from "@shared/aadhaar";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { QuestionShell } from "./simple-apply/QuestionShell";
import {
  BLUE_COLLAR_TRADES, EDUCATION_LEVELS, SIMPLE_LEVELS, QUICK_LANGUAGES,
  QUICK_COUNTRIES, MicField,
} from "./simple-apply/reference";

const TOTAL = 10;

async function patchProfile(body: any) {
  const res = await fetch("/api/v1/candidates/profile", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || "Save failed"); }
  return res.json();
}

// ── HP-4c: simplified, blue-collar-first application flow. Blue-collar is the
// default; an escape link routes degree-holders to the detailed /profile wizard.
// Every screen writes to the SAME candidate schema (skills / experienceMonths /
// qualificationLevel + candidate_education / candidate_languages / preferredCountries).
export default function SimpleApplyPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  // Dynamic-key lookup with a raw-string fallback (for values a candidate may
  // hold that aren't in the fixed choice lists, e.g. a language added via /apply/pro).
  const tx = (key: string, fallback: string): string => t(key, { defaultValue: fallback }) as string;
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Collected answers (prefilled from the profile on mount).
  const [trade, setTrade] = useState<typeof BLUE_COLLAR_TRADES[number] | null>(null);
  const [fullName, setFullName] = useState("");
  const [months, setMonths] = useState(0);
  const [eduKey, setEduKey] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [homeLocation, setHomeLocation] = useState("");
  const [langExpanding, setLangExpanding] = useState<string | null>(null); // lifted from LanguageScreen
  const [proHintDismissed, setProHintDismissed] = useState(false); // P3: education-screen "switch to Professional" nudge
  // HP-4c "complete" Standard flow: document-level identity fields.
  const [dob, setDob] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const { data: profileRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const { data: langRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/languages"] });
  const languages = langRes?.data || [];

  // audit 2026-07-06 (C2): wait for auth to finish loading before redirecting,
  // otherwise a hard refresh mid-flow ejects logged-in users to /auth.
  useEffect(() => {
    if (!authLoading && !user) { setLocation("/auth"); return; }
  }, [user, authLoading, setLocation]);

  // Prefill from an existing profile so returning candidates don't re-answer.
  // audit 2026-07-06 (C11): run once (ref-guarded, like the resume effect below)
  // — re-running on every save-triggered refetch clobbered in-progress answers.
  const prefilledRef = useRef(false);
  useEffect(() => {
    const p = profileRes?.data;
    if (!p || prefilledRef.current) return;
    prefilledRef.current = true;
    if (p.fullName) setFullName(p.fullName);
    if (p.experienceMonths != null) setMonths(p.experienceMonths);
    else if (p.experience != null) setMonths(p.experience * 12);
    if (Array.isArray(p.preferredCountries)) setCountries(p.preferredCountries);
    if (p.phone) setPhone(p.phone);
    if (p.location) setHomeLocation(p.location);
    if (p.dateOfBirth) setDob(String(p.dateOfBirth).slice(0, 10));
    if (p.aadhaarNumber) setAadhaar(p.aadhaarNumber);
    if (p.passportNumber) setPassportNumber(p.passportNumber);
    if (p.passportExpiry) setPassportExpiry(String(p.passportExpiry).slice(0, 10));
    if (p.skills?.[0]) {
      const t = BLUE_COLLAR_TRADES.find((x) => x.label === p.skills[0]);
      if (t) setTrade(t);
    }
  }, [profileRes]);

  // Resume where they left off. Each screen auto-saves on Next, so we can derive
  // the furthest-answered screen from the saved profile (+ languages) and jump
  // there instead of restarting at the trade grid every visit. Runs once, after
  // both queries settle; guarded so it never fights manual Back/Next navigation.
  const resumedRef = useRef(false);
  useEffect(() => {
    const p = profileRes?.data;
    if (!p || langRes === undefined || resumedRef.current) return;
    resumedRef.current = true;
    const langs = langRes?.data || [];
    let s = 0;
    if (p.skills?.[0] && BLUE_COLLAR_TRADES.some((x) => x.label === p.skills[0])) s = 1;
    if (s === 1 && (p.fullName || "").trim()) s = 2;
    if (s === 2 && (p.experienceMonths != null || p.experience != null)) s = 3;
    if (s === 3 && p.qualificationLevel) s = 4;
    if (s === 4 && langs.length > 0) s = 5;
    if (s === 5 && Array.isArray(p.preferredCountries) && p.preferredCountries.length) s = 6;
    if (s === 6 && (p.phone || "").trim()) s = 7;
    if (s === 7 && p.dateOfBirth) s = 8;                      // passport (8) is skippable
    if (s === 8 && (p.passportNumber || p.passportExpiry)) s = 9;
    if (s > 0) setStep(s);
  }, [profileRes, langRes]);

  const go = (n: number) => setStep(Math.max(0, Math.min(TOTAL - 1, n)));

  const save = async (body: any, next?: number) => {
    setSaving(true);
    try {
      await patchProfile(body);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      if (next != null) go(next);
    } catch (e: any) {
      toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Screen 0: trade grid (entry) ───────────────────────────────────────
  const TradeGrid = () => (
    <QuestionShell step={0} totalSteps={TOTAL} question={t("simpleApply.qTrade")} help={t("simpleApply.helpTrade")}
      onBack={() => setLocation("/start")} backLabel={t("simpleApply.changeType")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {BLUE_COLLAR_TRADES.map((opt) => {
          const Icon = opt.icon;
          const picked = trade?.key === opt.key;
          return (
            <button key={opt.key} type="button" disabled={saving}
              onClick={async () => { setTrade(opt); await save({ skills: [opt.label], preferredCategories: [opt.category] }, 1); }}
              className={`relative flex flex-col items-center text-center gap-2 rounded-2xl border p-4 min-h-[7rem] transition-all active:scale-[0.97] ${
                picked ? "border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50/60 ring-2 ring-blue-300 shadow-lg shadow-blue-500/10"
                       : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md"}`}>
              {picked && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center"><Check className="w-4 h-4" strokeWidth={3} /></span>}
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${picked ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md" : "bg-blue-50 text-blue-600"}`}>
                <Icon className="w-6 h-6" />
              </span>
              <span className="text-base font-bold text-slate-900 leading-tight">{t(`choices.trades.${opt.key}.label`)}</span>
              <span className="text-xs text-slate-500 leading-tight">{t(`choices.trades.${opt.key}.sub`)}</span>
            </button>
          );
        })}
        {/* P3: the Professional path is a peer option IN the grid (full-width),
            not a tiny escape link — so a nurse/engineer sees it as a real choice. */}
        <button type="button" onClick={() => setLocation("/apply/pro")}
          className="col-span-2 sm:col-span-3 md:col-span-4 flex items-center gap-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-purple-50/40 p-4 text-left hover:border-violet-300 hover:shadow-md active:scale-[0.99] transition-all">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white flex items-center justify-center shrink-0"><GraduationCap className="w-6 h-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-slate-900 leading-tight">{t("simpleApply.proTileTitle")}</span>
            <span className="block text-xs text-slate-500 mt-0.5">{t("simpleApply.proTileSub")}</span>
          </span>
          <ArrowRight className="w-5 h-5 text-violet-500 shrink-0" />
        </button>
      </div>
    </QuestionShell>
  );

  // ── Screen 1: name ─────────────────────────────────────────────────────
  const NameScreen = () => (
    <QuestionShell step={1} totalSteps={TOTAL} question={t("simpleApply.qName")}
      onBack={() => go(0)} onNext={() => save({ fullName }, 2)} nextDisabled={!fullName.trim()} loading={saving}>
      <MicField value={fullName} onChange={setFullName} placeholder={t("simpleApply.phName")} autoFocus />
    </QuestionShell>
  );

  // ── Screen 2: experience (months stepper + chips) ──────────────────────
  const ExperienceScreen = () => {
    const chips = [{ m: 0, l: t("simpleApply.chipNew") }, { m: 12, l: t("simpleApply.chip1y") }, { m: 24, l: t("simpleApply.chip2y") }, { m: 60, l: t("simpleApply.chip5y") }, { m: 120, l: t("simpleApply.chip10y") }];
    return (
      <QuestionShell step={2} totalSteps={TOTAL} question={trade ? t("simpleApply.qExperience", { trade: t(`choices.trades.${trade.key}.label`) }) : t("simpleApply.qExperienceNoTrade")}
        help={t("simpleApply.helpExperience")} onBack={() => go(1)} onNext={() => save({ experienceMonths: months, experience: Math.round(months / 12) }, 3)} loading={saving}>
        <div className="flex items-center justify-center gap-4 mb-6">
          <button type="button" onClick={() => setMonths((m) => Math.max(0, m - 6))} className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:scale-95"><Minus className="w-6 h-6" /></button>
          <div className="text-center min-w-[7rem]">
            <div className="text-4xl font-bold text-slate-900 tabular-nums">{months}</div>
            <div className="text-sm text-slate-500">{t("simpleApply.monthsUnit")}{months >= 12 ? ` ≈ ${(months / 12).toFixed(1)} ${t("simpleApply.yrsShort")}` : ""}</div>
          </div>
          <button type="button" onClick={() => setMonths((m) => Math.min(600, m + 6))} className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:scale-95"><Plus className="w-6 h-6" /></button>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {chips.map((c) => (
            <button key={c.l} type="button" onClick={() => setMonths(c.m)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${months === c.m ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"}`}>{c.l}</button>
          ))}
        </div>
      </QuestionShell>
    );
  };

  // ── Screen 3: education level ──────────────────────────────────────────
  const EducationScreen = () => {
    const chosen = EDUCATION_LEVELS.find((l) => l.key === eduKey);
    const saveEdu = async () => {
      if (!chosen) return;
      setSaving(true);
      try {
        await patchProfile({ qualificationLevel: chosen.qualificationLevel });
        if (chosen.eduRow) {
          await fetch("/api/v1/candidates/education", {
            method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ ...chosen.eduRow, institution: "—", isPassed: true }),
          }); // ignore 409 (already added on a back/forward)
        }
        go(4);
      } catch (e: any) { toast({ title: e.message || "Could not save", variant: "destructive" }); }
      finally { setSaving(false); }
    };
    return (
      <QuestionShell step={3} totalSteps={TOTAL} question={t("simpleApply.qEducation")}
        help={t("simpleApply.helpEducation")} onBack={() => go(2)} onNext={saveEdu} nextDisabled={!chosen} loading={saving}>
        <div className="grid grid-cols-2 gap-3">
          {EDUCATION_LEVELS.map((lvl) => {
            const sel = eduKey === lvl.key; const Icon = lvl.icon;
            return (
              <button key={lvl.key} type="button" onClick={() => setEduKey(lvl.key)}
                className={`relative flex items-center gap-3 rounded-2xl border p-4 min-h-[5rem] text-left transition-all active:scale-[0.98] ${
                  sel ? "border-violet-400 bg-gradient-to-br from-violet-50/80 to-purple-50/40 ring-2 ring-violet-300 shadow-lg shadow-violet-500/10" : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"}`}>
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ${sel ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md" : "bg-violet-50 text-violet-600"}`}>
                  {Icon ? <Icon className="w-6 h-6" /> : <span className="text-base">{lvl.glyph}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-slate-900 leading-tight">{t(`choices.edu.${lvl.key}.label`)}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{t(`choices.edu.${lvl.key}.sub`)}</span>
                </span>
                {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
              </button>
            );
          })}
        </div>
        {/* P3b: a diploma/degree holder landed in the blue-collar flow — nudge
            them to the Professional form (both write the same schema, nothing lost). */}
        {chosen && ["diploma", "bachelor", "master", "doctorate"].includes(chosen.qualificationLevel) && !proHintDismissed && (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-purple-50/40 p-4">
            <p className="text-sm text-slate-700">{t("simpleApply.proHint")}</p>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setLocation("/apply/pro")} className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold active:scale-[0.98] transition">{t("simpleApply.switchToPro")}</button>
              <button type="button" onClick={() => setProHintDismissed(true)} className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">{t("simpleApply.continueHere")}</button>
            </div>
          </div>
        )}
      </QuestionShell>
    );
  };

  // ── Screen 4: languages ────────────────────────────────────────────────
  const LanguageScreen = () => {
    const expanding = langExpanding, setExpanding = setLangExpanding;
    // audit 2026-07-06 (C12): check res.ok — a silent failure left the chip
    // missing and Next disabled with no message.
    const addLang = async (language: string, proficiency: string) => {
      try {
        const res = await fetch("/api/v1/candidates/languages", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ language, proficiency }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || t("simpleApply.couldNotSave")); }
        queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] });
        setExpanding(null);
      } catch (e: any) {
        toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" });
      }
    };
    const removeLang = async (id: string) => {
      try {
        const res = await fetch(`/api/v1/candidates/languages/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || t("simpleApply.couldNotSave")); }
        queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] });
      } catch (e: any) {
        toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" });
      }
    };
    const available = QUICK_LANGUAGES.filter((l) => !languages.some((s: any) => s.language.toLowerCase() === l.toLowerCase()));
    return (
      <QuestionShell step={4} totalSteps={TOTAL} question={t("simpleApply.qLanguage")}
        help={t("simpleApply.helpLanguage")} onBack={() => go(3)} onNext={() => go(5)} nextDisabled={languages.length === 0}>
        {languages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {languages.map((l: any) => (
              <span key={l.id} className="inline-flex items-center gap-2 pl-4 pr-2 py-2.5 rounded-xl text-sm font-semibold bg-sky-100 text-sky-800 border border-sky-200/80">
                {tx(`choices.langs.${l.language}`, l.language)}<span className="text-sky-500 font-normal">· {tx(`choices.prof.${l.proficiency}`, l.proficiency)}</span>
                {/* audit 2026-07-06 (Batch 3): icon-only remove chip needed an aria-label */}
                <button onClick={() => removeLang(l.id)} aria-label={t("simpleApply.removeLangAria", { lang: tx(`choices.langs.${l.language}`, l.language) })} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-sky-200 hover:text-red-500"><X className="w-4 h-4" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="space-y-2.5">
          {available.map((lang) => {
            const open = expanding === lang;
            return (
              <div key={lang} className={`rounded-2xl border transition-all ${open ? "border-sky-300 bg-gradient-to-br from-sky-50/80 to-cyan-50/40 shadow-md" : "border-slate-200 bg-white"}`}>
                <button type="button" onClick={() => setExpanding(open ? null : lang)} className="w-full flex items-center justify-between px-5 py-4 min-h-[3.5rem]">
                  <span className="text-base font-semibold text-slate-800">{tx(`choices.langs.${lang}`, lang)}</span>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${open ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-400"}`}><Plus className={`w-4 h-4 transition-transform ${open ? "rotate-45" : ""}`} /></span>
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="grid grid-cols-3 gap-2 p-4 pt-0">
                        {SIMPLE_LEVELS.map((lv) => (
                          <button key={lv.v} type="button" onClick={() => addLang(lang, lv.v)}
                            className="rounded-xl border border-sky-200/80 bg-white py-3.5 min-h-[3.5rem] text-sm font-semibold text-slate-700 hover:bg-sky-600 hover:text-white hover:border-sky-600 active:scale-95 transition-all">{t(`choices.prof.${lv.v}`)}</button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </QuestionShell>
    );
  };

  // ── Screen 5: preferred country ────────────────────────────────────────
  const CountryScreen = () => {
    const toggle = (name: string) => setCountries((c) => c.includes(name) ? c.filter((x) => x !== name) : [...c, name]);
    return (
      <QuestionShell step={5} totalSteps={TOTAL} question={t("simpleApply.qCountry")}
        help={t("simpleApply.helpCountry")} onBack={() => go(4)} onNext={() => save({ preferredCountries: countries }, 6)} nextDisabled={countries.length === 0} loading={saving}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_COUNTRIES.map((c) => {
            const sel = countries.includes(c.name);
            return (
              <button key={c.name} type="button" onClick={() => toggle(c.name)}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 min-h-[6rem] transition-all active:scale-[0.97] ${
                  sel ? "border-emerald-400 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 ring-2 ring-emerald-300 shadow-lg" : "border-slate-200 bg-white hover:border-emerald-300"}`}>
                {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
                <span className="text-3xl">{c.flag}</span>
                <span className="text-sm font-bold text-slate-900">{tx(`choices.countries.${c.name}`, c.name)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setCountries(QUICK_COUNTRIES.map((c) => c.name))}
          className="mt-4 w-full text-sm text-emerald-600 hover:text-emerald-700 py-3 font-semibold">{t("simpleApply.anywhereGulf")}</button>
      </QuestionShell>
    );
  };

  // ── Screen 6: review + finish ──────────────────────────────────────────
  // ── Screen 6: contact (phone + home town) ──────────────────────────────
  const ContactScreen = () => (
    <QuestionShell step={6} totalSteps={TOTAL} question={t("simpleApply.qContact")}
      help={t("simpleApply.helpContact")}
      onBack={() => go(5)} onNext={() => save({ phone, location: homeLocation || null }, 7)} nextDisabled={phone.replace(/\D/g, "").length < 10} loading={saving}>
      <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("simpleApply.labelPhone")}</label>
      <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))}
        placeholder={t("simpleApply.phPhone")} maxLength={15}
        className="h-14 w-full rounded-xl border border-blue-200/80 bg-white px-4 text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
      <label className="block text-sm font-semibold text-slate-600 mt-5 mb-1.5">{t("simpleApply.labelTown")}</label>
      <MicField value={homeLocation} onChange={setHomeLocation} placeholder={t("simpleApply.phTown")} />
    </QuestionShell>
  );

  // ── Screen 7: ID details (DOB required, Aadhaar optional) ──────────────
  const idInput = "h-14 w-full rounded-xl border border-blue-200/80 bg-white px-4 text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
  // HPSEDC 2026-07-07: 12 digits + Verhoeff checksum. Block Next when an Aadhaar
  // is entered but not valid; show a specific message (length vs checksum).
  const aadhaarWrongLen = aadhaar.length > 0 && aadhaar.length !== 12;
  const aadhaarBadChecksum = aadhaar.length === 12 && !isValidAadhaar(aadhaar);
  const aadhaarInvalid = aadhaarWrongLen || aadhaarBadChecksum;
  const IdScreen = () => (
    <QuestionShell step={7} totalSteps={TOTAL} question={t("simpleApply.qId")} help={t("simpleApply.helpId")}
      onBack={() => go(6)} onNext={() => save({ dateOfBirth: dob || null, aadhaarNumber: (aadhaar.length === 12 && isValidAadhaar(aadhaar)) ? aadhaar : null }, 8)}
      nextDisabled={!dob || aadhaarInvalid} loading={saving}>
      <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("simpleApply.labelDob")}</label>
      <input type="date" value={dob} max={today} onChange={(e) => setDob(e.target.value)} className={idInput} />
      <label className="block text-sm font-semibold text-slate-600 mt-5 mb-1.5">{t("simpleApply.labelAadhaar")} <span className="text-slate-400 font-normal">{t("start.optional")}</span></label>
      <input inputMode="numeric" value={formatAadhaar(aadhaar)} maxLength={14} onChange={(e) => setAadhaar(stripAadhaar(e.target.value))} placeholder={t("simpleApply.phAadhaar")} className={`${idInput} tracking-widest`} />
      {aadhaarWrongLen && <p className="mt-2 text-sm text-amber-600">{t("simpleApply.aadhaarLen")}</p>}
      {aadhaarBadChecksum && <p className="mt-2 text-sm text-rose-600">{t("simpleApply.aadhaarInvalid")}</p>}
    </QuestionShell>
  );

  // ── Screen 8: passport (skippable — many first-timers have none yet) ────
  const PassportScreen = () => (
    <QuestionShell step={8} totalSteps={TOTAL} question={t("simpleApply.qPassport")} help={t("simpleApply.helpPassport")}
      onBack={() => go(7)} onNext={() => save({ passportNumber: passportNumber.trim() || null, passportExpiry: passportExpiry || null }, 9)} onSkip={() => go(9)}
      nextDisabled={!!passportNumber.trim() && !!passportExpiry && passportExpiry < today} loading={saving}>
      <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("simpleApply.labelPassportNum")}</label>
      <input value={passportNumber} maxLength={20} onChange={(e) => setPassportNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder={t("simpleApply.phPassport")} className={`${idInput} tracking-widest uppercase`} />
      <label className="block text-sm font-semibold text-slate-600 mt-5 mb-1.5">{t("simpleApply.labelPassportExpiry")}</label>
      <input type="date" value={passportExpiry} min={today} onChange={(e) => setPassportExpiry(e.target.value)} className={idInput} />
      {!!passportExpiry && passportExpiry < today && <p className="mt-2 text-sm text-rose-600">{t("simpleApply.passportExpiryError")}</p>}
    </QuestionShell>
  );

  const ReviewScreen = () => {
    const chosenEdu = EDUCATION_LEVELS.find((l) => l.key === eduKey);
    const Row = ({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) => (
      <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
        <div className="min-w-0"><p className="text-xs text-slate-400">{label}</p><p className="text-base font-semibold text-slate-800 truncate">{value || "—"}</p></div>
        <button onClick={onEdit} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
      </div>
    );
    return (
      <QuestionShell step={9} totalSteps={TOTAL} question={t("simpleApply.qReview")} help={t("simpleApply.helpReview")}
        onBack={() => go(8)} onNext={() => { toast({ title: t("simpleApply.savedToast") }); setLocation("/"); }} nextLabel={t("simpleApply.saveProfile")} loading={saving}>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Row label={t("simpleApply.rowWork")} value={trade ? t(`choices.trades.${trade.key}.label`) : ""} onEdit={() => go(0)} />
          <Row label={t("simpleApply.rowName")} value={fullName} onEdit={() => go(1)} />
          <Row label={t("simpleApply.rowExperience")} value={months >= 12 ? t("simpleApply.reviewYears", { y: (months / 12).toFixed(1) }) : t("simpleApply.reviewMonths", { m: months })} onEdit={() => go(2)} />
          <Row label={t("simpleApply.rowEducation")} value={chosenEdu ? t(`choices.edu.${chosenEdu.key}.label`) : ""} onEdit={() => go(3)} />
          <Row label={t("simpleApply.rowLanguages")} value={languages.map((l: any) => tx(`choices.langs.${l.language}`, l.language)).join(", ")} onEdit={() => go(4)} />
          <Row label={t("simpleApply.rowCountries")} value={countries.map((c) => tx(`choices.countries.${c}`, c)).join(", ")} onEdit={() => go(5)} />
          <Row label={t("simpleApply.rowPhone")} value={phone} onEdit={() => go(6)} />
          {homeLocation ? <Row label={t("simpleApply.rowTown")} value={homeLocation} onEdit={() => go(6)} /> : null}
          <Row label={t("simpleApply.rowDob")} value={dob} onEdit={() => go(7)} />
          {/* UIDAI/DPDP best practice: show only the last 4 digits of Aadhaar,
              even on the user's own review — they can tap Edit to see/change it. */}
          {aadhaar ? <Row label={t("simpleApply.rowAadhaar")} value={maskAadhaar(aadhaar) || ""} onEdit={() => go(7)} /> : null}
          {passportNumber ? <Row label={t("simpleApply.rowPassport")} value={passportNumber} onEdit={() => go(8)} /> : null}
        </div>
        <div className="mt-4 rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-emerald-800">{t("simpleApply.noFeeNote")}</p>
        </div>
        {chosenEdu && ["diploma", "bachelor", "master", "doctorate"].includes(chosenEdu.qualificationLevel) && (
          <button type="button" onClick={() => setLocation("/apply/pro")} className="mt-4 w-full text-center text-sm text-violet-700 hover:text-violet-800 underline underline-offset-2 py-2">{t("simpleApply.reviewProLink")}</button>
        )}
      </QuestionShell>
    );
  };

  // Render the screen by CALLING the function (not <Current/>). Rendering an
  // inline-defined component via <Current/> gives it a new identity every
  // parent re-render, which remounts its inputs and drops focus after one
  // keystroke. Calling it returns JSX that React reconciles in place.
  const screens = [TradeGrid, NameScreen, ExperienceScreen, EducationScreen, LanguageScreen, CountryScreen, ContactScreen, IdScreen, PassportScreen, ReviewScreen];
  return <>{screens[step]()}</>;
}
