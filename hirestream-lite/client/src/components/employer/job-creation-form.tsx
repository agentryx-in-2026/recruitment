import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Loader2, X, Briefcase, MapPin, Globe, DollarSign, Clock, Users,
  Calendar, Zap, FileText, Sparkles, Building, AlertTriangle, Flame, Tag,
} from "lucide-react";
import { CITIES_BY_COUNTRY, FIELD_LIMITS, JOB_CATEGORIES } from "@/lib/reference-data";
import { SalaryRangePicker, EXPERIENCE_OPTIONS } from "@/components/shared/salary-range-picker";
import { HiringCriteriaSection } from "@/components/shared/HiringCriteriaSection";

// Countries dropdown is DB-driven via useActiveCountries() below.
function flagForIsoCode(code: string): string {
  if (!code || !/^[A-Z]{2}$/.test(code.toUpperCase())) return "🌐";
  const [a, b] = code.toUpperCase().split("");
  const offset = 0x1F1E6 - 0x41;
  return String.fromCodePoint(a.charCodeAt(0) + offset) + String.fromCodePoint(b.charCodeAt(0) + offset);
}
function useActiveCountries(): { name: string; flag: string }[] {
  const { data } = useQuery({
    queryKey: ["/api/v1/content/countries?activeOnly=true"],
    queryFn: async () => {
      const r = await fetch("/api/v1/content/countries?activeOnly=true", { credentials: "include" });
      if (!r.ok) return { data: [] };
      return r.json();
    },
    staleTime: 60_000,
  });
  return ((data as any)?.data ?? []).map((c: any) => ({ name: c.name, flag: flagForIsoCode(c.code) }));
}

const COMMON_SKILLS = [
  "React", "Node.js", "TypeScript", "Python", "Java", "AWS",
  "Docker", "Kubernetes", "SQL", "PostgreSQL", "AutoCAD",
  "Project Management", "Data Analysis", "Machine Learning",
  "ICU Care", "Patient Management", "Hotel Operations", "Mechanical Design",
];

interface JobFormData {
  title: string; company: string; location: string; country: string;
  category: string;
  salary: string; description: string; experience: number; skills: string[];
  targetHires: number; hiringDeadline: string;
  priority: "standard" | "urgent" | "critical";
  employerNotes: string;
  // v0.4.33 (Phase 3): Matching Engine v2 — all optional.
  qualificationRequired: string;
  requiredIeltsBand: number | null;
  languagesRequired: Record<string, string>;
}

