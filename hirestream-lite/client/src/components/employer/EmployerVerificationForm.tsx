/**
 * v0.4.32 (HPSEDC Item 1): Employer company-verification form.
 *
 * Renders inside a sheet/dialog. Sections:
 *  1. Company info (legal name, industry, business registration no., tax id)
 *     — the employer is an OVERSEAS company (FRS); Indian KYC lives on the agency.
 *  2. Registered address (line 1/2, city, state, pin, country of operation)
 *  3. Contact (email, phone) + authorised signatory (name, designation,
 *     ID type, ID number)
 *  4. KYB documents (via shared KYBDocSlots)
 *  5. Submit-for-review CTA, blocked until required text fields + at least
 *     one doc are present (server-side guard also enforces this)
 *
 * The form auto-loads the employer's existing profile so it works as both
 * first-time onboarding and resubmission after a rejection.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building, Loader2, ShieldCheck, FileSignature, IdCard, MapPin,
  Mail, Phone, AlertTriangle, FileText, Award, Briefcase, Send, CheckCircle,
} from "lucide-react";
import { KYBDocSlots, type KYBSlotDef } from "@/components/shared/KYBDocSlots";
import { DESTINATION_COUNTRIES } from "@/lib/reference-data";

// Overseas employer document set (FRS: employers are foreign companies; the
// Indian KYC — incorporation/PAN/GST — belongs to the recruiting AGENCY).
// These mirror the MEA eMigrate model for a foreign principal employer.
const EMPLOYER_DOC_SLOTS: KYBSlotDef[] = [
  { value: "demand_letter",        label: "Demand Letter",                description: "Manpower request — roles, headcount, salary & terms (attested by the Indian Mission)", icon: FileText,      color: "text-blue-600 bg-blue-100",      required: true },
  { value: "power_of_attorney",    label: "Power of Attorney",            description: "Authorising the Indian recruiting agent to act on your behalf (Mission-attested)",      icon: FileSignature, color: "text-violet-600 bg-violet-100",  required: true },
  { value: "company_registration", label: "Business Registration / Trade Licence", description: "Company registration or trade licence in your country of operation",            icon: Award,         color: "text-amber-600 bg-amber-100",    required: true },
  { value: "employment_contract",  label: "Employment Contract / Offer",  description: "Standard worker contract / offer template for the deployment",                          icon: Briefcase,     color: "text-emerald-600 bg-emerald-100" },
  { value: "signatory_id",         label: "Authorised Signatory Passport / ID", description: "Passport or national ID of the signing representative",                            icon: IdCard,        color: "text-cyan-600 bg-cyan-100",      required: true },
  { value: "agreement",            label: "Agreement / Undertaking",      description: "Recruitment undertaking with HPSEDC",                                                   icon: ShieldCheck,   color: "text-teal-600 bg-teal-100" },
];

interface ProfileShape {
  id?: string;
  companyName?: string;
  industry?: string | null;
  location?: string | null;
  cin?: string | null;
  gst?: string | null;
  pan?: string | null;
  registeredAddressLine1?: string | null;
  registeredAddressLine2?: string | null;
  registeredCity?: string | null;
  registeredState?: string | null;
  registeredPinCode?: string | null;
  registeredCountry?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  authorisedSignatoryName?: string | null;
  authorisedSignatoryDesignation?: string | null;
  authorisedSignatoryIdType?: string | null;
  authorisedSignatoryIdNumber?: string | null;
  verified?: boolean | null;
  submittedForReviewAt?: string | null;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
}

export function EmployerVerificationForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profileRes, isLoading } = useQuery({
    queryKey: ["/api/v1/employer/profile"],
    queryFn: async () => {
      const r = await fetch("/api/v1/employer/profile");
      if (!r.ok) return { data: {} };
      return r.json();
    },
  });
  const profile: ProfileShape = profileRes?.data || {};

  const [form, setForm] = useState<ProfileShape>({});
  useEffect(() => {
    if (profile && Object.keys(profile).length) {
      setForm({
        companyName: profile.companyName && profile.companyName !== "(pending)" ? profile.companyName : "",
        industry: profile.industry ?? "",
        location: profile.location ?? "",
        cin: profile.cin ?? "",
        gst: profile.gst ?? "",
        pan: profile.pan ?? "",
        registeredAddressLine1: profile.registeredAddressLine1 ?? "",
        registeredAddressLine2: profile.registeredAddressLine2 ?? "",
        registeredCity: profile.registeredCity ?? "",
        registeredState: profile.registeredState ?? "",
        registeredPinCode: profile.registeredPinCode ?? "",
        registeredCountry: profile.registeredCountry ?? "",
        contactEmail: profile.contactEmail ?? "",
        contactPhone: profile.contactPhone ?? "",
        authorisedSignatoryName: profile.authorisedSignatoryName ?? "",
        authorisedSignatoryDesignation: profile.authorisedSignatoryDesignation ?? "",
        authorisedSignatoryIdType: profile.authorisedSignatoryIdType ?? "",
        authorisedSignatoryIdNumber: profile.authorisedSignatoryIdNumber ?? "",
      });
    }
  }, [profile.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/v1/employer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/employer/profile"] });
      toast({ title: "Saved", description: "Profile details updated." });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Save fields first so any in-flight edits are persisted
      await saveMutation.mutateAsync();
      const r = await fetch("/api/v1/employer/submit-for-review", { method: "POST" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Submit failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/employer/profile"] });
      toast({ title: "Submitted for review", description: "HPSEDC admin will verify within 48 hours." });
      onDone?.();
    },
    onError: (e: any) => toast({ title: "Couldn't submit", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const verified = !!profile.verified;
  const submitted = !!profile.submittedForReviewAt && !verified;
  const rejected = !verified && !!profile.rejectionReason && !submitted;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {verified && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Your company is verified</p>
            <p className="text-xs text-emerald-700 mt-0.5">You can publish requisitions. Approved documents cannot be edited.</p>
          </div>
        </div>
      )}
      {submitted && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Verification pending</p>
            <p className="text-xs text-blue-700 mt-0.5">Submitted for HPSEDC review on {new Date(profile.submittedForReviewAt!).toLocaleDateString("en-IN")}. Usually decided within 48 hours.</p>
          </div>
        </div>
      )}
      {rejected && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Previous submission was not approved</p>
            <p className="text-xs text-red-700 mt-0.5">Reason: {profile.rejectionReason}</p>
            <p className="text-xs text-red-700 mt-1">Update the details / re-upload any flagged documents and re-submit.</p>
          </div>
        </div>
      )}

      {/* Section 1: Company info */}
      <Section icon={Building} title="Company information" color="text-blue-600 bg-blue-100">
        <Grid>
          <Field label="Legal company name" required>
            <Input value={form.companyName ?? ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="e.g. Acme Overseas Recruitment Pvt Ltd" maxLength={150} />
          </Field>
          <Field label="Industry">
            <Input value={form.industry ?? ""} onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="e.g. Healthcare / Construction" maxLength={120} />
          </Field>
          <Field label="Business Registration / Trade Licence No." required>
            <Input value={form.cin ?? ""} onChange={(e) => setForm({ ...form, cin: e.target.value })}
              placeholder="Company registration no. in your country" maxLength={40} />
          </Field>
          <Field label="Tax ID / VAT (optional)">
            <Input value={form.gst ?? ""} onChange={(e) => setForm({ ...form, gst: e.target.value })}
              placeholder="Tax registration no. (if applicable)" maxLength={30} />
          </Field>
          <Field label="Primary operating location">
            <Input value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Dubai, UAE" maxLength={120} />
          </Field>
        </Grid>
      </Section>

      {/* Section 2: Address */}
      <Section icon={MapPin} title="Registered office address" color="text-violet-600 bg-violet-100">
        <Grid>
          <Field label="Address line 1" full>
            <Input value={form.registeredAddressLine1 ?? ""} onChange={(e) => setForm({ ...form, registeredAddressLine1: e.target.value })}
              placeholder="Building, street" maxLength={200} />
          </Field>
          <Field label="Address line 2" full>
            <Input value={form.registeredAddressLine2 ?? ""} onChange={(e) => setForm({ ...form, registeredAddressLine2: e.target.value })}
              placeholder="Area, landmark" maxLength={200} />
          </Field>
          <Field label="City"><Input value={form.registeredCity ?? ""} onChange={(e) => setForm({ ...form, registeredCity: e.target.value })} maxLength={80} /></Field>
          <Field label="State"><Input value={form.registeredState ?? ""} onChange={(e) => setForm({ ...form, registeredState: e.target.value })} maxLength={80} /></Field>
          <Field label="PIN code"><Input value={form.registeredPinCode ?? ""} onChange={(e) => setForm({ ...form, registeredPinCode: e.target.value })} maxLength={10} inputMode="numeric" /></Field>
          <Field label="Country of operation" required>
            <Select value={form.registeredCountry ?? ""} onValueChange={(v) => setForm({ ...form, registeredCountry: v })}>
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {DESTINATION_COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Grid>
      </Section>

      {/* Section 3: Contact + signatory */}
      <Section icon={FileSignature} title="Contact & authorised signatory" color="text-emerald-600 bg-emerald-100">
        <Grid>
          <Field label="Contact email" required>
            <Input type="email" value={form.contactEmail ?? ""} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              placeholder="hr@yourcompany.com" maxLength={120} />
          </Field>
          <Field label="Contact phone">
            <Input value={form.contactPhone ?? ""} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              placeholder="+971 50 123 4567" maxLength={20} inputMode="tel" />
          </Field>
          <Field label="Signatory name" required>
            <Input value={form.authorisedSignatoryName ?? ""} onChange={(e) => setForm({ ...form, authorisedSignatoryName: e.target.value })}
              placeholder="Full legal name" maxLength={100} />
          </Field>
          <Field label="Signatory designation">
            <Input value={form.authorisedSignatoryDesignation ?? ""} onChange={(e) => setForm({ ...form, authorisedSignatoryDesignation: e.target.value })}
              placeholder="e.g. HR Director" maxLength={80} />
          </Field>
          <Field label="Signatory ID type">
            <Select value={form.authorisedSignatoryIdType ?? ""} onValueChange={(v) => setForm({ ...form, authorisedSignatoryIdType: v })}>
              <SelectTrigger><SelectValue placeholder="Select ID type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="national_id">National ID</SelectItem>
                <SelectItem value="driving_licence">Driving Licence</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Signatory ID number">
            <Input value={form.authorisedSignatoryIdNumber ?? ""} onChange={(e) => setForm({ ...form, authorisedSignatoryIdNumber: e.target.value })} maxLength={40} />
          </Field>
        </Grid>
      </Section>

      {/* Save fields */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save details"}
        </Button>
      </div>

      {/* Section 4: Documents */}
      <Section icon={FileText} title="Verification documents" color="text-indigo-600 bg-indigo-100">
        <KYBDocSlots
          subtitle="Upload each document into its slot. Approved documents become read-only."
          slots={EMPLOYER_DOC_SLOTS}
          endpoint="/api/v1/employer/documents"
          queryKey={["/api/v1/employer/documents"]}
        />
      </Section>

      {/* Submit for review */}
      {!verified && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white">
            {submitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4 mr-2" /> {submitted ? "Re-submit for review" : "Submit for review"}</>}
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: any) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <div className="pl-1">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children, required, full }: { label: string; children: React.ReactNode; required?: boolean; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-semibold text-slate-700 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
