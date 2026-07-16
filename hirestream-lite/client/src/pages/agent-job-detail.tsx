import { useParams, useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PhotoAvatar } from "@/components/shared/PhotoAvatar";
import {
  ArrowLeft, Briefcase, MapPin, Loader2, CheckCircle, XCircle,
  Clock, Filter, Users, TrendingUp, Star, Eye, Calendar, Download,
  MessageSquare, Send, Trash2, Edit, PauseCircle, PlayCircle,
  AlertTriangle, Flame, Zap, DollarSign, ChevronDown, ChevronUp, Share2,
  GitCompareArrows, Tag,
} from "lucide-react";
import { JobPoster } from "@/components/agent/job-poster";
import { RecordOutcomeModal } from "@/components/shared/RecordOutcomeModal";
import { RescheduleResponseModal } from "@/components/shared/RescheduleResponseModal";
import { ScheduleInterviewModal } from "@/components/shared/ScheduleInterviewModal";
import { jobCategoryLabel } from "@/lib/reference-data";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const PIPELINE = [
  { key: "submitted",           label: "Submitted",  color: "bg-blue-100 text-blue-700" },
  { key: "reviewed",            label: "Reviewed",   color: "bg-amber-100 text-amber-700" },
  { key: "shortlisted",         label: "Shortlisted", color: "bg-purple-100 text-purple-700" },
  { key: "interview_scheduled", label: "Interview",  color: "bg-cyan-100 text-cyan-700" },
  { key: "selected",            label: "Selected",   color: "bg-emerald-100 text-emerald-700" },
  { key: "rejected",            label: "Rejected",   color: "bg-red-100 text-red-700" },
];

