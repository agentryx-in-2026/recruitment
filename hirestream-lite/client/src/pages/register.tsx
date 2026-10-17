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
import { FormGrid, Field, GridHeading, GridCheckbox, MicInput, PhoneInput, inputCls } from "./register/Field";
// Formatting, masking and the Verhoeff checksum live in ONE shared module so
// client and server cannot disagree (HPSEDC 2026-07-07). The first cut of this
// page re-implemented masking by hand and dropped the rest.
import { formatAadhaar, stripAadhaar, maskAadhaar, isValidAadhaar } from "@shared/aadhaar";
import { splitPhone } from "./register/Field";
import { ProfessionAddonBlock, isAddonComplete, type AddonData } from "./register/profession-blocks";
import { ReviewPage } from "./register/ReviewPage";
import { DocumentsPage, CompliancePage } from "./register/DeploymentPages";
import { ReadyChecklist } from "./register/ReadyChecklist";
import { isTestMode, TEST_DATA } from "./register/test-mode";
import { Check, Plus, Minus, Info, Briefcase, BookUser, User, Phone, MapPin,
         Wrench, GraduationCap, ClipboardCheck, FlaskConical, Wand2, FileText, ShieldCheck } from "lucide-react";

/**
 * Four pages TODAY — everything HPSEDC need to match a candidate to a vacancy.
 *
 * Pages 5 and 6 are planned but deliberately NOT built yet: they collect the
 * extra detail that only matters once a candidate progresses through the
 * pipeline (post-shortlist, pre-deployment), and they will be enabled by
 * pipeline stage rather than shown to everyone. That is the same 20,000:500
 * rule the document engine already follows — do not ask 20,000 people for what
 * 500 will need.
 *
 * So treat this as a current count, not a fixed one. The stepper, the
 * per-page progress and the weighted overall percentage all read from it; the
 * ?page= deep-link clamps to it. Adding a page should mean adding its
 * component and its weight, not touching those mechanics.
 */
/**
 * Which education row does the registration page own?
 *
 * The page keeps ONE row — "highest qualification". Finding it by degree label
 * works for rows this page wrote, but not for rows the retired profile-wizard
 * wrote: it stored free text ("B.Sc Nursing", "12th (Medical)"), which matches
 * no label. That broke both directions — the fields came up blank on edit, and
 * on save the label lookup missed and INSERTED a second row, so the candidate
 * silently ended up claiming two qualifications.
 *
 * So: prefer an exact label match; otherwise fall back to the most advanced row
 * we can identify (highest year), which is what "highest qualification" means.
 */
export function findOwnEducationRow(rows: any[], knownLabels: string[]): any | undefined {
  if (!rows?.length) return undefined;
  const labelled = rows.find((e: any) => knownLabels.includes(e.degree));
  if (labelled) return labelled;
  return [...rows].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))[0];
}

const BASE_PAGES = 4;
// 18 is the statutory minimum emigration age. The `max` attribute stops the
// picker offering an under-age date at all; the inline error covers typed input.
const maxDobForAdult = () => {
  const n = new Date();
  return new Date(n.getFullYear() - 18, n.getMonth(), n.getDate()).toISOString().slice(0, 10);
};
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

