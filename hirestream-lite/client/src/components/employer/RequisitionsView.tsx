/**
 * v0.4.35 (Phase 4): Requisition-centric employer dashboard view.
 *
 * Tester feedback: "looks like agent clone but employers think
 * differently". The previous "My Jobs" tab listed requisitions as
 * generic job cards. Employers actually care about:
 *   - How many agents picked up the requisition
 *   - Who's pending their review right now (decisions awaiting them)
 *   - How long the req has been open (time-to-fill)
 *   - Progress toward the target hires count
 *
 * Each card surfaces those four answers + a "Review N candidates" CTA
 * that deep-links to the review queue scoped to the requisition.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Briefcase, Users, Clock, AlertCircle, Loader2, Search, Tag, MapPin,
  CheckCircle, Handshake, Flame, Zap, Target, Eye, Edit, ArrowRight,
} from "lucide-react";
import { jobCategoryLabel } from "@/lib/reference-data";
import { JobCreationForm } from "@/components/employer/job-creation-form";

interface RequisitionRow {
  id: string;
  title: string;
  company: string;
  location?: string;
  country?: string;
  category?: string | null;
  status: string;
  priority?: string | null;
  targetHires?: number | null;
  hiringDeadline?: string | null;
  createdAt?: string;
  stats: {
    totalApplicants: number;
    awaitingDecision: number;
    approvedForInterview: number;
    selected: number;
    placed: number;
    progressPct: number;
    agentsPickedUp?: number;
    daysSincePosted?: number | null;
    daysToFirstPlacement?: number | null;
  };
}

export function RequisitionsView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "closed">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "critical" | "urgent" | "standard">("all");
  const [sortBy, setSortBy] = useState<"awaiting" | "newest" | "oldest" | "progress">("awaiting");

  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/employer/requisitions"],
    queryFn: async () => {
      const r = await fetch("/api/v1/employer/requisitions");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
  const all: RequisitionRow[] = res?.data || [];

  const filtered = all
    .filter((r) => statusFilter === "all" ? true : r.status === statusFilter)
    .filter((r) => priorityFilter === "all" ? true : (r.priority || "standard") === priorityFilter)
    .filter((r) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return r.title?.toLowerCase().includes(s) || r.company?.toLowerCase().includes(s) || r.location?.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      if (sortBy === "awaiting") return (b.stats.awaitingDecision ?? 0) - (a.stats.awaitingDecision ?? 0);
      if (sortBy === "newest") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (sortBy === "progress") return (b.stats.progressPct ?? 0) - (a.stats.progressPct ?? 0);
      return 0;
    });

  if (isLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  }

  // Roll-up KPIs across all requisitions
  const totalAwaiting = all.reduce((acc, r) => acc + (r.stats.awaitingDecision || 0), 0);
  const totalApplicants = all.reduce((acc, r) => acc + (r.stats.totalApplicants || 0), 0);
  const totalAgents = new Set<string>();
  // agentsPickedUp count per req is already de-duplicated per req; we just sum
  // them as a rough fleet-level "agent engagements" stat — collisions across
  // reqs aren't meaningful for the single-employer view.
  const totalAgentEngagements = all.reduce((acc, r) => acc + (r.stats.agentsPickedUp || 0), 0);
  const placed = all.reduce((acc, r) => acc + (r.stats.placed || 0), 0);

  return (
    <div className="space-y-5">
      {/* Roll-up strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={AlertCircle} value={totalAwaiting} label="Awaiting your review" tone="amber"
          subtitle={totalAwaiting > 0 ? "Action required" : "All caught up"} />
        <KPI icon={Briefcase} value={all.length} label="Open requisitions" tone="purple"
          subtitle={`${all.filter((r) => r.status === "active").length} active`} />
        <KPI icon={Users} value={totalApplicants} label="Total applicants" tone="blue"
          subtitle={`${totalAgentEngagements} agency engagements`} />
        <KPI icon={Handshake} value={placed} label="Placements" tone="emerald"
          subtitle={`${all.reduce((a, r) => a + (r.stats.selected || 0), 0)} selected`} />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search title, company, location" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="awaiting">Most awaiting review</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="progress">Most progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{all.length === 0 ? "No requisitions yet. Click 'New Requisition' to post your first." : "No requisitions match the current filters."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => <RequisitionCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

function RequisitionCard({ r }: { r: RequisitionRow }) {
  const isCritical = r.priority === "critical";
  const isUrgent = r.priority === "urgent";
  const isDraft = r.status === "draft";
  const target = r.targetHires ?? 1;
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className={`rounded-xl border bg-white p-4 transition-all hover:shadow-md ${
      isCritical ? "border-red-200" : isUrgent ? "border-amber-200" : "border-slate-200"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900">{r.title}</h3>
            {isCritical && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200"><Flame className="w-2.5 h-2.5 mr-1" /> Critical</Badge>}
            {isUrgent && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200"><Zap className="w-2.5 h-2.5 mr-1" /> Urgent</Badge>}
            <Badge className={`text-[10px] ${
              r.status === "active" ? "bg-emerald-100 text-emerald-700"
              : r.status === "draft" ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600"
            }`}>{r.status}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{r.company}</span>
            {r.location && <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{r.location}, {r.country}</span></>}
            {r.category && <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-1"><Tag className="w-2.5 h-2.5" />{jobCategoryLabel(r.category)}</span></>}
            {r.stats.daysSincePosted != null && (
              <><span className="text-slate-300">·</span><span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{r.stats.daysSincePosted} day{r.stats.daysSincePosted === 1 ? "" : "s"} open</span></>
            )}
          </p>
        </div>
        {r.stats.awaitingDecision > 0 && (
          <Link href={`/employer/review/${r.id}`}>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
              <AlertCircle className="w-3.5 h-3.5 mr-1" />
              Review {r.stats.awaitingDecision}
            </Button>
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MiniStat icon={Users} label="Total applicants" value={r.stats.totalApplicants} tone="blue" />
        <MiniStat icon={Briefcase} label="Agencies engaged" value={r.stats.agentsPickedUp ?? 0} tone="purple" />
        <MiniStat icon={AlertCircle} label="Awaiting you" value={r.stats.awaitingDecision} tone="amber"
          highlight={r.stats.awaitingDecision > 0} />
        <MiniStat icon={CheckCircle} label="Approved" value={r.stats.approvedForInterview} tone="cyan" />
        <MiniStat icon={Handshake} label="Placed" value={r.stats.placed} tone="emerald" />
      </div>

      {/* Progress bar */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-slate-500 inline-flex items-center gap-1"><Target className="w-3 h-3" /> Progress to target ({r.stats.placed + r.stats.selected}/{target} hires)</span>
          <span className="font-mono font-semibold text-slate-700">{r.stats.progressPct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
            style={{ width: `${r.stats.progressPct}%` }} />
        </div>
        {r.stats.daysToFirstPlacement != null && (
          <p className="text-[10px] text-slate-400 mt-1.5">First placement at day {r.stats.daysToFirstPlacement}</p>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
        {isDraft ? (
          <Button size="sm" onClick={() => setEditOpen(true)}
            className="text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white">
            <ArrowRight className="w-3.5 h-3.5 mr-1" /> Continue editing
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setEditOpen(true)}>
              <Edit className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
            <Link href={`/employer/review/${r.id}`}>
              <Button size="sm" variant="outline" className="text-xs h-8">
                <Eye className="w-3.5 h-3.5 mr-1" /> Open requisition
              </Button>
            </Link>
          </>
        )}
      </div>
      <JobCreationForm editJob={r} controlledOpen={editOpen} onOpenChange={setEditOpen}
        trigger={<span style={{ display: "none" }} />} />
    </div>
  );
}

function KPI({ icon: Icon, value, label, subtitle, tone }: any) {
  const tones: any = {
    amber: "from-amber-500 to-orange-600 text-amber-50",
    purple: "from-purple-500 to-indigo-600 text-purple-50",
    blue: "from-blue-500 to-cyan-600 text-blue-50",
    emerald: "from-emerald-500 to-green-600 text-emerald-50",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tones[tone]} p-3.5`}>
      <div className="flex items-center justify-between mb-1">
        <Icon className="w-4 h-4 opacity-80" />
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">{label}</p>
      {subtitle && <p className="text-[10px] opacity-75 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone, highlight }: any) {
  const tones: any = {
    blue: "text-blue-600",
    purple: "text-purple-600",
    amber: "text-amber-600",
    cyan: "text-cyan-600",
    emerald: "text-emerald-600",
  };
  return (
    <div className={`rounded-lg p-2 ${highlight ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 ${tones[tone]}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      </div>
      <p className={`text-base font-bold tabular-nums mt-0.5 ${tones[tone]}`}>{value}</p>
    </div>
  );
}