export default function AgentJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  // "Stale" quick-filter: rows that have been in their current stage ≥ 7 days
  // AND aren't terminal (rejected/selected/placed). Orthogonal to statusFilter
  // — composes with it. Off by default to avoid surprising the user.
  const [onlyStale, setOnlyStale] = useState(false);
  // Track whether the user has touched the filter. Before they do, we auto-jump
  // to "submitted" when fresh applicants exist — that's the agent's "awaiting
  // my action" default. After any manual change, respect their choice.
  const userTouchedFilter = useRef(false);
  const autoFilterApplied = useRef(false);
  const setStatusFilterManual = (v: string) => {
    userTouchedFilter.current = true;
    setStatusFilter(v);
  };
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [interviewFor, setInterviewFor] = useState<{ applicationId: string; candidateName: string } | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<{ applicationId: string; candidateName: string } | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<{ interview: any; candidateName: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "match">("newest");
  const { toast } = useToast();
  const qc = useQueryClient();

  const jobStatusMutation = useMutation({
    mutationFn: async (nextStatus: "active" | "inactive" | "closed") => {
      const res = await fetch(`/api/v1/jobs/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || "Failed");
      return res.json();
    },
    onSuccess: (_, nextStatus) => {
      qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({
        title: nextStatus === "active" ? "Job reopened" : nextStatus === "closed" ? "Job closed" : "Job paused",
        description: nextStatus === "active" ? "Candidates can apply again." : "This job is no longer visible in search.",
      });
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error?.message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      toast({ title: "Job deleted" });
      setLocation("/");
    },
    onError: (e: any) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });

  const { data: jobRes, isLoading: jobLoading } = useQuery({
    queryKey: [`/api/v1/jobs/${id}`],
    queryFn: () => fetchJson(`/api/v1/jobs/${id}`),
  });
  const { data: appsRes, isLoading: appsLoading } = useQuery({
    queryKey: [`/api/v1/jobs/${id}/applicants`, sortOrder],
    queryFn: () => fetchJson(`/api/v1/jobs/${id}/applicants?sort=${sortOrder}`),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ applicationId, status, feedback }: { applicationId: string; status: string; feedback?: string }) => {
      const res = await fetch(`/api/v1/applications/${applicationId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionFeedback: feedback }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}/applicants`] });
      // audit 2026-07-06 (C10c): the dashboard pipeline funnel aggregates per-job
      // applicants under this key — refresh it too or it shows stale stages.
      qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] });
      toast({ title: "Status updated" });
    },
  });

  // Single atomic call — server handles rollback on partial failure, which
  // Promise.all of N PATCH calls couldn't guarantee.
  const bulkAction = async (status: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const r = await fetch(`/api/v1/applications/bulk-status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    const j = await r.json();
    if (!j.success) {
      toast({ title: "Bulk update failed", description: j.error?.message ?? "Please retry", variant: "destructive" });
      return;
    }
    toast({ title: `Updated ${ids.length} application${ids.length !== 1 ? "s" : ""}` });
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}/applicants`] });
    qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] }); // audit 2026-07-06 (C10c)
  };
  const toggleSelect = (appId: string) => {
    const next = new Set(selected);
    if (next.has(appId)) next.delete(appId); else next.add(appId);
    setSelected(next);
  };

  // Compute counts up-front so the auto-default useEffect below can run BEFORE
  // any conditional early return. Hooks must be called on every render in the
  // same order — hoisting this block past the early returns caused React
  // error #310 (rendered more hooks than during the previous render).
  const applicantsForHook: any[] = appsRes?.data ?? [];
  const submittedCountForHook = applicantsForHook.reduce((n, a: any) => a.status === "submitted" ? n + 1 : n, 0);

  // Auto-default to "submitted" once on first load if there's anything fresh.
  // Guards prevent fighting the user if they've clicked a stage themselves.
  useEffect(() => {
    if (autoFilterApplied.current || userTouchedFilter.current) return;
    if (applicantsForHook.length > 0 && submittedCountForHook > 0) {
      setStatusFilter("submitted");
      autoFilterApplied.current = true;
    } else if (applicantsForHook.length > 0) {
      autoFilterApplied.current = true;
    }
  }, [applicantsForHook.length, submittedCountForHook]);

  if (jobLoading || appsLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const job = jobRes?.data;
  const applicants: any[] = applicantsForHook;

  if (!job) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Job not found</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const s of PIPELINE) counts[s.key] = 0;
  for (const a of applicants) counts[a.status] = (counts[a.status] || 0) + 1;

  const isStale = (a: any): boolean => {
    const terminal = ["rejected", "selected", "placed"].includes(a.status);
    return !terminal && (a.daysInStage ?? 0) >= 7;
  };
  const staleCount = applicants.filter(isStale).length;
  const filtered = applicants.filter((a) => {
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const s = search.toLowerCase();
    const matchSearch = !s || a.candidate.fullName?.toLowerCase().includes(s) ||
      a.candidate.skills?.some((sk: string) => sk.toLowerCase().includes(s));
    const matchStale = !onlyStale || isStale(a);
    return matchStatus && matchSearch && matchStale;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium truncate">{job.title}</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
              <JobStatusBadge status={job.status} />
              {job.priority && job.priority !== "standard" && <PriorityBadge priority={job.priority} />}
            </div>
            <p className="text-sm text-slate-600 font-medium mt-1">{job.company}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{[job.location, job.country].filter(Boolean).join(", ")}</span>
              {job.category && (
                <span className="flex items-center gap-1.5"><Tag className="w-4 h-4 text-slate-400" />{jobCategoryLabel(job.category)}</span>
              )}
              {job.salary && <span className="flex items-center gap-1.5 font-medium text-slate-700"><DollarSign className="w-4 h-4 text-slate-400" />{job.salary}</span>}
              {job.experience !== undefined && job.experience !== null && (
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400" />Min {job.experience} yr{job.experience === 1 ? "" : "s"}</span>
              )}
              {job.targetHires > 1 && <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" />{job.targetHires} hires needed</span>}
            </div>
            <DeadlineRow hiringDeadline={job.hiringDeadline} status={job.status} />
          </div>
          <div className="flex flex-wrap items-start gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={() => window.open(`/jobs/${id}`, "_blank")}
              title="Open the candidate-facing view in a new tab">
              <Eye className="w-3.5 h-3.5" /> Preview
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={async () => {
                const url = `${window.location.origin}/jobs/${id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Link copied", description: "Share the URL via WhatsApp, LinkedIn, or email." });
                } catch {
                  window.prompt("Copy this link:", url);
                }
              }}
              title="Copy public shareable link">
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
            {job.status === "active" && (
              <Button size="sm" variant="outline" className="gap-1.5 border-slate-200 text-slate-700 hover:border-amber-400 hover:text-amber-700"
                onClick={() => {
                  if (window.confirm("Close this job? Candidates will no longer be able to apply. You can reopen it later.")) {
                    jobStatusMutation.mutate("closed");
                  }
                }} disabled={jobStatusMutation.isPending}>
                <PauseCircle className="w-3.5 h-3.5" /> Close
              </Button>
            )}
            {(job.status === "closed" || job.status === "inactive") && (
              <Button size="sm" variant="outline" className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => jobStatusMutation.mutate("active")} disabled={jobStatusMutation.isPending}>
                <PlayCircle className="w-3.5 h-3.5" /> Reopen
              </Button>
            )}
            {applicants.length === 0 && (
              <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (window.confirm("Delete this job permanently? This can't be undone.")) deleteMutation.mutate();
                }} disabled={deleteMutation.isPending}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
            <a href={`/api/v1/agent/jobs/${id}/applicants.csv`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-emerald-400 hover:text-emerald-700 transition">
              <Download className="w-4 h-4" /> Export CSV
            </a>
            <a href={`/api/v1/agent/jobs/${id}/applicants.zip`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:text-indigo-700 transition"
              title="ZIP bundle: CSV plus each applicant's uploaded documents">
              <Download className="w-4 h-4" /> Export ZIP (with docs)
            </a>
          </div>
        </div>

        {/* Description + skills collapsible */}
        {(job.description || job.skills?.length > 0 || job.requirements?.length > 0) && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button onClick={() => setDescOpen(!descOpen)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900">
              {descOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Job details (description, skills, requirements)
            </button>
            {descOpen && (
              <div className="mt-3 space-y-3">
                {job.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Description</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.description}</p>
                  </div>
                )}
                {job.skills?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Required skills</div>
                    <div className="flex flex-wrap gap-1.5">
                      {job.skills.map((s: string) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                )}
                {job.requirements?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Requirements</div>
                    <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
                      {job.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {job.employerNotes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1">Internal note from employer (not shown to candidates)</div>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{job.employerNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pipeline funnel */}
        <div className="mt-6 grid grid-cols-3 md:grid-cols-6 gap-2">
          {PIPELINE.map((s) => (
            <button key={s.key} onClick={() => setStatusFilterManual(s.key === statusFilter ? "all" : s.key)}
              className={`${s.color} rounded-lg px-3 py-3 text-left hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition ${statusFilter === s.key ? "ring-2 ring-slate-900" : ""}`}>
              <div className="text-xs font-medium opacity-90">{s.label}</div>
              <div className="text-xl font-bold">{counts[s.key] || 0}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Analytics panel */}
      <JobAnalyticsPanel jobId={id!} />

      {/* Edit dialog */}
      <JobPoster isVerified={true} editJob={job} controlledOpen={editOpen} onOpenChange={setEditOpen}
        trigger={<span style={{ display: "none" }} />} />

      {/* Filter bar */}
      <div className="mt-4 flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <Input placeholder="Search by name or skill…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 text-sm flex-1" />
        <div className="text-xs text-slate-500">{filtered.length} of {applicants.length}</div>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)}
          className="h-10 text-xs rounded-md border border-slate-200 bg-white px-2"
          title="Sort order">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="match">Best match</option>
        </select>
        {staleCount > 0 && (
          <button type="button" onClick={() => setOnlyStale(v => !v)}
            aria-pressed={onlyStale}
            className={`h-10 px-2.5 text-xs font-semibold rounded-md border transition flex items-center gap-1 ${
              onlyStale
                ? "bg-amber-500 border-amber-600 text-white shadow"
                : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
            }`}
            title="Applicants in their current stage for 7 or more days">
            ⏳ Stale <span className={onlyStale ? "bg-white/30 px-1 rounded" : "bg-amber-200 px-1 rounded"}>{staleCount}</span>
          </button>
        )}
        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
          <button onClick={() => setViewMode("list")}
            className={`px-2.5 py-2 text-xs font-medium ${viewMode === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            title="List view">List</button>
          <button onClick={() => setViewMode("kanban")}
            className={`px-2.5 py-2 text-xs font-medium ${viewMode === "kanban" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            title="Kanban board">Board</button>
        </div>
        {filtered.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none border border-slate-200 rounded px-2 h-10 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((a: any) => selected.has(a.applicationId))}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(filtered.map((a: any) => a.applicationId)));
                else setSelected(new Set());
              }}
              className="w-3.5 h-3.5 rounded border-slate-300"
            />
            Select all
          </label>
        )}
      </div>

      {/* Bulk action bar — visible when any row is selected. Selection set
          persists across statusFilter changes; we surface how many are
          currently hidden by the filter so the user doesn't get confused when
          the visible count doesn't match. */}
      {selected.size > 0 && (() => {
        const hiddenCount = Array.from(selected).filter(id => !filtered.some((a: any) => a.applicationId === id)).length;
        return (
        <div className="mt-3 bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between shadow-lg sticky top-3 z-20 flex-wrap gap-2">
          <div className="text-sm font-medium">
            {selected.size} selected
            {hiddenCount > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-300">
                ({hiddenCount} hidden by current filter)
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="bg-transparent border-white/20 text-white hover:bg-white/10"
              onClick={() => bulkAction("reviewed")}>Mark Reviewed</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => bulkAction("shortlisted")}>Shortlist All</Button>
            <Button size="sm" variant="outline" className="bg-transparent border-white/20 text-white hover:bg-white/10"
              onClick={() => bulkAction("rejected")}>Reject All</Button>
            {selected.size >= 2 && selected.size <= 4 && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setCompareOpen(true)}>
                <GitCompareArrows className="w-3.5 h-3.5 mr-1" /> Compare
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
        );
      })()}

      <CompareCandidatesDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        applicants={applicants.filter((a) => selected.has(a.applicationId))}
      />

      {/* Kanban board view — one column per pipeline stage */}
      {viewMode === "kanban" && filtered.length > 0 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {PIPELINE.map((stage) => {
            const col = filtered.filter((a) => a.status === stage.key);
            return (
              <div key={stage.key} className="shrink-0 w-64 bg-slate-50 rounded-xl border border-slate-200 p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded ${stage.color}`}>{stage.label}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((a) => {
                    // Time-in-stage visual: amber at 7+ days, red at 14+.
                    // Rejected / selected are terminal — no alert.
                    const terminal = ["rejected", "selected", "placed"].includes(a.status);
                    const days = a.daysInStage ?? 0;
                    const stale = !terminal && days >= 7;
                    const critical = !terminal && days >= 14;
                    return (
                    <div key={a.applicationId}
                      className={`bg-white border rounded-lg p-2.5 text-xs hover:border-blue-300 hover:shadow-sm transition cursor-pointer ${
                        critical ? "border-red-300 bg-red-50/50" :
                        stale ? "border-amber-300 bg-amber-50/40" :
                        "border-slate-200"
                      }`}
                      onClick={() => setLocation(`/agent/candidates/${a.candidate.id}`)}>
                      <div className="font-semibold text-slate-900 truncate">{a.candidate.fullName}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{a.candidate.location} · {a.candidate.experience}y</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {typeof a.matchScore === "number" && (
                          <Badge variant="outline" className="text-[9px] bg-slate-50">{a.matchScore}%</Badge>
                        )}
                        {!terminal && (
                          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                            critical ? "bg-red-100 text-red-700" :
                            stale ? "bg-amber-100 text-amber-700" :
                            "text-slate-400"
                          }`} title={`Entered ${a.status.replace(/_/g, " ")} ${days} day${days === 1 ? "" : "s"} ago`}>
                            {days}d
                          </span>
                        )}
                        <select
                          value={a.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateStatus.mutate({ applicationId: a.applicationId, status: e.target.value });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[9px] rounded border border-slate-200 px-1 py-0.5 bg-white"
                          aria-label="Change status"
                        >
                          {PIPELINE.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>
                    );
                  })}
                  {col.length === 0 && <p className="text-[10px] text-slate-400 text-center py-3">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Applicant list */}
      {viewMode === "list" && (
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">No applicants match.</p>
            {applicants.length === 0 && <p className="text-xs text-slate-400 mt-1">This job hasn't received any applications yet.</p>}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((a) => {
              const isBusy = updateStatus.isPending && updateStatus.variables?.applicationId === a.applicationId;
              return (
                <div key={a.applicationId} className="p-4 md:p-5 hover:bg-slate-50/60 transition">
                  <div className="flex items-start gap-4 flex-wrap">
                    <input
                      type="checkbox"
                      checked={selected.has(a.applicationId)}
                      onChange={() => toggleSelect(a.applicationId)}
                      className="mt-3 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label={`Select ${a.candidate.fullName}`}
                    />
                    <Link href={`/agent/candidates/${a.candidate.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1 group cursor-pointer">
                      <PhotoAvatar photoUrl={a.candidate.photoUrl} name={a.candidate.fullName || "?"}
                        size="w-10 h-10" rounded="rounded-xl" textSize="text-xs" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate">{a.candidate.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">{a.candidate.location} · {a.candidate.experience} yrs</p>
                        {a.candidate.skills?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {a.candidate.skills.slice(0, 4).map((s: string) => (
                              <Badge key={s} variant="secondary" className="text-[10px] rounded px-1.5 py-0">{s}</Badge>
                            ))}
                            {a.candidate.skills.length > 4 && <span className="text-[10px] text-slate-400">+{a.candidate.skills.length - 4}</span>}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={`text-[11px] font-bold ${a.matchScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : a.matchScore >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50"}`}>
                        {a.matchScore}% match
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] capitalize ${PIPELINE.find(p => p.key === a.status)?.color ?? "bg-slate-50"}`}>
                        {a.status?.replace(/_/g, " ")}
                      </Badge>
                      {(() => {
                        // Aging indicator — same thresholds as kanban (7d amber,
                        // 14d red). Terminal states skip; no value if daysInStage
                        // missing on the payload.
                        const terminal = ["rejected", "selected", "placed"].includes(a.status);
                        const days = a.daysInStage;
                        if (terminal || days == null) return null;
                        const critical = days >= 14;
                        const stale = days >= 7;
                        if (!stale) return null; // only surface when amber or worse
                        return (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            critical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                          }`} title={`Entered ${a.status.replace(/_/g, " ")} ${days} day${days === 1 ? "" : "s"} ago`}>
                            {critical ? "🔥 " : "⏳ "}{days}d in stage
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Action buttons per row */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/agent/candidates/${a.candidate.id}`}>
                      <Button size="sm" variant="outline" className="gap-1"><Eye className="w-3.5 h-3.5" /> View Profile</Button>
                    </Link>
                    {a.status === "submitted" && (
                      <Button size="sm" variant="outline" disabled={isBusy}
                        onClick={() => updateStatus.mutate({ applicationId: a.applicationId, status: "reviewed" })}
                        className="gap-1 border-amber-200 text-amber-700 hover:bg-amber-50">
                        Mark Reviewed
                      </Button>
                    )}
                    {["submitted", "reviewed"].includes(a.status) && (
                      <Button size="sm" disabled={isBusy}
                        onClick={() => updateStatus.mutate({ applicationId: a.applicationId, status: "shortlisted" })}
                        className="gap-1 bg-purple-600 hover:bg-purple-700 text-white">
                        <Star className="w-3.5 h-3.5" /> Shortlist
                      </Button>
                    )}
                    {a.status === "shortlisted" && (
                      <Button size="sm"
                        onClick={() => setInterviewFor({ applicationId: a.applicationId, candidateName: a.candidate.fullName })}
                        className="gap-1 bg-cyan-600 hover:bg-cyan-700 text-white">
                        <Clock className="w-3.5 h-3.5" /> Schedule Interview
                      </Button>
                    )}
                    {a.status === "interview_scheduled" && (
                      <>
                        <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 text-[11px] gap-1">
                          <Clock className="w-3 h-3" /> Interview Scheduled
                        </Badge>
                        {/* v0.4.34 (Phase 4): surface candidate's response so
                            the agent can see who confirmed / asked to
                            reschedule / declined without opening the row. */}
                        {a.interview?.candidateConfirmedStatus === "confirmed" && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px] gap-1" title="Candidate confirmed attendance">
                            <CheckCircle className="w-3 h-3" /> Confirmed
                          </Badge>
                        )}
                        {a.interview?.candidateConfirmedStatus === "reschedule_requested" && (
                          <Button size="sm" variant="outline"
                            onClick={() => setRescheduleFor({ interview: a.interview, candidateName: a.candidate.fullName })}
                            className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 animate-pulse"
                            title={`Reason: ${a.interview.candidateRescheduleReason || ""}`}>
                            <Clock className="w-3.5 h-3.5" /> Respond to reschedule
                          </Button>
                        )}
                        {a.interview?.candidateConfirmedStatus === "declined" && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[11px] gap-1" title={`Reason: ${a.interview.candidateDeclineReason || ""}`}>
                            <XCircle className="w-3 h-3" /> Declined
                          </Badge>
                        )}
                        <Button size="sm" disabled={isBusy}
                          onClick={() => setOutcomeFor({ applicationId: a.applicationId, candidateName: a.candidate.fullName })}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                          <CheckCircle className="w-3.5 h-3.5" /> Record Outcome
                        </Button>
                      </>
                    )}
                    {!["rejected", "selected", "placed", "interview_scheduled"].includes(a.status) && (
                      <Button size="sm" variant="outline" disabled={isBusy}
                        onClick={() => {
                          const feedback = window.prompt("Feedback for candidate (optional):") || "";
                          updateStatus.mutate({ applicationId: a.applicationId, status: "rejected", feedback });
                        }}
                        className="gap-1 border-red-200 text-red-700 hover:bg-red-50">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    )}
                  </div>

                  <ApplicantNotes applicationId={a.applicationId} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Interview scheduling modal */}
      <ScheduleInterviewModal
        open={!!interviewFor}
        onClose={() => setInterviewFor(null)}
        applicationId={interviewFor?.applicationId ?? ""}
        candidateName={interviewFor?.candidateName ?? ""}
        onScheduled={() => {
          qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}/applicants`] });
          qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] }); // audit 2026-07-06 (C10c)
          setInterviewFor(null);
        }}
      />

      {/* Interview outcome modal (v0.4.13.0) */}
      <RecordOutcomeModal
        open={!!outcomeFor}
        onClose={() => setOutcomeFor(null)}
        applicationId={outcomeFor?.applicationId ?? ""}
        candidateName={outcomeFor?.candidateName ?? ""}
        onRecorded={() => {
          qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}/applicants`] });
          qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] }); // audit 2026-07-06 (C10c)
          setOutcomeFor(null);
        }}
      />

      {/* Reschedule response modal (v0.4.37) */}
      <RescheduleResponseModal
        open={!!rescheduleFor}
        onClose={() => setRescheduleFor(null)}
        interview={rescheduleFor?.interview ?? null}
        candidateName={rescheduleFor?.candidateName ?? ""}
        onResponded={() => qc.invalidateQueries({ queryKey: [`/api/v1/jobs/${id}/applicants`] })}
      />
    </div>
  );
}

// ── Job status + priority badges + deadline countdown ────────────────
function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft:    "bg-amber-50 text-amber-700 border-amber-200",
    closed:   "bg-slate-100 text-slate-600 border-slate-300",
    inactive: "bg-slate-50 text-slate-500 border-slate-200",
  };
  return <Badge variant="outline" className={`text-xs capitalize ${styles[status] ?? "bg-slate-50"}`}>{status}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "critical") return <Badge className="bg-red-100 text-red-700 gap-1 text-xs"><Flame className="w-3 h-3" />Critical</Badge>;
  if (priority === "urgent")   return <Badge className="bg-amber-100 text-amber-700 gap-1 text-xs"><Zap className="w-3 h-3" />Urgent</Badge>;
  return null;
}

function DeadlineRow({ hiringDeadline, status }: { hiringDeadline?: string; status: string }) {
  if (!hiringDeadline || status !== "active") return null;
  const deadline = new Date(hiringDeadline);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / msPerDay);
  if (Number.isNaN(daysLeft)) return null;

  const color =
    daysLeft < 0 ? "text-red-700 bg-red-50 border-red-200"
    : daysLeft <= 3 ? "text-red-700 bg-red-50 border-red-200"
    : daysLeft <= 14 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-slate-600 bg-slate-50 border-slate-200";
  const label =
    daysLeft < 0 ? `Hiring deadline passed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago — close this job`
    : daysLeft === 0 ? "Hiring deadline is today"
    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left until hiring deadline`;
  const Icon = daysLeft <= 3 ? AlertTriangle : Calendar;
  return (
    <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {label} · {deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
    </div>
  );
}

// ── Inline Applicant Notes panel ─────────────────────────────────────
function ApplicantNotes({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: res } = useQuery({
    queryKey: [`/api/v1/agent/applications/${applicationId}/notes`],
    queryFn: async () => {
      const r = await fetch(`/api/v1/agent/applications/${applicationId}/notes`);
      if (!r.ok) return { data: [] };
      return r.json();
    },
    enabled: open,
  });
  const notes: any[] = res?.data ?? [];

  const post = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/agent/applications/${applicationId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: [`/api/v1/agent/applications/${applicationId}/notes`] });
    },
    onError: () => toast({ title: "Couldn't save note", variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/v1/agent/applications/notes/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/v1/agent/applications/${applicationId}/notes`] }),
  });

  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-medium">
        <MessageSquare className="w-3.5 h-3.5" /> {open ? "Hide" : "Internal notes"}
        {notes.length > 0 && <span className="ml-1 text-[10px] bg-slate-200 text-slate-700 rounded-full px-1.5">{notes.length}</span>}
      </button>
      {open && (
        <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
          {notes.length === 0 && <p className="text-xs text-slate-400">No notes yet. Add one below — visible only to your team.</p>}
          {notes.map((n) => (
            <div key={n.id} className="bg-white rounded border border-slate-200 px-3 py-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.body}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {n.authorName ?? "Someone"} <span className="capitalize">· {n.authorRole}</span> · {new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button onClick={() => del.mutate(n.id)} className="text-slate-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Quick note for your team…"
              onKeyDown={(e) => { if (e.key === "Enter" && body.trim()) post.mutate(); }}
              className="h-9 text-sm flex-1" />
            <Button size="sm" disabled={!body.trim() || post.isPending}
              onClick={() => post.mutate()} className="gap-1">
              <Send className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Job Analytics panel (PWS §7.19) ──────────────────────────────────
function JobAnalyticsPanel({ jobId }: { jobId: string }) {
  const { data: res, isLoading } = useQuery({
    queryKey: [`/api/v1/jobs/${jobId}/analytics`],
    queryFn: () => fetchJson(`/api/v1/jobs/${jobId}/analytics`),
  });
  if (isLoading) return null;
  const d = res?.data;
  if (!d) return null;

  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-blue-600" /> Job Analytics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-[10px] uppercase text-slate-500 font-semibold">Total applicants</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{d.totalApplicants}</p>
          <p className="text-[10px] text-slate-400 mt-1">{d.applicationsPerDay}/day over {d.daysLive} day{d.daysLive === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-[10px] uppercase text-blue-700 font-semibold">Avg match score</p>
          <p className="text-2xl font-bold text-blue-900 mt-0.5">{d.avgMatchScore}%</p>
          <p className="text-[10px] text-blue-700/70 mt-1">{d.totalApplicants > 0 ? "across all applicants" : "no applicants yet"}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] uppercase text-emerald-700 font-semibold">Time to 1st applicant</p>
          <p className="text-2xl font-bold text-emerald-900 mt-0.5">
            {d.timeToFirstApplicantHours === null
              ? "—"
              : d.timeToFirstApplicantHours < 24
              ? `${d.timeToFirstApplicantHours}h`
              : `${Math.round(d.timeToFirstApplicantHours / 24)}d`}
          </p>
          <p className="text-[10px] text-emerald-700/70 mt-1">since publish</p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
          <p className="text-[10px] uppercase text-purple-700 font-semibold">Shortlist rate</p>
          <p className="text-2xl font-bold text-purple-900 mt-0.5">
            {d.totalApplicants > 0
              ? Math.round(((d.stageBreakdown.shortlisted + d.stageBreakdown.interview_scheduled + d.stageBreakdown.selected + d.stageBreakdown.placed) / d.totalApplicants) * 100)
              : 0}%
          </p>
          <p className="text-[10px] text-purple-700/70 mt-1">of applicants advanced</p>
        </div>
      </div>
    </div>
  );
}

// ── Compare Candidates side-by-side ──────────────────────────────────
// Naukri RMS-style comparison for 2-4 shortlisted applicants. Pure UI over
// the existing applicants data; no new backend call. Helps agents do the
// "who do we put forward?" conversation without opening N tabs.
function CompareCandidatesDialog({
  open, onOpenChange, applicants,
}: { open: boolean; onOpenChange: (v: boolean) => void; applicants: any[] }) {
  if (applicants.length < 2) return null;
  const rows: { label: string; render: (a: any) => React.ReactNode }[] = [
    { label: "Match",       render: (a) => <span className="font-semibold tabular-nums">{a.matchScore ?? "—"}%</span> },
    { label: "Experience",  render: (a) => <span>{a.candidate?.experience ?? "—"} yrs</span> },
    { label: "Location",    render: (a) => <span>{a.candidate?.location ?? "—"}</span> },
    { label: "Status",      render: (a) => <Badge variant="outline" className="capitalize text-[10px]">{(a.status ?? "—").replace(/_/g, " ")}</Badge> },
    { label: "Skills",      render: (a) => (
      <div className="flex flex-wrap gap-1">
        {(a.candidate?.skills ?? []).slice(0, 8).map((s: string) => (
          <span key={s} className="text-[9px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">{s}</span>
        ))}
      </div>
    ) },
    { label: "Languages",   render: (a) => <span>{(a.candidate?.languages ?? []).join(", ") || "—"}</span> },
    { label: "Passport",    render: (a) => <span>{a.candidate?.passportNumber ? "On file" : <span className="text-red-600">Missing</span>}</span> },
    { label: "Ed. level",   render: (a) => <span>{a.candidate?.highestEducation ?? "—"}</span> },
    { label: "Applied",     render: (a) => <span>{a.appliedAt ? new Date(a.appliedAt).toLocaleDateString("en-IN") : "—"}</span> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-blue-600" />
            Compare candidates
          </DialogTitle>
          <DialogDescription>Side-by-side view of {applicants.length} selected applicants.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 w-[110px] bg-slate-50 sticky left-0"></th>
                {applicants.map((a) => (
                  <th key={a.applicationId} className="text-left p-2 border-l border-slate-100 min-w-[180px]">
                    <div className="text-sm font-bold text-slate-900">{a.candidate?.fullName ?? "—"}</div>
                    <div className="text-[10px] text-slate-500">{a.candidate?.email ?? ""}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="p-2 font-semibold text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 sticky left-0">{row.label}</td>
                  {applicants.map((a) => (
                    <td key={a.applicationId} className="p-2 border-l border-slate-100 align-top">{row.render(a)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