// UAT-05: four languages that actually matter for HP -> Gulf placement, plus the
// "Other language" free-text box for everything else. Nepali, Malayalam and
// Punjabi were dropped from the tiles — a long list of chips a candidate has to
// read past is a cost paid by every applicant to serve a few, and the free-text
// field serves those few without it. Arabic stays because it is the DESTINATION
// language: a candidate who speaks it is materially more employable in the Gulf.
// (The old profile-wizard's parallel COMMON_LANGUAGES list is gone with it.)
const LANGS = ["Hindi", "English", "Urdu", "Arabic"];
const LANG_LEVELS = ["elementary", "intermediate", "professional", "native"] as const;
const EDU_LEVELS = ["none", "class5", "class8", "class10", "class12", "iti", "diploma", "degree"];
// The board/institution list depends on the qualification. Class 5 to Class 12
// come from a SCHOOL BOARD; ITI, Diploma and a Degree come from a university or
// a technical board — offering "HPBOSE / CBSE" for a degree was simply wrong.
// "Other" reveals a free-text box, because there are far too many universities
// to enumerate. (Tester feedback, 2026-07-20.)
const SCHOOL_LEVELS = ["class5", "class8", "class10", "class12"];
const SCHOOL_BOARDS = ["HPBOSE", "CBSE", "ICSE", "NIOS", "Other State Board", "Other"];
const HIGHER_INSTITUTIONS = [
  "Himachal Pradesh University (HPU), Shimla",
  "Himachal Pradesh Technical University (HPTU), Hamirpur",
  "CSK HP Agricultural University, Palampur",
  "HP Takniki Shiksha Board (HPTSB) — ITI / Diploma",
  "Other",
];
const OTHER_SENTINEL = "__other__";

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  // ?page=N deep-links straight to a page (1-based), so the dashboard's
  // "Add education" lands on the education page rather than dumping the
  // candidate at the top of the form to click Next three times. Clamped, and
  // only honoured up to the furthest page they have actually completed —
  // enforced below once the profile loads, since each page saves on Next.
  const requestedPage = (() => {
    if (typeof window === "undefined") return 0;
    const raw = Number(new URLSearchParams(window.location.search).get("page"));
    return Number.isFinite(raw) && raw >= 1 && raw <= 6 ? raw - 1 : 0;
  })();
  const [step, setStep] = useState(requestedPage);
  // Furthest stage reached. The sidebar lets a candidate go BACK to a page
  // they have completed, never forward past one they have not — each page
  // saves on Next, so skipping ahead would leave earlier pages unsaved.
  const [maxStepReached, setMaxStepReached] = useState(requestedPage);
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
  // Has this candidate already submitted? The server computes profileComplete
  // from the same checkpoints the form collects, so it is the honest answer —
  // and unlike local state it survives a reload.
  const alreadySubmitted = Boolean(profileRes?.data?.profileComplete);
  const submittedAt: string | null = profileRes?.data?.updatedAt ?? null;

  // Has anything changed since the last save? Without this the review page
  // offered "Submit application" forever — a candidate who had already
  // submitted, went to their dashboard and came back saw the same call to
  // action and no evidence their application had ever gone in. The button now
  // only lights up when there is genuinely something new to send.
  const savedSnapshot = useRef<string | null>(null);
  const answersKey = JSON.stringify([
    passportNumber, passportExpiry, passportIssueDate, passportPlaceOfIssue, noPassportYet,
    ecrStatus, aadhaarNumber, fullName, dateOfBirth, sex, fatherName, motherName,
    disabilityStatus, disabilityType, phone, whatsappSame, whatsappNumber, email,
    homeTown, pAddr1, pAddr2, pDistrict, pState, pPin, corrSame, cAddr1, cAddr2, cDistrict, cState, cPin,
    picked, langs, eduLevel, eduBoard, eduInstitution, eduYear, eduPassed,
  ]);
  const isDirty = savedSnapshot.current !== null && savedSnapshot.current !== answersKey;
  const { data: profRes } = useQuery<any>({ queryKey: ["/api/v1/professions"] });
  const { data: minePropRes } = useQuery<any>({ queryKey: ["/api/v1/professions/mine"] });
  const { data: langRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/languages"] });
  // The education ROW (board, institution, year, passed) lives in
  // candidate_education, not on the profile — the profile carries only
  // qualificationLevel. Without this fetch a returning candidate saw those four
  // fields blank, and because the save path does an update-or-insert on the
  // same row, pressing Next then PUT the blanks straight over their real
  // answers. Silent data loss on an edit, which is the worst kind.
  const { data: eduRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/education"] });
  // Pages 5 and 6 exist only once HPSEDC actually need them — i.e. once this
  // candidate has been selected and owes documents. Twenty thousand applicants
  // must never be walked through a police-clearance page; five hundred must.
  const { data: deployObl } = useQuery<any>({ queryKey: ["/api/v1/candidates/documents/obligations"] });
  const hasDeploymentStage = (deployObl?.data?.obligations || []).length > 0;
  const TOTAL = hasDeploymentStage ? 6 : BASE_PAGES;
  // Field configuration — HPSEDC turn fields on/off and required/optional from
  // the admin screen, no release. The server is the authority; this is the form
  // reading it. Defaults are permissive so a failed fetch shows the full form
  // rather than a mysteriously empty one.
  const { data: fieldCfgRes } = useQuery<any>({ queryKey: ["/api/v1/registration-fields"] });
  const fieldCfg: Record<string, { enabled: boolean; required: boolean }> = fieldCfgRes?.data?.fields || {};
  const on = (k: string) => fieldCfg[k]?.enabled !== false;
  const req = (k: string) => fieldCfg[k]?.required === true;

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

  // Restore the education row this page owns — matched the same way the save
  // path finds it, by degree label, so the two cannot disagree about which row
  // is "ours".
  // Resume where it makes sense. Someone who has already submitted and comes
  // back through "Edit" wants the review page — the summary with per-section
  // Edit links — not to be dropped at field one of page one and marched
  // through all four again. Only fires once, and never overrides an explicit
  // ?page= deep-link.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !profileRes?.data) return;
    resumed.current = true;
    if (alreadySubmitted && requestedPage === 0) {
      setStep(TOTAL - 1);
      setMaxStepReached(TOTAL - 1);
    }
  }, [profileRes, alreadySubmitted, requestedPage]);

  // Snapshot ONCE, after the loaded profile has been written into state.
  //
  // Keying this on [profileRes] was wrong: React Query refetches the profile on
  // window focus and after every save, so the baseline was re-taken WITH the
  // candidate's unsaved edits folded in — the form forgot it was dirty and the
  // button fell back to disabled while their changes sat unsaved. Alt-tabbing
  // was enough to trigger it. The baseline must move only when we deliberately
  // move it: here once, and after a successful save or submit.
  const baselined = useRef(false);
  useEffect(() => {
    if (baselined.current || !profileRes?.data) return;
    const t = setTimeout(() => { savedSnapshot.current = answersKey; baselined.current = true; }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRes]);

  const prefilledEdu = useRef(false);
  useEffect(() => {
    const rows = eduRes?.data;
    if (!rows || prefilledEdu.current) return;
    prefilledEdu.current = true;
    const known = EDU_LEVELS.filter((k) => k !== "none").map((k) => t(`reg.edu.${k}`, { lng: "en" }));
    const mine = findOwnEducationRow(rows, known);
    if (!mine) return;
    setEduBoard(mine.board || "");
    // savePage3 writes "—" when the candidate left this blank (the column is
    // NOT NULL); restoring that literal would show a dash as if they typed it.
    setEduInstitution(mine.institution && mine.institution !== "—" ? mine.institution : "");
    setEduYear(mine.year ?? "");
    setEduPassed(mine.isPassed !== false);
  }, [eduRes, t]);

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
    setLangs(rows.map((r: any) => ({
      language: r.language,
      proficiency: r.proficiency,
      // Rows written before the split recorded one level; show it for both
      // rather than implying the candidate cannot write at all.
      writtenProficiency: r.writtenProficiency ?? r.proficiency,
    })));
  }, [langRes]);

  // ── Per-field validation messages ──────────────────────────────────
  // The flow this replaced showed these inline; the rebuild dropped them and
  // left only a greyed-out Next, so a candidate with a bad Aadhaar had no way
  // to find out why they were stuck.
  // Validate the NATIONAL part only — counting the dial code would let a
  // 6-digit number pass as "+971 501234" and reject a real Indian one.
  const digitsOnly = (x: string) => splitPhone(x).number;
  const aadhaarErr = !aadhaarNumber ? null
    : aadhaarNumber.length !== 12 ? t("reg.err.aadhaarLen")
    : !isValidAadhaar(aadhaarNumber) ? t("reg.err.aadhaarInvalid")
    : null;
  // National-number length varies by country: India is 10, but UAE/Saudi/Qatar/
  // Oman mobiles are 8-9. Demanding 10 rejected every Gulf number — i.e. the
  // dial-code feature shipped in v0.9.5 refused the exact users it was added
  // for, and the Next gate disagreed with the inline error on the same value.
  // 7 is the shortest national mobile in any country we list.
  const MIN_NATIONAL = 7;
  const phoneShort = (v: string) => Boolean(v) && digitsOnly(v).length < MIN_NATIONAL;
  const phoneErr = phoneShort(phone) ? t("reg.err.phone") : null;
  const whatsappErr = !whatsappSame && phoneShort(whatsappNumber) ? t("reg.err.phone") : null;
  const emailErr = email && !/\S+@\S+\.\S+/.test(email) ? t("reg.err.email") : null;

  // ── Validation ─────────────────────────────────────────────────────
  // Client-side, and only gates the Next button — the server is the authority.
  const digits = (s: string) => s.replace(/\D/g, "");
  // A hidden field can never block Next, and an optional one can never be
  // missing — otherwise turning a field off in the admin screen would strand
  // every candidate on a page with no visible reason.
  const need = (key: string, value: any) => !on(key) || !req(key) || Boolean(typeof value === "string" ? value.trim() : value);
  const passportOk = (on("noPassportOption") && noPassportYet)
    || (passportNumber.trim().length >= 6 && !!passportExpiry);
  const addrOk = pAddr1.trim() && pDistrict && pState && pPin.length === 6;
  const corrOk = !on("correspondenceAddress") || corrSame || (cAddr1.trim() && cDistrict && cState && cPin.length === 6);
  // An INVALID Aadhaar blocks Next as well as an empty one — the field is
  // optional, but a wrong number must not reach the server (which rejects it
  // anyway, at submit time, long after the candidate has moved on).
  const p1Ok = passportOk && fullName.trim().length >= 2 && dateOfBirth && sex
    && need("fatherName", fatherName) && need("motherName", motherName)
    && need("disability", disabilityStatus)
    && (!on("disability") || disabilityStatus !== "yes" || disabilityType.trim())
    && need("passportIssueDate", passportIssueDate) && need("passportPlaceOfIssue", passportPlaceOfIssue)
    && need("ecrStatus", ecrStatus) && need("aadhaarNumber", aadhaarNumber)
    && digits(phone).length >= MIN_NATIONAL && !phoneErr
    && (!on("whatsappNumber") || !req("whatsappNumber") || whatsappSame || (digits(whatsappNumber).length >= MIN_NATIONAL && !whatsappErr))
    && /\S+@\S+\.\S+/.test(email) && need("homeTown", homeTown) && addrOk && corrOk
    && !aadhaarErr && !(passportExpiry && passportExpiry < today());
  const p2Ok = picked.length > 0 && picked.every((x) => x.professionKey !== "other" || x.otherLabel?.trim()) && langs.length > 0;
  const p3Ok = eduLevel && picked.every((x) => isAddonComplete(x.professionKey, x.addonData) && x.experienceMonths >= 0);

  // ── Progress, per page and overall ─────────────────────────────────
  //
  // Per-STAGE progress is the number that actually helps: "page 1 is 57% done"
  // tells a candidate how much work is left in front of them right now, which
  // "step 1 of 4" never did. Counted over the fields that page genuinely
  // requires — optional fields must not drag a finished page below 100%.
  const pct = (vals: any[]) => {
    const done = vals.filter((v) => (typeof v === "string" ? v.trim() : v)).length;
    return vals.length === 0 ? 0 : Math.round((done / vals.length) * 100);
  };
  const p1Fields = [
    noPassportYet || passportNumber, noPassportYet || passportExpiry,
    fullName, dateOfBirth, sex, fatherName, motherName, disabilityStatus,
    disabilityStatus !== "yes" || disabilityType,
    phone, whatsappSame || whatsappNumber, email,
    homeTown, pAddr1, pDistrict, pState, pPin.length === 6,
    corrSame || (cAddr1 && cDistrict && cState && cPin.length === 6),
  ];
  const p2Fields = [picked.length > 0, langs.length > 0];
  const p3Fields = [
    eduLevel,
    ...picked.map((x) => isAddonComplete(x.professionKey, x.addonData)),
    ...picked.map((x) => x.experienceMonths > 0),
  ];
  // The review page counts as done when the application has actually been
  // SUBMITTED — not merely when the candidate happens to be standing on it.
  // Position-based progress meant a candidate who submitted, went to their
  // dashboard and came back saw "Review 0% · 90% complete" and had to click
  // through and submit a second time, every time. `alreadySubmitted` comes from
  // the server's profileComplete, so it survives reloads and devices.
  // Page 5 progresses with the documents actually uploaded; page 6 with the
  // compliance answers given. Both are real work, so they must count.
  const deployObligations: any[] = deployObl?.data?.obligations || [];
  const allDocs = deployObligations.flatMap((o: any) => o.required || []);
  const docPct = allDocs.length ? Math.round((allDocs.filter((d: any) => d.have).length / allDocs.length) * 100) : 0;
  const compliancePct = pct([profileRes?.data?.pccStatus, profileRes?.data?.medicalStatus, profileRes?.data?.pbbyInsuranceStatus]);
  const reviewDone = (alreadySubmitted || step === 3) ? 100 : 0;
  const stepProgress = hasDeploymentStage
    ? [pct(p1Fields), pct(p2Fields), pct(p3Fields), reviewDone, docPct, compliancePct]
    : [pct(p1Fields), pct(p2Fields), pct(p3Fields), reviewDone];
  // Weighted by how much work each page actually is, not a flat average — page 1
  // is ~18 fields and page 2 is two choices, so a flat mean would jump to 25%
  // for one tap and badly overstate progress.
  const overallProgress = hasDeploymentStage
    ? Math.round((stepProgress[0] * 0.30) + (stepProgress[1] * 0.10) + (stepProgress[2] * 0.15)
        + (stepProgress[3] * 0.05) + (stepProgress[4] * 0.25) + (stepProgress[5] * 0.15))
    : Math.round((stepProgress[0] * 0.5) + (stepProgress[1] * 0.15) + (stepProgress[2] * 0.25) + (stepProgress[3] * 0.10));

  // The pre-flight checklist, shown once per candidate on a fresh form. Skipped
  // for anyone resuming — they have already seen it and already have their
  // papers out.
  const [showChecklist, setShowChecklist] = useState(false);
  const checklistDecided = useRef(false);
  // The "already seen it" flag is per CANDIDATE, not per browser.
  //
  // It used to be one global localStorage key, so the first person to dismiss
  // the checklist on a given machine suppressed it for everyone who registered
  // afterwards on that machine — every new account looked like it had no
  // checklist. That is wrong on a shared or public terminal, which is exactly
  // how many HPSEDC applicants will reach this form: a cyber-café, a panchayat
  // office, a helper's phone. Keying it to the candidate means a genuinely new
  // applicant always gets the pre-flight list.
  const checklistKey = (id?: string) => `hs_reg_checklist_seen:${id || "anon"}`;
  useEffect(() => {
    const p = profileRes?.data;
    if (!p || checklistDecided.current) return;
    checklistDecided.current = true;
    const started = Boolean(p.fullName && p.fullName !== "Unknown" && p.phone);
    let seen = false;
    try { seen = localStorage.getItem(checklistKey(p.id)) === "1"; } catch { /* private mode */ }
    if (!started && !seen) setShowChecklist(true);
  }, [profileRes]);
  const dismissChecklist = () => {
    try { localStorage.setItem(checklistKey(profileRes?.data?.id), "1"); } catch { /* private mode */ }
    setShowChecklist(false);
  };

  // The clock lives in useFormTimer now — persisted, pausable, and auto-paused
  // when the tab is hidden. A per-mount Date.now() reset it on every reload.

  // ── Test mode ──────────────────────────────────────────────────────
  // Fills only the page you are ON, so a tester can still hand-check one page
  // while skipping the setup for the others. See register/test-mode.ts for how
  // it is gated (?test=1, sessionStorage, never on for a real candidate).
  const testMode = useMemo(() => isTestMode(), []);

  // Section-level fills. A tester checking the address rules should not have to
  // re-key identity and contact just to reach them.
  const fillIdentity = () => {
    const d = TEST_DATA.page1;
    setPassportNumber(d.passportNumber); setNoPassportYet(false);
    setPassportIssueDate(d.passportIssueDate); setPassportExpiry(d.passportExpiry);
    setPassportPlaceOfIssue(d.passportPlaceOfIssue); setEcrStatus(d.ecrStatus);
    setAadhaarNumber(d.aadhaarNumber);
    toast({ title: t("reg.test.filledSection") });
  };
  const fillPersonal = () => {
    const d = TEST_DATA.page1;
    setFullName(d.fullName); setDateOfBirth(d.dateOfBirth); setSex(d.sex);
    setFatherName(d.fatherName); setMotherName(d.motherName);
    setDisabilityStatus(d.disabilityStatus); setDisabilityType(d.disabilityType);
    toast({ title: t("reg.test.filledSection") });
  };
  const fillContact = () => {
    const d = TEST_DATA.page1;
    setPhone(d.phone); setWhatsappSame(d.whatsappSame); setWhatsappNumber(d.whatsappNumber);
    setEmail(d.email);
    toast({ title: t("reg.test.filledSection") });
  };
  const fillAddress = () => {
    const d = TEST_DATA.page1;
    setHomeTown(d.homeTown);
    setPAddr1(d.pAddr1); setPAddr2(d.pAddr2); setPDistrict(d.pDistrict);
    setPState(d.pState); setPPin(d.pPin); setCorrSame(d.corrSame);
    toast({ title: t("reg.test.filledSection") });
  };

  const fillTrades = () => {
    const d = TEST_DATA.page2;
    // Only trades the catalogue actually has, capped — HPSEDC can deactivate
    // any of them from the admin screen, and this must not break when they do.
    const available = d.professionKeys.filter((k) => professions.some((p) => p.professionKey === k));
    setPicked(available.slice(0, maxProfessions).map((k) => ({
      professionKey: k, experienceMonths: 0, specificSkills: [], addonData: {},
    })));
    toast({ title: t("reg.test.filledSection") });
  };
  const fillLanguages = () => {
    setLangs(TEST_DATA.page2.languages.filter((l) => LANGS.includes(l.language)));
    toast({ title: t("reg.test.filledSection") });
  };

  const fillEducation = () => {
    const d = TEST_DATA.page3;
    setEduLevel(d.eduLevel); setEduBoard(d.eduBoard);
    setEduInstitution(d.eduInstitution); setEduYear(d.eduYear); setEduPassed(d.eduPassed);
    toast({ title: t("reg.test.filledSection") });
  };
  /** Fill ONE trade's card — its add-on block, months and specific skills. */
  const fillTradeCard = (key: string) => {
    const d = TEST_DATA.page3;
    setPicked((prev) => prev.map((x) => {
      if (x.professionKey !== key) return x;
      const prof = profByKey[key];
      return {
        ...x,
        experienceMonths: d.experienceMonths,
        // Straight from HPSEDC's own list for this trade, so it survives edits.
        specificSkills: (prof?.skillsOptions || []).slice(0, 2),
        lastEmployerName: d.lastEmployerName,
        lastEmployerCountry: d.lastEmployerCountry,
        addonData: prof?.hasAddonBlock ? (d.addon[key] || x.addonData) : x.addonData,
      };
    }));
    toast({ title: t("reg.test.filledSection") });
  };

  /** Whole-page fill, kept for when a tester just wants to get past a page. */
  const autofill = [
    () => { fillIdentity(); fillPersonal(); fillContact(); fillAddress(); },
    () => { fillTrades(); fillLanguages(); },
    () => { fillEducation(); picked.forEach((x) => fillTradeCard(x.professionKey)); },
  ][step];

  // ── Saves ──────────────────────────────────────────────────────────
  async function savePage1() {
    await apiRequest("PATCH", "/api/v1/candidates/profile", {
      passportNumber: noPassportYet ? null : passportNumber.trim().toUpperCase() || null,
      noPassportYet,
      passportIssueDate: noPassportYet ? null : passportIssueDate || null,
      passportExpiry: noPassportYet ? null : passportExpiry || null,
      passportPlaceOfIssue: noPassportYet ? null : passportPlaceOfIssue.trim() || null,
      ecrStatus: ecrStatus || null,
      aadhaarNumber: aadhaarNumber || null,   // already raw 12 digits (stripAadhaar on input)
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
    // Languages: DIFF, not delete-all-then-insert-all.
    //
    // Two things were wrong with the old approach here. It swallowed delete
    // failures with `.catch(() => {})` — undoing audit fix C12, whose whole
    // point was that "a silent failure left the chip missing and Next disabled
    // with no message". And it churned every row on every save, so a network
    // blip between the deletes and the inserts could leave a candidate with NO
    // languages at all. There is no PUT on this resource, so a proficiency
    // change is a delete + add of that one row.
    const existing = (langRes?.data || []) as any[];
    const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    // Compare BOTH levels. Comparing only `proficiency` meant a candidate who
    // changed just their writing level produced no delete and no add, and the
    // change vanished on save with a success toast.
    const written = (x: any) => x.writtenProficiency ?? x.proficiency ?? null;
    const same = (a: any, b: any) =>
      sameName(a.language, b.language) && a.proficiency === b.proficiency && written(a) === written(b);
    const toRemove = existing.filter((e) => !langs.some((l) => same(l, e)));
    const toAdd = langs.filter((l) => !existing.some((e) => same(l, e)));
    for (const row of toRemove) await apiRequest("DELETE", `/api/v1/candidates/languages/${row.id}`);
    for (const l of toAdd) await apiRequest("POST", "/api/v1/candidates/languages", l);
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
        board: eduBoard.trim() || undefined,
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
      const mine = findOwnEducationRow(existing, known);
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
      savedSnapshot.current = answersKey;
      setStep((s) => { const n = Math.min(s + 1, TOTAL - 1); setMaxStepReached((m) => Math.max(m, n)); return n; });
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
      savedSnapshot.current = answersKey;
      toast({ title: t("reg.submitted"), description: t("reg.submittedSub") });
      setLocation("/");
    } catch (e: any) {
      toast({ title: t("reg.saveFailed"), description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const stepLabels = hasDeploymentStage
    ? [t("reg.p1.tab"), t("reg.p2.tab"), t("reg.p3.tab"), t("reg.p4.tab"), t("reg.p5.tab"), t("reg.p6.tab")]
    : [t("reg.p1.tab"), t("reg.p2.tab"), t("reg.p3.tab"), t("reg.p4.tab")];
  const stepIcons = hasDeploymentStage
    ? [User, Wrench, GraduationCap, ClipboardCheck, FileText, ShieldCheck]
    : [User, Wrench, GraduationCap, ClipboardCheck];
  const titles = [t("reg.p1.title"), t("reg.p2.title"), t("reg.p3.title"), t("reg.p4.title"), t("reg.p5.title"), t("reg.p6.title")];
  const helps = [t("reg.p1.help"), t("reg.p2.help"), t("reg.p3.help"), t("reg.p4.help"), t("reg.p5.help"), t("reg.p6.help")];
  const okFor = [p1Ok, p2Ok, p3Ok, true, true, true];

  return (
    <RegisterShell
      candidateId={profileRes?.data?.id}
      step={step} totalSteps={TOTAL} stepLabels={stepLabels} stepIcons={stepIcons}
      stepProgress={stepProgress} overallProgress={overallProgress}
      maxStepReached={maxStepReached}
      onNavigate={(i) => { setStep(i); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      title={titles[step]} help={helps[step]}
      onBack={step > 0 ? () => { setStep(step - 1); window.scrollTo({ top: 0 }); } : undefined}
      onNext={step < TOTAL - 1 ? next : submit}
      nextLabel={step === TOTAL - 1
        ? (alreadySubmitted && !isDirty ? t("reg.submitted") : t("reg.submit"))
        : undefined}
      // Already submitted and nothing edited? There is nothing to send. Leaving
      // it live invited candidates to press it repeatedly wondering whether it
      // had worked.
      nextDisabled={!okFor[step] || (step === TOTAL - 1 && alreadySubmitted && !isDirty)}
      submittedNote={step === TOTAL - 1 && alreadySubmitted && !isDirty
        ? t("reg.submittedNote", { date: submittedAt ? new Date(submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "" })
        : undefined}
      // A disabled button with no explanation reads as broken — the operator hit
      // this twice, retyping a value that was already saved and concluding the
      // form was faulty. Saying "nothing has changed" turns a dead control into
      // an answer.
      submittedHint={step === TOTAL - 1 && alreadySubmitted && !isDirty ? t("reg.noChanges") : undefined}
      loading={saving}
    >
      {showChecklist && (
        <ReadyChecklist onStart={dismissChecklist} onDismiss={dismissChecklist} />
      )}

      {/* Test mode. Loud amber on purpose — if this ever renders somewhere it
          should not, it must be impossible to mistake for part of the form. */}
      {testMode && (
        <div className="mb-5 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-amber-900 uppercase tracking-wide">
            <FlaskConical className="w-4 h-4" /> {t("reg.test.badge")}
          </span>
          <span className="text-[14px] text-amber-800 flex-1 min-w-[12rem]">{t("reg.test.hint")}</span>
          {autofill && (
            <Button type="button" size="sm" onClick={autofill}
              className="h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shrink-0">
              <Wand2 className="w-4 h-4" /> {t("reg.test.fill")}
            </Button>
          )}
        </div>
      )}

      {step === 0 && (
        <>
          {/* One instruction makes ~18 fields tolerable: everything on this page
              is printed on a document already in their hand. */}
          <div className="mb-8 flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3.5">
            <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-[15px] text-blue-900 leading-snug">{t("reg.p1.keepDocs")}</p>
          </div>

          <Section n={1} icon={BookUser} title={t("reg.p1.identity")} onAutofill={testMode ? fillIdentity : undefined} autofillLabel={t("reg.test.fillSection")} hint={t("reg.p1.identityHint")}>
            <FormGrid>
              <Field label={t("reg.p1.passportNo")} required={!noPassportYet} span={4}
                error={passportNumber && !noPassportYet && passportNumber.trim().length < 6 ? t("reg.err.passportShort") : null}>
                <Input className={inputCls} maxLength={20} disabled={noPassportYet}
                  value={passportNumber} onChange={(e) => setPassportNumber(e.target.value.toUpperCase())} />
              </Field>
              {!noPassportYet && (
                <Field label={t("reg.p1.passportExpiry")} required span={4}
                  error={passportExpiry && passportExpiry < today() ? t("reg.err.passportExpired") : null}>
                  <Input className={inputCls} type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} />
                </Field>
              )}
              {!noPassportYet && on("passportIssueDate") && (
                <Field label={t("reg.p1.passportIssue")} required={req("passportIssueDate")} span={4}
                  error={passportIssueDate && passportIssueDate > today() ? t("reg.err.issueFuture") : null}>
                  <Input className={inputCls} type="date" max={today()} value={passportIssueDate} onChange={(e) => setPassportIssueDate(e.target.value)} />
                </Field>
              )}
              {on("noPassportOption") && (
                <GridCheckbox checked={noPassportYet} onChange={setNoPassportYet} label={t("reg.p1.noPassport")} />
              )}
              {noPassportYet && (
                <div className="col-span-12 -mt-2 pb-4">
                  <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("reg.p1.noPassportHint")}</p>
                </div>
              )}
              {!noPassportYet && on("passportPlaceOfIssue") && (
                <Field label={t("reg.p1.passportPlace")} required={req("passportPlaceOfIssue")} span={4}>
                  <Input className={inputCls} maxLength={80} value={passportPlaceOfIssue} onChange={(e) => setPassportPlaceOfIssue(e.target.value)} />
                </Field>
              )}
              {!noPassportYet && on("ecrStatus") && (
                <Field label={t("reg.p1.ecr")} required={req("ecrStatus")} span={4} hint={t("reg.p1.ecrHint")}>
                  <Select value={ecrStatus} onValueChange={setEcrStatus}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ecnr">{t("reg.p1.ecnr")}</SelectItem>
                      <SelectItem value="ecr">{t("reg.p1.ecrYes")}</SelectItem>
                      {/* The third option is HPSEDC's call — off by default. */}
                      {on("ecrUnknownOption") && <SelectItem value="unknown">{t("reg.p1.ecrUnknown")}</SelectItem>}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {/* Aadhaar — formatted, checksum-validated, masked on review.
                  Uses @shared/aadhaar so client and server agree; the rebuild
                  briefly hand-rolled all three and lost the live feedback. */}
              {on("aadhaarNumber") && (
              <Field label={t("reg.p1.aadhaar")} required={req("aadhaarNumber")} span={4}
                hint={aadhaarErr ? undefined : t("reg.p1.aadhaarHint")} error={aadhaarErr}>
                <Input className={`${inputCls} tracking-[0.2em] font-mono`} inputMode="numeric" maxLength={14}
                  placeholder="1234 5678 9012"
                  value={formatAadhaar(aadhaarNumber)}
                  onChange={(e) => setAadhaarNumber(stripAadhaar(e.target.value))} />
              </Field>
              )}
            </FormGrid>
          </Section>

          <Section n={2} icon={User} title={t("reg.p1.personal")} onAutofill={testMode ? fillPersonal : undefined} autofillLabel={t("reg.test.fillSection")}>
            <FormGrid>
              <Field label={t("reg.p1.fullName")} required span={6} hint={t("reg.p1.fullNameHint")}>
                <MicInput value={fullName} onChange={setFullName} maxLength={120} />
              </Field>
              <Field label={t("reg.p1.dob")} required span={3}
                error={dateOfBirth && dateOfBirth > today() ? t("reg.err.dobFuture")
                     : dateOfBirth && dateOfBirth > maxDobForAdult() ? t("reg.err.dobMinAge") : null}>
                <Input className={inputCls} type="date" max={maxDobForAdult()} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </Field>
              <Field label={t("reg.p1.gender")} required span={3}>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t("reg.p1.male")}</SelectItem>
                    <SelectItem value="female">{t("reg.p1.female")}</SelectItem>
                    <SelectItem value="other">{t("common.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {on("fatherName") && (
                <Field label={t("reg.p1.father")} required={req("fatherName")} span={6}>
                  <MicInput value={fatherName} onChange={setFatherName} maxLength={120} />
                </Field>
              )}
              {on("motherName") && (
                <Field label={t("reg.p1.mother")} required={req("motherName")} span={6}>
                  <MicInput value={motherName} onChange={setMotherName} maxLength={120} />
                </Field>
              )}
              {on("disability") && (
              <Field label={t("reg.p1.disability")} required={req("disability")} span={3}>
                <Select value={disabilityStatus} onValueChange={setDisabilityStatus}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{t("common.no")}</SelectItem>
                    <SelectItem value="yes">{t("common.yes")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              )}
              {on("disability") && disabilityStatus === "yes" && (
                <Field label={t("reg.p1.disabilityType")} required span={5}>
                  <MicInput value={disabilityType} onChange={setDisabilityType} maxLength={200} />
                </Field>
              )}
            </FormGrid>
          </Section>

          <Section n={3} icon={Phone} title={t("reg.p1.contact")} onAutofill={testMode ? fillContact : undefined} autofillLabel={t("reg.test.fillSection")}>
            <FormGrid>
              {/* Country code: a candidate applying for their NEXT placement is
                  often already overseas, and a bare 10-digit box assumes they
                  are at home. */}
              <Field label={t("reg.p1.mobile")} required span={4} error={phoneErr}>
                <PhoneInput value={phone} onChange={setPhone} autoComplete="tel" />
              </Field>
              {on("whatsappNumber") && (
                <Field label={t("reg.p1.whatsapp")} required={req("whatsappNumber")} span={4} error={whatsappErr}>
                  <PhoneInput value={whatsappSame ? phone : whatsappNumber}
                    onChange={setWhatsappNumber} disabled={whatsappSame} />
                </Field>
              )}
              <Field label={t("reg.p1.email")} required span={4} error={emailErr}>
                <Input className={inputCls} type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              {on("whatsappNumber") && (
                <GridCheckbox checked={whatsappSame} onChange={setWhatsappSame} label={t("reg.p1.sameAsMobile")} />
              )}
            </FormGrid>
          </Section>

          <Section n={4} icon={MapPin} title={t("reg.p1.address")} onAutofill={testMode ? fillAddress : undefined} autofillLabel={t("reg.test.fillSection")}>
            <FormGrid>
              {on("homeTown") && (
                <Field label={t("reg.p1.homeTown")} required={req("homeTown")} span={4}>
                  <MicInput value={homeTown} onChange={setHomeTown} maxLength={80} />
                </Field>
              )}

              <GridHeading>{t("reg.p1.permanent")}</GridHeading>
              <Field label={t("reg.p1.line1")} required span={8}>
                <MicInput value={pAddr1} onChange={setPAddr1} maxLength={200} />
              </Field>
              <Field label={t("reg.p1.line2")} span={4}>
                <Input className={inputCls} maxLength={200} value={pAddr2} onChange={(e) => setPAddr2(e.target.value)} />
              </Field>
              <Field label={t("reg.p1.state")} required span={4}>
                <Select value={pState} onValueChange={(v) => { setPState(v); setPDistrict(""); }}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("reg.p1.district")} required span={4}>
                {pState === "Himachal Pradesh" ? (
                  <Select value={pDistrict} onValueChange={setPDistrict}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{HP_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input className={inputCls} maxLength={80} value={pDistrict} onChange={(e) => setPDistrict(e.target.value)} />
                )}
              </Field>
              <Field label={t("reg.p1.pin")} required span={3}
                error={pPin && pPin.length !== 6 ? t("reg.err.pin") : null}>
                <Input className={inputCls} inputMode="numeric" maxLength={6} value={pPin}
                  onChange={(e) => setPPin(e.target.value.replace(/\D/g, ""))} />
              </Field>

              {on("correspondenceAddress") && (
                <GridCheckbox checked={corrSame} onChange={setCorrSame} label={t("reg.p1.corrSame")} />
              )}

              {on("correspondenceAddress") && !corrSame && (
                <>
                  <GridHeading>{t("reg.p1.correspondence")}</GridHeading>
                  <Field label={t("reg.p1.line1")} required span={8}>
                    <MicInput value={cAddr1} onChange={setCAddr1} maxLength={200} />
                  </Field>
                  <Field label={t("reg.p1.line2")} span={4}>
                    <Input className={inputCls} maxLength={200} value={cAddr2} onChange={(e) => setCAddr2(e.target.value)} />
                  </Field>
                  <Field label={t("reg.p1.state")} required span={4}>
                    <Select value={cState} onValueChange={(v) => { setCState(v); setCDistrict(""); }}>
                      <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("reg.p1.district")} required span={4}>
                    {cState === "Himachal Pradesh" ? (
                      <Select value={cDistrict} onValueChange={setCDistrict}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{HP_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input className={inputCls} maxLength={80} value={cDistrict} onChange={(e) => setCDistrict(e.target.value)} />
                    )}
                  </Field>
                  <Field label={t("reg.p1.pin")} required span={3}
                    error={cPin && cPin.length !== 6 ? t("reg.err.pin") : null}>
                    <Input className={inputCls} inputMode="numeric" maxLength={6} value={cPin}
                      onChange={(e) => setCPin(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </>
              )}
            </FormGrid>
          </Section>
        </>
      )}
      {step === 1 && (
        <SkillsPage
          professions={professions} maxProfessions={maxProfessions} labelOf={labelOf}
          picked={picked} setPicked={setPicked}
          langs={langs} setLangs={setLangs} otherLangText={otherLangText} setOtherLangText={setOtherLangText}
          testMode={testMode} onFillTrades={fillTrades} onFillLanguages={fillLanguages}
        />
      )}

      {step === 2 && (
        <QualificationsPage
          picked={picked} setPicked={setPicked} profByKey={profByKey} labelOf={labelOf} noteOf={noteOf}
          eduLevel={eduLevel} setEduLevel={setEduLevel} eduBoard={eduBoard} setEduBoard={setEduBoard}
          eduInstitution={eduInstitution} setEduInstitution={setEduInstitution}
          eduYear={eduYear} setEduYear={setEduYear} eduPassed={eduPassed} setEduPassed={setEduPassed}
          testMode={testMode} onFillEducation={fillEducation} onFillTradeCard={fillTradeCard}
          on={on}
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

      {/* Pages 5 and 6 — deployment. Rendered only when this candidate has
          actually been selected and owes documents; see hasDeploymentStage. */}
      {step === 4 && hasDeploymentStage && <DocumentsPage />}
      {step === 5 && hasDeploymentStage && <CompliancePage profile={profileRes?.data} />}
    </RegisterShell>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────
function SkillsPage({
  professions, maxProfessions, labelOf, picked, setPicked, langs, setLangs, otherLangText, setOtherLangText,
  testMode, onFillTrades, onFillLanguages,
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
        <div className="flex items-start justify-between gap-3 mb-4">
          <p className="text-sm text-slate-500">{t("reg.p2.pickHint", { max: maxProfessions })}</p>
          {testMode && onFillTrades && (
            <button type="button" onClick={onFillTrades}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-[12.5px] font-semibold px-2.5 h-8">
              <Wand2 className="w-3.5 h-3.5" /> {t("reg.test.fillSection")}
            </button>
          )}
        </div>
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

      <Section n={2} icon={Wrench} title={t("reg.p2.languages")} onAutofill={testMode ? onFillLanguages : undefined} autofillLabel={t("reg.test.fillSection")} hint={t("reg.p2.languagesHint")}>
        <div className="space-y-2.5">
          {LANGS.map((lang) => {
            const row = langs.find((l: any) => l.language === lang);
            return (
              <div key={lang} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setLangs(row
                    ? langs.filter((l: any) => l.language !== lang)
                    : [...langs, { language: lang, proficiency: "intermediate", writtenProficiency: "intermediate" }])}
                  className={`rounded-lg border-2 px-4 h-11 text-sm font-semibold min-w-[112px] text-left transition-all ${
                    row ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                  {lang}
                </button>
                {/* Speaking and writing asked separately: the two genuinely
                    diverge for this workforce. A mason may speak workable Hindi
                    and Arabic and write neither; a nurse needs written English
                    for charting. One combined level told an employer nothing
                    about which they were getting. */}
                {row && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 w-14 shrink-0">{t("reg.lang.speak")}</span>
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
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 w-14 shrink-0">{t("reg.lang.write")}</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {["none", ...LANG_LEVELS].map((lv) => (
                          <button key={lv} type="button"
                            onClick={() => setLangs(langs.map((l: any) => l.language === lang ? { ...l, writtenProficiency: lv } : l))}
                            className={`rounded-lg px-3 h-9 text-xs font-medium transition-all ${
                              (row.writtenProficiency ?? row.proficiency) === lv ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                            {lv === "none" ? t("reg.lang.cannotWrite") : t(`reg.lang.${lv}`)}
                          </button>
                        ))}
                      </div>
                    </div>
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
  testMode, onFillEducation, onFillTradeCard, on,
}: any) {
  const { t } = useTranslation();
  const patch = (k: string, p: Partial<PickedProfession>) =>
    setPicked(picked.map((x: PickedProfession) => x.professionKey === k ? { ...x, ...p } : x));

  // School boards for Class 5–12; universities / technical boards for
  // ITI / Diploma / Degree. A stored value that is in neither list is a
  // free-text "Other" entry, so the field re-opens in that mode on return.
  const isSchool = SCHOOL_LEVELS.includes(eduLevel);
  const boardOptions = isSchool ? SCHOOL_BOARDS : HIGHER_INSTITUTIONS;
  const boardIsCustom = Boolean(eduBoard) && !boardOptions.includes(eduBoard);
  const boardLabel = isSchool ? t("reg.p3.board") : t("reg.p3.institution2");

  return (
    <>
      <Section n={1} icon={GraduationCap} title={t("reg.p3.education")} onAutofill={testMode ? onFillEducation : undefined} autofillLabel={t("reg.test.fillSection")} hint={t("reg.p3.educationHint")}>
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
              {on("eduBoard") && (
              <div>
                <Label className="text-sm font-medium text-slate-700">{boardLabel}</Label>
                <Select
                  value={boardIsCustom ? OTHER_SENTINEL : eduBoard}
                  onValueChange={(v) => setEduBoard(v === OTHER_SENTINEL ? " " : v)}>
                  <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {boardOptions.map((b) => (
                      <SelectItem key={b} value={b === "Other" ? OTHER_SENTINEL : b}>
                        {b === "Other" ? t("reg.p3.boardOther") : b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* "Other" -> type it in. eduBoard is briefly " " (a marker the
                    Select reads as Other) until they type the real name. */}
                {(boardIsCustom || eduBoard === " ") && (
                  <Input className="h-11 mt-2" maxLength={120}
                    placeholder={isSchool ? t("reg.p3.boardOtherPh") : t("reg.p3.institutionOtherPh")}
                    value={eduBoard.trim()} onChange={(e) => setEduBoard(e.target.value)} autoFocus />
                )}
              </div>
              )}
              {on("eduInstitution") && (
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.institution")}</Label>
                <Input className="h-11 mt-1.5" maxLength={120} value={eduInstitution} onChange={(e) => setEduInstitution(e.target.value)} />
              </div>
              )}
              {on("eduYear") && (
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reg.p3.year")}</Label>
                <Input className="h-11 mt-1.5" type="number" min={1950} max={new Date().getFullYear()}
                  value={eduYear} onChange={(e) => setEduYear(e.target.value ? Number(e.target.value) : "")} />
              </div>
              )}
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
              <h3 className="text-lg font-bold text-slate-900 flex-1">
                {x.professionKey === "other" ? x.otherLabel : labelOf(prof)}
              </h3>
              {testMode && onFillTradeCard && (
                <button type="button" onClick={() => onFillTradeCard(x.professionKey)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-[12.5px] font-semibold px-2.5 h-8">
                  <Wand2 className="w-3.5 h-3.5" /> {t("reg.test.fillSection")}
                </button>
              )}
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
                  {/* audit 2026-07-06 (Batch 3): icon-only controls need an
                      aria-label or a screen reader announces just "button". */}
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                    aria-label={t("reg.p3.less6")}
                    onClick={() => patch(x.professionKey, { experienceMonths: Math.max(0, x.experienceMonths - 6) })}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input className="h-11 w-24 text-center" type="number" min={0} max={600} value={x.experienceMonths}
                    aria-label={t("reg.p3.months")}
                    onChange={(e) => patch(x.professionKey, { experienceMonths: Math.min(600, Math.max(0, Number(e.target.value) || 0)) })} />
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                    aria-label={t("reg.p3.more6")}
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
