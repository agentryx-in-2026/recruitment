import { useParams, useLocation, Link } from "wouter";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PhotoAvatar } from "@/components/shared/PhotoAvatar";
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Star, Users, MessageSquare,
  ArrowRight, Briefcase, MapPin, Calendar, AlertCircle, Eye, Award,
  Layers, ChevronRight, Send, Edit, FileText,
} from "lucide-react";
import { RecordOutcomeModal } from "@/components/shared/RecordOutcomeModal";
import { JobCreationForm } from "@/components/employer/job-creation-form";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

/**
 * Employer review page — decision-maker UX. Not a pipeline manager.
 * Shows only the shortlisted + interviewed + selected applicants for ONE job,
 * with decision-focused actions: Approve for interview / Request replacement /
 * Record final feedback / Select / Reject.
 */
export default function EmployerReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [requestMoreOpen, setRequestMoreOpen] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<{ applicationId: string; candidateName: string } | null>(null);
  // Which bucket is showing. Default "awaiting" so the employer lands on the
  // work-that-needs-them-now slice instead of a heap.
  type Bucket = "awaiting" | "approved" | "interview" | "selected" | "all";
  const [bucket, setBucket] = useState<Bucket>("awaiting");
  // Orthogonal "stale" filter — cards with daysInStage ≥ 7 that aren't in a
  // terminal state. Composes with the bucket filter so employers can, e.g., see
  // "approved-for-interview candidates who've been waiting > 7 days".
  const [onlyStale, setOnlyStale] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: jobRes, isLoading: jobLoading } = useQuery({
    queryKey: [`/api/v1/jobs/${id}`],
    queryFn: () => fetchJson(`/api/v1/jobs/${id}`),
  });
  // Aggregated across the requisition + any derivative (agent-picked-up) jobs —
  // without this the page was empty when all applicants came through a
  // derivative, even though the hero card on the dashboard listed them fine.
  const { data: appsRes, isLoading: appsLoading } = useQuery({
    queryKey: [`/api/v1/employer/requisitions/${id}/applicants`],
    queryFn: () => fetchJson(`/api/v1/employer/requisitions/${id}/applicants`),
  });

  const job: any = jobRes?.data;
  const allApps: any[] = appsRes?.data ?? [];

  // Only show the candidates the agency has progressed to shortlisted+
  const reviewable = useMemo(
    () => allApps.filter((a) => ["shortlisted", "interview_scheduled", "selected"].includes(a.status)),
    [allApps]
  );
  const isStale = (a: any) => (a.daysInStage ?? 0) >= 7 && !["rejected", "placed"].includes(a.status);
  const staleCount = useMemo(() => reviewable.filter(isStale).length, [reviewable]);
  // Bucket filter applied on top of the reviewable slice. "awaiting" = shortlisted
  // rows the employer hasn't decided on yet; the others map 1:1 to hero stats.
  const visible = useMemo(() => {
    let base: any[];
    switch (bucket) {
      case "awaiting":  base = reviewable.filter((a) => a.status === "shortlisted" && !a.employerDecision); break;
      case "approved":  base = reviewable.filter((a) => a.employerDecision === "approved_for_interview"); break;
      case "interview": base = reviewable.filter((a) => a.status === "interview_scheduled"); break;
      case "selected":  base = reviewable.filter((a) => a.status === "selected"); break;
      case "all":
      default:          base = reviewable;
    }
    return onlyStale ? base.filter(isStale) : base;
  }, [reviewable, bucket, onlyStale]);

  const approve = useMutation({
    mutationFn: async (applicationId: string) => {
      const r = await fetch(`/api/v1/employer/applications/${applicationId}/approve-for-interview`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Approved for interview", description: "Agency has been notified to schedule." }); qc.invalidateQueries({ queryKey: [`/api/v1/employer/requisitions/${id}/applicants`] }); },
  });

  const requestReplacement = useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason: string }) => {
      const r = await fetch(`/api/v1/employer/applications/${applicationId}/request-replacement`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Replacement requested", description: "Agency will send alternative candidates." }); qc.invalidateQueries({ queryKey: [`/api/v1/employer/requisitions/${id}/applicants`] }); },
  });

  const reject = useMutation({
    mutationFn: async ({ applicationId, feedback }: { applicationId: string; feedback?: string }) => {
      const r = await fetch(`/api/v1/applications/${applicationId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", rejectionFeedback: feedback }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Candidate rejected" }); qc.invalidateQueries({ queryKey: [`/api/v1/employer/requisitions/${id}/applicants`] }); },
  });

  const toggleSelect = (appId: string) => {
    const next = new Set(selected);
    if (next.has(appId)) next.delete(appId); else next.add(appId);
    setSelected(next);
  };

  if (jobLoading || appsLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;
  if (!job) return <div className="p-10 text-center"><p>Requisition not found.</p></div>;

  // A draft has no review queue — route the employer straight to completing it
  // instead of an empty "awaiting your decision" page (this is where every
  // draft link lands).
  if (job.status === "draft") {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl p-6 shadow-lg">
          <Badge className="bg-white/20 text-white border-0">Draft</Badge>
          <h1 className="text-2xl font-bold mt-2">{job.title || "Untitled requisition"}</h1>
          <p className="text-amber-50 text-sm mt-1 max-w-xl">
            This requisition is still a draft. Complete the details and publish it so verified agencies can start sourcing candidates.
          </p>
          <Button onClick={() => setEditOpen(true)} className="mt-4 bg-white text-orange-700 hover:bg-orange-50">
            <Edit className="w-4 h-4 mr-1.5" /> Continue editing
          </Button>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 flex items-start gap-3">
          <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
          <p>Your saved details are preserved. Pick up where you left off, then either save again as a draft or publish the requisition.</p>
        </div>
        <JobCreationForm editJob={job} controlledOpen={editOpen}
          onOpenChange={(o) => { setEditOpen(o); if (!o) qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}`] }); }}
          trigger={<span style={{ display: "none" }} />} />
      </div>
    );
  }

  const awaitingDecision = reviewable.filter((a) => a.status === "shortlisted" && !a.employerDecision).length;
  const approvedForInterview = reviewable.filter((a) => a.employerDecision === "approved_for_interview").length;
  const inInterview = reviewable.filter((a) => a.status === "interview_scheduled").length;
  const selectedCount = reviewable.filter((a) => a.status === "selected").length;
  const placedCount = allApps.filter((a) => a.status === "placed").length;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-purple-600">Hiring Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium truncate">{job.title}</span>
      </div>

      {/* Hero requisition card — employer-branded (indigo/purple) */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-purple-200 mb-2">
              <Layers className="w-3.5 h-3.5" /> Requisition
            </div>
            <h1 className="text-3xl font-bold">{job.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-purple-100 mt-2">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{job.location}, {job.country}</span>
              {job.salary && <span>{job.salary}</span>}
              {job.priority && job.priority !== "standard" && (
                <Badge className={`${job.priority === "critical" ? "bg-red-500" : "bg-amber-500"} text-white border-0`}>
                  {job.priority === "critical" ? "🔥 Critical priority" : "⚡ Urgent"}
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={() => setRequestMoreOpen(true)}
            className="bg-white text-purple-700 hover:bg-purple-50">
            <Send className="w-4 h-4 mr-1.5" /> Request more candidates
          </Button>
        </div>

        {/* Requisition progress — these four stats are also the primary filter.
            Clicking a box toggles that bucket; clicking the active box goes back
            to "all reviewable". Avoids the heap — employers see one stage at a
            time with one click. */}
        <div className="mt-6 grid sm:grid-cols-4 gap-3">
          <HeroStat label="Awaiting your review" value={awaitingDecision} active={bucket === "awaiting"}
            onClick={() => setBucket(bucket === "awaiting" ? "all" : "awaiting")}
            spotlight={awaitingDecision > 0 && bucket !== "awaiting"} />
          <HeroStat label="Approved for interview" value={approvedForInterview} active={bucket === "approved"}
            onClick={() => setBucket(bucket === "approved" ? "all" : "approved")} />
          <HeroStat label="In interview" value={inInterview} active={bucket === "interview"}
            onClick={() => setBucket(bucket === "interview" ? "all" : "interview")} />
          <HeroStat label="Selected (ready for offer)" value={selectedCount} active={bucket === "selected"}
            onClick={() => setBucket(bucket === "selected" ? "all" : "selected")}
            spotlight={selectedCount > 0 && selectedCount >= (job.targetHires ?? 1) && bucket !== "selected"} />
        </div>

        {job.targetHires > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-purple-100 mb-1.5">
              <span>Filling {job.targetHires} position{job.targetHires !== 1 ? "s" : ""}</span>
              <span className="font-bold">{selectedCount + placedCount} / {job.targetHires}</span>
            </div>
            <div className="h-2 bg-purple-900/40 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((selectedCount + placedCount) / job.targetHires) * 100)}%` }} />
            </div>
          </div>
        )}
      </motion.div>

      {/* Bulk comparison action — selection persists across bucket / stale
          filter changes; hidden-count hint prevents confusion when the active
          filter narrows past some of the selected rows. */}
      {selected.size >= 2 && (() => {
        const hiddenCount = Array.from(selected).filter(id => !visible.some((a: any) => a.applicationId === id)).length;
        return (
          <div className="mt-4 bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between">
            <div className="text-sm">
              {selected.size} candidates selected for comparison
              {hiddenCount > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-300">
                  ({hiddenCount} hidden by current filter)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setCompareOpen(true)} className="bg-white text-slate-900 hover:bg-slate-100">
                <Users className="w-4 h-4 mr-1.5" /> Compare side-by-side
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-white hover:bg-white/10">Clear</Button>
            </div>
          </div>
        );
      })()}

      {/* Decision queue */}
      <section className="mt-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-600" />
            {bucketHeading(bucket)}
            {visible.length > 0 && <Badge variant="outline">{visible.length}</Badge>}
            {onlyStale && <Badge className="bg-amber-500 text-white border-0">⏳ Stale only</Badge>}
          </h2>
          <div className="flex items-center gap-2">
            {staleCount > 0 && (
              <button type="button" onClick={() => setOnlyStale(v => !v)}
                aria-pressed={onlyStale}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-md border transition flex items-center gap-1 ${
                  onlyStale
                    ? "bg-amber-500 border-amber-600 text-white shadow"
                    : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                }`}
                title="Candidates in their current stage for 7 or more days">
                ⏳ Stale <span className={onlyStale ? "bg-white/30 px-1 rounded" : "bg-amber-200 px-1 rounded"}>{staleCount}</span>
              </button>
            )}
            {bucket !== "all" && (
              <button onClick={() => setBucket("all")}
                className="text-xs text-purple-600 hover:text-purple-700 hover:underline">
                Show all {reviewable.length} →
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">{bucketEmptyTitle(bucket)}</p>
            <p className="text-xs text-slate-400 mt-1">{bucketEmptyHint(bucket)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((a: any) => (
              <CandidateReviewCard
                key={a.applicationId}
                app={a}
                selected={selected.has(a.applicationId)}
                onToggleSelect={() => toggleSelect(a.applicationId)}
                onApprove={() => approve.mutate(a.applicationId)}
                onRequestReplacement={() => {
                  const reason = window.prompt("Why are you requesting a replacement?");
                  if (!reason) return;
                  requestReplacement.mutate({ applicationId: a.applicationId, reason });
                }}
                onRecordOutcome={() =>
                  setOutcomeFor({ applicationId: a.applicationId, candidateName: a.candidate?.fullName ?? "" })
                }
                onReject={() => {
                  const fb = window.prompt("Reason / feedback (optional):") || "";
                  reject.mutate({ applicationId: a.applicationId, feedback: fb });
                }}
              />
            ))}
          </div>
        )}
      </section>

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)}
        candidates={visible.filter((a: any) => selected.has(a.applicationId))} />

      <RequestMoreModal open={requestMoreOpen} onClose={() => setRequestMoreOpen(false)}
        jobId={id} jobTitle={job.title}
        onDone={() => { setRequestMoreOpen(false); toast({ title: "Request sent to agency" }); }} />

      {/* Record Interview Outcome (v0.4.13.0) — server enforces
          interview.conducted_by policy; this lets the employer record
          pass/fail with notes + rating instead of one-tap select. */}
      <RecordOutcomeModal
        open={!!outcomeFor}
        onClose={() => setOutcomeFor(null)}
        applicationId={outcomeFor?.applicationId ?? ""}
        candidateName={outcomeFor?.candidateName ?? ""}
        onRecorded={() => {
          qc.invalidateQueries({ queryKey: [`/api/v1/employer/requisitions/${id}/applicants`] });
          setOutcomeFor(null);
        }}
      />
    </div>
  );
}

function bucketHeading(b: "awaiting" | "approved" | "interview" | "selected" | "all"): string {
  switch (b) {
    case "awaiting":  return "Awaiting your review";
    case "approved":  return "Approved for interview";
    case "interview": return "In interview";
    case "selected":  return "Selected (ready for offer)";
    default:          return "All reviewable candidates";
  }
}
function bucketEmptyTitle(b: "awaiting" | "approved" | "interview" | "selected" | "all"): string {
  switch (b) {
    case "awaiting":  return "Nothing awaiting your decision";
    case "approved":  return "No candidates approved for interview yet";
    case "interview": return "No interviews in progress";
    case "selected":  return "No selections yet";
    default:          return "No candidates to review yet";
  }
}
function bucketEmptyHint(b: "awaiting" | "approved" | "interview" | "selected" | "all"): string {
  switch (b) {
    case "awaiting":  return "The agency will send shortlisted candidates here when ready.";
    case "approved":  return "Approve a shortlisted candidate to see them here.";
    case "interview": return "Once the agency schedules an interview, it appears here.";
    case "selected":  return "Mark a candidate as Selected after the interview to issue an offer.";
    default:          return "Agencies are still screening. Shortlisted candidates will arrive here.";
  }
}

function HeroStat({ label, value, spotlight, active, onClick }: {
  label: string; value: number; spotlight?: boolean; active?: boolean; onClick?: () => void;
}) {
  // Three visual states: active (selected filter — inverted white), spotlight
  // (CTA-worthy count > 0 on the default bucket), or plain.
  const base = active
    ? "bg-white text-purple-700 ring-2 ring-white shadow-lg"
    : spotlight
      ? "bg-white/95 text-slate-900 hover:bg-white"
      : "bg-white/10 text-white hover:bg-white/20";
  const content = (
    <>
      <p className={`text-[10px] uppercase tracking-wide font-semibold ${active ? "text-purple-600" : spotlight ? "text-purple-600" : "text-purple-200"}`}>{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${active ? "text-purple-700" : spotlight ? "text-purple-700" : "text-white"}`}>{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick}
        className={`text-left rounded-xl p-3 backdrop-blur transition ${base}`}
        aria-pressed={!!active}>
        {content}
      </button>
    );
  }
  return <div className={`rounded-xl p-3 backdrop-blur ${base}`}>{content}</div>;
}

function CandidateReviewCard({ app, selected, onToggleSelect, onApprove, onRequestReplacement, onRecordOutcome, onReject }: any) {
  const c = app.candidate;
  const decisionBadge = app.employerDecision === "approved_for_interview"
    ? { label: "Approved by you", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : app.employerDecision === "replacement_requested"
    ? { label: "Replacement requested", cls: "bg-red-50 text-red-700 border-red-200" }
    : null;
  const statusBadge: Record<string, string> = {
    shortlisted: "bg-purple-50 text-purple-700 border-purple-200",
    interview_scheduled: "bg-cyan-50 text-cyan-700 border-cyan-200",
    selected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border p-5 shadow-sm transition ${selected ? "border-purple-400 ring-2 ring-purple-200" : "border-slate-200 hover:border-slate-300"}`}>
      <div className="flex items-start gap-4">
        <input type="checkbox" checked={selected} onChange={onToggleSelect}
          className="mt-3 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
          title="Select for comparison" />
        <Link href={`/agent/candidates/${c.id}`} className="flex items-start gap-3 min-w-0 flex-1 group">
          <PhotoAvatar photoUrl={c.photoUrl} name={c.fullName || "?"}
            size="w-14 h-14" rounded="rounded-xl" textSize="text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-slate-900 group-hover:text-purple-700">{c.fullName}</p>
              <Badge variant="outline" className={`text-[10px] font-bold ${app.matchScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : app.matchScore >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50"}`}>
                {app.matchScore}% match
              </Badge>
              <Badge variant="outline" className={`text-[10px] capitalize ${statusBadge[app.status] || ""}`}>
                {app.status === "shortlisted" ? "Awaiting your review" : app.status.replace(/_/g, " ")}
              </Badge>
              {decisionBadge && <Badge variant="outline" className={`text-[10px] ${decisionBadge.cls}`}>{decisionBadge.label}</Badge>}
              {(() => {
                // Time-in-stage flag — 7d amber, 14d red. "selected" is decision-
                // required-by-employer so we don't treat it as terminal here;
                // a selected candidate who's been waiting 10 days for an offer
                // letter IS an actionable aging row.
                const days = app.daysInStage;
                if (days == null) return null;
                const critical = days >= 14;
                const stale = days >= 7;
                if (!stale) return null;
                return (
                  <Badge variant="outline" className={`text-[10px] font-semibold ${
                    critical ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"
                  }`} title={`In this stage for ${days} day${days === 1 ? "" : "s"}`}>
                    {critical ? "🔥 " : "⏳ "}{days}d in stage
                  </Badge>
                );
              })()}
            </div>
            <p className="text-sm text-slate-500 mt-1">{c.location} · {c.experience} years experience</p>
            {c.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {c.skills.slice(0, 6).map((s: string) => (
                  <Badge key={s} variant="secondary" className="text-[11px] rounded">{s}</Badge>
                ))}
                {c.skills.length > 6 && <span className="text-[11px] text-slate-400">+{c.skills.length - 6}</span>}
              </div>
            )}
            {app.employerDecisionNotes && (
              <p className="text-xs text-slate-500 mt-2 italic">Your note: {app.employerDecisionNotes}</p>
            )}
          </div>
        </Link>
      </div>

      {/* Decision actions — role-specific (employer) */}
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
        <Link href={`/agent/candidates/${c.id}`}>
          <Button size="sm" variant="outline" className="gap-1"><Eye className="w-3.5 h-3.5" /> Full profile</Button>
        </Link>

        {app.status === "shortlisted" && !app.employerDecision && (
          <>
            <Button size="sm" onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve for interview
            </Button>
            <Button size="sm" variant="outline" onClick={onRequestReplacement} className="border-amber-200 text-amber-700 hover:bg-amber-50">
              <AlertCircle className="w-3.5 h-3.5 mr-1" /> Request replacement
            </Button>
          </>
        )}

        {app.status === "interview_scheduled" && (
          <>
            <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 gap-1">
              <Calendar className="w-3.5 h-3.5" /> Interview Scheduled
            </Badge>
            <Button size="sm" onClick={onRecordOutcome} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Award className="w-3.5 h-3.5 mr-1" /> Record Outcome
            </Button>
          </>
        )}

        {app.status === "selected" && (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 py-2 px-3">
            <CheckCircle className="w-4 h-4 mr-1.5" /> Selected — issue offer from Placements tab
          </Badge>
        )}

        {app.status === "shortlisted" && (
          <Button size="sm" variant="outline" onClick={onReject} className="border-red-200 text-red-700 hover:bg-red-50 ml-auto">
            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function CompareModal({ open, onClose, candidates }: { open: boolean; onClose: () => void; candidates: any[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Side-by-side comparison</DialogTitle>
          <DialogDescription>Compare {candidates.length} candidates at a glance.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: `150px repeat(${candidates.length}, minmax(180px, 1fr))` }}>
            <div />
            {candidates.map((a) => (
              <div key={a.applicationId} className="bg-purple-50/50 rounded-lg p-3 border border-purple-100">
                <PhotoAvatar photoUrl={a.candidate.photoUrl} name={a.candidate.fullName || "?"}
                  size="w-10 h-10" rounded="rounded-lg" textSize="text-xs" className="mb-2" />
                <p className="text-sm font-bold text-slate-900">{a.candidate.fullName}</p>
                <Badge variant="outline" className={`text-[10px] mt-1 ${a.matchScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {a.matchScore}% match
                </Badge>
              </div>
            ))}

            {[
              { label: "Location", get: (a: any) => a.candidate.location },
              { label: "Experience", get: (a: any) => `${a.candidate.experience ?? 0} yrs` },
              { label: "Current status", get: (a: any) => a.status.replace(/_/g, " ") },
              { label: "Your decision", get: (a: any) => a.employerDecision?.replace(/_/g, " ") ?? "—" },
              { label: "Skills", get: (a: any) => (a.candidate.skills || []).join(", ") || "—" },
            ].map((row) => (
              <div key={row.label} className="contents">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide self-center">{row.label}</div>
                {candidates.map((a) => (
                  <div key={a.applicationId} className="text-sm text-slate-800 p-2">{row.get(a)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestMoreModal({ open, onClose, jobId, jobTitle, onDone }: {
  open: boolean; onClose: () => void; jobId: string; jobTitle: string; onDone: () => void;
}) {
  const { toast } = useToast();
  const [count, setCount] = useState<number>(5);
  const [reason, setReason] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/employer/requisitions/${jobId}/request-more`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, reason }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: onDone,
    onError: () => toast({ title: "Couldn't send", variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request more candidates</DialogTitle>
          <DialogDescription>For <span className="font-semibold text-slate-900">{jobTitle}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">How many additional candidates?</label>
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 h-10" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">What are you looking for? (optional)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="e.g. Need candidates with Gulf experience; current batch is too junior…"
              className="mt-1 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={send.isPending} onClick={() => send.mutate()} className="bg-purple-600 hover:bg-purple-700 text-white">
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send request to agency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
