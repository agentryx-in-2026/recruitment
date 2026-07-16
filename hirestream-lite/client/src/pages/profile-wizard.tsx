import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  User, GraduationCap, Briefcase, Globe, FileText,
  Plus, Trash2, Upload, CheckCircle, AlertCircle,
  Lightbulb, Loader2, ArrowLeft, ArrowRight, Check, Home,
  X, Search, MapPin, Mail, Phone, Building, Calendar,
  Award, Sparkles, Shield, Star, Eye, EyeOff
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HP_DISTRICTS, INDIAN_STATES, DESTINATION_COUNTRIES, SKILL_CATEGORIES, ALL_SKILLS, JOB_CATEGORIES, QUALIFICATION_LEVELS, EDUCATION_OPTIONS, EDU_TYPE_COPY, EDU_OTHER, jobCategoryLabel } from "@/lib/reference-data";
import { normalizeQualification } from "@shared/education";
import { formatAadhaar, stripAadhaar, isValidAadhaar } from "@shared/aadhaar";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const STEPS = [
  { key: "basic", label: "Personal Info", icon: User, color: "from-blue-500 to-blue-600", bg: "bg-blue-50", ring: "ring-blue-200", text: "text-blue-700" },
  { key: "education", label: "Education", icon: GraduationCap, color: "from-violet-500 to-violet-600", bg: "bg-violet-50", ring: "ring-violet-200", text: "text-violet-700" },
  { key: "experience", label: "Experience", icon: Briefcase, color: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700" },
  { key: "skills", label: "Skills & Prefs", icon: Globe, color: "from-amber-500 to-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700" },
  { key: "documents", label: "Documents", icon: FileText, color: "from-rose-500 to-rose-600", bg: "bg-rose-50", ring: "ring-rose-200", text: "text-rose-700" },
];

// Animation variants
const pageVariants = {
  initial: { opacity: 0, x: 40, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, x: -40, scale: 0.98, transition: { duration: 0.3 } },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function ProfileWizard() {
  // Honor ?step=N from the dashboard smart CTA
  const initialStep = (() => {
    const raw = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("step");
    const n = raw ? parseInt(raw, 10) - 1 : NaN;
    return Number.isFinite(n) && n >= 0 && n < 5 ? n : 0;
  })();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileRes } = useQuery({
    queryKey: ["/api/v1/candidates/profile"],
    queryFn: () => fetchJson("/api/v1/candidates/profile"),
  });
  const { data: completionRes } = useQuery({
    queryKey: ["/api/v1/candidates/profile/completion"],
    queryFn: () => fetchJson("/api/v1/candidates/profile/completion"),
  });

  const profile = profileRes?.data || {};
  const completion = completionRes?.data || { percentage: 0, checks: [] };
  const currentStepData = STEPS[currentStep];

  // audit 2026-07-06 (C3): steps keep typed fields in local state and only
  // persist on "Save & Continue" — a step-pill jump silently discarded them.
  // Track dirtiness with a capture-phase input listener on the step body and
  // confirm before a pill jump leaves unsaved input behind.
  const dirtyRef = useRef(false);
  const goTo = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    dirtyRef.current = false;
  };
  const goToViaPill = (step: number) => {
    if (step === currentStep) return;
    if (dirtyRef.current && !window.confirm("You have unsaved changes on this step. Leave without saving?")) return;
    goTo(step);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back to Dashboard */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 mb-8 group transition-colors"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Dashboard
        </motion.button>

        {/* Hero Header with gradient */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 p-6 md:p-8 mb-8 shadow-xl shadow-blue-900/10"
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-40" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Complete Your Profile</h1>
              <p className="text-blue-100 text-sm mt-1.5">Each section improves your match scores and visibility to overseas recruiters</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center">
                <p className="text-3xl font-bold text-white tabular-nums">{completion.percentage}<span className="text-lg text-blue-200">%</span></p>
                <p className="text-[11px] text-blue-200 font-medium">Complete</p>
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="relative mt-5">
            <div className="h-2 bg-white/15 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-white/90 to-blue-200 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completion.percentage}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.div>

        {/* Step Navigation — large, premium pill-style */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.15 } }}
          className="flex items-center gap-0 mb-8 bg-white rounded-2xl border border-slate-200/80 p-2 shadow-sm overflow-x-auto"
        >
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const isCurrent = i === currentStep;
            const checkStatus = completion.checks?.find((c: any) => {
              if (step.key === "basic") return ["fullName", "email", "phone", "location"].includes(c.name);
              if (step.key === "education") return c.name === "education";
              if (step.key === "experience") return c.name === "experience";
              if (step.key === "skills") return c.name === "skills";
              if (step.key === "documents") return c.name === "documents";
              return false;
            });
            const stepDone = step.key === "basic"
              ? completion.checks?.filter((c: any) => ["fullName", "email", "phone", "location"].includes(c.name)).every((c: any) => c.done)
              : checkStatus?.done;

            return (
              <button
                key={step.key}
                onClick={() => goToViaPill(i)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center ${
                  isCurrent
                    ? `bg-gradient-to-r ${step.color} text-white shadow-lg shadow-blue-500/20`
                    : stepDone
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCurrent ? "bg-white/20" : stepDone ? "bg-emerald-200" : "bg-slate-200/50"
                }`}>
                  {stepDone && !isCurrent ? <Check className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                </div>
                <span className="hidden md:inline">{step.label}</span>
              </button>
            );
          })}
        </motion.div>

        {/* Step Content — animated */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="bg-white rounded-2xl border border-slate-200/80 shadow-lg shadow-slate-900/[0.04] overflow-hidden"
          >
            {/* Step color bar at top */}
            <div className={`h-1.5 bg-gradient-to-r ${currentStepData.color}`} />

            {/* audit 2026-07-06 (C3): mark the step dirty on any typed input */}
            <div className="p-6 md:p-8" onInputCapture={() => { dirtyRef.current = true; }}>
              {currentStep === 0 && <BasicInfoStep profile={profile} onNext={() => goTo(1)} />}
              {currentStep === 1 && <EducationStep onNext={() => goTo(2)} onBack={() => goTo(0)} />}
              {currentStep === 2 && <ExperienceStep onNext={() => goTo(3)} onBack={() => goTo(1)} />}
              {currentStep === 3 && <SkillsStep profile={profile} onNext={() => goTo(4)} onBack={() => goTo(2)} />}
              {currentStep === 4 && <DocumentsStep onBack={() => goTo(3)} onFinish={() => setLocation("/")} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Premium Section Header ──────────────────────────────────────────
function SectionHeader({ icon: Icon, color, title, subtitle }: {
  icon: React.ElementType; color: string; title: string; subtitle: string;
}) {
  return (
    <motion.div variants={fadeUp} className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Hint ─────────────────────────────────────────────────────────────
function Hint({ text }: { text: string }) {
  return (
    <motion.div variants={fadeUp} className="flex items-start gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 mb-6">
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lightbulb className="w-4 h-4 text-amber-600" />
      </div>
      <p className="text-sm text-amber-800 leading-relaxed">{text}</p>
    </motion.div>
  );
}

// ── Resume Parse Widget (AI-assisted profile fill) ──────────────────
function ResumeParseWidget({ onApply }: { onApply: (parsed: any) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const parse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data.extracted);
      } else {
        toast({ title: "Parse failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Parse failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    toast({ title: "Applied!", description: `Added ${result.skills?.length || 0} skills, ${result.preferredCountries?.length || 0} countries` });
    setOpen(false);
    setText("");
    setResult(null);
  };

  return (
    <motion.div variants={fadeUp} className="bg-gradient-to-br from-indigo-50 via-purple-50/60 to-pink-50/40 border border-indigo-200/50 rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900">AI Resume Parser</p>
            <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]">Smart</Badge>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">Paste your resume text — we'll extract skills, experience, degrees, and country preferences automatically.</p>
          {!open ? (
            <Button size="sm" onClick={() => setOpen(true)}
              className="mt-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Parse Resume
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <textarea
                className="w-full min-h-[140px] p-3 border border-indigo-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                placeholder="Paste your resume text here (or use plain CV content)..."
                value={text} onChange={e => setText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={parse} disabled={!text.trim() || loading}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Sparkles className="w-3.5 h-3.5 mr-1" /> Parse</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setOpen(false); setText(""); setResult(null); }} className="rounded-lg text-xs">
                  Cancel
                </Button>
              </div>

              {result && (
                <div className="bg-white rounded-lg border border-indigo-200 p-3 space-y-2">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Extracted Data</p>
                  <div className="text-xs space-y-1.5">
                    {result.name && <p><span className="text-slate-500">Name:</span> <span className="font-semibold">{result.name}</span></p>}
                    {result.experience != null && <p><span className="text-slate-500">Experience:</span> <span className="font-semibold">{result.experience} years</span></p>}
                    {result.degrees?.length > 0 && (
                      <p><span className="text-slate-500">Degrees:</span> <span className="font-semibold">{result.degrees.join(", ")}</span></p>
                    )}
                    {result.skills?.length > 0 && (
                      <div>
                        <p className="text-slate-500 mb-1">Skills ({result.skills.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {result.skills.slice(0, 15).map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700">{s}</Badge>
                          ))}
                          {result.skills.length > 15 && <Badge variant="outline" className="text-[10px]">+{result.skills.length - 15}</Badge>}
                        </div>
                      </div>
                    )}
                    {result.preferredCountries?.length > 0 && (
                      <p><span className="text-slate-500">Countries:</span> <span className="font-semibold">{result.preferredCountries.join(", ")}</span></p>
                    )}
                  </div>
                  <Button size="sm" onClick={apply}
                    className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-xs mt-2">
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Apply to Profile
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Premium Input Field ─────────────────────────────────────────────
function FormField({ label, required, icon: Icon, children, hint }: {
  label: string; required?: boolean; icon?: React.ElementType; children: React.ReactNode; hint?: string;
}) {
  // Plain div — no motion variants. Previous version relied on a parent
  // `variants={staggerContainer}` that doesn't propagate through
  // AnimatePresence branches, leaving fields stuck at opacity 0.
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        {label}
        {required && <span className="text-red-500 text-xs">*</span>}
      </Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />}
        {children}
      </div>
      {hint && <p className="text-xs text-slate-400 pl-1">{hint}</p>}
    </div>
  );
}

// ── Nav Buttons ──────────────────────────────────────────────────────
function StepNav({ onBack, onNext, nextLabel = "Save & Continue", loading = false, disabled = false }: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; loading?: boolean; disabled?: boolean;
}) {
  return (
    <motion.div variants={fadeUp} className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
      {onBack ? (
        <Button variant="outline" onClick={onBack} className="gap-2 h-11 px-5 rounded-xl border-slate-200 hover:bg-slate-50">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      ) : <div />}
      {onNext && (
        <Button
          onClick={onNext}
          disabled={disabled || loading}
          className="gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:-translate-y-0.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {nextLabel} {!loading && <ArrowRight className="w-4 h-4" />}
        </Button>
      )}
    </motion.div>
  );
}

// ── Step 1: Basic Info ───────────────────────────────────────────────
function BasicInfoStep({ profile, onNext }: { profile: any; onNext: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile.fullName || "");
  const [email, setEmail] = useState(profile.email || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [username, setUsername] = useState(profile.username || "");
  // Sex as per passport — needed for emigration compliance + matching.
  const [sex, setSex] = useState(profile.sex || "");
  // v0.4.31 (HPSEDC Item 4): family details
  const [fatherName, setFatherName] = useState(profile.fatherName || "");
  const [motherName, setMotherName] = useState(profile.motherName || "");
  // Current/postal address
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Himachal Pradesh");
  const [pinCode, setPinCode] = useState("");
  // v0.4.31 (HPSEDC Item 4): permanent address — distinct from current
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [permAddressLine1, setPermAddressLine1] = useState("");
  const [permAddressLine2, setPermAddressLine2] = useState("");
  const [permCity, setPermCity] = useState("");
  const [permPinCode, setPermPinCode] = useState("");
  // v0.4.31 (HPSEDC Item 4 gap A): surface passport + IELTS at top level so
  // HPSEDC testers (and real candidates) see them in the wizard instead of
  // buried in the Compliance panel later.
  const [aadhaarNumber, setAadhaarNumber] = useState(profile.aadhaarNumber || "");
  // UIDAI/DPDP: mask Aadhaar even on the owner's own edit field (shoulder-surfing
  // / screen-share). Show last 4 by default; reveal-to-edit via the eye toggle.
  const [revealAadhaar, setRevealAadhaar] = useState(false);
  const [passportNumber, setPassportNumber] = useState(profile.passportNumber || "");
  const [passportExpiry, setPassportExpiry] = useState(profile.passportExpiry || "");
  const [ecrStatus, setEcrStatus] = useState(profile.ecrStatus || "");
  const [ieltsBand, setIeltsBand] = useState(profile.ieltsBand || "");

  useEffect(() => {
    if (profile.fullName) setFullName(profile.fullName);
    if (profile.email) setEmail(profile.email);
    if (profile.phone) setPhone(profile.phone);
    if (profile.username) setUsername(profile.username);
    if (profile.sex) setSex(profile.sex);
    if (profile.fatherName) setFatherName(profile.fatherName);
    if (profile.motherName) setMotherName(profile.motherName);
    if (profile.location) {
      const parts = profile.location.split(",").map((s: string) => s.trim());
      if (parts.length >= 2) { setDistrict(parts[0]); setState(parts[1]); }
      else if (parts.length === 1) { setDistrict(parts[0]); }
    }
    if (profile.addressLine1) setAddressLine1(profile.addressLine1);
    if (profile.addressLine2) setAddressLine2(profile.addressLine2);
    if (profile.city) setCity(profile.city);
    if (profile.pinCode) setPinCode(profile.pinCode);
    if (profile.permanentAddressLine1) setPermAddressLine1(profile.permanentAddressLine1);
    if (profile.permanentAddressLine2) setPermAddressLine2(profile.permanentAddressLine2);
    if (profile.permanentCity) setPermCity(profile.permanentCity);
    if (profile.permanentPinCode) setPermPinCode(profile.permanentPinCode);
    if (profile.aadhaarNumber) setAadhaarNumber(profile.aadhaarNumber);
    if (profile.passportNumber) setPassportNumber(profile.passportNumber);
    if (profile.passportExpiry) setPassportExpiry(profile.passportExpiry);
    if (profile.ecrStatus) setEcrStatus(profile.ecrStatus);
    if (profile.ieltsBand != null) setIeltsBand(String(profile.ieltsBand));
  }, [profile]);

  // When "same as current" is checked, mirror the current address into perm.
  // Effect runs whenever the toggle flips on or the current address changes.
  useEffect(() => {
    if (sameAsCurrent) {
      setPermAddressLine1(addressLine1);
      setPermAddressLine2(addressLine2);
      setPermCity(city);
      setPermPinCode(pinCode);
    }
  }, [sameAsCurrent, addressLine1, addressLine2, city, pinCode]);

  const location = [district, state].filter(Boolean).join(", ");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/candidates/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, email, phone, location, username: username || undefined,
          sex: sex || null,
          fatherName: fatherName || null,
          motherName: motherName || null,
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          pinCode: pinCode || null,
          permanentAddressLine1: permAddressLine1 || null,
          permanentAddressLine2: permAddressLine2 || null,
          permanentCity: permCity || null,
          permanentPinCode: permPinCode || null,
          // Only persist a complete, checksum-valid Aadhaar; anything else saves
          // null (the Save button is also blocked while an invalid one is present).
          aadhaarNumber: (aadhaarNumber.length === 12 && isValidAadhaar(aadhaarNumber)) ? aadhaarNumber : null,
          passportNumber: passportNumber || null,
          passportExpiry: passportExpiry || null,
          ecrStatus: ecrStatus || null,
          // ielts_band is a decimal column → send as string (schema also
          // coerces defensively, but keep the client honest).
          ieltsBand: ieltsBand ? String(ieltsBand) : null,
        }),
      });
      if (!res.ok) {
        // Surface the server's field-level message instead of a generic
        // throw — a silent failure here (no onError) is exactly what hid
        // the ieltsBand type bug and made "Save does nothing" so confusing.
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.message || err?.error?.message || "Failed to save personal info");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      toast({ title: "Personal info saved" });
      onNext();
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <SectionHeader icon={User} color="from-blue-500 to-blue-600" title="Personal Information" subtitle="Basic details that help agencies identify and contact you" />
      <Hint text="Fill in your complete details. Agencies search candidates by location, so accuracy matters." />

      {/* Identity Section */}
      <motion.div variants={fadeUp} className="bg-gradient-to-br from-blue-50/80 to-indigo-50/40 rounded-xl border border-blue-100/60 p-5 mb-6">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2">
          <User className="w-4 h-4" /> Identity Details
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label="Full Name" required icon={User}>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full legal name" maxLength={100}
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
          </FormField>
          <FormField label="Email" required icon={Mail}>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" maxLength={120}
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
          </FormField>
          <FormField label="Username" icon={User} hint="Your unique login ID">
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. mobiletest"
              maxLength={60}
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </FormField>
          <FormField label="Phone Number" icon={Phone} hint="Digits only (optionally with +country code, spaces, or dashes)">
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              inputMode="tel"
              pattern="^\+?[0-9][0-9\s\-]{5,18}[0-9]$"
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
            {phone && !/^\+?[0-9][0-9\s\-]{5,18}[0-9]$/.test(phone) && (
              <p className="text-[11px] text-red-600 mt-1 pl-2">Phone must be digits only.</p>
            )}
          </FormField>
          {/* Gender as per passport — emigration compliance + matching.
              UAT-03 Item 1: label "Sex" → "Gender" (field/column stays `sex`). */}
          <FormField label="Gender (as per passport)" required icon={User} hint="Required for visa & emigration paperwork">
            <select value={sex} onChange={e => setSex(e.target.value)}
              className="pl-11 h-12 w-full rounded-xl border border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none">
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          {/* v0.4.31 (HPSEDC Item 4): Father / Mother names */}
          <FormField label="Father's Name" required icon={User} hint="As on passport / official records">
            <Input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Father's full name" maxLength={100}
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
          </FormField>
          <FormField label="Mother's Name" required icon={User} hint="As on passport / official records">
            <Input value={motherName} onChange={e => setMotherName(e.target.value)} placeholder="Mother's full name" maxLength={100}
              className="pl-11 h-12 rounded-xl border-blue-200/80 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
          </FormField>
        </div>
      </motion.div>

      {/* Correspondence (current/postal) Address — UAT-03 Item 3: "Address" →
          "Correspondence Address". The Permanent Address section stays as-is. */}
      <motion.div variants={fadeUp} className="bg-gradient-to-br from-emerald-50/80 to-teal-50/40 rounded-xl border border-emerald-100/60 p-5">
        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Correspondence Address
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Address Line 1">
              <Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="House/Flat No., Street, Colony" maxLength={200}
                className="h-12 rounded-xl border-emerald-200/80 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
            </FormField>
            <FormField label="Address Line 2">
              <Input value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Landmark, Area (optional)" maxLength={200}
                className="h-12 rounded-xl border-emerald-200/80 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="City / Town">
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Shimla" maxLength={80}
                className="h-12 rounded-xl border-emerald-200/80 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
            </FormField>
            <FormField label="State">
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="h-12 rounded-xl border-emerald-200/80 bg-white"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="PIN Code">
              <Input value={pinCode} inputMode="numeric" onChange={e => setPinCode(e.target.value.replace(/\D/g, ""))} placeholder="171001" maxLength={6}
                className="h-12 rounded-xl border-emerald-200/80 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
            </FormField>
          </div>
          <div>
            <FormField label="District" required>
              {state === "Himachal Pradesh" ? (
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger className="h-12 rounded-xl border-emerald-200/80 bg-white">
                    <MapPin className="w-4 h-4 mr-2 text-emerald-500" /><SelectValue placeholder="Select HP district" />
                  </SelectTrigger>
                  <SelectContent>
                    {HP_DISTRICTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={district} onChange={e => setDistrict(e.target.value)} placeholder="Enter your district" maxLength={80}
                  className="h-12 rounded-xl border-emerald-200/80 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
              )}
            </FormField>
            {state === "Himachal Pradesh" && (
              <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1.5 ml-1">
                <Shield className="w-3.5 h-3.5" /> All 12 HP districts from LGD (Local Government Directory)
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* v0.4.31 (HPSEDC Item 4): Permanent Address — distinct from
          current. Visa, PCC, and emigration paperwork need both. */}
      <motion.div variants={fadeUp} className="bg-gradient-to-br from-amber-50/80 to-orange-50/40 rounded-xl border border-amber-100/60 p-5 mt-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Permanent Address
          </p>
          <label className="text-xs text-amber-800 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={sameAsCurrent} onChange={(e) => setSameAsCurrent(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-amber-300" />
            Same as current address
          </label>
        </div>
        <div className={`space-y-4 ${sameAsCurrent ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Address Line 1">
              <Input value={permAddressLine1} onChange={e => setPermAddressLine1(e.target.value)} placeholder="House/Flat No., Street, Colony" maxLength={200}
                disabled={sameAsCurrent}
                className="h-12 rounded-xl border-amber-200/80 bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all" />
            </FormField>
            <FormField label="Address Line 2">
              <Input value={permAddressLine2} onChange={e => setPermAddressLine2(e.target.value)} placeholder="Landmark, Area (optional)" maxLength={200}
                disabled={sameAsCurrent}
                className="h-12 rounded-xl border-amber-200/80 bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="City / Town">
              <Input value={permCity} onChange={e => setPermCity(e.target.value)} placeholder="e.g. Shimla" maxLength={80}
                disabled={sameAsCurrent}
                className="h-12 rounded-xl border-amber-200/80 bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all" />
            </FormField>
            <FormField label="PIN Code">
              <Input value={permPinCode} inputMode="numeric" onChange={e => setPermPinCode(e.target.value.replace(/\D/g, ""))} placeholder="171001" maxLength={6}
                disabled={sameAsCurrent}
                className="h-12 rounded-xl border-amber-200/80 bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all" />
            </FormField>
          </div>
        </div>
      </motion.div>

      {/* v0.4.31 (HPSEDC Item 4 gap A): Identity & Travel — surface
          passport, ECR, IELTS at top level. Existed before but lived
          in the Compliance panel that testers didn't reach. */}
      <motion.div variants={fadeUp} className="bg-gradient-to-br from-indigo-50/80 to-violet-50/40 rounded-xl border border-indigo-100/60 p-5 mt-6">
        <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Identity &amp; Travel
        </p>
        <p className="text-[11px] text-indigo-600 mb-4">Optional now, mandatory before any overseas placement. Filling these early speeds up offer-acceptance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label="Aadhaar Number" hint="12 digits, as printed on your Aadhaar. Optional; helps HPSEDC verify you.">
            <div className="relative">
              {/* Masked by default (UIDAI/DPDP — shoulder-surfing); eye reveals to
                  edit. Shown grouped "1234 5678 9012" when revealed. */}
              <Input inputMode="numeric" type={revealAadhaar ? "text" : "password"} autoComplete="off"
                value={formatAadhaar(aadhaarNumber)} maxLength={14}
                onChange={e => setAadhaarNumber(stripAadhaar(e.target.value))} placeholder="1234 5678 9012"
                className="h-12 rounded-xl border-indigo-200/80 bg-white tracking-widest pr-11 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
              {aadhaarNumber.length > 0 && (
                <button type="button" onClick={() => setRevealAadhaar(v => !v)}
                  aria-label={revealAadhaar ? "Hide Aadhaar number" : "Show Aadhaar number"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {revealAadhaar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            {aadhaarNumber.length > 0 && aadhaarNumber.length !== 12 && (
              <p className="mt-1 text-xs text-amber-600">Aadhaar must be 12 digits.</p>
            )}
            {aadhaarNumber.length === 12 && !isValidAadhaar(aadhaarNumber) && (
              <p className="mt-1 text-xs text-rose-600">This Aadhaar number is not valid. Please check and re-enter.</p>
            )}
          </FormField>
          <FormField label="Passport Number" hint="Letters and digits, as printed on the data page">
            <Input value={passportNumber} onChange={e => setPassportNumber(e.target.value.toUpperCase())} placeholder="e.g. M1234567" maxLength={20}
              className="h-12 rounded-xl border-indigo-200/80 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
          </FormField>
          <FormField label="Passport Expiry">
            <Input type="date" value={passportExpiry || ""} onChange={e => setPassportExpiry(e.target.value)}
              className="h-12 rounded-xl border-indigo-200/80 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
          </FormField>
          <FormField label="ECR / Non-ECR" hint="Emigration Check Required status (visible in passport)">
            <Select value={ecrStatus || "unset"} onValueChange={(v) => setEcrStatus(v === "unset" ? "" : v)}>
              <SelectTrigger className="h-12 rounded-xl border-indigo-200/80 bg-white"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Don't know / not specified</SelectItem>
                <SelectItem value="ecr">ECR — Emigration Check Required</SelectItem>
                <SelectItem value="ecnr">ECNR / Non-ECR</SelectItem>
                <SelectItem value="unknown">Not on passport</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="IELTS Overall Band" hint="Required for UK / Australia / NZ / Canada / Ireland; leave empty if not taken">
            <Input type="number" step="0.5" min="0" max="9" value={ieltsBand || ""} onChange={e => setIeltsBand(e.target.value)} placeholder="e.g. 6.5"
              className="h-12 rounded-xl border-indigo-200/80 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
          </FormField>
        </div>
      </motion.div>

      {/* UAT-03 Item 4: Identity section is mandatory — Gender + Father's +
          Mother's name are required to continue past this step. */}
      <StepNav onNext={() => mutation.mutate()} loading={mutation.isPending} disabled={!fullName || !email || !sex || !fatherName.trim() || !motherName.trim() || (aadhaarNumber.length > 0 && !isValidAadhaar(aadhaarNumber))} />
    </motion.div>
  );
}

// ── Step 2: Education ────────────────────────────────────────────────
function EducationStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  // v0.4.33 (Phase 3, HPSEDC Item 5): explicit education type so the
  // wizard can group entries into Schooling / Higher-Ed / Certs and the
  // matching engine knows what "Qualification" the candidate has.
  const [type, setType] = useState("university");
  const [degree, setDegree] = useState(""); const [institution, setInstitution] = useState("");
  // Escape hatch from the canonical picker. Each type has its own option list,
  // so switching type must clear both — a degree picked under "Diploma" is not
  // a valid value under "Skill Course".
  const [degreeIsOther, setDegreeIsOther] = useState(false);
  const [board, setBoard] = useState(""); const [subject, setSubject] = useState("");
  const [year, setYear] = useState(""); const [percentage, setPercentage] = useState("");
  // UAT-03 Item 7: affiliating university/body, distinct from `institution`
  // (the school/college name). UAT-03 Item 6: whether the qualification was
  // passed (default true — most entries are completed qualifications).
  const [university, setUniversity] = useState(""); const [isPassed, setIsPassed] = useState(true);

  const { data: eduRes, isLoading } = useQuery({
    queryKey: ["/api/v1/candidates/education"], queryFn: () => fetchJson("/api/v1/candidates/education"),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/candidates/education", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degree, institution, year: parseInt(year) || null, percentage,
          type, board: board || null, subject: subject || null,
          university: university || null, isPassed,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Failed to add education"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      setAdding(false); setDegree(""); setInstitution(""); setYear(""); setPercentage("");
      setBoard(""); setSubject(""); setType("university"); setUniversity(""); setIsPassed(true);
      toast({ title: "Education added" });
    },
    // UAT-03 Item 5: surface the duplicate-entry (409) message.
    onError: (e: any) => toast({ title: e.message || "Could not add education", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/v1/candidates/education/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/education"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
    },
  });

  const records = eduRes?.data || [];

  // UAT-03 #5: the whole point of a fixed list is that it can't produce a
  // duplicate — so an option the candidate already holds must not be offered.
  // Matched on the SHARED normaliser the server's 409 uses, so the list can
  // never offer something the save would then reject. Compared across all
  // types, because that's the identity rule the server enforces.
  const takenQualifications = new Set(
    records.map((r: any) => normalizeQualification(r.degree)).filter(Boolean),
  );
  const availableOptions = (EDUCATION_OPTIONS[type] ?? []).filter(
    (o) => !takenQualifications.has(normalizeQualification(o)),
  );

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <SectionHeader icon={GraduationCap} color="from-violet-500 to-violet-600" title="Education" subtitle="Add your academic qualifications — at least one is required" />
      <Hint text="Candidates with education details get 2x more views from recruiters. Include your highest qualification first." />

      {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-8 text-violet-500" /> : (
        <>
          {/* Existing records */}
          {records.length > 0 && (
            <motion.div variants={fadeUp} className="space-y-3 mb-6">
              {records.map((edu: any, i: number) => (
                <motion.div
                  key={edu.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group flex items-center justify-between p-4 bg-gradient-to-r from-violet-50/80 to-purple-50/40 rounded-xl border border-violet-100/60 hover:shadow-md hover:shadow-violet-100/50 transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center shrink-0 shadow-inner">
                      <GraduationCap className="w-6 h-6 text-violet-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 truncate">{edu.degree}</p>
                      <p className="text-xs text-slate-500 truncate">{edu.institution}{edu.university ? ` · ${edu.university}` : ""}{edu.board ? ` · ${edu.board}` : ""}{edu.subject ? ` · ${edu.subject}` : ""}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {edu.type && (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 px-1.5 py-0 capitalize">
                            {String(edu.type).replace(/_/g, " ")}
                          </Badge>
                        )}
                        {edu.year && <Badge variant="outline" className="text-[10px] bg-white text-slate-600 border-slate-200 px-1.5 py-0">{edu.year}</Badge>}
                        {edu.percentage && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0">{edu.percentage}%</Badge>}
                        {edu.isPassed === false && <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 px-1.5 py-0">Not passed</Badge>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(edu.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Add form */}
          <AnimatePresence mode="wait">
            {adding ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-gradient-to-br from-violet-50 to-purple-50/50 border border-violet-200/60 rounded-xl p-6 space-y-5">
                  <p className="text-sm font-bold text-violet-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Education Record
                  </p>
                  {/* Type picker — drives which optional fields show below */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { v: "school",        label: "Schooling (10th / 12th)" },
                      { v: "university",    label: "Higher Education (degree)" },
                      { v: "diploma",       label: "Diploma" },
                      { v: "certification", label: "Certification" },
                      // UAT-03 #9 (2026-07-16): was "Skill Course". A *skill*
                      // (carpentry, welding) isn't education and is captured on
                      // the Skills step — the old name invited people to file it
                      // here twice. This type is the credential: a course you
                      // attended and completed.
                      { v: "course",        label: "Certificate Course" },
                    ].map((opt) => (
                      <button key={opt.v} type="button"
                        onClick={() => { setType(opt.v); setDegree(""); setDegreeIsOther(false); }}
                        className={`text-[11px] px-2.5 py-1.5 rounded-md border transition ${
                          type === opt.v
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-violet-400"
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {/* UAT-03 Item 9: differentiate Certification vs Skill Course. */}
                  {(type === "certification" || type === "course") && (
                    <p className="text-[11px] text-violet-600/90 bg-violet-100/50 border border-violet-200/60 rounded-lg px-3 py-2">
                      {type === "certification"
                        ? "Certification = someone examined you and issued a credential, usually with an ID that can expire — NCVT/NSDC trade cert, welder/electrician/driver licence, nursing council registration, AWS, CCNA, PMP."
                        : "Certificate course = training you attended and completed, with no exam body behind it — a 3-month NIELIT computer course, a first-aid or industrial-safety workshop. If an authority tested you and issued an ID, use Certification instead. The skills themselves (carpentry, welding) belong on the Skills step, not here."}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* UAT-03 #5/#8: pick from a canonical list instead of typing.
                        Stream/trade/specialisation goes in Subject/Field below —
                        keeping it out of the qualification name is what stops
                        "12th" and "12th (Science)" becoming two entries. */}
                    <FormField label={EDU_TYPE_COPY[type]?.field ?? "Qualification"} required icon={Award}>
                      {degreeIsOther ? (
                        <div className="flex gap-2">
                          <Input value={degree} onChange={e => setDegree(e.target.value)} autoFocus
                            placeholder={`Type the ${(EDU_TYPE_COPY[type]?.field ?? "qualification").toLowerCase()}`}
                            maxLength={100}
                            className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                          <button type="button" onClick={() => { setDegreeIsOther(false); setDegree(""); }}
                            className="shrink-0 text-[11px] px-3 rounded-xl border border-violet-200 text-violet-700 hover:bg-violet-50">
                            Pick from list
                          </button>
                        </div>
                      ) : (
                        <Select
                          value={degree || undefined}
                          onValueChange={(v) => { if (v === EDU_OTHER) { setDegreeIsOther(true); setDegree(""); } else setDegree(v); }}
                        >
                          <SelectTrigger className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white">
                            <SelectValue placeholder={availableOptions.length ? "Select…" : "All added — use Other…"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOptions.map((o) => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                            <SelectItem value={EDU_OTHER}>Other (type it in)…</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                    <FormField label={EDU_TYPE_COPY[type]?.institution ?? "Institution"} required icon={Building}>
                      <Input value={institution} onChange={e => setInstitution(e.target.value)}
                        placeholder={EDU_TYPE_COPY[type]?.instPlaceholder ?? "Institute name"}
                        maxLength={100}
                        className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                    </FormField>
                    {type === "school" && (
                      <FormField label="Board" icon={Award}>
                        <Input value={board} onChange={e => setBoard(e.target.value)} placeholder="CBSE / ICSE / HPBSE / Cambridge" maxLength={100}
                          className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                      </FormField>
                    )}
                    {(type === "university" || type === "diploma" || type === "certification") && (
                      <FormField label="Subject / Field" icon={Award}>
                        <Input value={subject} onChange={e => setSubject(e.target.value)}
                          placeholder={type === "certification" ? "Cloud / Networking / ..." : "Computer Science, Mechanical, ..."}
                          maxLength={100}
                          className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                      </FormField>
                    )}
                    {/* UAT-03 Item 7: affiliating University, distinct from the
                        Institution (college) name above. Shown for higher-ed. */}
                    {(type === "university" || type === "diploma") && (
                      <FormField label="University / Affiliating Body" icon={Building}>
                        <Input value={university} onChange={e => setUniversity(e.target.value)}
                          placeholder="e.g. HP University, IGNOU (leave blank if same as institution)"
                          maxLength={150}
                          className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                      </FormField>
                    )}
                    <FormField label="Year of Passing" icon={Calendar}>
                      <Input type="number" min={1950} max={new Date().getFullYear() + 1} value={year}
                        onChange={e => setYear(e.target.value)} placeholder="2024"
                        className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                    </FormField>
                    <FormField label="Percentage / CGPA" icon={Star}>
                      <Input type="number" min={0} max={100} step="0.01" value={percentage}
                        onChange={e => setPercentage(e.target.value)} placeholder="85.5 or 8.5"
                        className="pl-11 h-12 rounded-xl border-violet-200/80 bg-white" />
                    </FormField>
                  </div>
                  {/* UAT-03 Item 6: has this qualification been passed/completed? */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                    <input type="checkbox" checked={isPassed} onChange={e => setIsPassed(e.target.checked)}
                      className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500/30" />
                    <span className="text-sm text-slate-700">Passed / Completed
                      <span className="text-xs text-slate-400 ml-1">(uncheck if pursuing or not cleared)</span>
                    </span>
                  </label>
                  <div className="flex gap-3">
                    <Button onClick={() => addMutation.mutate()} disabled={!degree || !institution || addMutation.isPending}
                      className="gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white shadow-lg shadow-violet-500/25">
                      {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Education
                    </Button>
                    <Button variant="outline" onClick={() => setAdding(false)} className="rounded-xl">Cancel</Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="trigger"
                variants={fadeUp}
                onClick={() => setAdding(true)}
                className="w-full border-2 border-dashed border-violet-300/60 rounded-xl p-6 text-sm text-violet-500 hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50/50 transition-all flex items-center justify-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-medium">Add Education Record</span>
              </motion.button>
            )}
          </AnimatePresence>
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </motion.div>
  );
}

// ── Step 3: Experience ───────────────────────────────────────────────
function ExperienceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [company, setCompany] = useState(""); const [role, setRole] = useState("");
  const [years, setYears] = useState(""); const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");

  const { data: expRes, isLoading } = useQuery({
    queryKey: ["/api/v1/candidates/experience"], queryFn: () => fetchJson("/api/v1/candidates/experience"),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/candidates/experience", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, years: parseInt(years) || 0, country, description }),
      });
      if (!res.ok) throw new Error("Failed"); return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/experience"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      setAdding(false); setCompany(""); setRole(""); setYears(""); setCountry(""); setDescription("");
      toast({ title: "Experience added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/v1/candidates/experience/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/experience"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
    },
  });

  const records = expRes?.data || [];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <SectionHeader icon={Briefcase} color="from-emerald-500 to-emerald-600" title="Work Experience" subtitle="Add your work history — even internships and freelance count" />
      <Hint text="Add every relevant work experience — internships, freelance and contract roles all count. More detail helps recruiters assess fit." />

      {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-8 text-emerald-500" /> : (
        <>
          {records.length > 0 && (
            <motion.div variants={fadeUp} className="space-y-3 mb-6">
              {records.map((exp: any, i: number) => (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50/80 to-teal-50/40 rounded-xl border border-emerald-100/60 hover:shadow-md hover:shadow-emerald-100/50 transition-all"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shrink-0 shadow-inner">
                      <Briefcase className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 truncate">{exp.role}</p>
                      <p className="text-xs text-slate-600 font-medium truncate">{exp.company}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-600 border-slate-200 px-1.5 py-0">{exp.years} year{exp.years !== 1 ? "s" : ""}</Badge>
                        {exp.country && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 px-1.5 py-0">{exp.country}</Badge>}
                      </div>
                      {exp.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{exp.description}</p>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(exp.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {adding ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200/60 rounded-xl p-6 space-y-5">
                  <p className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Experience Record
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Company" required icon={Building}>
                      <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="TCS, Infosys..." maxLength={100}
                        className="pl-11 h-12 rounded-xl border-emerald-200/80 bg-white" />
                    </FormField>
                    <FormField label="Job Role" required icon={Briefcase}>
                      <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Developer, Nurse..." maxLength={80}
                        className="pl-11 h-12 rounded-xl border-emerald-200/80 bg-white" />
                    </FormField>
                    <FormField label="Years" icon={Calendar}>
                      <Input type="number" min={0} max={70} value={years} onChange={e => setYears(e.target.value)} placeholder="3"
                        className="pl-11 h-12 rounded-xl border-emerald-200/80 bg-white" />
                    </FormField>
                    <FormField label="Country" icon={Globe}>
                      <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="India, UAE..."
                        className="pl-11 h-12 rounded-xl border-emerald-200/80 bg-white" />
                    </FormField>
                  </div>
                  <div>
                    {/* UAT-03 Item 11: clearer, blue-collar-friendly guidance
                        (was a vague "Brief Description" with "Key responsibilities…"). */}
                    <Label className="text-sm font-semibold text-slate-700">What work did you do here? <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <p className="text-xs text-slate-500 mt-1">In simple words — for example: “Laid bricks and plastered walls”, “Drove a truck for deliveries”, “Cooked in a hotel kitchen”.</p>
                    <textarea
                      className="w-full mt-2 p-4 border border-emerald-200/80 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 min-h-[80px] transition-all"
                      value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Laid bricks, plastered walls, mixed cement"
                      maxLength={500}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={() => addMutation.mutate()} disabled={!company || !role || addMutation.isPending}
                      className="gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-500/25">
                      {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Experience
                    </Button>
                    <Button variant="outline" onClick={() => setAdding(false)} className="rounded-xl">Cancel</Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="trigger"
                variants={fadeUp}
                onClick={() => setAdding(true)}
                className="w-full border-2 border-dashed border-emerald-300/60 rounded-xl p-6 text-sm text-emerald-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-medium">Add Experience Record</span>
              </motion.button>
            )}
          </AnimatePresence>
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </motion.div>
  );
}

// ── Step 4: Skills & Preferences ─────────────────────────────────────
// UAT-03 Item 12: language proficiency — first-class for overseas placement.
const PROFICIENCY_LEVELS = [
  { v: "elementary", label: "Basic" },
  { v: "intermediate", label: "Conversational" },
  { v: "professional", label: "Fluent" },
  { v: "native", label: "Native" },
];
const COMMON_LANGUAGES = ["Hindi", "English", "Punjabi", "Pahari", "Nepali", "Urdu", "Arabic", "Malayalam"];

function LanguagesSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [language, setLanguage] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");

  const { data: langRes } = useQuery({
    queryKey: ["/api/v1/candidates/languages"], queryFn: () => fetchJson("/api/v1/candidates/languages"),
  });
  const records = langRes?.data || [];

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/candidates/languages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: language.trim(), proficiency }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] });
      setLanguage(""); setProficiency("intermediate");
      toast({ title: "Language added" });
    },
    onError: (e: any) => toast({ title: e.message || "Could not add language", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/v1/candidates/languages/${id}`, { method: "DELETE" }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/languages"] }),
  });

  return (
    <motion.div variants={fadeUp} className="bg-gradient-to-br from-sky-50/80 to-cyan-50/40 rounded-xl border border-sky-100/60 p-5">
      <p className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Globe className="w-4 h-4" /> Languages you speak
      </p>
      {records.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {records.map((l: any) => (
            <span key={l.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200/80">
              {l.language}
              <span className="text-sky-500">· {PROFICIENCY_LEVELS.find(p => p.v === l.proficiency)?.label || l.proficiency}</span>
              <button onClick={() => deleteMutation.mutate(l.id)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {COMMON_LANGUAGES.filter(l => !records.some((r: any) => r.language.toLowerCase() === l.toLowerCase())).map(l => (
          <button key={l} type="button" onClick={() => setLanguage(l)}
            className={`text-[11px] px-2.5 py-1 rounded-md border transition ${language === l ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-400"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Language (or tap above)" maxLength={60}
          className="h-11 rounded-xl border-sky-200/80 bg-white flex-1" />
        <select value={proficiency} onChange={e => setProficiency(e.target.value)}
          className="h-11 rounded-xl border border-sky-200/80 bg-white px-3 text-sm sm:max-w-[180px]">
          {PROFICIENCY_LEVELS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
        <Button onClick={() => addMutation.mutate()} disabled={!language.trim() || addMutation.isPending}
          className="gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white">
          {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </Button>
      </div>
    </motion.div>
  );
}

function SkillsStep({ profile, onNext, onBack }: { profile: any; onNext: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // UAT-03 Item 10: total experience captured in MONTHS. Seed from
  // experienceMonths, else convert the legacy years value (×12).
  const [experienceMonths, setExperienceMonths] = useState(String(profile.experienceMonths ?? (profile.experience ? profile.experience * 12 : 0)));
  const [selectedSkills, setSelectedSkills] = useState<string[]>(profile.skills || []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(profile.preferredCountries || []);
  const [skillSearch, setSkillSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(SKILL_CATEGORIES[0].category);
  const [customSkill, setCustomSkill] = useState("");
  // v0.4.33 (Phase 3): Matching v2 candidate-side preferences.
  const [qualificationLevel, setQualificationLevel] = useState<string>(profile.qualificationLevel || "");
  const [preferredCategories, setPreferredCategories] = useState<string[]>(profile.preferredCategories || []);
  const [preferredSalaryMin, setPreferredSalaryMin] = useState<string>(profile.preferredSalaryMin != null ? String(profile.preferredSalaryMin) : "");
  const [preferredSalaryMax, setPreferredSalaryMax] = useState<string>(profile.preferredSalaryMax != null ? String(profile.preferredSalaryMax) : "");
  const [preferredSalaryCurrency, setPreferredSalaryCurrency] = useState<string>(profile.preferredSalaryCurrency || "USD");

  useEffect(() => {
    if (profile.skills) setSelectedSkills(profile.skills);
    if (profile.preferredCountries) setSelectedCountries(profile.preferredCountries);
    if (profile.experienceMonths != null) setExperienceMonths(String(profile.experienceMonths));
    else if (profile.experience != null) setExperienceMonths(String(profile.experience * 12));
    if (profile.qualificationLevel) setQualificationLevel(profile.qualificationLevel);
    if (profile.preferredCategories) setPreferredCategories(profile.preferredCategories);
    if (profile.preferredSalaryMin != null) setPreferredSalaryMin(String(profile.preferredSalaryMin));
    if (profile.preferredSalaryMax != null) setPreferredSalaryMax(String(profile.preferredSalaryMax));
    if (profile.preferredSalaryCurrency) setPreferredSalaryCurrency(profile.preferredSalaryCurrency);
  }, [profile]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const addCustomSkill = () => {
    if (customSkill.trim() && !selectedSkills.includes(customSkill.trim())) {
      setSelectedSkills(prev => [...prev, customSkill.trim()]);
      setCustomSkill("");
    }
  };

  const toggleCountry = (country: string) => {
    setSelectedCountries(prev => prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/candidates/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // UAT-03 Item 10: send months; keep years in sync for any legacy
          // reader (matching prefers months when present).
          experienceMonths: parseInt(experienceMonths) || 0,
          experience: Math.round((parseInt(experienceMonths) || 0) / 12),
          skills: selectedSkills,
          preferredCountries: selectedCountries,
          // v0.4.33 (Phase 3) — Matching v2 candidate-side fields
          qualificationLevel: qualificationLevel || null,
          preferredCategories: preferredCategories.length ? preferredCategories : null,
          preferredSalaryMin: preferredSalaryMin ? parseInt(preferredSalaryMin) : null,
          preferredSalaryMax: preferredSalaryMax ? parseInt(preferredSalaryMax) : null,
          preferredSalaryCurrency: preferredSalaryCurrency || null,
        }),
      });
      if (!res.ok) throw new Error("Failed"); return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      toast({ title: "Skills & preferences saved" });
      onNext();
    },
  });

  const searchResults = skillSearch.trim()
    ? ALL_SKILLS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()) && !selectedSkills.includes(s)).slice(0, 12)
    : [];

  const activeCategorySkills = SKILL_CATEGORIES.find(c => c.category === activeCategory)?.skills || [];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <SectionHeader icon={Globe} color="from-amber-500 to-amber-600" title="Skills & Preferences" subtitle="Select your skills and preferred countries — these directly determine your match scores" />
      <Hint text="Skills account for 50% of your match score. Select from the categories below or search. Country preference adds 20%." />

      <ResumeParseWidget
        onApply={(parsed) => {
          if (parsed.experience) setExperienceMonths(String(parsed.experience * 12));
          if (parsed.skills?.length) {
            setSelectedSkills(prev => Array.from(new Set([...prev, ...parsed.skills])));
          }
          if (parsed.preferredCountries?.length) {
            setSelectedCountries(prev => Array.from(new Set([...prev, ...parsed.preferredCountries])));
          }
        }}
      />

      <div className="space-y-6">
        {/* Experience */}
        <motion.div variants={fadeUp} className="bg-gradient-to-br from-amber-50/80 to-orange-50/40 rounded-xl border border-amber-100/60 p-5">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Total Experience
          </p>
          <div className="flex items-center gap-3">
            <Input type="number" value={experienceMonths}
              onChange={e => {
                const v = e.target.value;
                // Reject negatives client-side; coerce to 0 if a user somehow
                // types "-2" in Safari (where min= isn't enforced on type=number).
                if (v === "" || /^\d+$/.test(v)) setExperienceMonths(v);
                else setExperienceMonths(String(Math.max(0, parseInt(v, 10) || 0)));
              }}
              min={0} max={720} step={1} inputMode="numeric" pattern="[0-9]*"
              placeholder="0"
              className="h-12 rounded-xl border-amber-200/80 bg-white max-w-[140px] text-center text-lg font-bold" />
            <span className="text-sm text-amber-700 font-medium">months
              {(() => { const m = parseInt(experienceMonths) || 0; return m >= 12 ? ` (≈ ${(m / 12).toFixed(1)} yrs)` : ""; })()}
            </span>
          </div>
          <p className="text-xs text-amber-500 mt-2">e.g. 42 months. Experience contributes 30% to your match score</p>
        </motion.div>

        {/* Languages (UAT-03 Item 12) */}
        <LanguagesSection />

        {/* Selected Skills */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" /> Your Skills <span className="text-red-500 text-xs">*</span>
            </Label>
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-0 font-bold">{selectedSkills.length} selected</Badge>
          </div>
          {selectedSkills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 p-4 bg-gradient-to-br from-amber-50/60 to-orange-50/30 rounded-xl border border-amber-100/50">
              {selectedSkills.map(skill => (
                <motion.span
                  key={skill}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200/80"
                >
                  {skill}
                  <button onClick={() => toggleSkill(skill)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                </motion.span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search skills..." value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
              className="pl-11 h-11 rounded-xl text-sm" />
          </div>

          {searchResults.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100/50">
              <p className="w-full text-[11px] text-blue-600 font-medium mb-1">Click to add:</p>
              {searchResults.map(skill => (
                <button key={skill} onClick={() => { toggleSkill(skill); setSkillSearch(""); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-100 transition-all font-medium">
                  + {skill}
                </button>
              ))}
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
            {SKILL_CATEGORIES.map(cat => (
              <button key={cat.category} onClick={() => setActiveCategory(cat.category)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat.category
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {cat.category}
              </button>
            ))}
          </div>

          {/* Category Skills Grid */}
          <div className="flex flex-wrap gap-2 p-4 bg-white rounded-xl border border-slate-200 max-h-[200px] overflow-y-auto">
            {activeCategorySkills.map(skill => {
              const isSelected = selectedSkills.includes(skill);
              return (
                <button key={skill} onClick={() => toggleSkill(skill)}
                  className={`text-xs px-3 py-2 rounded-xl border font-medium transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-500 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50"
                  }`}>
                  {isSelected ? <Check className="w-3 h-3 inline mr-1" /> : null}{skill}
                </button>
              );
            })}
          </div>

          {/* Custom Skill */}
          <div className="flex gap-2 mt-3">
            <Input value={customSkill} onChange={e => setCustomSkill(e.target.value)} placeholder="Add custom skill..."
              className="h-10 rounded-xl text-sm" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }} />
            <Button variant="outline" onClick={addCustomSkill} disabled={!customSkill.trim()} className="h-10 rounded-xl text-xs px-4">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </motion.div>

        {/* Preferred Countries */}
        <motion.div variants={fadeUp} className="bg-gradient-to-br from-sky-50/80 to-blue-50/40 rounded-xl border border-sky-100/60 p-5">
          <p className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Globe className="w-4 h-4" /> Preferred Destination Countries
          </p>
          <p className="text-xs text-sky-500 mb-4">Country match adds 20% to your score. Select all countries you'd consider working in.</p>

          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCountries.map(c => (
                <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200/80">
                  {c}
                  <button onClick={() => toggleCountry(c)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {DESTINATION_COUNTRIES.map(c => {
              const isSelected = selectedCountries.includes(c.value);
              return (
                <button key={c.value} onClick={() => toggleCountry(c.value)}
                  className={`text-left px-4 py-3 rounded-xl border text-xs transition-all ${
                    isSelected
                      ? "bg-sky-100 border-sky-300 text-sky-800 shadow-sm"
                      : "bg-white border-sky-200/60 text-slate-600 hover:border-sky-300 hover:bg-sky-50"
                  }`}>
                  <span className="font-semibold">{isSelected ? <Check className="w-3 h-3 inline mr-1" /> : null}{c.label}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">{c.region}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* v0.4.33 (Phase 3): Matching v2 candidate-side preferences.
            Qualification level + preferred role categories + salary band.
            All optional — the engine treats blanks as neutral per the
            configurable missing-criteria policy. */}
        <motion.div variants={fadeUp} className="bg-gradient-to-br from-indigo-50/80 to-violet-50/40 rounded-xl border border-indigo-100/60 p-5 space-y-4">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Job preferences <span className="text-[10px] font-medium text-indigo-400">(optional)</span>
          </p>
          <p className="text-xs text-indigo-500">These help the matching engine score jobs against your goals. You can leave anything blank.</p>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Highest qualification</label>
              <Select value={qualificationLevel || ""} onValueChange={(v) => setQualificationLevel(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Not specified</SelectItem>
                  {QUALIFICATION_LEVELS.map((q) => (
                    <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1 block">
                Preferred salary band ({preferredSalaryCurrency})
                <span className="text-[10px] text-slate-400 ml-1 font-normal">— annualised</span>
              </label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} step={1000} placeholder="Min" value={preferredSalaryMin}
                  onChange={(e) => setPreferredSalaryMin(e.target.value)} className="h-10 text-sm" />
                <span className="text-slate-400">→</span>
                <Input type="number" min={0} step={1000} placeholder="Max" value={preferredSalaryMax}
                  onChange={(e) => setPreferredSalaryMax(e.target.value)} className="h-10 text-sm" />
                <Select value={preferredSalaryCurrency} onValueChange={setPreferredSalaryCurrency}>
                  <SelectTrigger className="h-10 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "AUD", "CAD", "AED", "SAR", "INR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 mb-2 block">Preferred role categories</label>
            <div className="flex flex-wrap gap-1.5">
              {JOB_CATEGORIES.map((c) => {
                const active = preferredCategories.includes(c.key);
                return (
                  <button key={c.key} type="button"
                    onClick={() => setPreferredCategories(active ? preferredCategories.filter((x) => x !== c.key) : [...preferredCategories, c.key])}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-700"
                    }`}>
                    {active && <Check className="w-2.5 h-2.5 inline mr-1" />}{c.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Jobs for You from your preferred categories get full marks on the Category factor (10% weight by default).
            </p>
          </div>
        </motion.div>
      </div>

      <StepNav onBack={onBack} onNext={() => mutation.mutate()} nextLabel="Save & Continue" loading={mutation.isPending} disabled={selectedSkills.length === 0} />
    </motion.div>
  );
}

// ── Step 5: Documents ────────────────────────────────────────────────
// v0.4.31 (HPSEDC Item 7): Replaced the single drag-and-drop zone with 6
// per-document-type slot cards. Each HPSEDC-mandated doc class now has its
// own card, upload trigger, and persistent ✓ indicator so candidates (and
// agents reviewing them) can see at a glance which docs are still missing.
// "Other" remains as a catch-all for anything outside the mandated set.
function DocumentsStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const { data: docsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/candidates/documents"], queryFn: () => fetchJson("/api/v1/candidates/documents"),
  });

  const handleUpload = async (file: File, slotType: string) => {
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File too large", description: "Max 5MB", variant: "destructive" }); return; }
    setUploadingSlot(slotType);
    const formData = new FormData(); formData.append("file", file); formData.append("type", slotType);
    try {
      const res = await fetch("/api/v1/candidates/documents", { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "Upload failed"); }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      toast({ title: "Document uploaded" });
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    finally { setUploadingSlot(null); }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await fetch(`/api/v1/candidates/documents/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      toast({ title: "Document removed" });
    },
  });

  const docs: any[] = docsRes?.data || [];

  // 6 HPSEDC-mandated slots + "other" catch-all. Order matters — drives the
  // visual sequence the candidate walks through. "cv" is marked required so
  // the wizard surfaces it as the must-have for applying to any job.
  // Legacy "certificate" uploads (from before v0.4.31) get bucketed into
  // educational_certificate for display so they remain visible.
  const slots: { value: string; label: string; description: string; icon: any; color: string; required?: boolean }[] = [
    { value: "cv", label: "CV / Resume", description: "Required to apply for any job", icon: FileText, color: "text-blue-600 bg-blue-100", required: true },
    { value: "passport", label: "Passport", description: "Bio-page scan (PDF or JPG)", icon: Shield, color: "text-emerald-600 bg-emerald-100" },
    { value: "identity_proof", label: "Identity Proof", description: "Aadhaar / Voter ID / Driving Licence", icon: User, color: "text-cyan-600 bg-cyan-100" },
    { value: "educational_certificate", label: "Educational Certificate", description: "Degree, diploma, or 10th/12th marksheet", icon: GraduationCap, color: "text-violet-600 bg-violet-100" },
    { value: "experience_certificate", label: "Experience Certificate", description: "Past employer letter / payslips", icon: Briefcase, color: "text-amber-600 bg-amber-100" },
    { value: "offer_letter", label: "Offer Letter", description: "Existing offer from overseas employer (optional)", icon: Mail, color: "text-indigo-600 bg-indigo-100" },
  ];

  // Match docs to slots. Legacy "certificate" docs surface under the
  // educational_certificate slot so we don't lose visibility of pre-v0.4.31
  // uploads. A slot may have multiple docs (e.g. front + back of ID).
  const docsBySlot: Record<string, any[]> = {};
  const otherDocs: any[] = [];
  for (const d of docs) {
    let bucket = d.type;
    if (bucket === "certificate") bucket = "educational_certificate"; // legacy
    if (slots.some(s => s.value === bucket)) {
      (docsBySlot[bucket] = docsBySlot[bucket] || []).push(d);
    } else {
      otherDocs.push(d);
    }
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate">
      <SectionHeader icon={FileText} color="from-rose-500 to-rose-600" title="Documents" subtitle="Upload each document into its own slot. Agencies see at a glance which ones are still missing." />
      <Hint text="At minimum, upload your CV — without it you cannot apply to jobs. Other documents speed up verification once you're shortlisted. Accepted formats: PDF, JPG, PNG (max 5MB each)." />

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div>
      ) : (
        <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slots.map((slot) => {
            const slotDocs = docsBySlot[slot.value] || [];
            const hasDoc = slotDocs.length > 0;
            const Icon = slot.icon;
            const isUploading = uploadingSlot === slot.value;
            return (
              <div
                key={slot.value}
                className={`relative rounded-2xl border p-4 transition-all ${
                  hasDoc
                    ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white"
                    : "border-slate-200 bg-gradient-to-br from-slate-50/60 to-white hover:border-rose-200"
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${slot.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                      {slot.required && <Badge variant="outline" className="text-[9px] rounded-md border-rose-200 text-rose-600 bg-rose-50">Required</Badge>}
                      {hasDoc && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white flex-shrink-0" title="Uploaded">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{slot.description}</p>
                  </div>
                </div>

                {hasDoc && (
                  <div className="space-y-1.5 mb-3">
                    {slotDocs.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-emerald-100">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700 truncate">{doc.fileName}</p>
                          {doc.fileSize && <p className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(0)} KB</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/v1/candidates/documents/${doc.id}/download?inline=1`, "_blank")}
                            className="h-7 px-2 text-[10px] rounded-md text-slate-600 hover:text-rose-600">
                            View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(doc.id)}
                            className="h-7 w-7 p-0 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label className={`cursor-pointer w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isUploading
                    ? "bg-slate-200 text-slate-500"
                    : hasDoc
                      ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-sm"
                }`}>
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploading ? "Uploading…" : hasDoc ? "Replace / Add another" : "Upload file"}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, slot.value); e.target.value = ""; }}
                    className="hidden" disabled={isUploading} />
                </label>
              </div>
            );
          })}

          {/* "Other" catch-all — only renders if there are uploads not matching a known slot,
              plus a permanent slot at the bottom for new misc uploads. */}
          <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/60 to-white p-4 md:col-span-2">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl text-slate-600 bg-slate-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Other Documents</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Anything else an agent or employer might need (e.g. PCC, medical, reference letters).</p>
              </div>
            </div>

            {otherDocs.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {otherDocs.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700 truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[9px] capitalize rounded-md">{doc.type}</Badge>
                        {doc.fileSize && <span className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(0)} KB</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => window.open(`/api/v1/candidates/documents/${doc.id}/download?inline=1`, "_blank")}
                        className="h-7 px-2 text-[10px] rounded-md text-slate-600 hover:text-rose-600">
                        View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(doc.id)}
                        className="h-7 w-7 p-0 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label className={`cursor-pointer w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              uploadingSlot === "other"
                ? "bg-slate-200 text-slate-500"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}>
              {uploadingSlot === "other" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploadingSlot === "other" ? "Uploading…" : "Upload other document"}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, "other"); e.target.value = ""; }}
                className="hidden" disabled={uploadingSlot === "other"} />
            </label>
          </div>
        </motion.div>
      )}

      {/* Finish */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
        <Button variant="outline" onClick={onBack} className="gap-2 h-11 px-5 rounded-xl">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={onFinish}
          className="gap-2 h-12 px-8 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xl shadow-emerald-500/25 text-base font-semibold hover:-translate-y-0.5 transition-all">
          <CheckCircle className="w-5 h-5" /> Finish & Go to Dashboard
        </Button>
      </motion.div>
    </motion.div>
  );
}
