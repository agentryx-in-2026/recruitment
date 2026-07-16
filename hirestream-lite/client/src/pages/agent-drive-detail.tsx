import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Calendar, MapPin, Users, Loader2, CheckCircle, XCircle, Megaphone, Clock,
  Download, Star, ClipboardList,
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:  { label: "Rejected",          cls: "bg-red-50 text-red-700 border-red-200" },
  completed: { label: "Completed",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "Cancelled",         cls: "bg-slate-100 text-slate-400 border-slate-200" },
};

export default function AgentDriveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [feedbackFor, setFeedbackFor] = useState<any>(null);

  const { data: driveRes, isLoading } = useQuery({
    queryKey: [`/api/v1/drives/${id}`],
    queryFn: () => fetchJson(`/api/v1/drives/${id}`),
  });
  const { data: intRes } = useQuery({
    queryKey: [`/api/v1/drives/${id}/interviews`],
    queryFn: () => fetchJson(`/api/v1/drives/${id}/interviews`),
  });
  const { data: regRes } = useQuery({
    queryKey: [`/api/v1/drives/${id}/registrations`],
    queryFn: () => fetchJson(`/api/v1/drives/${id}/registrations`),
  });
  const regAction = useMutation({
    mutationFn: async ({ regId, status }: { regId: string; status: string }) => {
      const res = await fetch(`/api/v1/drives/registrations/${regId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Action failed"); }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/v1/drives/${id}/registrations`] });
      toast({ title: vars.status === "invited" ? "Candidate invited" : vars.status === "attended" ? "Marked attended" : "Updated" });
    },
  });
  // Agency's own jobs — to pick which role to interview a registrant for.
  const { data: myJobsRes } = useQuery({
    queryKey: ["/api/v1/jobs", "mine", "drive"],
    queryFn: () => fetchJson("/api/v1/jobs?status=all&mine=true&limit=100"),
  });
  const myJobs: any[] = (myJobsRes?.data ?? []).filter((j: any) => j.status === "active");
  const [scheduleReg, setScheduleReg] = useState<any>(null); // the registration being scheduled
  const [ivJobId, setIvJobId] = useState("");
  const [ivWhen, setIvWhen] = useState("");
  const [ivInterviewer, setIvInterviewer] = useState("");
  const scheduleInterview = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/drives/${id}/registrations/${scheduleReg.id}/schedule-interview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: ivJobId, scheduledAt: ivWhen, interviewerName: ivInterviewer || undefined }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Couldn't schedule interview"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/v1/drives/${id}/registrations`] });
      qc.invalidateQueries({ queryKey: [`/api/v1/drives/${id}/interviews`] });
      setScheduleReg(null); setIvJobId(""); setIvWhen(""); setIvInterviewer("");
      toast({ title: "Interview scheduled at the drive" });
    },
  });

  const setResult = useMutation({
    mutationFn: async ({ interviewId, result }: { interviewId: string; result: string }) => {
      const res = await fetch(`/api/v1/drives/interviews/${interviewId}/result`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Interview result recorded" });
      qc.invalidateQueries({ queryKey: [`/api/v1/drives/${id}/interviews`] });
    },
  });

  const cancelDrive = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/drives/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ title: "Drive cancelled" }); setLocation("/"); },
  });

  // Notify every candidate with an application on this agency's jobs about the
  // drive. Server-side guards: agency-ownership + drive.status === "approved".
  const notifyCandidates = useMutation({
    mutationFn: async (message: string | undefined) => {
      const res = await fetch(`/api/v1/drives/${id}/notify-candidates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || "Failed");
      }
      return res.json();
    },
    onSuccess: (r: any) => {
      toast({ title: `Notified ${r.data?.notified ?? 0} candidate${r.data?.notified === 1 ? "" : "s"}` });
    },
    onError: (e: any) => toast({ title: "Notify failed", description: e.message }),
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const d = driveRes?.data;
  const interviews: any[] = intRes?.data ?? [];
  const registrations: any[] = regRes?.data ?? [];

  if (!d) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Drive not found</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const meta = STATUS_META[d.status] ?? STATUS_META.pending;

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
        <span className="text-slate-900 font-medium truncate">{d.title}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{d.title}</h1>
              {d.description && <p className="text-sm text-slate-600 mt-1 max-w-2xl">{d.description}</p>}
            </div>
          </div>
          <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-6">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">When</p>
            <p className="text-sm text-slate-900 font-bold mt-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              {new Date(d.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Where</p>
            <p className="text-sm text-slate-900 font-bold mt-1 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-rose-600" /> {d.location}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Capacity</p>
            <p className="text-sm text-slate-900 font-bold mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" /> {d.expectedCandidates ?? "—"} candidates
            </p>
          </div>
        </div>

        {d.targetRoles?.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Target roles</p>
            <div className="flex flex-wrap gap-2">
              {d.targetRoles.map((r: string) => <Badge key={r} variant="secondary">{r}</Badge>)}
            </div>
          </div>
        )}

        {d.status === "rejected" && d.rejectionReason && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <span className="font-semibold">Rejection reason:</span> {d.rejectionReason}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {d.status === "approved" && (
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={notifyCandidates.isPending}
              onClick={() => {
                const msg = window.prompt(
                  "Optional: custom message to candidates (leave blank for default drive announcement)",
                  ""
                );
                // prompt returns null on cancel; empty string is a valid "use default".
                if (msg === null) return;
                notifyCandidates.mutate(msg.trim() || undefined);
              }}>
              <Megaphone className="w-4 h-4" />
              {notifyCandidates.isPending ? "Notifying…" : "Notify candidates"}
            </Button>
          )}
          {d.status === "pending" && (
            <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => window.confirm("Cancel this drive?") && cancelDrive.mutate()}>
              Cancel drive
            </Button>
          )}
        </div>
      </motion.div>

      {/* Registrants — candidates who registered for this drive */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" /> Registered Candidates ({registrations.length})
        </h2>
        {registrations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">No registrations yet</p>
            <p className="text-xs text-slate-400 mt-1">{d.status === "approved" ? "Candidates can register from their dashboard once the drive is approved." : "Registrations open once HPSEDC approves the drive."}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {registrations.map((r: any) => {
              const c = r.candidate ?? {};
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {(c.name || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.name || "Candidate"}</p>
                    <p className="text-xs text-slate-500 truncate">{c.location || ""}{c.phone ? ` · ${c.phone}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.status === "registered" && (
                      <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" disabled={regAction.isPending}
                        onClick={() => regAction.mutate({ regId: r.id, status: "invited" })}>
                        Invite
                      </Button>
                    )}
                    {r.status === "invited" && (
                      <>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">Invited</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={regAction.isPending}
                          onClick={() => regAction.mutate({ regId: r.id, status: "attended" })}>
                          Mark Attended
                        </Button>
                      </>
                    )}
                    {r.status === "attended" && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Attended</span>
                    )}
                    {d.status === "approved" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => { setScheduleReg(r); setIvJobId(""); setIvWhen(""); setIvInterviewer(""); }}>
                        <Calendar className="w-3 h-3" /> Interview
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Interviews list */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-600" /> Scheduled Interviews ({interviews.length})
        </h2>

        {interviews.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">No interviews scheduled yet</p>
            <p className="text-xs text-slate-400 mt-1">Schedule interviews from the applicant pipeline on each job.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {interviews.map((i: any) => {
              const c = i.candidate ?? {};
              const j = i.job ?? {};
              return (
                <div key={i.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <Link href={`/agent/candidates/${c.id}`}
                      className="flex items-center gap-3 min-w-0 group">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {(c.fullName || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700">{c.fullName || "Unknown candidate"}</p>
                        <p className="text-xs text-slate-500 truncate">Interviewing for: {j.id
                          ? <Link href={`/agent/jobs/${j.id}`} className="text-blue-600 hover:underline">{j.title}</Link>
                          : <span>{j.title || "—"}</span>}</p>
                      </div>
                    </Link>
                    <div className="text-right text-xs text-slate-600">
                      <p className="font-semibold">{i.scheduledAt ? new Date(i.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                      <p className="text-slate-400 capitalize">{i.mode?.replace(/_/g, " ") || "in person"}{i.location ? ` · ${i.location}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {i.result && (
                      <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Current:</span>
                    )}
                    <Button size="sm"
                      onClick={() => i.result !== "selected" && setResult.mutate({ interviewId: i.id, result: "selected" })}
                      className={i.result === "selected"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 ring-offset-1"
                        : "bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50"}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Selected
                    </Button>
                    <Button size="sm"
                      onClick={() => i.result !== "hold" && setResult.mutate({ interviewId: i.id, result: "hold" })}
                      className={i.result === "hold"
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-300 ring-offset-1"
                        : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"}>
                      Hold
                    </Button>
                    <Button size="sm"
                      onClick={() => i.result !== "rejected" && setResult.mutate({ interviewId: i.id, result: "rejected" })}
                      className={i.result === "rejected"
                        ? "bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-300 ring-offset-1"
                        : "bg-white border border-red-200 text-red-700 hover:bg-red-50"}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Rejected
                    </Button>
                    {i.result && (
                      <Button size="sm" variant="ghost"
                        onClick={() => setResult.mutate({ interviewId: i.id, result: null as any })}
                        className="text-slate-500 hover:text-slate-900">
                        Clear result
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1 ml-auto"
                      onClick={() => setFeedbackFor({ ...i, candidate: c, job: j })}>
                      <ClipboardList className="w-3.5 h-3.5" /> Feedback
                    </Button>
                    <a href={`/api/v1/agent/interviews/${i.id}.ics`}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:border-blue-400 hover:text-blue-700 transition">
                      <Download className="w-3.5 h-3.5" /> .ics
                    </a>
                  </div>
                  {(i.rating || i.recommendation) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      {i.rating && (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          {[1,2,3,4,5].map((n) => <Star key={n} className={`w-3 h-3 ${n <= i.rating ? "fill-amber-500 text-amber-500" : "text-slate-200"}`} />)}
                        </span>
                      )}
                      {i.recommendation && (
                        <Badge variant="outline" className="text-[10px] capitalize bg-blue-50 text-blue-700 border-blue-200">
                          {i.recommendation.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <InterviewFeedbackModal
        open={!!feedbackFor}
        onClose={() => setFeedbackFor(null)}
        interview={feedbackFor}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: [`/api/v1/drives/${id}/interviews`] });
          setFeedbackFor(null);
        }}
      />

      {/* Schedule an on-the-spot interview for a registrant */}
      <Dialog open={!!scheduleReg} onOpenChange={(o) => { if (!o) setScheduleReg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule interview — {scheduleReg?.candidate?.name || "candidate"}</DialogTitle>
            <DialogDescription>Pick the role and time. This creates the application (if needed) and links the interview to this drive.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Job / role</label>
              <Select value={ivJobId} onValueChange={setIvJobId}>
                <SelectTrigger><SelectValue placeholder="Select one of your jobs" /></SelectTrigger>
                <SelectContent>
                  {myJobs.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.title} · {j.country}</SelectItem>)}
                </SelectContent>
              </Select>
              {myJobs.length === 0 && <p className="text-[11px] text-amber-600 mt-1">You have no active jobs — pick up a requisition or post a job first.</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Date &amp; time</label>
              <input type="datetime-local" value={ivWhen} onChange={(e) => setIvWhen(e.target.value)}
                className="w-full text-sm border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Interviewer (optional)</label>
              <input type="text" maxLength={100} value={ivInterviewer} onChange={(e) => setIvInterviewer(e.target.value)}
                placeholder="e.g. Imran Qureshi" className="w-full text-sm border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleReg(null)}>Cancel</Button>
            <Button disabled={!ivJobId || !ivWhen || scheduleInterview.isPending} onClick={() => scheduleInterview.mutate()} className="bg-blue-600 hover:bg-blue-700 text-white">
              {scheduleInterview.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InterviewFeedbackModal({ open, onClose, interview, onSaved }: {
  open: boolean; onClose: () => void; interview: any; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number>(interview?.rating ?? 0);
  const [strengths, setStrengths] = useState<string>(interview?.strengths ?? "");
  const [concerns, setConcerns] = useState<string>(interview?.concerns ?? "");
  const [recommendation, setRecommendation] = useState<string>(interview?.recommendation ?? "");
  const [notes, setNotes] = useState<string>(interview?.notes ?? "");

  // Keep local state in sync when the modal opens for a different interview
  if (interview && interview.id && rating === 0 && interview.rating) setRating(interview.rating);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/interviews/${interview.id}/feedback`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating || null, strengths, concerns, recommendation, notes }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Feedback saved" }); onSaved(); },
    onError: () => toast({ title: "Couldn't save feedback", variant: "destructive" }),
  });

  if (!interview) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-600" /> Interview Feedback</DialogTitle>
          <DialogDescription>
            {interview.candidate?.fullName} · <span className="text-slate-900 font-medium">{interview.job?.title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Overall rating</label>
            <div className="flex gap-1">
              {/* audit 2026-07-06 (Batch 3): icon-only star buttons needed aria-labels (agent-facing, English) */}
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)}
                  aria-label={`Rate ${n} out of 5`} aria-pressed={n <= rating}
                  className="p-0.5 hover:scale-110 transition">
                  <Star className={`w-6 h-6 ${n <= rating ? "fill-amber-500 text-amber-500" : "text-slate-300"}`} />
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-500 self-center">{rating > 0 ? `${rating}/5` : "Not rated"}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Recommendation</label>
            <Select value={recommendation} onValueChange={setRecommendation}>
              <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strong_yes">Strong yes</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="maybe">Maybe</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="strong_no">Strong no</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Strengths</label>
            <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)}
              placeholder="What stood out?" rows={2} className="mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Concerns</label>
            <Textarea value={concerns} onChange={(e) => setConcerns(e.target.value)}
              placeholder="Gaps or reservations?" rows={2} className="mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Additional notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else?" rows={2} className="mt-1 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()} className="bg-blue-600 hover:bg-blue-700 text-white">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
