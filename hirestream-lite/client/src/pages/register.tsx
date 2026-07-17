/**
 * UAT-05 registration — ONE flow, four pages.
 *
 * Replaces four parallel flows: /start (tier chooser), /apply (10 screens,
 * blue-collar), /apply/pro (14 screens, professional), and /profile's wizard as
 * an onboarding path. HPSEDC item 3: "minimise multiple steps and consolidate
 * related information into a single section wherever possible."
 *
 * ── Why the tiers had to go ────────────────────────────────────────────────
 * Two flows writing one schema is where the defects bred. /apply never asked
 * for email, yet email is one of the nine completion checkpoints — so a
 * blue-collar candidate who finished Standard PERFECTLY was mathematically
 * incapable of reaching 100%. Only /apply/pro ever set profileComplete. The two
 * disagreed on which languages exist. Every change had to be made twice, and
 * the second is where it got forgotten. One flow that adapts to the selected
 * profession does everything the tiers did and cannot drift out of sync with
 * itself.
 *
 * ── The 20,000 : 500 rule, which decides what is on these pages ────────────
 * HPSEDC: "we get 20,000 applications and only 500 are selected. Why collect
 * 20,000 applicants' documents when they are not needed until the candidate is
 * selected?" So: ZERO uploads here. But the test is COST, not field count — an
 * Aadhaar number is free (it is in their pocket); a PCC costs Rs 500 and three
 * weeks and EXPIRES before selection. Page 1 asks for everything printed on the
 * documents in their hand; certificates wait for shortlist; PCC and medical
 * wait for selection.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HP_DISTRICTS, INDIAN_STATES } from "@/lib/reference-data";
import { RegisterShell, FieldGrid, Wide, Section } from "./register/RegisterShell";
import { ProfessionAddonBlock, isAddonComplete, type AddonData } from "./register/profession-blocks";
import { ReviewPage } from "./register/ReviewPage";
import { Check, Plus, Minus, Info, Briefcase } from "lucide-react";

const TOTAL = 4;
const today = () => new Date().toISOString().slice(0, 10);

export interface Profession {
  professionKey: string; label: string; labelHi?: string | null;
  qualifications?: string[] | null; hasAddonBlock?: boolean | null;
  skillsEnabled?: boolean | null; skillsOptions?: string[] | null;
  candidateNote?: string | null; candidateNoteHi?: string | null;
}

/** One selected trade, as page 3 edits it. Mirrors candidate_professions. */
export interface PickedProfession {
  professionKey: string;
  otherLabel?: string;
  experienceMonths: number;
  specificSkills: string[];
  lastEmployerName?: string;
  lastEmployerCountry?: string;
  addonData: AddonData;
}

