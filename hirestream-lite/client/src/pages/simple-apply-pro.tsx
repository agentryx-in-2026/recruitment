import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Plus, Minus, Pencil, ShieldCheck, Briefcase, Award } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { QuestionShell } from "./simple-apply/QuestionShell";
import { MicField, QUICK_LANGUAGES, SIMPLE_LEVELS } from "./simple-apply/reference";
import { PRO_EDU_LEVELS, DEGREE_TYPES, PRO_FIELDS, CERT_SUGGESTIONS, PRO_COUNTRIES, IELTS_BANDS } from "./simple-apply-pro/reference";
import { SKILL_CATEGORIES, IELTS_COUNTRIES, FIELD_LIMITS } from "@/lib/reference-data";

// HP tier-3: guided professional registration. One question per screen, same
// QuestionShell chrome as the blue-collar flow. Screens are plain functions
// with NO internal hooks (all state lifted here) rendered by CALLING
// screens[step]() so inputs keep focus across re-renders.
const TOTAL = 14;

async function patchProfile(body: any) {
  const res = await fetch("/api/v1/candidates/profile", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || "Save failed"); }
  return res.json();
}
async function postJson(url: string, body: any, method = "POST") {
  const res = await fetch(url, {
    method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || "Save failed"); }
  return res.json();
}

const cardCls = (sel: boolean) =>
  `relative flex items-center gap-3 rounded-2xl border p-4 min-h-[5rem] text-left transition-all active:scale-[0.98] ${
    sel ? "border-violet-400 bg-gradient-to-br from-violet-50/80 to-purple-50/40 ring-2 ring-violet-300 shadow-lg shadow-violet-500/10"
        : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"}`;
const inputCls = "h-14 w-full rounded-xl border border-blue-200/80 bg-white px-4 text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all";
const labelCls = "block text-sm font-semibold text-slate-600 mb-1.5";

