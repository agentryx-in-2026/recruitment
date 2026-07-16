import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, XCircle, ClipboardList, MapPin, Loader2, Briefcase,
  Award, Download,
} from "lucide-react";
import { MatchBreakdownPanel } from "@/components/shared/MatchBreakdownPanel";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const PIPELINE = [
  { key: "submitted", label: "Submitted", bg: "bg-blue-100", color: "text-blue-600" },
  { key: "reviewed", label: "Reviewed", bg: "bg-amber-100", color: "text-amber-600" },
  { key: "shortlisted", label: "Shortlisted", bg: "bg-purple-100", color: "text-purple-600" },
  { key: "interview_scheduled", label: "Interview", bg: "bg-cyan-100", color: "text-cyan-600" },
  { key: "selected", label: "Selected", bg: "bg-emerald-100", color: "text-emerald-600" },
  { key: "placed", label: "Placed", bg: "bg-green-100", color: "text-green-700" },
];

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const { data: appsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/candidates/applications"],
    queryFn: () => fetchJson("/api/v1/candidates/applications"),
  });

  const app = (appsRes?.data ?? []).find((a: any) => a.id === id);

  // v0.4.15: Accept / decline mutations live on this page too. Before
  // this fix the standalone /applications/:id page had no offer action
  // at all — UAT showed candidates landing here from notifications or
  // direct URLs with no path forward. Mirrors the dashboard-side panel.
  const acceptMutation = useMutation({
    mutationFn: async (placementId: string) => {
      const res = await fetch(`/api/v1/drives/placements/${placementId}/accept`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offer accepted", description: "Your visa process will begin. Check Documents." });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/applications"] });
    },
    onError: () => toast({ title: "Couldn't accept offer", description: "Please try again or contact the agency.", variant: "destructive" }),
  });
  const declineMutation = useMutation({
    mutationFn: async ({ placementId, reason }: { placementId: string; reason: string }) => {
      const res = await fetch(`/api/v1/drives/placements/${placementId}/decline`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offer declined", description: "Thank you for letting us know." });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/applications"] });
      setShowDeclineForm(false);
    },
    onError: () => toast({ title: "Couldn't decline", description: "Please try again.", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }
  if (!app) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <ClipboardList className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-900">Application not found</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const stageIdx = PIPELINE.findIndex((s) => s.key === app.status);
  const isRejected = app.status === "rejected";
  // Known dates per pipeline stage (best-effort from what the candidate API exposes)
  const stageDates: Record<string, string | undefined> = {
    submitted: app.appliedAt,
    interview_scheduled: app.nextInterview?.scheduledAt,
    placed: app.placement?.startDate,
  };
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium truncate">Application</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{app.jobTitle}</h1>
            <p className="text-base text-slate-600 font-medium mt-1">{app.company}</p>
            {app.location && (
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" /> {app.location}, {app.country}
              </p>
            )}
          </div>
          <Link href={`/jobs/${app.jobId}`}
            className="text-sm text-blue-600 hover:underline font-medium">View original job posting →</Link>
        </div>

        <div className="flex items-center gap-1.5 my-7 bg-gradient-to-r from-slate-50 to-white rounded-xl p-4 border border-slate-100 overflow-x-auto">
          {PIPELINE.map((stage, i) => {
            const isDone = !isRejected && i < stageIdx;
            const isCurrent = !isRejected && i === stageIdx;
            return (
              <div key={stage.key} className="flex items-center flex-1 last:flex-none min-w-0">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
                    isDone ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-500 text-white shadow-md" :
                    isCurrent ? `${stage.bg} border-current ${stage.color} ring-4 ring-blue-50 shadow-sm` :
                    isRejected ? "bg-red-100 border-red-300 text-red-500" :
                    "bg-white border-slate-200 text-slate-300"
                  }`}>
                    {isDone ? <CheckCircle className="w-4 h-4" /> : isRejected && i === 0 ? <XCircle className="w-4 h-4" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-semibold whitespace-nowrap ${isCurrent ? stage.color : isDone ? "text-emerald-600" : "text-slate-300"}`}>
                    {stage.label}
                  </span>
                  {stageDates[stage.key] && (isDone || isCurrent) && (
                    <span className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">{fmt(stageDates[stage.key])}</span>
                  )}
                </div>
                {i < PIPELINE.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded-full ${isDone ? "bg-emerald-400" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>

        {/* v0.4.15: Offer Received — Accept / Decline. Surfaces on the
            standalone Application Detail page so candidates landing here
            from a notification link or direct URL have a clear path to
            respond. Mirrors the dashboard side-panel UI. */}
        {app.placement && app.placement.status === "offered" && (
          <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-white border-2 border-emerald-300 rounded-2xl p-5 md:p-6 mb-4 shadow-sm">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-slate-900">Offer received 🎉</p>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-white bg-emerald-600 px-2 py-0.5 rounded">⚡ Action required</span>
                </div>
                <p className="text-sm text-slate-700 mt-1">
                  {app.company} has issued you a placement offer for <span className="font-semibold">{app.jobTitle}</span>. Visa processing begins as soon as you accept.
                </p>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="bg-white rounded-lg border border-emerald-100 px-2.5 py-2">
                    <p className="text-[10px] uppercase text-slate-500 font-semibold">Destination</p>
                    <p className="font-bold text-slate-900 mt-0.5">{app.placement.country || "—"}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 px-2.5 py-2">
                    <p className="text-[10px] uppercase text-slate-500 font-semibold">Salary</p>
                    <p className="font-bold text-slate-900 mt-0.5">{app.placement.salary || "—"}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-emerald-100 px-2.5 py-2">
                    <p className="text-[10px] uppercase text-slate-500 font-semibold">Start date</p>
                    <p className="font-bold text-slate-900 mt-0.5">{app.placement.startDate ? new Date(app.placement.startDate).toLocaleDateString("en-IN") : "To be confirmed"}</p>
                  </div>
                </div>
              </div>
            </div>

            {!showDeclineForm ? (
              <div className="flex gap-2 flex-wrap">
                <Button size="lg" disabled={acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate(app.placement.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md">
                  {acceptMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    : <CheckCircle className="w-5 h-5 mr-1.5" />}
                  {acceptMutation.isPending ? "Accepting…" : "Accept Offer"}
                </Button>
                <Button size="lg" variant="outline"
                  onClick={() => { setShowDeclineForm(true); setDeclineReason(""); }}
                  className="border-red-300 text-red-700 hover:bg-red-50">
                  <XCircle className="w-5 h-5 mr-1.5" /> Decline
                </Button>
                <a href={`/api/v1/me/placements/${app.placement.id}/offer-letter.pdf`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md border border-slate-200 bg-white hover:border-emerald-400 hover:text-emerald-700 transition">
                  <Download className="w-4 h-4" /> Download offer letter (PDF)
                </a>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-red-200 p-3">
                <label className="text-xs font-semibold text-slate-700">Reason for declining <span className="text-slate-400">(optional, helps us improve matches)</span></label>
                <textarea
                  value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Found a better opportunity, family reasons, salary too low…"
                  className="mt-2 w-full border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 min-h-[72px]"
                />
                <div className="flex gap-2 mt-3">
                  <Button size="sm" disabled={declineMutation.isPending}
                    onClick={() => declineMutation.mutate({ placementId: app.placement.id, reason: declineReason.trim() || "No reason provided" })}
                    className="bg-red-600 hover:bg-red-700 text-white">
                    {declineMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    {declineMutation.isPending ? "Declining…" : "Confirm Decline"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDeclineForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Accepted offer — confirmation state */}
        {app.placement && app.placement.status === "accepted" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Offer accepted — visa processing has begun</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Visa status: <span className="font-semibold capitalize">{app.placement.visaStatus?.replace(/_/g, " ") || "not yet applied"}</span>.
                Track progress and upload required documents from your dashboard.
              </p>
            </div>
          </div>
        )}

        {/* Declined offer — confirmation state */}
        {app.placement && app.placement.status === "declined" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <XCircle className="w-6 h-6 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-700">Offer declined</p>
              {app.placement.declineReason && (
                <p className="text-xs text-slate-600 mt-0.5">Reason recorded: {app.placement.declineReason}</p>
              )}
            </div>
          </div>
        )}

        {isRejected && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200/60 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-sm text-red-800 font-semibold">This application was not selected</p>
            </div>
            {app.rejectionFeedback ? (
              <div className="mt-3 pt-3 border-t border-red-200/60">
                <p className="text-[11px] uppercase tracking-wide text-red-700 font-semibold mb-1">Feedback from the recruiter</p>
                <p className="text-sm text-slate-700 leading-relaxed">{app.rejectionFeedback}</p>
              </div>
            ) : (
              <p className="text-xs text-red-600/80 mt-2 pl-13">No detailed feedback was shared.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/30 rounded-xl p-4 border border-blue-100/50">
            <p className="text-xs text-blue-600 font-semibold mb-1">Match Score</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{app.matchScore}%</p>
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 border border-slate-100">
            <p className="text-xs text-slate-500 font-semibold mb-1">Applied Date</p>
            <p className="text-2xl font-bold text-slate-900">{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString("en-IN") : "—"}</p>
          </div>
        </div>

        {/* v0.4.33 (Phase 3): 7-factor match breakdown — explains why this
            score, factor by factor. Collapsible so it doesn't dominate the
            page when not needed. */}
        {app.scoreBreakdown && (
          <div className="mt-4">
            <MatchBreakdownPanel breakdown={app.scoreBreakdown} collapsible={true} title="Why this score" />
          </div>
        )}

        {app.skills?.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Skills for this role</h2>
            <div className="flex flex-wrap gap-2">
              {app.skills.map((s: string) => <Badge key={s} variant="secondary" className="text-xs rounded-lg px-3 py-1">{s}</Badge>)}
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
}
