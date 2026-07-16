/**
 * Agent aggregate "All my applicants" — answers the question
 * "across everything I'm recruiting for, who should I act on today?"
 * Lands on Awaiting-me (status=submitted) by default, shows the job name
 * on every card, aging badges, and a Stale chip. Pattern is the same as
 * the per-job list view so agents don't learn two UIs.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Filter, Users, ArrowLeft, Briefcase, MapPin, Eye, Star, Clock, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoAvatar } from "@/components/shared/PhotoAvatar";
import { ScheduleInterviewModal } from "@/components/shared/ScheduleInterviewModal";
import { RecordOutcomeModal } from "@/components/shared/RecordOutcomeModal";
import { RescheduleResponseModal } from "@/components/shared/RescheduleResponseModal";
import { useToast } from "@/hooks/use-toast";

type Applicant = {
  applicationId: string;
  status: string;
  matchScore: number;
  appliedAt: string;
  stageEnteredAt: string | null;
  daysInStage: number | null;
  jobId: string;
  jobTitle: string;
  jobCountry: string | null;
  jobCompany: string | null;
  jobPriority: string | null;
  candidate: {
    id: string; fullName: string; email: string; phone: string;
    location: string; experience: number; skills: string[]; photoUrl?: string | null;
  };
  interview?: {
    id: string;
    scheduledAt: string;
    mode?: string | null;
    candidateConfirmedStatus?: string | null;
    candidateRescheduleReason?: string | null;
    candidateProposedAt?: string | null;
    candidateDeclineReason?: string | null;
    interviewerName?: string | null;
    meetingLink?: string | null;
  } | null;
};

type SortKey = "newest" | "oldest" | "match" | "longest_in_stage";

// v0.4.23: added Withdrawn pill so "All" = sum of all pills. Before
// this, withdrawn applications were counted in "All" but had no pill —
// making the math look broken on the UI.
const PIPELINE = [
  { key: "submitted",           label: "Submitted",  color: "bg-blue-100 text-blue-700" },
  { key: "reviewed",            label: "Reviewed",   color: "bg-amber-100 text-amber-700" },
  { key: "shortlisted",         label: "Shortlisted",color: "bg-purple-100 text-purple-700" },
  { key: "interview_scheduled", label: "Interview",  color: "bg-cyan-100 text-cyan-700" },
  { key: "selected",            label: "Selected",   color: "bg-emerald-100 text-emerald-700" },
  { key: "placed",              label: "Placed",     color: "bg-green-100 text-green-700" },
  { key: "rejected",            label: "Rejected",   color: "bg-red-100 text-red-700" },
  { key: "withdrawn",           label: "Withdrawn",  color: "bg-slate-100 text-slate-600" },
] as const;

const VALID_STATUSES = ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "placed", "rejected", "withdrawn"];

export default function AgentApplicantsPage() {
  const [, setLocation] = useLocation();
  const queryString = useSearch();
  // Seed the filter from ?status=<stage> when the page is deep-linked from
  // the dashboard pipeline pills. Treat the query as a one-shot hint — after
  // mount the user can change the filter freely and the URL is left alone.
  const initialStatus = useMemo(() => {
    const p = new URLSearchParams(queryString);
    const s = p.get("status");
    if (s && VALID_STATUSES.includes(s)) return s;
    // v0.4.22: default eagerly to "submitted" (new triage queue) so the
    // page lands on the action-needed list even before applicants load.
    // The data-load effect downgrades to "all" only if zero submitted
    // apps come back. Previously the effect raced against any early
    // user click and could leave the user on "all" by accident.
    return "submitted";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [search, setSearch] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");

  // v0.4.22: the initial default is now "submitted" (eager). The effect
  // below only flips to "all" if data comes back with zero submitted
  // apps. URL ?status=... still wins. Manual clicks pin user choice.
  const userTouchedFilter = useRef(false);
  const autoFilterApplied = useRef(false);
  const setStatusFilterManual = (v: string) => { userTouchedFilter.current = true; setStatusFilter(v); };

  const { data, isLoading } = useQuery({
    queryKey: ["/api/v1/agent/applicants"],
    queryFn: async () => (await fetch("/api/v1/agent/applicants")).json(),
  });
  const applicants: Applicant[] = data?.data ?? [];
  const jobCount: number = data?.jobCount ?? 0;

  // v0.4.21: inline action buttons on each card. Agents shouldn't have
  // to drill into a specific job just to schedule an interview or move
  // a candidate forward in the pipeline.
  const { toast } = useToast();
  const qc = useQueryClient();
  const [interviewFor, setInterviewFor] = useState<{ applicationId: string; candidateName: string } | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<{ applicationId: string; candidateName: string } | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<{ interview: any; candidateName: string } | null>(null);

  const updateStatus = useMutation({
    mutationFn: async ({ applicationId, status, feedback }: { applicationId: string; status: string; feedback?: string }) => {
      const res = await fetch(`/api/v1/applications/${applicationId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionFeedback: feedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error?.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/agent/applicants"] });
      // audit 2026-07-06 (C10c): the dashboard pipeline funnel aggregates per-job
      // applicants under this key — refresh it too or it shows stale stages.
      qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const counts: Record<string, number> = {};
  for (const s of PIPELINE) counts[s.key] = 0;
  for (const a of applicants) counts[a.status] = (counts[a.status] || 0) + 1;

  // v0.4.22: initial state is already "submitted". This effect only
  // downgrades to "all" when the data arrives and there are zero
  // submitted applicants — so the page never shows an empty list by
  // default. Once the user manually changes the filter, this stops.
  useEffect(() => {
    if (autoFilterApplied.current || userTouchedFilter.current) return;
    if (applicants.length > 0) {
      if ((counts.submitted ?? 0) === 0) {
        // No new submissions — fall back to the broadest non-terminal view.
        setStatusFilter("all");
      }
      autoFilterApplied.current = true;
    }
  }, [applicants.length, counts.submitted]);

  const isStale = (a: Applicant) => {
    const terminal = ["rejected", "selected", "placed"].includes(a.status);
    return !terminal && (a.daysInStage ?? 0) >= 7;
  };
  const staleCount = useMemo(() => applicants.filter(isStale).length, [applicants]);
  const countries = useMemo(() => Array.from(new Set(applicants.map(a => a.jobCountry).filter(Boolean))).sort() as string[], [applicants]);
  const companies = useMemo(() => Array.from(new Set(applicants.map(a => a.jobCompany).filter(Boolean))).sort() as string[], [applicants]);
  const priorities = useMemo(() => Array.from(new Set(applicants.map(a => a.jobPriority).filter(Boolean))) as string[], [applicants]);
  const jobsOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of applicants) if (!seen.has(a.jobId)) seen.set(a.jobId, a.jobTitle);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [applicants]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const rows = applicants.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (onlyStale && !isStale(a)) return false;
      if (countryFilter !== "all" && a.jobCountry !== countryFilter) return false;
      if (companyFilter !== "all" && a.jobCompany !== companyFilter) return false;
      if (priorityFilter !== "all" && a.jobPriority !== priorityFilter) return false;
      if (jobFilter !== "all" && a.jobId !== jobFilter) return false;
      if (s) {
        const hay = `${a.candidate.fullName} ${a.jobTitle} ${(a.candidate.skills || []).join(" ")} ${a.jobCompany ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const timeOf = (a: Applicant) => new Date(a.appliedAt).getTime();
    switch (sortBy) {
      case "oldest":            rows.sort((a, b) => timeOf(a) - timeOf(b)); break;
      case "match":             rows.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)); break;
      case "longest_in_stage":  rows.sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0)); break;
      case "newest":
      default:                  rows.sort((a, b) => timeOf(b) - timeOf(a));
    }
    return rows;
  }, [applicants, statusFilter, search, onlyStale, countryFilter, companyFilter, priorityFilter, jobFilter, sortBy]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium">Applications Pipeline</span>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Applications Pipeline</h1>
        <p className="text-sm text-blue-100 mt-1">
          {applicants.length} application{applicants.length !== 1 ? "s" : ""} across {jobCount} job{jobCount !== 1 ? "s" : ""}. Default view shows fresh submissions awaiting your triage.
        </p>
      </div>

      {/* Stage filter pills.
          v0.4.25: switched from a flex row with shrink-0 pills (which
          clustered on the left and left the right gutter empty) to a
          CSS grid: 3 columns on mobile, 9 on large screens (All + 8
          stages). Pills now stretch equal-width across the full
          container — the row visually fills end-to-end instead of
          looking like 60% of a toolbar. */}
      <div className="mt-6 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        <button onClick={() => setStatusFilterManual("all")}
          className={`bg-slate-100 text-slate-700 rounded-lg px-3 py-2 text-left hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition ${statusFilter === "all" ? "ring-2 ring-slate-900" : ""}`}>
          <div className="text-[11px] font-medium opacity-90">All</div>
          <div className="text-lg font-bold tabular-nums">{applicants.length}</div>
        </button>
        {PIPELINE.map((s) => (
          <button key={s.key} onClick={() => setStatusFilterManual(s.key === statusFilter ? "all" : s.key)}
            className={`${s.color} rounded-lg px-3 py-2 text-left hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition ${statusFilter === s.key ? "ring-2 ring-slate-900" : ""}`}>
            <div className="text-[11px] font-medium opacity-90">{s.label}</div>
            <div className="text-lg font-bold tabular-nums">{counts[s.key] || 0}</div>
          </button>
        ))}
      </div>

      {/* Toolbar row 1 — search + stale chip + result count.
          Toolbar row 2 — sort + dimension filters (country / company / priority / job).
          Laid out as two rows so the search input always gets the full width
          while the filter selects fit on a single line on desktop. */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <Input placeholder="Search candidate, job title, company, or skill…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm flex-1 min-w-[200px]" />
        <div className="text-xs text-slate-500 tabular-nums">{filtered.length} of {applicants.length}</div>
        {staleCount > 0 && (
          <button type="button" onClick={() => setOnlyStale(v => !v)}
            aria-pressed={onlyStale}
            className={`h-9 px-2.5 text-xs font-semibold rounded-md border transition flex items-center gap-1 ${
              onlyStale ? "bg-amber-500 border-amber-600 text-white shadow" : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
            }`}
            title="Applicants in their current stage for 7 or more days">
            ⏳ Stale <span className={onlyStale ? "bg-white/30 px-1 rounded" : "bg-amber-200 px-1 rounded"}>{staleCount}</span>
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
        <label className="text-slate-500 font-medium">Sort</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="h-9 rounded-md border border-slate-200 px-2 bg-white">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="match">Best match</option>
          <option value="longest_in_stage">Longest in stage</option>
        </select>
        {countries.length > 1 && (
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {companies.length > 1 && (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {priorities.length > 1 && (
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All priorities</option>
            {priorities.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        )}
        {jobsOptions.length > 1 && (
          <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-200 px-2 bg-white max-w-[240px]">
            <option value="all">All jobs</option>
            {jobsOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        )}
        {(countryFilter !== "all" || companyFilter !== "all" || priorityFilter !== "all" || jobFilter !== "all" || sortBy !== "newest") && (
          <button onClick={() => { setCountryFilter("all"); setCompanyFilter("all"); setPriorityFilter("all"); setJobFilter("all"); setSortBy("newest"); }}
            className="text-slate-500 hover:text-slate-900 hover:underline">Clear</button>
        )}
      </div>

      {/* List */}
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">
              {applicants.length === 0
                ? "No applicants yet across any of your jobs."
                : "No applicants match the current filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((a) => {
              const terminal = ["rejected", "selected", "placed"].includes(a.status);
              const days = a.daysInStage;
              const critical = !terminal && days != null && days >= 14;
              const stale = !terminal && days != null && days >= 7;
              const stageColor = PIPELINE.find(p => p.key === a.status)?.color ?? "bg-slate-50";
              return (
                <div key={a.applicationId} className="px-4 md:px-5 py-3 hover:bg-slate-50/60 transition">
                  {/* v0.4.22: single-row dense layout. Avatar+identity
                      stretches to fill, badges + action buttons share
                      the right edge. No more wasted vertical space or
                      empty right gutter. */}
                  <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                    <Link href={`/agent/candidates/${a.candidate.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1 group cursor-pointer">
                      <PhotoAvatar photoUrl={a.candidate.photoUrl} name={a.candidate.fullName || "?"}
                        size="w-10 h-10" rounded="rounded-xl" textSize="text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate">{a.candidate.fullName}</p>
                          <Badge variant="outline" className={`text-[10px] font-bold ${a.matchScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : a.matchScore >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50"}`}>
                            {a.matchScore}% match
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] capitalize ${stageColor}`}>
                            {a.status?.replace(/_/g, " ")}
                          </Badge>
                          {stale && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              critical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                            }`} title={`Entered ${a.status.replace(/_/g, " ")} ${days} day${days === 1 ? "" : "s"} ago`}>
                              {critical ? "🔥 " : "⏳ "}{days}d
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3 h-3" />
                          <Link href={`/agent/jobs/${a.jobId}`} onClick={(e) => e.stopPropagation()}
                            className="hover:text-blue-700 hover:underline truncate">
                            {a.jobTitle}
                          </Link>
                          {a.jobCountry && <><MapPin className="w-3 h-3 ml-1" />{a.jobCountry}</>}
                        </p>
                        {a.candidate.skills?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {a.candidate.skills.slice(0, 5).map((s) => (
                              <Badge key={s} variant="secondary" className="text-[10px] rounded px-1.5 py-0">{s}</Badge>
                            ))}
                            {a.candidate.skills.length > 5 && <span className="text-[10px] text-slate-400">+{a.candidate.skills.length - 5}</span>}
                          </div>
                        )}
                      </div>
                    </Link>
                    {/* v0.4.23: anchored right column with applied-date
                        meta + buttons. Min-width ensures the right side
                        has visual weight even on rows with one button.
                        Date row reuses the otherwise-wasted vertical
                        space above/below the button row. */}
                    <div className="shrink-0 ml-auto flex flex-col items-end gap-1.5 min-w-[280px]">
                      {a.appliedAt && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          Applied {new Date(a.appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <Link href={`/agent/candidates/${a.candidate.id}`}>
                          <Button size="sm" variant="outline" className="gap-1 h-8">
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                        </Link>
                        {a.status === "submitted" && (
                          <Button size="sm" variant="outline" disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ applicationId: a.applicationId, status: "reviewed" })}
                            className="gap-1 h-8 border-amber-200 text-amber-700 hover:bg-amber-50">
                            Reviewed
                          </Button>
                        )}
                        {["submitted", "reviewed"].includes(a.status) && (
                          <Button size="sm" disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ applicationId: a.applicationId, status: "shortlisted" })}
                            className="gap-1 h-8 bg-purple-600 hover:bg-purple-700 text-white">
                            <Star className="w-3.5 h-3.5" /> Shortlist
                          </Button>
                        )}
                        {a.status === "shortlisted" && (
                          <Button size="sm"
                            onClick={() => setInterviewFor({ applicationId: a.applicationId, candidateName: a.candidate.fullName })}
                            className="gap-1 h-8 bg-cyan-600 hover:bg-cyan-700 text-white">
                            <Clock className="w-3.5 h-3.5" /> Schedule
                          </Button>
                        )}
                        {a.status === "interview_scheduled" && (
                          <>
                            {/* v0.4.34: candidate confirmation badge */}
                            {a.interview?.candidateConfirmedStatus === "confirmed" && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] gap-1" title="Candidate confirmed">
                                <CheckCircle className="w-3 h-3" /> Confirmed
                              </Badge>
                            )}
                            {a.interview?.candidateConfirmedStatus === "reschedule_requested" && (
                              <Button size="sm" variant="outline"
                                onClick={() => setRescheduleFor({ interview: a.interview, candidateName: a.candidate.fullName })}
                                className="gap-1 h-8 border-amber-300 text-amber-700 hover:bg-amber-50 animate-pulse"
                                title={`Reason: ${a.interview.candidateRescheduleReason || ""}`}>
                                <Clock className="w-3.5 h-3.5" /> Respond to reschedule
                              </Button>
                            )}
                            {a.interview?.candidateConfirmedStatus === "declined" && (
                              <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] gap-1" title={`Reason: ${a.interview.candidateDeclineReason || ""}`}>
                                <XCircle className="w-3 h-3" /> Declined
                              </Badge>
                            )}
                            <Button size="sm" disabled={updateStatus.isPending}
                              onClick={() => setOutcomeFor({ applicationId: a.applicationId, candidateName: a.candidate.fullName })}
                              className="gap-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
                              <CheckCircle className="w-3.5 h-3.5" /> Outcome
                            </Button>
                          </>
                        )}
                        {!["rejected", "selected", "placed", "interview_scheduled", "withdrawn"].includes(a.status) && (
                          <Button size="sm" variant="outline" disabled={updateStatus.isPending}
                            onClick={() => {
                              const feedback = window.prompt("Feedback for candidate (optional):") || "";
                              updateStatus.mutate({ applicationId: a.applicationId, status: "rejected", feedback });
                            }}
                            className="gap-1 h-8 border-red-200 text-red-700 hover:bg-red-50">
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* v0.4.21: shared modals — Schedule Interview (for shortlisted)
          and Record Outcome (for interview_scheduled). Same components
          used on agent-job-detail.tsx so behaviour stays consistent
          across the two agent surfaces. */}
      <ScheduleInterviewModal
        open={!!interviewFor}
        onClose={() => setInterviewFor(null)}
        applicationId={interviewFor?.applicationId ?? ""}
        candidateName={interviewFor?.candidateName ?? ""}
        onScheduled={() => {
          qc.invalidateQueries({ queryKey: ["/api/v1/agent/applicants"] });
          qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] }); // audit 2026-07-06 (C10c)
          setInterviewFor(null);
        }}
      />
      <RecordOutcomeModal
        open={!!outcomeFor}
        onClose={() => setOutcomeFor(null)}
        applicationId={outcomeFor?.applicationId ?? ""}
        candidateName={outcomeFor?.candidateName ?? ""}
        onRecorded={() => {
          qc.invalidateQueries({ queryKey: ["/api/v1/agent/applicants"] });
          qc.invalidateQueries({ queryKey: ["agent-aggregate-applicants"] }); // audit 2026-07-06 (C10c)
          setOutcomeFor(null);
        }}
      />
      <RescheduleResponseModal
        open={!!rescheduleFor}
        onClose={() => setRescheduleFor(null)}
        interview={rescheduleFor?.interview ?? null}
        candidateName={rescheduleFor?.candidateName ?? ""}
        onResponded={() => qc.invalidateQueries({ queryKey: ["/api/v1/agent/applicants"] })}
      />
    </div>
  );
}
