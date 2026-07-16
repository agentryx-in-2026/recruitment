/**
 * v0.4.32 (HPSEDC Item 3): Agency KYB verification form.
 *
 * Renders inside a sheet/dialog. Mirrors EmployerVerificationForm but with
 * agency-specific fields (MEA RA license + 9 mandated doc classes). Uses
 * PATCH /api/v1/agencies/me for field updates + /agencies/documents +
 * /agencies/submit-for-review.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Building, Loader2, ShieldCheck, FileSignature, IdCard, MapPin,
  AlertTriangle, FileText, Award, Briefcase, Send, CheckCircle, FileBadge, BookOpen,
} from "lucide-react";
import { KYBDocSlots, type KYBSlotDef } from "@/components/shared/KYBDocSlots";

// HPSEDC Item 3: the 9 doc classes flagged for MEA RA agency verification.
// Order = visual sequence on the form.
const AGENCY_DOC_SLOTS: KYBSlotDef[] = [
  { value: "mea_ra_license",          label: "MEA RA Licence",            description: "Recruiting Agent licence issued by Ministry of External Affairs", icon: ShieldCheck,    color: "text-emerald-600 bg-emerald-100", required: true },
  { value: "incorporation_certificate", label: "Incorporation Certificate", description: "Certificate of Incorporation / Registration",                     icon: FileText,       color: "text-blue-600 bg-blue-100" },
  { value: "pan_card",                label: "PAN Card",                  description: "Agency PAN card",                                                  icon: IdCard,         color: "text-violet-600 bg-violet-100" },
  { value: "gst_certificate",         label: "GST Registration",          description: "GSTIN registration certificate",                                   icon: Award,          color: "text-amber-600 bg-amber-100" },
  { value: "address_proof",           label: "Office Address Proof",      description: "Lease deed / utility bill / municipal certificate",                icon: MapPin,         color: "text-teal-600 bg-teal-100" },
  { value: "signatory_id",            label: "Authorised Signatory ID",   description: "Aadhaar / passport / driving licence",                             icon: FileSignature,  color: "text-cyan-600 bg-cyan-100" },
  { value: "labour_permission",       label: "Labour / Recruitment Permission", description: "Any state-level recruitment permission you hold",            icon: Briefcase,      color: "text-indigo-600 bg-indigo-100" },
  { value: "experience_proof",        label: "Experience / Work Orders",  description: "Past placement contracts or work orders (multi-upload OK)",        icon: BookOpen,       color: "text-rose-600 bg-rose-100" },
  { value: "agreement",               label: "Agreement / Undertaking",   description: "Recruitment undertaking with HPSEDC",                              icon: FileBadge,      color: "text-purple-600 bg-purple-100" },
];

interface AgencyProfile {
  id?: string;
  agencyName?: string;
  licenseNumber?: string;
  specializations?: string[] | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  registeredAddressLine1?: string | null;
  registeredAddressLine2?: string | null;
  registeredCity?: string | null;
  registeredState?: string | null;
  registeredPinCode?: string | null;
  authorisedSignatoryName?: string | null;
  authorisedSignatoryDesignation?: string | null;
  meaLicenseExpiry?: string | null;
  verified?: boolean | null;
  submittedForReviewAt?: string | null;
  rejectionReason?: string | null;
  verifiedAt?: string | null;
}

export function AgencyVerificationForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: profileRes, isLoading } = useQuery({
    queryKey: ["/api/v1/agencies/me"],
    queryFn: async () => {
      const r = await fetch("/api/v1/agencies/me");
      if (!r.ok) return { data: null };
      return r.json();
    },
  });
  const profile: AgencyProfile | null = profileRes?.data ?? null;

  const [form, setForm] = useState<AgencyProfile>({});
  useEffect(() => {
    if (profile) {
      setForm({
        agencyName: profile.agencyName ?? "",
        licenseNumber: profile.licenseNumber ?? "",
        contactEmail: profile.contactEmail ?? "",
        contactPhone: profile.contactPhone ?? "",
        registeredAddressLine1: profile.registeredAddressLine1 ?? "",
        registeredAddressLine2: profile.registeredAddressLine2 ?? "",
        registeredCity: profile.registeredCity ?? "",
        registeredState: profile.registeredState ?? "",
        registeredPinCode: profile.registeredPinCode ?? "",
        authorisedSignatoryName: profile.authorisedSignatoryName ?? "",
        authorisedSignatoryDesignation: profile.authorisedSignatoryDesignation ?? "",
        meaLicenseExpiry: profile.meaLicenseExpiry ? String(profile.meaLicenseExpiry).split("T")[0] : "",
      });
    }
  }, [profile?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/v1/agencies/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || err.error?.message || "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agencies/me"] });
      toast({ title: "Saved", description: "Agency details updated." });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      const r = await fetch("/api/v1/agencies/submit-for-review", { method: "POST" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Submit failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agencies/me"] });
      toast({ title: "Submitted for review", description: "HPSEDC will verify within 48 hours." });
      onDone?.();
    },
    onError: (e: any) => toast({ title: "Couldn't submit", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  if (!profile) {
    return (
      <div className="p-6 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
        Register your agency first before completing verification.
      </div>
    );
  }

  const verified = !!profile.verified;
  const submitted = !!profile.submittedForReviewAt && !verified;
  const rejected = !verified && !!profile.rejectionReason && !submitted;

  return (
    <div className="space-y-6">
      {verified && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Your agency is verified</p>
            <p className="text-xs text-emerald-700 mt-0.5">You can post jobs and pick up requisitions. Approved documents cannot be edited.</p>
          </div>
        </div>
      )}
      {submitted && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Verification pending</p>
            <p className="text-xs text-blue-700 mt-0.5">Submitted on {new Date(profile.submittedForReviewAt!).toLocaleDateString("en-IN")}. HPSEDC usually decides within 48 hours.</p>
          </div>
        </div>
      )}
      {rejected && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Previous submission was not approved</p>
            <p className="text-xs text-red-700 mt-0.5">Reason: {profile.rejectionReason}</p>
            <p className="text-xs text-red-700 mt-1">Address the feedback and re-submit.</p>
          </div>
        </div>
      )}

      <Section icon={Building} title="Agency information" color="text-blue-600 bg-blue-100">
        <Grid>
          <Field label="Agency name" required>
            <Input value={form.agencyName ?? ""} onChange={(e) => setForm({ ...form, agencyName: e.target.value })} maxLength={150} />
          </Field>
          <Field label="MEA RA Licence number" required>
            <Input value={form.licenseNumber ?? ""} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="e.g. B-1234/MUM/PER/1000+/5/8585/2024" maxLength={50} />
          </Field>
          <Field label="Licence expiry (if known)">
            <Input type="date" value={form.meaLicenseExpiry ?? ""} onChange={(e) => setForm({ ...form, meaLicenseExpiry: e.target.value })} />
          </Field>
        </Grid>
      </Section>

      <Section icon={MapPin} title="Registered office address" color="text-violet-600 bg-violet-100">
        <Grid>
          <Field label="Address line 1" full><Input value={form.registeredAddressLine1 ?? ""} onChange={(e) => setForm({ ...form, registeredAddressLine1: e.target.value })} maxLength={200} /></Field>
          <Field label="Address line 2" full><Input value={form.registeredAddressLine2 ?? ""} onChange={(e) => setForm({ ...form, registeredAddressLine2: e.target.value })} maxLength={200} /></Field>
          <Field label="City"><Input value={form.registeredCity ?? ""} onChange={(e) => setForm({ ...form, registeredCity: e.target.value })} maxLength={80} /></Field>
          <Field label="State"><Input value={form.registeredState ?? ""} onChange={(e) => setForm({ ...form, registeredState: e.target.value })} maxLength={80} /></Field>
          <Field label="PIN code"><Input value={form.registeredPinCode ?? ""} onChange={(e) => setForm({ ...form, registeredPinCode: e.target.value })} maxLength={10} /></Field>
        </Grid>
      </Section>

      <Section icon={FileSignature} title="Contact & authorised signatory" color="text-emerald-600 bg-emerald-100">
        <Grid>
          <Field label="Contact email"><Input type="email" value={form.contactEmail ?? ""} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} maxLength={120} /></Field>
          <Field label="Contact phone"><Input value={form.contactPhone ?? ""} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} maxLength={20} /></Field>
          <Field label="Signatory name"><Input value={form.authorisedSignatoryName ?? ""} onChange={(e) => setForm({ ...form, authorisedSignatoryName: e.target.value })} maxLength={100} /></Field>
          <Field label="Signatory designation"><Input value={form.authorisedSignatoryDesignation ?? ""} onChange={(e) => setForm({ ...form, authorisedSignatoryDesignation: e.target.value })} maxLength={80} /></Field>
        </Grid>
      </Section>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save details"}
        </Button>
      </div>

      <Section icon={FileText} title="Verification documents" color="text-indigo-600 bg-indigo-100">
        <KYBDocSlots
          subtitle="MEA RA Licence is mandatory. Approved documents become read-only."
          slots={AGENCY_DOC_SLOTS}
          endpoint="/api/v1/agencies/documents"
          queryKey={["/api/v1/agencies/documents"]}
        />
      </Section>

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
