import { useState, forwardRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, AlertCircle, Edit, Briefcase, MapPin, Globe, Building,
  DollarSign, Clock, FileText, Sparkles, X, Tag,
} from "lucide-react";
import { CITIES_BY_COUNTRY, FIELD_LIMITS, JOB_CATEGORIES } from "@/lib/reference-data";
import { SalaryRangePicker, EXPERIENCE_OPTIONS } from "@/components/shared/salary-range-picker";
import { HiringCriteriaSection } from "@/components/shared/HiringCriteriaSection";

const CATEGORY_KEYS = JOB_CATEGORIES.map((c) => c.key) as [string, ...string[]];

const jobSchema = z.object({
  title: z.string().min(2, "Job title is required").max(FIELD_LIMITS.jobTitle, `Max ${FIELD_LIMITS.jobTitle} characters`),
  company: z.string().min(2, "Company name is required").max(FIELD_LIMITS.companyName, `Max ${FIELD_LIMITS.companyName} characters`),
  location: z.string().min(2, "Location is required").max(FIELD_LIMITS.city, `Max ${FIELD_LIMITS.city} characters`),
  country: z.string().min(2, "Country is required"),
  // v0.4.31 (HPSEDC Item 8): category required so the matching engine, browse-filter,
  // and HPSEDC reports can group jobs by role family.
  category: z.enum(CATEGORY_KEYS, { errorMap: () => ({ message: "Pick a job category" }) }),
  salary: z.string().max(FIELD_LIMITS.salary, `Max ${FIELD_LIMITS.salary} characters`).optional(),
  description: z.string().min(10, "Description must be at least 10 characters").max(FIELD_LIMITS.longDescription, `Max ${FIELD_LIMITS.longDescription} characters`),
  experience: z.number().min(0).max(50),
  requirements: z.string().transform((str) => str.split(",").map((s) => s.trim()).filter(Boolean)),
  skills: z.string().transform((str) => str.split(",").map((s) => s.trim()).filter(Boolean)),
});

type JobFormValues = z.infer<typeof jobSchema>;

// Countries dropdown is DB-driven: useActiveCountries() below fetches the
// active rows from country_info via /api/v1/content/countries?activeOnly=true.
// Single source of truth — admin adds/disables a country in the Countries
// admin panel, the dropdown updates within a minute (TanStack Query staleTime).

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
  "React", "Node.js", "TypeScript", "Python", "AWS", "Docker",
  "SQL", "AutoCAD", "Project Management", "ICU Care", "Patient Management",
  "Hotel Operations", "Mechanical Design", "Welding", "Electrical",
];