const LANGS = ["Hindi", "English", "Punjabi", "Nepali", "Urdu", "Arabic", "Malayalam"];
const LANG_LEVELS = ["elementary", "intermediate", "professional", "native"] as const;
const EDU_LEVELS = ["none", "class5", "class8", "class10", "class12", "iti", "diploma", "degree"];
const BOARDS = ["HPBOSE", "CBSE", "ICSE", "NIOS", "Other State Board"];

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Page 1: about you ──────────────────────────────────────────────
  const [passportNumber, setPassportNumber] = useState("");
  const [noPassportYet, setNoPassportYet] = useState(false);
  const [passportIssueDate, setPassportIssueDate] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [passportPlaceOfIssue, setPassportPlaceOfIssue] = useState("");
  const [ecrStatus, setEcrStatus] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [disabilityStatus, setDisabilityStatus] = useState("");
  const [disabilityType, setDisabilityType] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [homeTown, setHomeTown] = useState("");
  const [pAddr1, setPAddr1] = useState(""); const [pAddr2, setPAddr2] = useState("");
  const [pDistrict, setPDistrict] = useState(""); const [pState, setPState] = useState("Himachal Pradesh");
  const [pPin, setPPin] = useState("");
  const [corrSame, setCorrSame] = useState(true);
  const [cAddr1, setCAddr1] = useState(""); const [cAddr2, setCAddr2] = useState("");
  const [cDistrict, setCDistrict] = useState(""); const [cState, setCState] = useState("Himachal Pradesh");
  const [cPin, setCPin] = useState("");

  // ── Page 2: skills ─────────────────────────────────────────────────
  const [picked, setPicked] = useState<PickedProfession[]>([]);
  const [langs, setLangs] = useState<{ language: string; proficiency: string }[]>([]);
  const [otherLangText, setOtherLangText] = useState("");

  // ── Page 3: qualifications ─────────────────────────────────────────
  const [eduLevel, setEduLevel] = useState("");
  const [eduBoard, setEduBoard] = useState("");
  const [eduInstitution, setEduInstitution] = useState("");
  const [eduYear, setEduYear] = useState<number | "">("");
  const [eduPassed, setEduPassed] = useState(true);

  const { data: profileRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const { data: profRes } = useQuery<any>({ queryKey: ["/api/v1/professions"] });
  const { data: minePropRes } = useQuery<any>({ queryKey: ["/api/v1/professions/mine"] });
  const { data: langRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/languages"] });

  const professions: Profession[] = profRes?.data?.professions || [];
  const maxProfessions: number = profRes?.data?.maxProfessions ?? 3;
  const profByKey = useMemo(() => Object.fromEntries(professions.map((p) => [p.professionKey, p])), [professions]);
  const isHi = i18n.language?.startsWith("hi");
  const labelOf = (p?: Profession) => (isHi && p?.labelHi) ? p.labelHi : (p?.label ?? "");
  const noteOf = (p?: Profession) => (isHi && p?.candidateNoteHi) ? p.candidateNoteHi : (p?.candidateNote ?? "");

  // audit 2026-07-06 (C2): wait for auth to settle before redirecting, or a hard
  // refresh mid-flow ejects a logged-in candidate to /auth.
  useEffect(() => { if (!authLoading && !user) setLocation("/auth"); }, [user, authLoading, setLocation]);

  // Prefill once. Ref-guarded: /apply/pro's prefill was NOT, so every profile
  // refetch clobbered whatever the candidate was mid-way through typing.
  const prefilled = useRef(false);
  useEffect(() => {
    const p = profileRes?.data;
    if (!p || prefilled.current) return;
    prefilled.current = true;
    setPassportNumber(p.passportNumber || ""); setNoPassportYet(!!p.noPassportYet);
    setPassportIssueDate(p.passportIssueDate || ""); setPassportExpiry(p.passportExpiry || "");
    setPassportPlaceOfIssue(p.passportPlaceOfIssue || ""); setEcrStatus(p.ecrStatus || "");
    setAadhaarNumber(p.aadhaarNumber || ""); setFullName(p.fullName && p.fullName !== "Unknown" ? p.fullName : "");
    setDateOfBirth(p.dateOfBirth || ""); setSex(p.sex || "");
    setFatherName(p.fatherName || ""); setMotherName(p.motherName || "");
    setDisabilityStatus(p.disabilityStatus || ""); setDisabilityType(p.disabilityType || "");
    setPhone(p.phone || ""); setEmail(p.email || "");
    if (p.whatsappNumber) { setWhatsappNumber(p.whatsappNumber); setWhatsappSame(p.whatsappNumber === p.phone); }
    setHomeTown(p.homeTown || "");
    setPAddr1(p.permanentAddressLine1 || ""); setPAddr2(p.permanentAddressLine2 || "");
    setPDistrict(p.permanentDistrict || ""); setPState(p.permanentState || "Himachal Pradesh");
    setPPin(p.permanentPinCode || "");
    setCAddr1(p.addressLine1 || ""); setCAddr2(p.addressLine2 || "");
    setCDistrict(p.district || ""); setCState(p.state || "Himachal Pradesh"); setCPin(p.pinCode || "");
    if (p.addressLine1 && p.addressLine1 !== p.permanentAddressLine1) setCorrSame(false);
    setEduLevel(p.qualificationLevel || "");
  }, [profileRes]);

  const prefilledProfs = useRef(false);
  useEffect(() => {
    const rows = minePropRes?.data;
    if (!rows || prefilledProfs.current) return;
    prefilledProfs.current = true;
    if (rows.length > 0) {
      setPicked(rows.map((r: any) => ({
        professionKey: r.professionKey, otherLabel: r.otherLabel || undefined,
        experienceMonths: r.experienceMonths ?? 0, specificSkills: r.specificSkills || [],
        lastEmployerName: r.lastEmployerName || undefined, lastEmployerCountry: r.lastEmployerCountry || undefined,
        addonData: r.addonData || {},
      })));
    }
  }, [minePropRes]);

  const prefilledLangs = useRef(false);
  useEffect(() => {
    const rows = langRes?.data;
    if (!rows || prefilledLangs.current) return;
    prefilledLangs.current = true;
    setLangs(rows.map((r: any) => ({ language: r.language, proficiency: r.proficiency })));
  }, [langRes]);

  // ── Validation ─────────────────────────────────────────────────────
  // Client-side, and only gates the Next button — the server is the authority.
  const digits = (s: string) => s.replace(/\D/g, "");
  const passportOk = noPassportYet || (passportNumber.trim().length >= 6 && !!passportExpiry);
  const addrOk = pAddr1.trim() && pDistrict && pState && pPin.length === 6;
  const corrOk = corrSame || (cAddr1.trim() && cDistrict && cState && cPin.length === 6);
  const p1Ok = passportOk && fullName.trim().length >= 2 && dateOfBirth && sex
    && fatherName.trim() && motherName.trim() && disabilityStatus
    && (disabilityStatus !== "yes" || disabilityType.trim())
    && digits(phone).length >= 10 && (whatsappSame || digits(whatsappNumber).length >= 10)
    && /\S+@\S+\.\S+/.test(email) && homeTown.trim() && addrOk && corrOk;
  const p2Ok = picked.length > 0 && picked.every((x) => x.professionKey !== "other" || x.otherLabel?.trim()) && langs.length > 0;
  const p3Ok = eduLevel && picked.every((x) => isAddonComplete(x.professionKey, x.addonData) && x.experienceMonths >= 0);

  // ── Saves ──────────────────────────────────────────────────────────
  async function savePage1() {
    await apiRequest("PATCH", "/api/v1/candidates/profile", {
      passportNumber: noPassportYet ? null : passportNumber.trim().toUpperCase() || null,
      noPassportYet,
      passportIssueDate: noPassportYet ? null : passportIssueDate || null,
      passportExpiry: noPassportYet ? null : passportExpiry || null,
      passportPlaceOfIssue: noPassportYet ? null : passportPlaceOfIssue.trim() || null,
      ecrStatus: ecrStatus || null,
      aadhaarNumber: aadhaarNumber ? digits(aadhaarNumber) : null,
      fullName: fullName.trim(), dateOfBirth, sex,
      fatherName: fatherName.trim(), motherName: motherName.trim(),
      disabilityStatus, disabilityType: disabilityStatus === "yes" ? disabilityType.trim() : null,
      phone: phone.trim(),
      whatsappNumber: (whatsappSame ? phone : whatsappNumber).trim(),
      email: email.trim(), homeTown: homeTown.trim(),
      permanentAddressLine1: pAddr1.trim(), permanentAddressLine2: pAddr2.trim() || null,
      permanentDistrict: pDistrict, permanentState: pState, permanentPinCode: pPin,
      addressLine1: (corrSame ? pAddr1 : cAddr1).trim(),
      addressLine2: (corrSame ? pAddr2 : cAddr2).trim() || null,
      district: corrSame ? pDistrict : cDistrict,
      state: corrSame ? pState : cState,
      pinCode: corrSame ? pPin : cPin,
      // `location` is the legacy free-text city/state that matching + the agent
      // list still read. Kept in sync from the real columns rather than left to
      // rot — the old wizard DERIVED it from district/state fields it never
      // stored, which is how item 13 happened in the first place.
      location: `${corrSame ? pDistrict : cDistrict}, ${corrSame ? pState : cState}`,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
  }

  async function savePage2() {
    await apiRequest("PUT", "/api/v1/professions/mine", {
      professions: picked.map((x) => ({
        professionKey: x.professionKey,
        otherLabel: x.professionKey === "other" ? x.otherLabel : undefined,
        experienceMonths: x.experienceMonths, specificSkills: x.specificSkills,
        lastEmployerName: x.lastEmployerName || undefined,
        lastEmployerCountry: x.lastEmployerCountry || undefined,
        addonData: x.addonData,
      })),
    });
    // skills[] is the legacy matching surface; candidate_professions is the new
    // one. Both written until the matching engine moves over, so a profile saved
    // today still matches jobs today.
    await apiRequest("PATCH", "/api/v1/candidates/profile", {
      skills: picked.map((x) => (x.professionKey === "other" ? x.otherLabel : profByKey[x.professionKey]?.label) || x.professionKey),
    });
    const existing = (langRes?.data || []) as any[];
    for (const row of existing) await apiRequest("DELETE", `/api/v1/candidates/languages/${row.id}`).catch(() => {});
    for (const l of langs) await apiRequest("POST", "/api/v1/candidates/languages", l);
    queryClient.invalidateQueries({ queryKey: ["/api/v1/professions/mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
  }

  async function savePage3() {
    await apiRequest("PUT", "/api/v1/professions/mine", {
      professions: picked.map((x) => ({
        professionKey: x.professionKey,
        otherLabel: x.professionKey === "other" ? x.otherLabel : undefined,
        experienceMonths: x.experienceMonths, specificSkills: x.specificSkills,
        lastEmployerName: x.lastEmployerName || undefined,
        lastEmployerCountry: x.lastEmployerCountry || undefined,
        addonData: x.addonData,
      })),
    });
    const totalMonths = picked.reduce((m, x) => Math.max(m, x.experienceMonths), 0);
    await apiRequest("PATCH", "/api/v1/candidates/profile", {
      qualificationLevel: eduLevel,
      experienceMonths: totalMonths,
      experience: Math.round(totalMonths / 12),
    });
    if (eduLevel && eduLevel !== "none") {
      const row = {
        type: ["iti", "diploma"].includes(eduLevel) ? "diploma" : eduLevel === "degree" ? "university" : "school",
        degree: t(`reg.edu.${eduLevel}`, { lng: "en" }),
        institution: eduInstitution.trim() || "—",
        board: eduBoard || undefined,
        year: eduYear || undefined,
        isPassed: eduPassed,
      };
      // Update-or-insert, NOT insert-and-swallow-the-409.
      //
      // This page owns exactly one education row — "highest qualification". A
      // blind POST has two failure modes, and both are silent: re-saving the
      // same level 409s (UAT-03 item 5's duplicate guard) and the correction is
      // dropped; changing 10th -> 12th is NOT a duplicate, so it inserts a
      // SECOND row and the candidate now claims both. Find the row this page
      // created — the one whose degree is one of our level labels — and PUT it.
      const known = EDU_LEVELS.filter((k) => k !== "none").map((k) => t(`reg.edu.${k}`, { lng: "en" }));
      const existing: any[] = (await apiRequest("GET", "/api/v1/candidates/education")
        .then((r) => r.json()).then((j) => j.data).catch(() => [])) || [];
      const mine = existing.find((e: any) => known.includes(e.degree));
      if (mine) await apiRequest("PUT", `/api/v1/candidates/education/${mine.id}`, row);
      else await apiRequest("POST", "/api/v1/candidates/education", row);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/v1/professions/mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] });
  }

  async function next() {
    setSaving(true);
    try {
      if (step === 0) await savePage1();
      if (step === 1) await savePage2();
      if (step === 2) await savePage3();
      setStep((s) => Math.min(s + 1, TOTAL - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast({ title: t("reg.saveFailed"), description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function submit() {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/v1/candidates/profile", { profileComplete: true });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      toast({ title: t("reg.submitted"), description: t("reg.submittedSub") });
      setLocation("/");
    } catch (e: any) {
      toast({ title: t("reg.saveFailed"), description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const stepLabels = [t("reg.p1.tab"), t("reg.p2.tab"), t("reg.p3.tab"), t("reg.p4.tab")];
  const titles = [t("reg.p1.title"), t("reg.p2.title"), t("reg.p3.title"), t("reg.p4.title")];
  const helps = [t("reg.p1.help"), t("reg.p2.help"), t("reg.p3.help"), t("reg.p4.help")];
  const okFor = [p1Ok, p2Ok, p3Ok, true];

  return (
    <RegisterShell
      step={step} totalSteps={TOTAL} stepLabels={stepLabels}
      title={titles[step]} help={helps[step]}
      onBack={step > 0 ? () => { setStep(step - 1); window.scrollTo({ top: 0 }); } : undefined}
      onNext={step < TOTAL - 1 ? next : submit}
      nextLabel={step === TOTAL - 1 ? t("reg.submit") : undefined}
      nextDisabled={!okFor[step]} loading={saving}
    >
      {step === 0 && (
        <>
          {/* One instruction makes ~18 fields tolerable: everything on this page
              is printed on a document already in their hand. */}
          <div className="mb-7 flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-100 p-4">
            <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-900">{t("reg.p1.keepDocs")}</p>
          </div>

          <Section title={t("reg.p1.identity")} hint={t("reg.p1.identityHint")}>
            <FieldGrid>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.passportNo")} {!noPassportYet && "*"}</Label>
                <Input className="h-11 mt-1.5" maxLength={20} disabled={noPassportYet}
                  value={passportNumber} onChange={(e) => setPassportNumber(e.target.value.toUpperCase())} />
                <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                  <Checkbox checked={noPassportYet} onCheckedChange={(v) => setNoPassportYet(!!v)} />
                  <span className="text-sm text-slate-600">{t("reg.p1.noPassport")}</span>
                </label>
                {noPassportYet && <p className="text-xs text-amber-700 mt-2">{t("reg.p1.noPassportHint")}</p>}
              </div>
              {!noPassportYet && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.passportExpiry")} *</Label>
                    <Input className="h-11 mt-1.5" type="date" min={today()} value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.passportIssue")}</Label>
                    <Input className="h-11 mt-1.5" type="date" max={today()} value={passportIssueDate} onChange={(e) => setPassportIssueDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.passportPlace")}</Label>
                    <Input className="h-11 mt-1.5" maxLength={80} value={passportPlaceOfIssue} onChange={(e) => setPassportPlaceOfIssue(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.ecr")}</Label>
                    <Select value={ecrStatus} onValueChange={setEcrStatus}>
                      <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ecnr">{t("reg.p1.ecnr")}</SelectItem>
                        <SelectItem value="ecr">{t("reg.p1.ecrYes")}</SelectItem>
                        <SelectItem value="unknown">{t("reg.p1.ecrUnknown")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1.5">{t("reg.p1.ecrHint")}</p>
                  </div>
                </>
              )}
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.aadhaar")}</Label>
                <Input className="h-11 mt-1.5" inputMode="numeric" maxLength={14}
                  value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1.5">{t("reg.p1.aadhaarHint")}</p>
              </div>
            </FieldGrid>
          </Section>

          <Section title={t("reg.p1.personal")}>
            <FieldGrid>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.fullName")} *</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1.5">{t("reg.p1.fullNameHint")}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.dob")} *</Label>
                <Input className="h-11 mt-1.5" type="date" max={today()} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.gender")} *</Label>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t("reg.p1.male")}</SelectItem>
                    <SelectItem value="female">{t("reg.p1.female")}</SelectItem>
                    <SelectItem value="other">{t("common.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.father")} *</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.mother")} *</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={motherName} onChange={(e) => setMotherName(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.disability")} *</Label>
                <Select value={disabilityStatus} onValueChange={setDisabilityStatus}>
                  <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{t("common.no")}</SelectItem>
                    <SelectItem value="yes">{t("common.yes")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {disabilityStatus === "yes" && (
                <div>
                  <Label className="text-sm font-medium text-slate-700">{t("reg.p1.disabilityType")} *</Label>
                  <Input className="h-11 mt-1.5" maxLength={200} value={disabilityType} onChange={(e) => setDisabilityType(e.target.value)} />
                </div>
              )}
            </FieldGrid>
          </Section>

          <Section title={t("reg.p1.contact")}>
            <FieldGrid>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.mobile")} *</Label>
                <Input className="h-11 mt-1.5" inputMode="tel" maxLength={15} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.whatsapp")} *</Label>
                <Input className="h-11 mt-1.5" inputMode="tel" maxLength={15} disabled={whatsappSame}
                  value={whatsappSame ? phone : whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
                <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                  <Checkbox checked={whatsappSame} onCheckedChange={(v) => setWhatsappSame(!!v)} />
                  <span className="text-sm text-slate-600">{t("reg.p1.sameAsMobile")}</span>
                </label>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.email")} *</Label>
                <Input className="h-11 mt-1.5" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </FieldGrid>
          </Section>

          <Section title={t("reg.p1.address")}>
            <FieldGrid>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.homeTown")} *</Label>
                <Input className="h-11 mt-1.5" maxLength={80} value={homeTown} onChange={(e) => setHomeTown(e.target.value)} />
              </div>
              <Wide><p className="text-sm font-semibold text-slate-700 mt-2">{t("reg.p1.permanent")}</p></Wide>
              <Wide>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.line1")} *</Label>
                <Input className="h-11 mt-1.5" maxLength={200} value={pAddr1} onChange={(e) => setPAddr1(e.target.value)} />
              </Wide>
              <Wide>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.line2")}</Label>
                <Input className="h-11 mt-1.5" maxLength={200} value={pAddr2} onChange={(e) => setPAddr2(e.target.value)} />
              </Wide>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.state")} *</Label>
                <Select value={pState} onValueChange={(v) => { setPState(v); setPDistrict(""); }}>
                  <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.district")} *</Label>
                {pState === "Himachal Pradesh" ? (
                  <Select value={pDistrict} onValueChange={setPDistrict}>
                    <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{HP_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input className="h-11 mt-1.5" maxLength={80} value={pDistrict} onChange={(e) => setPDistrict(e.target.value)} />
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p1.pin")} *</Label>
                <Input className="h-11 mt-1.5" inputMode="numeric" maxLength={6} value={pPin}
                  onChange={(e) => setPPin(e.target.value.replace(/\D/g, ""))} />
              </div>
              <Wide>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <Checkbox checked={corrSame} onCheckedChange={(v) => setCorrSame(!!v)} />
                  <span className="text-sm font-medium text-slate-700">{t("reg.p1.corrSame")}</span>
                </label>
              </Wide>
              {!corrSame && (
                <>
                  <Wide><p className="text-sm font-semibold text-slate-700 mt-2">{t("reg.p1.correspondence")}</p></Wide>
                  <Wide>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.line1")} *</Label>
                    <Input className="h-11 mt-1.5" maxLength={200} value={cAddr1} onChange={(e) => setCAddr1(e.target.value)} />
                  </Wide>
                  <Wide>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.line2")}</Label>
                    <Input className="h-11 mt-1.5" maxLength={200} value={cAddr2} onChange={(e) => setCAddr2(e.target.value)} />
                  </Wide>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.state")} *</Label>
                    <Select value={cState} onValueChange={(v) => { setCState(v); setCDistrict(""); }}>
                      <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.district")} *</Label>
                    {cState === "Himachal Pradesh" ? (
                      <Select value={cDistrict} onValueChange={setCDistrict}>
                        <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{HP_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-11 mt-1.5" maxLength={80} value={cDistrict} onChange={(e) => setCDistrict(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">{t("reg.p1.pin")} *</Label>
                    <Input className="h-11 mt-1.5" inputMode="numeric" maxLength={6} value={cPin}
                      onChange={(e) => setCPin(e.target.value.replace(/\D/g, ""))} />
                  </div>
                </>
              )}
            </FieldGrid>
          </Section>
        </>
      )}

      {step === 1 && (
        <SkillsPage
          professions={professions} maxProfessions={maxProfessions} labelOf={labelOf}
          picked={picked} setPicked={setPicked}
          langs={langs} setLangs={setLangs} otherLangText={otherLangText} setOtherLangText={setOtherLangText}
        />
      )}

      {step === 2 && (
        <QualificationsPage
          picked={picked} setPicked={setPicked} profByKey={profByKey} labelOf={labelOf} noteOf={noteOf}
          eduLevel={eduLevel} setEduLevel={setEduLevel} eduBoard={eduBoard} setEduBoard={setEduBoard}
          eduInstitution={eduInstitution} setEduInstitution={setEduInstitution}
          eduYear={eduYear} setEduYear={setEduYear} eduPassed={eduPassed} setEduPassed={setEduPassed}
        />
      )}

      {step === 3 && (
        <ReviewPage
          onEdit={(s) => { setStep(s); window.scrollTo({ top: 0 }); }}
          profile={{
            passportNumber, noPassportYet, passportIssueDate, passportExpiry, passportPlaceOfIssue, ecrStatus,
            aadhaarNumber, fullName, dateOfBirth, sex, fatherName, motherName, disabilityStatus, disabilityType,
            phone, whatsappNumber: whatsappSame ? phone : whatsappNumber, email, homeTown,
            pAddr1, pAddr2, pDistrict, pState, pPin,
            corrSame, cAddr1, cAddr2, cDistrict, cState, cPin,
            eduLevel, eduBoard, eduInstitution, eduYear, eduPassed,
          }}
          picked={picked} langs={langs} profByKey={profByKey} labelOf={labelOf}
        />
      )}
    </RegisterShell>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────
function SkillsPage({
  professions, maxProfessions, labelOf, picked, setPicked, langs, setLangs, otherLangText, setOtherLangText,
}: any) {
  const { t } = useTranslation();
  const isPicked = (k: string) => picked.some((p: PickedProfession) => p.professionKey === k);
  const atCap = picked.length >= maxProfessions;

  function toggle(k: string) {
    if (isPicked(k)) { setPicked(picked.filter((p: PickedProfession) => p.professionKey !== k)); return; }
    if (atCap) { toast({ title: t("reg.p2.capReached", { max: maxProfessions }) }); return; }
    setPicked([...picked, { professionKey: k, experienceMonths: 0, specificSkills: [], addonData: {} }]);
  }

  const other = picked.find((p: PickedProfession) => p.professionKey === "other");

  return (
    <>
      {/* No section heading here: the page's own h1 IS "What skills do you
          have?" (item 14's wording) and the tiles are the answer to it —
          repeating the question as a sub-heading is just noise. */}
      <section className="mb-9">
        <p className="text-sm text-slate-500 mb-4">{t("reg.p2.pickHint", { max: maxProfessions })}</p>
        {/* Tiles: 2 across on a phone, up to 5 on desktop — the old shell could
            only ever show 2 because of the 576px cap. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {professions.map((p: Profession) => {
            const on = isPicked(p.professionKey);
            return (
              <button key={p.professionKey} type="button" onClick={() => toggle(p.professionKey)}
                className={`relative rounded-xl border-2 p-3.5 text-left transition-all min-h-[68px] ${
                  on ? "border-blue-600 bg-blue-50 shadow-sm"
                     : atCap ? "border-slate-200 bg-white opacity-50" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                <span className={`text-sm font-semibold leading-tight block ${on ? "text-blue-900" : "text-slate-700"}`}>
                  {labelOf(p)}
                </span>
                {on && <Check className="w-4 h-4 text-blue-600 absolute top-2 right-2" />}
              </button>
            );
          })}
        </div>
        {other && (
          <div className="mt-4 max-w-md">
            <Label className="text-sm font-medium text-slate-700">{t("reg.p2.otherLabel")} *</Label>
            <Input className="h-11 mt-1.5" maxLength={60} value={other.otherLabel || ""}
              onChange={(e) => setPicked(picked.map((p: PickedProfession) =>
                p.professionKey === "other" ? { ...p, otherLabel: e.target.value } : p))} />
          </div>
        )}
      </section>

      <Section title={t("reg.p2.languages")} hint={t("reg.p2.languagesHint")}>
        <div className="space-y-2.5">
          {LANGS.map((lang) => {
            const row = langs.find((l: any) => l.language === lang);
            return (
              <div key={lang} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setLangs(row
                    ? langs.filter((l: any) => l.language !== lang)
                    : [...langs, { language: lang, proficiency: "intermediate" }])}
                  className={`rounded-lg border-2 px-4 h-11 text-sm font-semibold min-w-[112px] text-left transition-all ${
                    row ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                  {lang}
                </button>
                {row && (
                  <div className="flex gap-1.5 flex-wrap">
                    {LANG_LEVELS.map((lv) => (
                      <button key={lv} type="button"
                        onClick={() => setLangs(langs.map((l: any) => l.language === lang ? { ...l, proficiency: lv } : l))}
                        className={`rounded-lg px-3 h-9 text-xs font-medium transition-all ${
                          row.proficiency === lv ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {t(`reg.lang.${lv}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* UAT-05 item 6. "Pahari" is gone (item 7) — it is a dialect group,
              not a listable language, and HPSEDC asked for it out. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input className="h-11 w-full sm:w-64" maxLength={40} placeholder={t("reg.p2.otherLangPh")}
              value={otherLangText} onChange={(e) => setOtherLangText(e.target.value)} />
            <Button type="button" variant="outline" className="h-11"
              disabled={!otherLangText.trim() || langs.some((l: any) => l.language.toLowerCase() === otherLangText.trim().toLowerCase())}
              onClick={() => { setLangs([...langs, { language: otherLangText.trim(), proficiency: "intermediate" }]); setOtherLangText(""); }}>
              <Plus className="w-4 h-4 mr-1" /> {t("reg.p2.addLang")}
            </Button>
          </div>
          {langs.filter((l: any) => !LANGS.includes(l.language)).map((l: any) => (
            <div key={l.language} className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLangs(langs.filter((x: any) => x.language !== l.language))}
                className="rounded-lg border-2 border-blue-600 bg-blue-50 text-blue-900 px-4 h-11 text-sm font-semibold min-w-[112px] text-left">
                {l.language}
              </button>
              <div className="flex gap-1.5 flex-wrap">
                {LANG_LEVELS.map((lv) => (
                  <button key={lv} type="button"
                    onClick={() => setLangs(langs.map((x: any) => x.language === l.language ? { ...x, proficiency: lv } : x))}
                    className={`rounded-lg px-3 h-9 text-xs font-medium ${l.proficiency === lv ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {t(`reg.lang.${lv}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ── Page 3 ────────────────────────────────────────────────────────────
function QualificationsPage({
  picked, setPicked, profByKey, labelOf, noteOf,
  eduLevel, setEduLevel, eduBoard, setEduBoard, eduInstitution, setEduInstitution,
  eduYear, setEduYear, eduPassed, setEduPassed,
}: any) {
  const { t } = useTranslation();
  const patch = (k: string, p: Partial<PickedProfession>) =>
    setPicked(picked.map((x: PickedProfession) => x.professionKey === k ? { ...x, ...p } : x));

  return (
    <>
      <Section title={t("reg.p3.education")} hint={t("reg.p3.educationHint")}>
        <FieldGrid>
          <div>
            <Label className="text-sm font-medium text-slate-700">{t("reg.p3.highest")} *</Label>
            <Select value={eduLevel} onValueChange={setEduLevel}>
              <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{EDU_LEVELS.map((k) => <SelectItem key={k} value={k}>{t(`reg.edu.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {eduLevel && eduLevel !== "none" && (
            <>
              <div>
                {/* UAT-05 item 17: the HP board is HPBOSE — Himachal Pradesh Board of
                    School Education is HPBOSE; the old placeholder had it wrong
                    in three places. */}
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.board")}</Label>
                <Select value={eduBoard} onValueChange={setEduBoard}>
                  <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{BOARDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.institution")}</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={eduInstitution} onChange={(e) => setEduInstitution(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.year")}</Label>
                <Input className="h-11 mt-1.5" type="number" min={1950} max={new Date().getFullYear()}
                  value={eduYear} onChange={(e) => setEduYear(e.target.value ? Number(e.target.value) : "")} />
              </div>
              <Wide>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={eduPassed} onCheckedChange={(v) => setEduPassed(!!v)} />
                  <span className="text-sm text-slate-700">{t("reg.p3.passed")}</span>
                </label>
              </Wide>
            </>
          )}
        </FieldGrid>
      </Section>

      {/* One card per selected trade. Everything about being a welder lives in
          the welder card — qualification, experience, specific skills. */}
      {picked.map((x: PickedProfession) => {
        const prof: Profession | undefined = profByKey[x.professionKey];
        const note = noteOf(prof);
        const skills: string[] = prof?.skillsOptions || [];
        return (
          <div key={x.professionKey} className="mb-7 rounded-2xl border-2 border-slate-200 bg-white p-5 lg:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="rounded-lg bg-blue-100 p-2"><Briefcase className="w-4 h-4 text-blue-700" /></div>
              <h3 className="text-lg font-bold text-slate-900">
                {x.professionKey === "other" ? x.otherLabel : labelOf(prof)}
              </h3>
            </div>

            {/* HPSEDC's own note, from the DB. This is the screen that makes the
                funnel shrink for free: tell a candidate up front that nursing
                needs Council registration and the ones without it stop here,
                instead of being shortlisted and rejected by hand later. */}
            {note && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">{note}</p>
              </div>
            )}

            {prof?.hasAddonBlock && (
              <div className="mb-5">
                <ProfessionAddonBlock professionKey={x.professionKey}
                  qualifications={prof?.qualifications || []}
                  value={x.addonData} onChange={(p) => patch(x.professionKey, { addonData: { ...x.addonData, ...p } })} />
              </div>
            )}

            <FieldGrid>
              <Wide>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.months")} *</Label>
                <div className="flex items-center gap-3 mt-1.5">
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                    onClick={() => patch(x.professionKey, { experienceMonths: Math.max(0, x.experienceMonths - 6) })}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input className="h-11 w-24 text-center" type="number" min={0} max={600} value={x.experienceMonths}
                    onChange={(e) => patch(x.professionKey, { experienceMonths: Math.min(600, Math.max(0, Number(e.target.value) || 0)) })} />
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                    onClick={() => patch(x.professionKey, { experienceMonths: Math.min(600, x.experienceMonths + 6) })}>
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-slate-500">
                    {t("reg.p3.approxYears", { years: (x.experienceMonths / 12).toFixed(1) })}
                  </span>
                </div>
              </Wide>

              {/* Optional, and where the matching value lives: a Gulf employer is
                  not hiring "a welder", they are hiring a 6G pipe welder. */}
              {prof?.skillsEnabled && skills.length > 0 && (
                <Wide>
                  <Label className="text-sm font-medium text-slate-700">{t("reg.p3.specificSkills")}</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">{t("reg.p3.specificSkillsHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => {
                      const on = x.specificSkills.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => patch(x.professionKey, {
                            specificSkills: on ? x.specificSkills.filter((y) => y !== s) : [...x.specificSkills, s] })}
                          className={`rounded-lg border-2 px-3.5 h-10 text-sm font-medium transition-all ${
                            on ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </Wide>
              )}

              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.lastEmployer")}</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={x.lastEmployerName || ""}
                  onChange={(e) => patch(x.professionKey, { lastEmployerName: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.lastEmployerCountry")}</Label>
                <Input className="h-11 mt-1.5" maxLength={60} value={x.lastEmployerCountry || ""}
                  onChange={(e) => patch(x.professionKey, { lastEmployerCountry: e.target.value })} />
              </div>
            </FieldGrid>
          </div>
        );
      })}
    </>
  );
}