interface JobCreationFormProps {
  editJob?: any;
  trigger?: React.ReactNode;
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function JobCreationForm({ editJob, trigger, controlledOpen, onOpenChange }: JobCreationFormProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const isEdit = !!editJob;
  // Unverified employers may save drafts but cannot publish (server enforces this
  // too). We disable Publish so it's clear up-front rather than a 403 on click.
  const { data: empProfileRes } = useQuery({
    queryKey: ["/api/v1/employer/profile"],
    queryFn: () => fetch("/api/v1/employer/profile", { credentials: "include" }).then((r) => r.json()),
  });
  const canPublish = isEdit || !!empProfileRes?.data?.verified;
  const [skillInput, setSkillInput] = useState("");
  const activeCountries = useActiveCountries();
  const initialCountry = editJob?.country ?? "";
  const initialLocation = editJob?.location ?? "";
  const [cityChoice, setCityChoice] = useState<string>(
    initialCountry && initialLocation && CITIES_BY_COUNTRY[initialCountry]?.includes(initialLocation)
      ? initialLocation : (initialLocation ? "__other__" : "")
  );
  const [form, setForm] = useState<JobFormData>({
    title: editJob?.title ?? "",
    company: editJob?.company ?? "",
    location: editJob?.location ?? "",
    country: editJob?.country ?? "",
    category: editJob?.category ?? "",
    salary: editJob?.salary ?? "",
    description: editJob?.description ?? "",
    experience: editJob?.experience ?? 0,
    skills: editJob?.skills ?? [],
    targetHires: editJob?.targetHires ?? 1,
    hiringDeadline: editJob?.hiringDeadline ? String(editJob.hiringDeadline).split("T")[0] : "",
    priority: (editJob?.priority as any) ?? "standard",
    employerNotes: editJob?.employerNotes ?? "",
    qualificationRequired: editJob?.qualificationRequired ?? "",
    requiredIeltsBand: editJob?.requiredIeltsBand !== undefined && editJob?.requiredIeltsBand !== null ? Number(editJob.requiredIeltsBand) : null,
    languagesRequired: (editJob?.languagesRequired && typeof editJob.languagesRequired === "object") ? editJob.languagesRequired : {},
  });

  const mutation = useMutation({
    mutationFn: async ({ data, isDraft }: { data: JobFormData; isDraft: boolean }) => {
      const url = isEdit ? `/api/v1/jobs/${editJob.id}` : "/api/v1/jobs";
      const method = isEdit ? "PUT" : "POST";
      // Empty date strings break Postgres — coerce to null
      const payload: any = { ...data, isDraft };
      if (payload.hiringDeadline === "") payload.hiringDeadline = null;
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error?.message || (isEdit ? "Failed to update" : "Failed to create job"));
      }
      return res.json();
    },
    onSuccess: (resp, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/employer/requisitions"] });
      toast({
        title: vars.isDraft ? "Draft saved"
          : isEdit ? "Requisition updated"
          : "Requisition published 🎉",
        description: vars.isDraft
          ? "You can resume from your drafts anytime."
          : isEdit ? "Agencies will see the updated requirement."
          : `"${resp.data?.title}" is live. Agencies can now start sending candidates.`,
      });
      setOpen(false);
      if (!isEdit) resetForm();
    },
    onError: (err: any, vars: any) => {
      toast({
        title: vars?.isDraft ? "Couldn't save draft" : isEdit ? "Couldn't update" : "Couldn't publish",
        description: err.message, variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setForm({
      title: "", company: "", location: "", country: "", category: "",
      salary: "", description: "", experience: 0, skills: [],
      targetHires: 1, hiringDeadline: "", priority: "standard", employerNotes: "",
      qualificationRequired: "", requiredIeltsBand: null, languagesRequired: {},
    });
    setSkillInput("");
    setCityChoice("");
  };

  const addSkill = (skill: string) => {
    const trimmed = skill.trim().slice(0, FIELD_LIMITS.tagItem);
    if (!trimmed) return;
    if (form.skills.length >= FIELD_LIMITS.skillsMax) {
      toast({ title: `Max ${FIELD_LIMITS.skillsMax} skills`, description: "Remove one before adding more.", variant: "destructive" });
      return;
    }
    if (!form.skills.includes(trimmed)) {
      setForm((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }));
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) =>
    setForm((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== skill) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.company || !form.location || !form.country) {
      toast({ title: "Missing fields", description: "Title, company, location, and country are required.", variant: "destructive" });
      return;
    }
    if (!form.category) {
      toast({ title: "Pick a category", description: "Choose the closest job category — used for matching and HPSEDC reporting.", variant: "destructive" });
      return;
    }
    mutation.mutate({ data: form, isDraft: false });
  };

  const saveDraft = () => {
    if (!form.title?.trim()) {
      toast({ title: "Title required", description: "Add at least a job title before saving a draft.", variant: "destructive" });
      return;
    }
    mutation.mutate({ data: form, isDraft: true });
  };

  const priorityOption = (value: "standard" | "urgent" | "critical", label: string, Icon: any, color: string, description: string) => (
    <button
      type="button" key={value}
      onClick={() => setForm({ ...form, priority: value })}
      className={`flex-1 rounded-xl p-3 border-2 text-left transition ${
        form.priority === value
          ? `${color} border-current shadow-sm`
          : "bg-white border-slate-200 hover:border-slate-300 text-slate-600"
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold text-sm">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <p className="text-[11px] opacity-80 mt-0.5">{description}</p>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-500/20" data-testid="button-post-job">
            <Plus className="mr-2 h-4 w-4" /> New Requisition
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 text-white px-6 py-5 sticky top-0 z-10">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">{isEdit ? "Edit Requisition" : "Create a Hiring Requisition"}</DialogTitle>
                <DialogDescription className="text-purple-100 text-sm mt-0.5">
                  {isEdit
                    ? "Update the details. Shortlists from agencies stay attached to this requisition."
                    : "Describe the role. Agencies will start submitting shortlisted candidates within 48 hours."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* ── Section: Role basics ───────────────────────── */}
          <Section icon={Briefcase} color="text-blue-600 bg-blue-50" title="Role basics" subtitle="What are you hiring for and where?">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Job title" required>
                <IconInput icon={<Briefcase className="w-4 h-4 text-slate-400" />} value={form.title}
                  onChange={(v) => setForm({ ...form, title: v })}
                  maxLength={FIELD_LIMITS.jobTitle}
                  placeholder="e.g. Senior Welder — Offshore" />
              </Field>
              <Field label="Company / entity" required>
                <IconInput icon={<Building className="w-4 h-4 text-slate-400" />} value={form.company}
                  onChange={(v) => setForm({ ...form, company: v })}
                  maxLength={FIELD_LIMITS.companyName}
                  placeholder="e.g. Saudi Aramco" />
              </Field>
              <Field label="Country" required>
                <Select value={form.country} onValueChange={(v) => {
                  setForm({ ...form, country: v, location: "" });
                  setCityChoice("");
                }}>
                  <SelectTrigger className="h-10">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-slate-400" />
                      <SelectValue placeholder="Select destination" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {activeCountries.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-slate-400">Loading destinations…</div>
                    )}
                    {activeCountries.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        <span className="mr-2">{c.flag}</span>{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="City" required hint="Pick a major city, or choose 'Other city' to type a custom one">
                {(() => {
                  const cities = form.country ? (CITIES_BY_COUNTRY[form.country] ?? []) : [];
                  return (
                    <Select
                      disabled={!form.country}
                      value={cityChoice}
                      onValueChange={(v) => {
                        setCityChoice(v);
                        setForm({ ...form, location: v === "__other__" ? "" : v });
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <SelectValue placeholder={form.country ? "Select city" : "Pick country first"} />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((city) => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                        {form.country && <SelectItem value="__other__">Other city…</SelectItem>}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </Field>
              {cityChoice === "__other__" && (
                <Field label="Custom city name" required hint={`Up to ${FIELD_LIMITS.city} characters`} fullWidth>
                  <IconInput icon={<MapPin className="w-4 h-4 text-slate-400" />}
                    value={form.location}
                    onChange={(v) => setForm({ ...form, location: v })}
                    maxLength={FIELD_LIMITS.city}
                    placeholder="Enter city name" />
                </Field>
              )}
              <Field label="Job category" required hint="Drives match-engine grouping and browse filters">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-10">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-slate-400" />
                      <SelectValue placeholder="Select category" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {JOB_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* ── Section: Requisition details ───────────────── */}
          <Section icon={Sparkles} color="text-purple-600 bg-purple-50" title="Requisition details" subtitle="Target count, deadline, and how urgent this fill is">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Positions to fill" hint="How many hires you need">
                <IconInput icon={<Users className="w-4 h-4 text-slate-400" />}
                  type="number" min={1} max={500}
                  value={String(form.targetHires)}
                  onChange={(v) => setForm({ ...form, targetHires: parseInt(v) || 1 })} />
              </Field>
              <Field label="Min. experience">
                <Select value={String(form.experience)} onValueChange={(v) => setForm({ ...form, experience: parseInt(v, 10) })}>
                  <SelectTrigger className="h-10">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Hiring deadline" hint="Optional target date — must be today or later">
                <IconInput icon={<Calendar className="w-4 h-4 text-slate-400" />}
                  type="date" value={form.hiringDeadline}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(v) => setForm({ ...form, hiringDeadline: v })} />
              </Field>
              <Field label="Salary range" hint="Pick currency, period, and band — preview shows below" fullWidth>
                <SalaryRangePicker
                  value={form.salary}
                  onChange={(v) => setForm((prev) => ({ ...prev, salary: v }))}
                />
              </Field>
            </div>

            {/* Priority selector — visual, not a dropdown */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700 mb-2 block">Priority</label>
              <div className="flex gap-2">
                {priorityOption("standard", "Standard", Clock,  "bg-slate-50 text-slate-700",   "No specific urgency")}
                {priorityOption("urgent",   "Urgent",   Zap,    "bg-amber-50 text-amber-700",  "Need to fill in 30 days")}
                {priorityOption("critical", "Critical", Flame,  "bg-red-50 text-red-700",      "Business-critical, rush")}
              </div>
            </div>
          </Section>

          {/* Hiring criteria — Phase 3 Matching v2 inputs */}
          <HiringCriteriaSection
            country={form.country}
            qualification={form.qualificationRequired}
            setQualification={(v) => setForm({ ...form, qualificationRequired: v })}
            requiredIeltsBand={form.requiredIeltsBand}
            setRequiredIeltsBand={(v) => setForm({ ...form, requiredIeltsBand: v })}
            languagesRequired={form.languagesRequired}
            setLanguagesRequired={(v) => setForm({ ...form, languagesRequired: v })}
          />

          {/* ── Section: Description & skills ──────────────── */}
          <Section icon={FileText} color="text-emerald-600 bg-emerald-50" title="Description & skills" subtitle="Tell candidates what the role is and what skills you need">
            <Field label="Job description" hint="Include benefits, visa sponsorship, accommodation details">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={FIELD_LIMITS.longDescription}
                placeholder="Describe the role, responsibilities, benefits, visa sponsorship details…"
                rows={4} className="text-sm" />
              <p className="text-[10px] text-slate-400 text-right mt-1">{form.description.length} / {FIELD_LIMITS.longDescription}</p>
            </Field>

            <Field label="Required skills" hint="Press Enter or click a suggestion to add">
              <div className="flex gap-2 mb-2">
                <IconInput icon={<Sparkles className="w-4 h-4 text-slate-400" />} value={skillInput}
                  onChange={setSkillInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addSkill(skillInput); }
                  }}
                  maxLength={FIELD_LIMITS.tagItem}
                  placeholder="Type a skill and press Enter" />
                <Button type="button" variant="outline" onClick={() => addSkill(skillInput)} className="shrink-0">Add</Button>
              </div>
              {/* Quick-add common skills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_SKILLS.filter((s) => !form.skills.includes(s)).slice(0, 10).map((s) => (
                  <button key={s} type="button" onClick={() => addSkill(s)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-purple-400 hover:text-purple-700 transition">
                    + {s}
                  </button>
                ))}
              </div>
              {/* Selected skills */}
              {form.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  {form.skills.map((s) => (
                    <Badge key={s} className="bg-purple-600 text-white hover:bg-purple-700">
                      {s}
                      <X className="ml-1 h-3 w-3 cursor-pointer hover:text-red-200" onClick={() => removeSkill(s)} />
                    </Badge>
                  ))}
                </div>
              )}
            </Field>

            <Field label="Internal note (optional)" hint="Not shown to candidates — helps the agency understand priorities">
              <Textarea value={form.employerNotes}
                onChange={(e) => setForm({ ...form, employerNotes: e.target.value })}
                maxLength={FIELD_LIMITS.internalNotes}
                placeholder="e.g. Prefer candidates with Gulf experience; need to start before Eid…"
                rows={2} className="text-sm" />
              <p className="text-[10px] text-slate-400 text-right mt-1">{form.employerNotes.length} / {FIELD_LIMITS.internalNotes}</p>
            </Field>
          </Section>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <div className="text-xs hidden sm:block max-w-[280px]">
              {!canPublish
                ? <span className="text-amber-600 font-medium">⏳ Pending HPSEDC verification — save a draft now; you can publish once your company is approved.</span>
                : <span className="text-slate-500">After publishing, agencies get notified and begin shortlisting candidates against this requisition.</span>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" variant="outline" onClick={saveDraft}
                disabled={mutation.isPending || !form.title?.trim()}
                title="Save your progress. Only the title is required; fill the rest later.">
                Save as Draft
              </Button>
              <Button type="submit" disabled={mutation.isPending || !canPublish}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-500/20"
                title={!canPublish ? "Your company must be verified by HPSEDC before you can publish. You can save a draft now." : undefined}
                data-testid="button-submit-job">
                {mutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEdit ? "Saving…" : "Publishing…"}</>
                  : <><Briefcase className="mr-2 h-4 w-4" /> {isEdit ? "Save Changes" : "Publish Requisition"}</>}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Helper components ────────────────────────────────────────────────
function Section({ icon: Icon, color, title, subtitle, children }: any) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="pl-1 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, required, hint, children, fullWidth }: any) {
  return (
    <div className={fullWidth ? "md:col-span-3" : ""}>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function IconInput({ icon, value, onChange, onKeyDown, placeholder, type = "text", min, max, maxLength, disabled }: {
  icon: React.ReactNode;
  value?: string;
  onChange?: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  min?: number | string;
  max?: number | string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
      <Input type={type} value={value} min={min} max={max} maxLength={maxLength} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown} placeholder={placeholder}
        className="pl-9 h-10 text-sm" />
    </div>
  );
}