interface JobPosterProps {
  isVerified: boolean;
  editJob?: any;
  trigger?: React.ReactNode;
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function JobPoster({ isVerified, editJob, trigger, controlledOpen, onOpenChange }: JobPosterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const isEdit = !!editJob;
  const [selectedSkills, setSelectedSkills] = useState<string[]>(editJob?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  // v0.4.33 (Phase 3): Matching Engine v2 inputs. All optional.
  const [qualification, setQualification] = useState<string>(editJob?.qualificationRequired ?? "");
  const [requiredIeltsBand, setRequiredIeltsBand] = useState<number | null>(
    editJob?.requiredIeltsBand !== undefined && editJob?.requiredIeltsBand !== null
      ? Number(editJob.requiredIeltsBand) : null
  );
  const [languagesRequired, setLanguagesRequired] = useState<Record<string, string>>(
    (editJob?.languagesRequired && typeof editJob.languagesRequired === "object") ? editJob.languagesRequired : {}
  );

  // Active destinations from country_info via the API (single source of truth).
  // If the API isn't reachable yet at first render, dropdown is briefly empty —
  // the country field is still saved free-text; server validator rejects unknowns.
  const activeCountries = useActiveCountries();
  const initialCountry = editJob?.country ?? "";
  const initialLocation = editJob?.location ?? "";
  const initialCityFromList =
    initialCountry && CITIES_BY_COUNTRY[initialCountry]?.includes(initialLocation)
      ? initialLocation
      : "";
  const [cityChoice, setCityChoice] = useState<string>(initialCityFromList || (initialLocation ? "__other__" : ""));

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    mode: "onChange",
    defaultValues: {
      title: editJob?.title ?? "",
      company: editJob?.company ?? "",
      location: editJob?.location ?? "",
      country: editJob?.country ?? "",
      category: (editJob?.category as any) ?? undefined,
      salary: editJob?.salary ?? "",
      description: editJob?.description ?? "",
      experience: editJob?.experience ?? 0,
      requirements: (editJob?.requirements?.join?.(", ") as any) ?? ("" as any),
      skills: (selectedSkills.join(", ") as any) ?? ("" as any),
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ data, isDraft }: { data: any; isDraft: boolean }) => {
      const url = isEdit ? `/api/v1/jobs/${editJob.id}` : "/api/v1/jobs";
      const method = isEdit ? "PUT" : "POST";

      // Normalize: form keeps "requirements" as comma-separated string for ease of typing,
      // but the API expects a string[]. handleSubmit runs Zod transforms; Save-as-Draft
      // bypasses validation and hits this path raw, so transform here unconditionally.
      const toArray = (v: any) =>
        Array.isArray(v) ? v :
        typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) :
        [];
      const payload: any = {
        ...data,
        requirements: toArray(data.requirements),
        skills: selectedSkills,
        // v0.4.33 (Phase 3): Matching v2 fields. Empty → null so the engine
        // applies the missing-criteria policy rather than scoring blanks.
        qualificationRequired: qualification || null,
        requiredIeltsBand: requiredIeltsBand,
        languagesRequired: Object.keys(languagesRequired).length ? languagesRequired : null,
        isDraft,
      };
      // Empty date strings break Postgres — coerce to null
      if (payload.hiringDeadline === "") payload.hiringDeadline = null;

      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error?.message || (isEdit ? "Failed to update job" : "Failed to post job"));
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agencies/candidates"] });
      toast({
        title: vars.isDraft ? "Draft saved" : (isEdit ? "Job updated" : "Job posted"),
        description: vars.isDraft
          ? "You can come back and finish this later from your drafts."
          : (isEdit ? "Changes are live; applicants untouched." : "Candidates can now apply."),
      });
      setOpen(false);
      if (!isEdit) { form.reset(); setSelectedSkills([]); }
    },
    onError: (err: any, vars: any) => {
      toast({
        title: vars?.isDraft ? "Couldn't save draft" : (isEdit ? "Update failed" : "Couldn't post"),
        description: err.message, variant: "destructive",
      });
    },
  });

  async function saveDraft() {
    const data = form.getValues();
    mutation.mutate({ data, isDraft: true });
  }

  const addSkill = (s: string) => {
    const t = s.trim().slice(0, FIELD_LIMITS.tagItem);
    if (!t) return;
    if (selectedSkills.length >= FIELD_LIMITS.skillsMax) {
      toast({ title: `Max ${FIELD_LIMITS.skillsMax} skills`, description: "Remove one before adding more.", variant: "destructive" });
      return;
    }
    if (!selectedSkills.includes(t)) {
      setSelectedSkills([...selectedSkills, t]);
      form.setValue("skills", [...selectedSkills, t].join(", ") as any);
    }
    setSkillInput("");
  };
  const removeSkill = (s: string) => {
    const next = selectedSkills.filter((x) => x !== s);
    setSelectedSkills(next);
    form.setValue("skills", next.join(", ") as any);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md shadow-blue-500/20">
            {isEdit ? <><Edit className="mr-2 h-4 w-4" /> Edit</> : <><Plus className="mr-2 h-4 w-4" /> Post Job</>}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white px-6 py-5 sticky top-0 z-10">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                  {isEdit ? "Edit Job Posting" : "Post a New Job"}
                </DialogTitle>
                <DialogDescription className="text-blue-100 text-sm mt-0.5">
                  {isEdit
                    ? "Update the details. Applicants currently in the pipeline keep their status."
                    : "Candidates on HireStream will see this job and can apply immediately after publication."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {!isVerified && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong>Agency verification required.</strong> You can draft this post, but publishing is blocked until HPSEDC verifies your licence.
            </div>
          </div>
        )}

        <form onSubmit={form.handleSubmit((d) => mutation.mutate({ data: d, isDraft: false }))} className="p-6 space-y-6">
          {/* Role basics */}
          <Section icon={Briefcase} color="text-blue-600 bg-blue-50" title="Role basics" subtitle="Title, company, and destination">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Job title" required error={form.formState.errors.title?.message}>
                <IconInput icon={<Briefcase className="w-4 h-4 text-slate-400" />} {...form.register("title")}
                  maxLength={FIELD_LIMITS.jobTitle}
                  placeholder="e.g. Registered Nurse — ICU" />
              </Field>
              <Field label="Employer / company" required error={form.formState.errors.company?.message}>
                <IconInput icon={<Building className="w-4 h-4 text-slate-400" />} {...form.register("company")}
                  maxLength={FIELD_LIMITS.companyName}
                  placeholder="e.g. Royal London NHS Trust" />
              </Field>
              <Field label="Country" required>
                <Select value={form.watch("country")} onValueChange={(v) => {
                  form.setValue("country", v);
                  setCityChoice(""); form.setValue("location", "");
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
              <Field label="City" required error={form.formState.errors.location?.message}
                hint="Pick a major city, or choose 'Other city' to type a custom one">
                {(() => {
                  const country = form.watch("country");
                  const cities = country ? (CITIES_BY_COUNTRY[country] ?? []) : [];
                  return (
                    <Select
                      disabled={!country}
                      value={cityChoice}
                      onValueChange={(v) => {
                        setCityChoice(v);
                        if (v !== "__other__") form.setValue("location", v, { shouldValidate: true });
                        else form.setValue("location", "", { shouldValidate: false });
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <SelectValue placeholder={country ? "Select city" : "Pick country first"} />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((city) => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                        {country && <SelectItem value="__other__">Other city…</SelectItem>}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </Field>
              {cityChoice === "__other__" && (
                <Field label="Custom city name" required error={form.formState.errors.location?.message}
                  hint={`Up to ${FIELD_LIMITS.city} characters`}>
                  <IconInput icon={<MapPin className="w-4 h-4 text-slate-400" />}
                    {...form.register("location")}
                    maxLength={FIELD_LIMITS.city}
                    placeholder="Enter city name" />
                </Field>
              )}
              <Field label="Job category" required error={form.formState.errors.category?.message as any}
                hint="Drives match-engine grouping and browse filters">
                <Select value={form.watch("category") ?? ""} onValueChange={(v) => form.setValue("category", v as any, { shouldDirty: true, shouldValidate: true })}>
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

          {/* Package */}
          <Section icon={DollarSign} color="text-emerald-600 bg-emerald-50" title="Compensation & experience" subtitle="What you're offering and who should apply">
            <div className="space-y-3">
              <Field label="Salary range" hint="Pick currency, period, and the band you're offering">
                <SalaryRangePicker
                  value={form.watch("salary")}
                  onChange={(v) => form.setValue("salary", v, { shouldDirty: true })}
                />
              </Field>
              <Field label="Min. experience">
                <Select
                  value={String(form.watch("experience") ?? 0)}
                  onValueChange={(v) => form.setValue("experience", parseInt(v, 10), { shouldDirty: true, shouldValidate: true })}
                >
                  <SelectTrigger className="h-10 max-w-xs">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <SelectValue placeholder="Select minimum experience" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* Hiring criteria — Phase 3 Matching v2 inputs */}
          <HiringCriteriaSection
            country={form.watch("country") || ""}
            qualification={qualification}
            setQualification={setQualification}
            requiredIeltsBand={requiredIeltsBand}
            setRequiredIeltsBand={setRequiredIeltsBand}
            languagesRequired={languagesRequired}
            setLanguagesRequired={setLanguagesRequired}
          />

          {/* Description & skills */}
          <Section icon={FileText} color="text-purple-600 bg-purple-50" title="Description & skills" subtitle="Describe the role and what skills you need">
            <Field label="Job description" required error={form.formState.errors.description?.message}
              hint="Mention visa support, accommodation, relocation — the things candidates compare on">
              <Textarea {...form.register("description")} rows={5}
                maxLength={FIELD_LIMITS.longDescription}
                placeholder="Describe the role, team, benefits, and what makes this opportunity attractive…"
                className="text-sm" />
              <div className="text-[10px] text-slate-400 text-right mt-1">
                {form.watch("description")?.length ?? 0} / {FIELD_LIMITS.longDescription}
              </div>
            </Field>

            <Field label="Required skills" hint="Press Enter or click a chip to add">
              <div className="flex gap-2 mb-2">
                <IconInput icon={<Sparkles className="w-4 h-4 text-slate-400" />}
                  value={skillInput} onChange={(e: any) => setSkillInput(e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === "Enter") { e.preventDefault(); addSkill(skillInput); } }}
                  maxLength={FIELD_LIMITS.tagItem}
                  placeholder="Type a skill and press Enter" />
                <Button type="button" variant="outline" onClick={() => addSkill(skillInput)} className="shrink-0">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_SKILLS.filter((s) => !selectedSkills.includes(s)).slice(0, 10).map((s) => (
                  <button key={s} type="button" onClick={() => addSkill(s)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-blue-400 hover:text-blue-700 transition">
                    + {s}
                  </button>
                ))}
              </div>
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  {selectedSkills.map((s) => (
                    <Badge key={s} className="bg-blue-600 text-white hover:bg-blue-700">
                      {s}
                      <X className="ml-1 h-3 w-3 cursor-pointer hover:text-red-200" onClick={() => removeSkill(s)} />
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
          </Section>

          <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t flex-col sm:flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={saveDraft}
              disabled={mutation.isPending || !form.watch("title")?.trim()}
              title="Save now, finish later. Only the job title is required.">
              Save as Draft
            </Button>
            <Button type="submit" disabled={mutation.isPending || !isVerified}
              className={`${!isVerified
                ? "opacity-50 cursor-not-allowed bg-gray-400"
                : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"} text-white shadow-md shadow-blue-500/20`}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                isEdit ? "Save Changes" : <><Briefcase className="mr-2 h-4 w-4" /> Publish Job</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
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

function Field({ label, required, hint, error, children }: any) {
  return (
    <div>
      <Label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {hint && !error && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const IconInput = forwardRef<HTMLInputElement, any>(function IconInput({ icon, ...props }, ref) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">{icon}</div>
      <Input ref={ref} {...props} className="pl-9 h-10 text-sm" />
    </div>
  );
});
