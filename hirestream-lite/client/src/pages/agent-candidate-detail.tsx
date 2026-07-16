import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Mail, Phone, GraduationCap, Briefcase, FileText,
  Globe, Star, Award, Loader2, Download, CheckCircle, Shield, ShieldAlert,
  Plane, Heart, BookOpen, Save, Eye, IdCard,
} from "lucide-react";
import { PhotoAvatar } from "@/components/shared/PhotoAvatar";
import { ReadinessPanel } from "@/components/shared/ReadinessPanel";
import { TravelReadyBadge } from "@/components/shared/TravelReadyBadge";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

// audit 2026-07-06 (C10b): the placement panels used qc.invalidateQueries({}),
// which refetched the ENTIRE cache. All their data (visa status/history, start
// date, appointment letter, welfare) comes from this page's candidate-detail
// query — invalidate just that.
function invalidateCandidateDetail(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/v1/agencies/candidates/") });
}

export default function AgentCandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: res, isLoading } = useQuery({
    queryKey: [`/api/v1/agencies/candidates/${id}`],
    queryFn: () => fetchJson(`/api/v1/agencies/candidates/${id}`),
  });

  const c = res?.data;

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!c) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Candidate not found</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const initials = (c.fullName || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium">{c.fullName}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-start gap-5 flex-wrap">
          <PhotoAvatar photoUrl={c.photoUrl} name={c.fullName || "?"}
            size="w-20 h-20" rounded="rounded-2xl" textSize="text-3xl" />
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{c.fullName}</h1>
              {/* readiness 2026-07-07: at-a-glance deployment stage next to the name */}
              {c.readiness && <TravelReadyBadge stage={c.readiness.stage} isTravelReady={c.readiness.isTravelReady} size="sm" />}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-2">
              {c.location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{c.location}</span>}
              {c.experience > 0 && <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-slate-400" />{c.experience} yrs experience</span>}
              {c.preferredCountries?.length > 0 && (
                <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-slate-400" />{c.preferredCountries.join(", ")}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => window.location.href = `mailto:${c.email}`}>
                <Mail className="w-4 h-4 mr-1.5" /> {c.email}
              </Button>
              {c.phone && (
                <Button size="sm" variant="outline" onClick={() => window.location.href = `tel:${c.phone}`}>
                  <Phone className="w-4 h-4 mr-1.5" /> Call
                </Button>
              )}
            </div>
          </div>
        </div>

        {c.skills?.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {c.skills.map((s: string) => <Badge key={s} variant="secondary" className="text-xs rounded-lg px-3 py-1">{s}</Badge>)}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your private tags</h2>
          <PrivateTagsEditor candidateId={c.id} />
        </section>

        {/* UAT-03 #13: countries the candidate was refused for (visa/country). Jobs
            in these countries are hidden from the candidate's own listings. */}
        <section className="mt-6">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Visa / country rejections</h2>
          <CountryRejectionEditor candidateId={c.id} initial={c.rejectedCountries || []} />
        </section>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-violet-600" /> Education
          </h2>
          {c.education?.length === 0 && <p className="text-sm text-slate-400">No records.</p>}
          <div className="space-y-2">
            {c.education.map((e: any) => (
              <div key={e.id} className="bg-violet-50/40 border border-violet-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-900">{e.degree}</p>
                <p className="text-xs text-slate-500">{e.institution}</p>
                <div className="flex items-center gap-2 mt-1">
                  {e.year && <Badge variant="outline" className="text-[10px] bg-white">{e.year}</Badge>}
                  {e.percentage && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{e.percentage}%</Badge>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-emerald-600" /> Experience
          </h2>
          {c.experience?.length === 0 && <p className="text-sm text-slate-400">No records.</p>}
          <div className="space-y-2">
            {(c.experience ?? []).map((e: any) => (
              <div key={e.id} className="bg-emerald-50/40 border border-emerald-100 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-900">{e.role}</p>
                <p className="text-xs text-slate-600 font-medium">{e.company}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] bg-white">{e.years} yrs</Badge>
                  {e.country && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{e.country}</Badge>}
                </div>
                {e.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{e.description}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {c.documents?.length > 0 && (
        <section className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-purple-600" /> Documents
          </h2>
          <div className="grid md:grid-cols-2 gap-2">
            {c.documents.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{d.fileName}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] capitalize">{d.type}</Badge>
                      {d.verified && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Verified</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a href={`/api/v1/candidates/documents/${d.id}/download?inline=1`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1"><Eye className="w-3.5 h-3.5" /> Preview</Button>
                  </a>
                  <a href={`/api/v1/candidates/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1"><Download className="w-3.5 h-3.5" /></Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* readiness 2026-07-07: deployment-readiness ring + stepper + what's-left,
          just above the compliance panel that feeds it */}
      {c.readiness && <ReadinessPanel readiness={c.readiness} className="mt-4" />}

      {/* Compliance & pre-departure panel — overseas-placement essential */}
      <ComplianceAndWelfarePanel candidate={c} applications={c.applications ?? []} />

      {c.applications?.length > 0 && (
        <section className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-amber-600" /> Applications ({c.applications.length})
          </h2>
          <div className="space-y-2">
            {c.applications.map((a: any) => (
              <Link key={a.id} href={`/agent/jobs/${a.jobId}`}
                className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{a.jobTitle}</p>
                  <p className="text-xs text-slate-500">{a.company} · {a.country}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{a.status?.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline" className={`text-[10px] font-semibold ${a.matchScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50"}`}>
                    {a.matchScore}%
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Compliance & Welfare Panel ───────────────────────────────────────
function ComplianceAndWelfarePanel({ candidate, applications }: { candidate: any; applications: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    passportNumber: candidate.passportNumber ?? "",
    passportExpiry: candidate.passportExpiry ?? "",
    ecrStatus: candidate.ecrStatus ?? "",
    pccStatus: candidate.pccStatus ?? "",
    medicalStatus: candidate.medicalStatus ?? "",
    ieltsBand: candidate.ieltsBand ?? "",
    pdoCompleted: !!candidate.pdoCompleted,
    pdoDate: candidate.pdoDate ?? "",
    pbbyInsuranceStatus: candidate.pbbyInsuranceStatus ?? "",
    pbbyPolicyNumber: candidate.pbbyPolicyNumber ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/candidates/${candidate.id}/compliance`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ieltsBand: form.ieltsBand === "" ? null : Number(form.ieltsBand),
          passportExpiry: form.passportExpiry || null,
          pdoDate: form.pdoDate || null,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Compliance record saved" });
      qc.invalidateQueries({ queryKey: [`/api/v1/agencies/candidates/${candidate.id}`] });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const statusBadge = (status: string, ok: string, pending: string, bad: string) => {
    if (!status) return <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500">Not set</Badge>;
    const cls = status === ok ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === pending ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === bad ? "bg-red-50 text-red-700 border-red-200"
      : "bg-slate-50 text-slate-700";
    return <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>{status.replace(/_/g, " ")}</Badge>;
  };

  const activePlacement = applications.find((a) => a.status === "selected" || a.status === "placed");

  return (
    <section className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" />
          <div>
            <h2 className="font-bold">Pre-Departure Compliance (MEA / Emigration Act)</h2>
            <p className="text-xs text-slate-300">Mandatory regulatory data for overseas placement. Agent-maintained.</p>
          </div>
        </div>
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-x-6 gap-y-4">
        {/* Aadhaar — identity anchor. Candidate-provided (read-only here); shown
            masked to the last 4 (server already masks it for staff) so the agent
            can cross-check the uploaded ID without seeing the full number. */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IdCard className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-900">Aadhaar (identity)</h3>
            {candidate.aadhaarNumber && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">On file</Badge>}
          </div>
          <div className="h-9 flex items-center px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 tracking-widest">
            {candidate.aadhaarNumber || <span className="text-slate-400 tracking-normal">Not provided</span>}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Masked · provided by candidate · verify against the uploaded ID</p>
        </div>

        {/* Passport */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Passport</h3>
            {candidate.passportNumber && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">On file</Badge>}
          </div>
          <Input placeholder="Passport number" value={form.passportNumber}
            onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
            className="h-9 text-sm mb-2" />
          <label className="text-[10px] text-slate-500">Expiry</label>
          <Input type="date" value={form.passportExpiry}
            onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })}
            min={new Date().toISOString().slice(0, 10)}
            className="h-9 text-sm" />
        </div>

        {/* ECR Status */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">ECR Status</h3>
            {statusBadge(candidate.ecrStatus ?? "", "ecnr", "", "ecr")}
          </div>
          <Select value={form.ecrStatus} onValueChange={(v) => setForm({ ...form, ecrStatus: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ecnr">ECNR (no clearance needed)</SelectItem>
              <SelectItem value="ecr">ECR (emigration clearance required)</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-slate-400 mt-1">ECR holders need POE clearance for 18 Gulf + Malaysia countries.</p>
        </div>

        {/* PCC */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Police Clearance (PCC)</h3>
          <Select value={form.pccStatus} onValueChange={(v) => setForm({ ...form, pccStatus: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="not_required">Not required</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Medical */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-900">Medical Fitness</h3>
          </div>
          <Select value={form.medicalStatus} onValueChange={(v) => setForm({ ...form, medicalStatus: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="unfit">Unfit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* IELTS */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">IELTS band (if applicable)</h3>
          <Input type="number" step="0.5" min="0" max="9" placeholder="e.g. 7.5"
            value={form.ieltsBand}
            onChange={(e) => setForm({ ...form, ieltsBand: e.target.value })}
            className="h-9 text-sm" />
        </div>

        {/* PDO */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Plane className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-bold text-slate-900">Pre-Departure Orientation (PDO)</h3>
            {candidate.pdoCompleted && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Completed</Badge>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.pdoCompleted}
                onChange={(e) => setForm({ ...form, pdoCompleted: e.target.checked })}
                className="w-4 h-4" />
              Completed
            </label>
            <Input type="date" value={form.pdoDate}
              onChange={(e) => setForm({ ...form, pdoDate: e.target.value })}
              className="h-9 text-sm flex-1" />
          </div>
        </div>

        {/* PBBY */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">PBBY Insurance (Pravasi Bharatiya Bima Yojana)</h3>
            {statusBadge(candidate.pbbyInsuranceStatus ?? "", "enrolled", "pending", "")}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Select value={form.pbbyInsuranceStatus} onValueChange={(v) => setForm({ ...form, pbbyInsuranceStatus: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="not_required">Not required</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Policy number" value={form.pbbyPolicyNumber}
              onChange={(e) => setForm({ ...form, pbbyPolicyNumber: e.target.value })}
              className="h-9 text-sm" />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Mandatory for ECR-category emigrants under Emigration Act §10.</p>
        </div>
      </div>

      <div className="flex items-center justify-between bg-slate-50 px-5 py-3 rounded-b-2xl border-t border-slate-100">
        <p className="text-xs text-slate-500">Changes here are written to the audit log.</p>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save compliance
        </Button>
      </div>

      {/* Visa/passport assistance + welfare — only when a placement exists */}
      {activePlacement?.placementId && (
        <>
          <VisaStatusPanel placementId={activePlacement.placementId} current={activePlacement.visaStatus} history={activePlacement.visaHistory ?? []} />
          <AppointmentTravelPanel placementId={activePlacement.placementId} startDate={activePlacement.startDate} appointmentLetterUrl={activePlacement.appointmentLetterUrl} />
          <WelfarePanel placementId={activePlacement.placementId} welfare={activePlacement.welfare} />
        </>
      )}
    </section>
  );
}

// ── Visa/passport assistance (FRS 2.2 — agency-driven) ───────────────
// The agency moves the visa/passport status forward; the candidate is
// notified on every change. Foundation for a fuller pre-departure module.
const VISA_STEPS: { value: string; label: string; tone: string }[] = [
  { value: "not_applied", label: "Not applied yet", tone: "text-slate-600" },
  { value: "applied",     label: "Application submitted", tone: "text-blue-700" },
  { value: "approved",    label: "Approved", tone: "text-emerald-700" },
  { value: "rejected",    label: "Rejected", tone: "text-red-700" },
];
function VisaStatusPanel({ placementId, current, history }: { placementId: string; current?: string | null; history?: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(current || "not_applied");
  const [note, setNote] = useState("");
  const labelFor = (v: string) => VISA_STEPS.find((s) => s.value === v)?.label || v;
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/placements/${placementId}/visa-status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visaStatus: value, note: note.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Visa status updated", description: "The candidate has been notified." });
      setNote("");
      invalidateCandidateDetail(qc);
    },
    onError: (e: any) => toast({ title: "Couldn't update visa status", description: e.message, variant: "destructive" }),
  });
  const dirty = value !== (current || "not_applied") || note.trim().length > 0;
  return (
    <div className="border-t border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
        <Plane className="w-4 h-4 text-indigo-600" /> Visa / passport assistance
      </h3>
      <p className="text-xs text-slate-500 mb-3">Agency-maintained. The candidate sees this on their application and is notified on every change.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className="text-[11px] font-semibold text-slate-600">Status</label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VISA_STEPS.map((s) => (
                <SelectItem key={s.value} value={s.value}><span className={s.tone}>{s.label}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-[11px] font-semibold text-slate-600">Note to candidate (optional)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Embassy appointment on 12 June" className="h-9 mt-1 text-sm" />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Update & notify
        </Button>
      </div>

      {/* History timeline — every change is logged (audit_log) and shown here */}
      {history && history.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">History</p>
          <ul className="space-y-2">
            {history.map((h, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">{labelFor(h.visaStatus)}</span>
                  <span className="text-slate-400"> · {h.at ? new Date(h.at).toLocaleString("en-IN") : ""}{h.role ? ` · by ${h.role}` : ""}</span>
                  {h.note && <p className="text-slate-600 mt-0.5">“{h.note}”</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Appointment letter + travel/start date (FRS 2.2 — agency issues these) ──
function AppointmentTravelPanel({ placementId, startDate, appointmentLetterUrl }: { placementId: string; startDate?: string | null; appointmentLetterUrl?: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(startDate ? String(startDate).slice(0, 10) : "");
  const [url, setUrl] = useState<string>(appointmentLetterUrl && /^https?:\/\//i.test(appointmentLetterUrl) ? appointmentLetterUrl : "");
  const hasLetter = !!appointmentLetterUrl;

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/v1/agent/placements/${placementId}/appointment-letter-file`, { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error?.message || (await r.json().catch(() => ({})))?.message || "Upload failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Appointment letter uploaded" }); invalidateCandidateDetail(qc); },
    onError: (e: any) => toast({ title: "Couldn't upload letter", description: e.message, variant: "destructive" }),
  });

  const saveDate = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/placements/${placementId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: date || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Start date saved" }); invalidateCandidateDetail(qc); },
    onError: (e: any) => toast({ title: "Couldn't save start date", description: e.message, variant: "destructive" }),
  });

  const saveUrl = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/placements/${placementId}/appointment-letter`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentLetterUrl: url.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Appointment letter linked" }); invalidateCandidateDetail(qc); },
    onError: (e: any) => toast({ title: "Couldn't save letter", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border-t border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
        <FileText className="w-4 h-4 text-emerald-600" /> Appointment &amp; travel
      </h3>
      <p className="text-xs text-slate-500 mb-3">Agency-issued. Both appear on the candidate's pre-departure tracker.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-600">Travel / start date</label>
          <div className="flex gap-2 mt-1">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
            <Button size="sm" disabled={saveDate.isPending || (date ? date : "") === (startDate ? String(startDate).slice(0, 10) : "")}
              onClick={() => saveDate.mutate()} className="gap-1">
              {saveDate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-600">Appointment letter</label>
          <div className="flex items-center gap-2 mt-1">
            <label className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-md border cursor-pointer ${uploadFile.isPending ? "opacity-60" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
              {uploadFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {hasLetter ? "Replace file" : "Upload signed file"}
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                disabled={uploadFile.isPending}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); e.currentTarget.value = ""; }} />
            </label>
            {hasLetter && (
              <a href={`/api/v1/agent/placements/${placementId}/appointment-letter`} target="_blank" rel="noreferrer"
                className="text-[11px] font-semibold text-indigo-600 hover:underline">View current</a>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an external link" className="h-9 text-sm" />
            <Button size="sm" variant="outline" disabled={!url.trim() || saveUrl.isPending || url.trim() === (appointmentLetterUrl || "")}
              onClick={() => saveUrl.mutate()} className="gap-1">
              {saveUrl.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const WELFARE_OPTS: { value: string; label: string; tone: string }[] = [
  { value: "ok",             label: "OK",             tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "concerns",       label: "Concerns",       tone: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "no_response",    label: "No response",    tone: "text-slate-600 bg-slate-50 border-slate-200" },
  { value: "not_applicable", label: "Not applicable", tone: "text-slate-500 bg-slate-50 border-slate-200" },
];
function WelfarePanel({ placementId, welfare }: { placementId: string; welfare?: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState("ok");
  const [draftNotes, setDraftNotes] = useState("");
  const record = useMutation({
    mutationFn: async ({ milestone, status, notes }: { milestone: string; status: string; notes?: string }) => {
      const r = await fetch(`/api/v1/agent/placements/${placementId}/welfare`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone, status, notes: notes ?? null }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Welfare check-in recorded" }); setEditing(null); setDraftNotes(""); invalidateCandidateDetail(qc); },
    onError: () => toast({ title: "Couldn't record check-in", variant: "destructive" }),
  });
  const milestones = [{ m: "30", w: welfare?.d30 }, { m: "60", w: welfare?.d60 }, { m: "90", w: welfare?.d90 }];
  const openEditor = (m: string, current?: any) => {
    setEditing(m);
    setDraftStatus(current?.status || "ok");
    setDraftNotes(current?.notes || "");
  };
  return (
    <div className="border-t border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <Heart className="w-4 h-4 text-rose-600" /> Post-placement welfare check-ins
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {milestones.map(({ m, w }) => {
          const opt = WELFARE_OPTS.find((o) => o.value === w?.status);
          const recorded = !!w?.status;
          return (
            <div key={m} className={`rounded-lg border p-4 ${recorded ? "bg-white border-slate-200" : "bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">{m}-day check-in</p>
                <button onClick={() => openEditor(m, w)} className="text-[11px] text-blue-600 font-semibold hover:underline">
                  {recorded ? "Edit" : "Record"}
                </button>
              </div>
              {recorded ? (
                <div className="mt-2 space-y-1">
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${opt?.tone}`}>{opt?.label || w.status}</span>
                  {w.at && <p className="text-[10px] text-slate-400">{new Date(w.at).toLocaleDateString("en-IN")}</p>}
                  {w.notes && <p className="text-[11px] text-slate-600">{w.notes}</p>}
                </div>
              ) : (
                <p className="text-[10px] text-rose-600 mt-1">Not recorded yet</p>
              )}

              {editing === m && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                  <Select value={draftStatus} onValueChange={setDraftStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WELFARE_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Notes (optional)" className="h-8 text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" disabled={record.isPending}
                      onClick={() => record.mutate({ milestone: m, status: draftStatus, notes: draftNotes.trim() || undefined })}>
                      {record.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Private per-agent tags on a candidate ────────────────────────────
// LinkedIn Recruiter-style: the agent's personal annotations ("good-english",
// "passport-expires-aug"). Visible only to the agent who wrote them.
function PrivateTagsEditor({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: res } = useQuery({
    queryKey: [`/api/v1/agent/candidates/${candidateId}/tags`],
    queryFn: async () => (await fetch(`/api/v1/agent/candidates/${candidateId}/tags`)).json(),
  });
  const tags: any[] = res?.data ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const tag = text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!tag) return;
      const r = await fetch(`/api/v1/agent/candidates/${candidateId}/tags`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag }),
      });
      if (!r.ok) throw new Error("Could not add tag");
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: [`/api/v1/agent/candidates/${candidateId}/tags`] }); },
  });
  const del = useMutation({
    mutationFn: async (tagId: string) => {
      await fetch(`/api/v1/agent/candidates/${candidateId}/tags/${tagId}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/v1/agent/candidates/${candidateId}/tags`] }); },
  });

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 && <p className="text-xs text-slate-400 italic">No tags yet. Add private notes like <span className="font-mono">good-english</span> or <span className="font-mono">gulf-ready</span>.</p>}
        {tags.map((t: any) => (
          <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
            <span>#{t.tag}</span>
            <button onClick={() => del.mutate(t.id)} className="text-slate-400 hover:text-red-600 ml-0.5" title="Remove tag" aria-label={`Remove ${t.tag}`}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add.mutate(); } }}
          placeholder="Add a tag (letters, digits, dashes) — press Enter"
          className="text-sm h-9"
          maxLength={40}
        />
        <Button size="sm" variant="outline" onClick={() => add.mutate()} disabled={!text.trim() || add.isPending}>
          Add
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">Private to your agency. Other agencies looking at this candidate won't see your tags.</p>
    </div>
  );
}

// UAT-03 #13: agent control to record/clear a candidate's visa/country rejections.
function CountryRejectionEditor({ candidateId, initial }: { candidateId: string; initial: string[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [list, setList] = useState<string[]>(initial || []);
  const [input, setInput] = useState("");
  const add = useMutation({
    mutationFn: async (country: string) => {
      const r = await fetch(`/api/v1/candidates/${candidateId}/country-rejection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ country }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: (d: any) => { setList(d.data.rejectedCountries); setInput(""); toast({ title: "Country rejection saved" }); qc.invalidateQueries({ queryKey: [`/api/v1/agencies/candidates/${candidateId}`] }); },
    onError: (e: any) => toast({ title: e.message || "Couldn't save", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (country: string) => {
      const r = await fetch(`/api/v1/candidates/${candidateId}/country-rejection?country=${encodeURIComponent(country)}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (d: any) => setList(d.data.rejectedCountries),
  });
  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">Add a country the candidate was refused a visa for. Jobs in that country stop showing in the candidate's own listings.</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {list.length === 0 && <span className="text-sm text-slate-400">None.</span>}
        {list.map((cty) => (
          <span key={cty} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            {cty}
            <button onClick={() => remove.mutate(cty)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-100" aria-label={`Remove ${cty}`}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Saudi Arabia" className="h-9 text-sm max-w-[220px]" />
        <Button size="sm" variant="outline" disabled={!input.trim() || add.isPending} onClick={() => add.mutate(input.trim())}>Add</Button>
      </div>
    </div>
  );
}