export default function SimpleApplyProPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const tx = (key: string, fallback: string): string => t(key, { defaultValue: fallback }) as string;
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [homeLocation, setHomeLocation] = useState("");

  const [eduLevel, setEduLevel] = useState<string | null>(null);
  const [degreeType, setDegreeType] = useState<string | null>(null);
  const [fieldKey, setFieldKey] = useState<string | null>(null);
  const [fieldCustom, setFieldCustom] = useState("");
  const [institution, setInstitution] = useState("");
  const [university, setUniversity] = useState("");
  const [eduYear, setEduYear] = useState("");
  const [eduMarks, setEduMarks] = useState("");
  const [eduRowId, setEduRowId] = useState<string | null>(null);

  const [expOpen, setExpOpen] = useState(false);
  const [expRole, setExpRole] = useState("");
  const [expCompany, setExpCompany] = useState("");
  const [expYears, setExpYears] = useState(1);
  const [expCountry, setExpCountry] = useState("India");

  const [certOpen, setCertOpen] = useState(false);
  const [certName, setCertName] = useState("");
  const [certIssuer, setCertIssuer] = useState("");
  const [certYear, setCertYear] = useState("");

  const [skills, setSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [moreSkills, setMoreSkills] = useState(false);
  const [langExpanding, setLangExpanding] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [ieltsBand, setIeltsBand] = useState<string | null>(null);
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");

  const { data: profileRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const { data: langRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/languages"] });
  const { data: eduRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/education"] });
  const { data: expRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/experience"] });
  const languages = langRes?.data || [];
  const eduRows: any[] = eduRes?.data || [];
  const certRows = eduRows.filter((r) => r.type === "certification");
  const qualRows = eduRows.filter((r) => r.type !== "certification");
  const expRows: any[] = expRes?.data || [];

  // audit 2026-07-06 (C2): wait for auth to finish loading before redirecting,
  // otherwise a hard refresh mid-flow ejects logged-in users to /auth.
  useEffect(() => { if (!authLoading && !user) setLocation("/auth"); }, [user, authLoading, setLocation]);
  useEffect(() => {
    const p = profileRes?.data;
    if (!p) return;
    if (p.fullName) setFullName(p.fullName);
    if (p.phone) setPhone(p.phone);
    if (p.email) setEmail(p.email);
    if (p.location) setHomeLocation(p.location);
    if (Array.isArray(p.skills)) setSkills(p.skills);
    if (Array.isArray(p.preferredCountries)) setCountries(p.preferredCountries);
    if (p.ieltsBand != null) setIeltsBand(Number(p.ieltsBand).toFixed(1));
    if (p.passportNumber) setPassportNumber(p.passportNumber);
    if (p.passportExpiry) setPassportExpiry(String(p.passportExpiry).slice(0, 10));
    if (p.qualificationLevel) {
      if (["bachelor", "master", "doctorate"].includes(p.qualificationLevel)) { setEduLevel("degree"); setDegreeType(p.qualificationLevel); }
      else if (p.qualificationLevel === "diploma") setEduLevel("diploma");
      else if (p.qualificationLevel === "school") setEduLevel("senior");
    }
  }, [profileRes]);

  // Resume where they left off (each screen auto-saves on Next). Derived from the
  // saved profile + education/language rows; jumps past completed sections rather
  // than restarting at screen 0. Runs once, guarded against manual navigation.
  const resumedRef = useRef(false);
  useEffect(() => {
    const p = profileRes?.data;
    if (!p || langRes === undefined || eduRes === undefined || resumedRef.current) return;
    resumedRef.current = true;
    const langs = langRes?.data || [];
    const quals = (eduRes?.data || []).filter((r: any) => r.type !== "certification");
    // Restore the profession (fieldKey) so the Skills + Certificate suggestions
    // repopulate when the user returns — otherwise those panels look empty.
    if (!fieldKey) {
      const subj = quals.map((r: any) => r.subject).find(Boolean);
      const m = PRO_FIELDS.find((f) => f.label === subj) || PRO_FIELDS.find((f) => f.category === p.preferredCategories?.[0]);
      if (m) setFieldKey(m.key);
    }
    let s = 0;
    if ((p.fullName || "").trim()) s = 1;
    if (s === 1 && (p.phone || "").trim()) s = 2;
    if (s === 2 && p.qualificationLevel && quals.length > 0) s = 6;   // education section done
    if (s === 6 && Array.isArray(p.skills) && p.skills.length > 0) s = 9;
    if (s === 9 && langs.length > 0) s = 10;
    if (s === 10 && Array.isArray(p.preferredCountries) && p.preferredCountries.length) {
      s = p.preferredCountries.some((c: string) => IELTS_COUNTRIES.has(c)) ? 11 : 12;
    }
    if ((s === 11 || s === 12) && (p.passportNumber || p.passportExpiry)) s = 13;
    if (s > 0) setStep(s);
  }, [profileRes, langRes, eduRes]);

  const go = (n: number) => setStep(Math.max(0, Math.min(TOTAL - 1, n)));
  const hasIeltsCountry = countries.some((c) => IELTS_COUNTRIES.has(c));

  const save = async (body: any, next?: number) => {
    setSaving(true);
    try {
      await patchProfile(body);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      if (next != null) go(next);
    } catch (e: any) { toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // ── 0 name ─────────────────────────────────────────────────────────
  const NameScreen = () => (
    <QuestionShell step={0} totalSteps={TOTAL} question={t("simpleApply.qName")} help={t("pro.nameHelp")}
      onBack={() => setLocation("/start")} backLabel={t("simpleApply.changeType")} onNext={() => save({ fullName }, 1)} nextDisabled={!fullName.trim()} loading={saving}>
      <MicField value={fullName} onChange={setFullName} placeholder={t("pro.namePh")} autoFocus />
    </QuestionShell>
  );

  // ── 1 contact ──────────────────────────────────────────────────────
  const ContactScreen = () => (
    <QuestionShell step={1} totalSteps={TOTAL} question={t("simpleApply.qContact")} help={t("pro.contactHelp")}
      onBack={() => go(0)} onNext={() => save({ phone, ...(email.trim() ? { email: email.trim() } : {}), location: homeLocation || null }, 2)}
      nextDisabled={phone.replace(/\D/g, "").length < 10} loading={saving}>
      <label className={labelCls}>{t("simpleApply.labelPhone")}</label>
      <input type="tel" inputMode="numeric" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder={t("simpleApply.phPhone")} className={inputCls} />
      <label className={`${labelCls} mt-5`}>{t("pro.email")}</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder={t("pro.emailPh")} className={inputCls} />
      <label className={`${labelCls} mt-5`}>{t("simpleApply.labelTown")}</label>
      <MicField value={homeLocation} onChange={setHomeLocation} placeholder={t("pro.townPh")} />
    </QuestionShell>
  );

  // ── 2 education level (branch) ─────────────────────────────────────
  const EduLevelScreen = () => (
    <QuestionShell step={2} totalSteps={TOTAL} question={t("pro.eduLevelQ")} help={t("pro.eduLevelHelp")}
      onBack={() => go(1)} onNext={() => go(eduLevel === "degree" ? 3 : eduLevel === "diploma" ? 4 : 5)} nextDisabled={!eduLevel}>
      <div className="grid grid-cols-1 gap-3">
        {PRO_EDU_LEVELS.map((lvl) => {
          const sel = eduLevel === lvl.key; const Icon = lvl.icon;
          return (
            <button key={lvl.key} type="button" className={cardCls(sel)} onClick={() => { setEduLevel(lvl.key); if (lvl.key !== "degree") setDegreeType(null); }}>
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${sel ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md" : "bg-violet-50 text-violet-600"}`}><Icon className="w-6 h-6" /></span>
              <span className="min-w-0"><span className="block text-base font-bold text-slate-900 leading-tight">{t(`choices.proEdu.${lvl.key}.label`)}</span><span className="block text-xs text-slate-500 mt-0.5">{t(`choices.proEdu.${lvl.key}.sub`)}</span></span>
              {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );

  // ── 3 degree type ──────────────────────────────────────────────────
  const DegreeTypeScreen = () => (
    <QuestionShell step={3} totalSteps={TOTAL} question={t("pro.degreeQ")} help={t("pro.degreeHelp")} onBack={() => go(2)} onNext={() => go(4)} nextDisabled={!degreeType}>
      <div className="grid grid-cols-1 gap-3">
        {DEGREE_TYPES.map((d) => {
          const sel = degreeType === d.key;
          return (
            <button key={d.key} type="button" className={cardCls(sel)} onClick={() => setDegreeType(d.key)}>
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-bold ${sel ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md" : "bg-violet-50 text-violet-600"}`}>{t(`choices.degree.${d.key}.label`)[0]}</span>
              <span className="min-w-0"><span className="block text-base font-bold text-slate-900 leading-tight">{t(`choices.degree.${d.key}.label`)}</span><span className="block text-xs text-slate-500 mt-0.5">{t(`choices.degree.${d.key}.sub`)}</span></span>
              {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );

  // ── 4 field ─────────────────────────────────────────────────────────
  const FieldScreen = () => (
    <QuestionShell step={4} totalSteps={TOTAL} question={t("pro.fieldQ")} help={t("pro.fieldHelp")}
      onBack={() => go(eduLevel === "degree" ? 3 : 2)} onNext={() => go(5)} nextDisabled={!fieldKey || (fieldKey === "other" && !fieldCustom.trim())}>
      <div className="grid grid-cols-2 gap-3">
        {PRO_FIELDS.map((f) => {
          const sel = fieldKey === f.key; const Icon = f.icon;
          return (
            <button key={f.key} type="button" className={cardCls(sel)} onClick={() => setFieldKey(f.key)}>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${sel ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md" : "bg-violet-50 text-violet-600"}`}><Icon className="w-5 h-5" /></span>
              <span className="block text-sm font-bold text-slate-900 leading-tight">{t(`choices.field.${f.key}`)}</span>
              {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
      {fieldKey === "other" && (
        <div className="mt-4"><label className={labelCls}>{t("pro.fieldCustomLabel")}</label><MicField value={fieldCustom} onChange={setFieldCustom} placeholder={t("pro.fieldCustomPh")} autoFocus /></div>
      )}
    </QuestionShell>
  );

  // ── 5 institution + year (writes the education row) ─────────────────
  const subjectLabel = () => (fieldKey === "other" ? fieldCustom.trim() : PRO_FIELDS.find((f) => f.key === fieldKey)?.label ?? "");
  const buildEduRow = () => {
    if (eduLevel === "senior") return { type: "school", degree: "12th", institution: institution.trim() || "—", board: university.trim() || null, year: eduYear ? Number(eduYear) : null, percentage: eduMarks ? eduMarks : null, isPassed: true };
    if (eduLevel === "diploma") return { type: "diploma", degree: "Diploma", subject: subjectLabel() || null, institution: institution.trim() || "—", university: university.trim() || null, year: eduYear ? Number(eduYear) : null, percentage: eduMarks ? eduMarks : null, isPassed: true };
    const dt = DEGREE_TYPES.find((d) => d.key === degreeType)!;
    return { type: "university", degree: dt.degreeLabel, subject: subjectLabel() || null, institution: institution.trim() || "—", university: university.trim() || null, year: eduYear ? Number(eduYear) : null, percentage: eduMarks ? eduMarks : null, isPassed: true };
  };
  const qualLevelFor = () => (eduLevel === "degree" ? DEGREE_TYPES.find((d) => d.key === degreeType)!.qualificationLevel : PRO_EDU_LEVELS.find((l) => l.key === eduLevel)!.qualificationLevel);
  const saveEducation = async (addAnother: boolean) => {
    setSaving(true);
    try {
      const order = ["school", "diploma", "bachelor", "master", "doctorate"];
      const current = profileRes?.data?.qualificationLevel;
      const mine = qualLevelFor();
      if (!current || order.indexOf(mine) > order.indexOf(current)) {
        await patchProfile({ qualificationLevel: mine });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      }
      const row = buildEduRow();
      if (eduRowId) await postJson(`/api/v1/candidates/education/${eduRowId}`, row, "PUT");
      else { const created = await postJson("/api/v1/candidates/education", row); if (!addAnother) setEduRowId(created?.data?.id ?? null); }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] });
      if (addAnother) {
        setEduLevel(null); setDegreeType(null); setFieldKey(null); setFieldCustom(""); setInstitution(""); setUniversity(""); setEduYear(""); setEduMarks(""); setEduRowId(null);
        go(2);
      } else go(6);
    } catch (e: any) { toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const InstitutionScreen = () => {
    const isSchool = eduLevel === "senior";
    return (
      <QuestionShell step={5} totalSteps={TOTAL} question={isSchool ? t("pro.instQSchool") : t("pro.instQ")} help={t("pro.instHelp")}
        onBack={() => go(isSchool ? 2 : 4)} onNext={() => saveEducation(false)} nextDisabled={!institution.trim()} loading={saving}>
        <label className={labelCls}>{isSchool ? t("pro.schoolNameLabel") : t("pro.collegeLabel")}</label>
        <MicField value={institution} onChange={setInstitution} placeholder={isSchool ? t("pro.schoolPh") : t("pro.collegePh")} autoFocus />
        <label className={`${labelCls} mt-5`}>{isSchool ? t("pro.boardLabel") : t("pro.universityLabel")}</label>
        <MicField value={university} onChange={setUniversity} placeholder={isSchool ? t("pro.boardPh") : t("pro.universityPh")} />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div><label className={labelCls}>{t("pro.yearPassed")}</label><input inputMode="numeric" value={eduYear} maxLength={4} onChange={(e) => setEduYear(e.target.value.replace(/\D/g, ""))} placeholder={t("pro.yearPh")} className={inputCls} /></div>
          <div><label className={labelCls}>{t("pro.marks")}</label><input inputMode="decimal" value={eduMarks} maxLength={5} onChange={(e) => setEduMarks(e.target.value.replace(/[^\d.]/g, ""))} placeholder={t("pro.marksPh")} className={inputCls} /></div>
        </div>
        {qualRows.length > 0 && <p className="mt-4 text-xs text-slate-500">{t("pro.alreadyAdded", { list: qualRows.map((r) => r.degree + (r.subject ? ` — ${r.subject}` : "")).join(", ") })}</p>}
        <p className="text-center mt-5">
          <button type="button" disabled={!institution.trim() || saving} onClick={() => saveEducation(true)} className="text-sm text-violet-600 hover:text-violet-700 underline underline-offset-4 py-3 px-2 disabled:opacity-40">{t("pro.addAnotherQual")}</button>
        </p>
      </QuestionShell>
    );
  };

  // ── 6 experience ────────────────────────────────────────────────────
  const addExperience = async () => {
    try {
      await postJson("/api/v1/candidates/experience", { role: expRole.trim(), company: expCompany.trim(), years: expYears, country: expCountry.trim() || null });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/experience"] });
      setExpRole(""); setExpCompany(""); setExpYears(1); setExpCountry("India"); setExpOpen(false);
    } catch (e: any) { toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" }); }
  };
  const removeExperience = async (id: string) => { await fetch(`/api/v1/candidates/experience/${id}`, { method: "DELETE", credentials: "include" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/experience"] }); };
  const ExperienceScreen = () => {
    const totalYears = expRows.reduce((s, r) => s + (r.years || 0), 0);
    return (
      <QuestionShell step={6} totalSteps={TOTAL} question={t("pro.expQ")} help={t("pro.expHelp")}
        onBack={() => go(5)} onNext={() => save({ experienceMonths: totalYears * 12, experience: totalYears }, 7)} loading={saving}>
        {expRows.length > 0 && (
          <div className="space-y-2.5 mb-4">
            {expRows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Briefcase className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900 leading-tight truncate">{r.role}</span><span className="block text-xs text-slate-500 truncate">{r.company}{r.country ? ` · ${r.country}` : ""} · {r.years} {r.years === 1 ? t("pro.yrOne") : t("pro.yrMany")}</span></span>
                <button onClick={() => removeExperience(r.id)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        {!expOpen ? (
          <button type="button" onClick={() => setExpOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 py-5 text-base font-semibold text-blue-700 hover:bg-blue-50 active:scale-[0.99] transition-all"><Plus className="w-5 h-5" /> {t("pro.addJob")}</button>
        ) : (
          <div className="rounded-2xl border border-blue-300 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 p-4 space-y-4 shadow-md">
            <div><label className={labelCls}>{t("pro.roleLabel")}</label><MicField value={expRole} onChange={setExpRole} placeholder={t("pro.rolePh")} autoFocus /></div>
            <div><label className={labelCls}>{t("pro.companyLabel")}</label><MicField value={expCompany} onChange={setExpCompany} placeholder={t("pro.companyPh")} /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className={labelCls}>{t("pro.yearsThere")}</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setExpYears((y) => Math.max(0, y - 1))} className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:scale-95"><Minus className="w-5 h-5" /></button>
                  <span className="flex-1 text-center text-2xl font-bold text-slate-900 tabular-nums">{expYears}</span>
                  <button type="button" onClick={() => setExpYears((y) => Math.min(40, y + 1))} className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:scale-95"><Plus className="w-5 h-5" /></button>
                </div>
              </div>
              <div><label className={labelCls}>{t("pro.country")}</label><input value={expCountry} onChange={(e) => setExpCountry(e.target.value)} maxLength={60} placeholder={t("pro.countryPh")} className={inputCls} /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={addExperience} disabled={!expRole.trim() || !expCompany.trim()} className="flex-1 h-12 rounded-xl bg-blue-600 text-white text-base font-semibold disabled:opacity-40 active:scale-[0.98] transition-all">{t("pro.addThisJob")}</button>
              <button type="button" onClick={() => setExpOpen(false)} className="h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">{t("pro.cancel")}</button>
            </div>
          </div>
        )}
        {totalYears > 0 && <p className="mt-4 text-center text-sm text-slate-500">{t("pro.total")} <span className="font-semibold text-slate-700">{t("simpleApply.reviewYears", { y: totalYears })}</span></p>}
      </QuestionShell>
    );
  };

  // ── 7 certifications ────────────────────────────────────────────────
  const addCert = async (name: string, issuer?: string, year?: string) => {
    try {
      await postJson("/api/v1/candidates/education", { type: "certification", degree: name.trim(), institution: (issuer || "").trim() || "—", year: year ? Number(year) : null, isPassed: true });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] });
      setCertName(""); setCertIssuer(""); setCertYear(""); setCertOpen(false);
    } catch (e: any) { toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" }); }
  };
  const removeCert = async (id: string) => { await fetch(`/api/v1/candidates/education/${id}`, { method: "DELETE", credentials: "include" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] }); };
  const CertScreen = () => {
    const suggestions = (CERT_SUGGESTIONS[fieldKey ?? ""] || []).filter((s) => !certRows.some((r) => r.degree.toLowerCase() === s.toLowerCase()));
    return (
      <QuestionShell step={7} totalSteps={TOTAL} question={t("pro.certQ")} help={t("pro.certHelp")}
        onBack={() => go(6)} onNext={() => go(8)} onSkip={() => go(8)}>
        {certRows.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {certRows.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-2 pl-4 pr-2 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
                <Award className="w-4 h-4 text-amber-500" /> {r.degree}
                {r.institution && r.institution !== "—" && <span className="text-amber-500 font-normal">· {r.institution}</span>}
                <button onClick={() => removeCert(r.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-amber-100 hover:text-red-500"><X className="w-4 h-4" /></button>
              </span>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <>
            <p className="text-sm font-semibold text-slate-600 mb-2">{t("pro.certCommon")}</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {suggestions.map((s) => (<button key={s} type="button" onClick={() => addCert(s)} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-amber-400 hover:bg-amber-50 active:scale-95 transition-all">+ {s}</button>))}
            </div>
          </>
        )}
        {!certOpen ? (
          <button type="button" onClick={() => setCertOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 py-5 text-base font-semibold text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition-all"><Plus className="w-5 h-5" /> {t("pro.certAddDifferent")}</button>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50/60 to-orange-50/30 p-4 space-y-4 shadow-md">
            <div><label className={labelCls}>{t("pro.certNameLabel")}</label><MicField value={certName} onChange={setCertName} placeholder={t("pro.certNamePh")} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>{t("pro.certIssuer")}</label><input value={certIssuer} onChange={(e) => setCertIssuer(e.target.value)} maxLength={100} placeholder={t("pro.certIssuerPh")} className={inputCls} /></div>
              <div><label className={labelCls}>{t("pro.certYear")}</label><input inputMode="numeric" value={certYear} maxLength={4} onChange={(e) => setCertYear(e.target.value.replace(/\D/g, ""))} placeholder={t("pro.certYearPh")} className={inputCls} /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => addCert(certName, certIssuer, certYear)} disabled={!certName.trim()} className="flex-1 h-12 rounded-xl bg-amber-600 text-white text-base font-semibold disabled:opacity-40 active:scale-[0.98] transition-all">{t("pro.addCert")}</button>
              <button type="button" onClick={() => setCertOpen(false)} className="h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">{t("pro.cancel")}</button>
            </div>
          </div>
        )}
      </QuestionShell>
    );
  };

  // ── 8 skills ────────────────────────────────────────────────────────
  const SkillsScreen = () => {
    const field = PRO_FIELDS.find((f) => f.key === fieldKey);
    const primary = SKILL_CATEGORIES.find((c) => c.category === field?.skillCategory)?.skills ?? [];
    const rest = SKILL_CATEGORIES.filter((c) => c.category !== field?.skillCategory).flatMap((c) => c.skills);
    const noField = primary.length === 0; // resumed without a field, or a custom field — show all
    const toggle = (s: string) => setSkills((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s)
      : cur.length >= FIELD_LIMITS.skillsMax ? (toast({ title: t("pro.skillMax", { max: FIELD_LIMITS.skillsMax }) }), cur)
      : [...cur, s]);
    const addCustom = () => {
      const s = customSkill.trim();
      if (!s) return;
      if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) { toast({ title: t("pro.skillDupe") }); setCustomSkill(""); return; }
      if (skills.length >= FIELD_LIMITS.skillsMax) { toast({ title: t("pro.skillMax", { max: FIELD_LIMITS.skillsMax }) }); return; }
      setSkills((c) => [...c, s]); setCustomSkill("");
    };
    const Chip = ({ s }: { s: string }) => (<button type="button" onClick={() => toggle(s)} className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition active:scale-95 ${skills.includes(s) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"}`}>{s}</button>);
    return (
      <QuestionShell step={8} totalSteps={TOTAL} question={t("pro.skillsQ")} help={t("pro.skillsHelp")}
        onBack={() => go(7)} onNext={() => save({ skills, ...(field ? { preferredCategories: [field.category] } : {}) }, 9)} nextDisabled={skills.length === 0} loading={saving}>
        {/* Your skills — every selected skill (predefined OR custom) shown here, removable. */}
        {skills.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">{t("pro.skillsSelectedTitle")}</p>
              <span className="text-xs text-slate-400 tabular-nums">{t("pro.skillCount", { n: skills.length, max: FIELD_LIMITS.skillsMax })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 pl-4 pr-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white">
                  {s}
                  <button type="button" onClick={() => setSkills((c) => c.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-500"><X className="w-4 h-4" /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggested chips (full list if we don't know the field) */}
        <p className="text-sm font-semibold text-slate-700 mb-2">{t("pro.skillsSuggested")}</p>
        <div className="flex flex-wrap gap-2">{(noField ? rest : primary).map((s) => <Chip key={s} s={s} />)}</div>
        {!noField && (!moreSkills ? (
          <button type="button" onClick={() => setMoreSkills(true)} className="mt-4 text-sm text-blue-600 hover:text-blue-700 underline underline-offset-4 py-2">{t("pro.showMoreSkills")}</button>
        ) : (
          <div className="flex flex-wrap gap-2 mt-4 max-h-64 overflow-y-auto pr-1">{rest.map((s) => <Chip key={s} s={s} />)}</div>
        ))}

        {/* Add your own */}
        <p className="text-sm font-semibold text-slate-700 mt-5 mb-2">{t("pro.skillsAddOwn")}</p>
        <div className="flex gap-2">
          <div className="flex-1"><MicField value={customSkill} onChange={setCustomSkill} placeholder={t("pro.skillPh")} /></div>
          <button type="button" onClick={addCustom} disabled={!customSkill.trim()} className="h-14 px-5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-40 active:scale-95">{t("pro.add")}</button>
        </div>
        {skills.length === 0 && <p className="mt-3 text-xs text-slate-400">{t("pro.skillsEmptyHint")}</p>}
      </QuestionShell>
    );
  };

  // ── 9 languages ─────────────────────────────────────────────────────
  const LanguageScreen = () => {
    const addLang = async (language: string, proficiency: string) => { await postJson("/api/v1/candidates/languages", { language, proficiency }); queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] }); setLangExpanding(null); };
    const removeLang = async (id: string) => { await fetch(`/api/v1/candidates/languages/${id}`, { method: "DELETE", credentials: "include" }); queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] }); };
    const available = QUICK_LANGUAGES.filter((l) => !languages.some((s: any) => s.language.toLowerCase() === l.toLowerCase()));
    return (
      <QuestionShell step={9} totalSteps={TOTAL} question={t("simpleApply.qLanguage")} help={t("simpleApply.helpLanguage")}
        onBack={() => go(8)} onNext={() => go(10)} nextDisabled={languages.length === 0}>
        {languages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {languages.map((l: any) => (
              <span key={l.id} className="inline-flex items-center gap-2 pl-4 pr-2 py-2.5 rounded-xl text-sm font-semibold bg-sky-100 text-sky-800 border border-sky-200/80">
                {tx(`choices.langs.${l.language}`, l.language)}<span className="text-sky-500 font-normal">· {tx(`choices.prof.${l.proficiency}`, l.proficiency)}</span>
                <button onClick={() => removeLang(l.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-sky-200 hover:text-red-500"><X className="w-4 h-4" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="space-y-2.5">
          {available.map((lang) => {
            const open = langExpanding === lang;
            return (
              <div key={lang} className={`rounded-2xl border transition-all ${open ? "border-sky-300 bg-gradient-to-br from-sky-50/80 to-cyan-50/40 shadow-md" : "border-slate-200 bg-white"}`}>
                <button type="button" onClick={() => setLangExpanding(open ? null : lang)} className="w-full flex items-center justify-between px-5 py-4 min-h-[3.5rem]">
                  <span className="text-base font-semibold text-slate-800">{tx(`choices.langs.${lang}`, lang)}</span>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${open ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-400"}`}><Plus className={`w-4 h-4 transition-transform ${open ? "rotate-45" : ""}`} /></span>
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="grid grid-cols-3 gap-2 p-4 pt-0">
                        {SIMPLE_LEVELS.map((lv) => (<button key={lv.v} type="button" onClick={() => addLang(lang, lv.v)} className="rounded-xl border border-sky-200/80 bg-white py-3.5 min-h-[3.5rem] text-sm font-semibold text-slate-700 hover:bg-sky-600 hover:text-white hover:border-sky-600 active:scale-95 transition-all">{t(`choices.prof.${lv.v}`)}</button>))}
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

  // ── 10 countries ────────────────────────────────────────────────────
  const CountryScreen = () => {
    const toggle = (name: string) => setCountries((c) => c.includes(name) ? c.filter((x) => x !== name) : [...c, name]);
    return (
      <QuestionShell step={10} totalSteps={TOTAL} question={t("simpleApply.qCountry")} help={t("simpleApply.helpCountry")}
        onBack={() => go(9)} onNext={() => save({ preferredCountries: countries }, countries.some((c) => IELTS_COUNTRIES.has(c)) ? 11 : 12)} nextDisabled={countries.length === 0} loading={saving}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRO_COUNTRIES.map((c) => {
            const sel = countries.includes(c.name);
            return (
              <button key={c.name} type="button" onClick={() => toggle(c.name)} className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 min-h-[6rem] transition-all active:scale-[0.97] ${sel ? "border-emerald-400 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 ring-2 ring-emerald-300 shadow-lg" : "border-slate-200 bg-white hover:border-emerald-300"}`}>
                {sel && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>}
                <span className="text-3xl">{c.flag}</span><span className="text-sm font-bold text-slate-900">{tx(`choices.countries.${c.name}`, c.name)}</span>
              </button>
            );
          })}
        </div>
      </QuestionShell>
    );
  };

  // ── 11 IELTS (conditional) ─────────────────────────────────────────
  const IeltsScreen = () => (
    <QuestionShell step={11} totalSteps={TOTAL} question={t("pro.ieltsQ")} help={t("pro.ieltsHelp")}
      onBack={() => go(10)} onNext={() => save(ieltsBand ? { ieltsBand: Number(ieltsBand) } : {}, 12)} onSkip={() => go(12)} loading={saving}>
      <div className="grid grid-cols-4 gap-2.5">
        {IELTS_BANDS.map((b) => (<button key={b} type="button" onClick={() => setIeltsBand(ieltsBand === b ? null : b)} className={`rounded-xl border py-4 min-h-[3.5rem] text-lg font-bold tabular-nums transition active:scale-95 ${ieltsBand === b ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"}`}>{b}</button>))}
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">{t("pro.ieltsNote")}</p>
    </QuestionShell>
  );

  // ── 12 passport ─────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const PassportScreen = () => (
    <QuestionShell step={12} totalSteps={TOTAL} question={t("pro.passportQ")} help={t("pro.passportHelp")}
      onBack={() => go(hasIeltsCountry ? 11 : 10)} onNext={() => save({ passportNumber: passportNumber.trim() || null, passportExpiry: passportExpiry || null }, 13)} onSkip={() => go(13)}
      nextDisabled={!!passportNumber.trim() && !!passportExpiry && passportExpiry < today} loading={saving}>
      <label className={labelCls}>{t("pro.passportNumber")}</label>
      <input value={passportNumber} maxLength={20} onChange={(e) => setPassportNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder={t("pro.passportPh")} className={`${inputCls} tracking-widest uppercase`} />
      <label className={`${labelCls} mt-5`}>{t("pro.expiryDate")}</label>
      <input type="date" value={passportExpiry} min={today} onChange={(e) => setPassportExpiry(e.target.value)} className={inputCls} />
      {!!passportExpiry && passportExpiry < today && <p className="mt-2 text-sm text-rose-600">{t("pro.expiryError")}</p>}
    </QuestionShell>
  );

  // ── 13 review ───────────────────────────────────────────────────────
  const ReviewScreen = () => {
    const totalYears = expRows.reduce((s: number, r: any) => s + (r.years || 0), 0);
    const eduSummary = qualRows.map((r) => [r.degree, r.subject].filter(Boolean).join(" — ")).join("; ");
    const Row = ({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) => (
      <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
        <div className="min-w-0"><p className="text-xs text-slate-400">{label}</p><p className="text-base font-semibold text-slate-800 truncate">{value || "—"}</p></div>
        <button onClick={onEdit} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
      </div>
    );
    const finish = async () => {
      setSaving(true);
      try { await patchProfile({ profileComplete: true }); toast({ title: t("simpleApply.savedToast") }); setLocation("/"); }
      catch (e: any) { toast({ title: e.message || t("simpleApply.couldNotSave"), variant: "destructive" }); setSaving(false); }
    };
    return (
      <QuestionShell step={13} totalSteps={TOTAL} question={t("simpleApply.qReview")} help={t("simpleApply.helpReview")}
        onBack={() => go(12)} onNext={finish} nextLabel={t("simpleApply.saveProfile")} loading={saving}>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Row label={t("simpleApply.rowName")} value={fullName} onEdit={() => go(0)} />
          <Row label={t("pro.rowContact")} value={[phone, email].filter(Boolean).join(" · ")} onEdit={() => go(1)} />
          <Row label={t("simpleApply.rowEducation")} value={eduSummary} onEdit={() => go(2)} />
          <Row label={t("simpleApply.rowExperience")} value={expRows.length ? t("pro.jobsSummary", { count: expRows.length, years: totalYears }) : t("pro.fresher")} onEdit={() => go(6)} />
          <Row label={t("pro.rowCerts")} value={certRows.map((r: any) => r.degree).join(", ")} onEdit={() => go(7)} />
          <Row label={t("pro.rowSkills")} value={skills.join(", ")} onEdit={() => go(8)} />
          <Row label={t("simpleApply.rowLanguages")} value={languages.map((l: any) => tx(`choices.langs.${l.language}`, l.language)).join(", ")} onEdit={() => go(9)} />
          <Row label={t("simpleApply.rowCountries")} value={countries.map((c) => tx(`choices.countries.${c}`, c)).join(", ")} onEdit={() => go(10)} />
          {hasIeltsCountry && <Row label={t("pro.rowIelts")} value={ieltsBand || t("pro.notTakenYet")} onEdit={() => go(11)} />}
          <Row label={t("pro.rowPassport")} value={passportNumber ? t("pro.passportSummary", { number: passportNumber, expiry: passportExpiry || "—" }) : t("pro.notYet")} onEdit={() => go(12)} />
        </div>
        <div className="mt-4 rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-emerald-800">{t("pro.noFeeNote")}</p>
        </div>
      </QuestionShell>
    );
  };

  const screens = [NameScreen, ContactScreen, EduLevelScreen, DegreeTypeScreen, FieldScreen, InstitutionScreen, ExperienceScreen, CertScreen, SkillsScreen, LanguageScreen, CountryScreen, IeltsScreen, PassportScreen, ReviewScreen];
  return <>{screens[step]()}</>;
}
