import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ReportsBI } from "@/components/shared/ReportsBI";
import { JobCreationForm } from "@/components/employer/job-creation-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, UserCheck, Handshake, Clock, Plus, Users, Search,
  Calendar, Loader2, Building, Eye, Edit, MapPin, FileText,
  ChevronRight, User, Star, AlertCircle, Bell, LayoutDashboard,
  Activity, ArrowRight, CheckCircle, TrendingUp, Globe, Download, Heart,
  Copy, Trash2, PauseCircle, PlayCircle, ClipboardList, Route, Tag,
} from "lucide-react";
import { jobCategoryLabel } from "@/lib/reference-data";
import { EmployerVerificationForm } from "@/components/employer/EmployerVerificationForm";
import { RequisitionsView } from "@/components/employer/RequisitionsView";
import { AgencyScorecardPanel } from "@/components/employer/AgencyScorecardPanel";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

function InitialsAvatar({ name, size = "w-10 h-10" }: { name: string; size?: string }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const gradients = ["from-blue-500 to-blue-600", "from-emerald-500 to-emerald-600", "from-purple-500 to-purple-600", "from-orange-500 to-orange-600", "from-rose-500 to-rose-600"];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return (
    <div className={`${size} bg-gradient-to-br ${gradients[idx]} rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
      {initials || <Building className="w-4 h-4" />}
    </div>
  );
}

export default function EmployerDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState("overview");
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Job list filter — settable by stat-card clicks (sidebar Quick Stats) so
  // "Closed", "Active", "All Posts" etc. open the My Jobs view already narrowed.
  // "all" = no filter. Persisted at dashboard level so switching tabs preserves it.
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | "active" | "closed" | "draft">("all");

  const { data: jobsRes, isLoading: jobsLoading } = useQuery({
    queryKey: ["/api/v1/jobs", "employer-all", "mine"],
    queryFn: () => fetchJson("/api/v1/jobs?status=all&mine=true&limit=100"),
  });
  // v0.4.32 (HPSEDC Item 1): pull KYB profile to drive the verification
  // banner. Profile auto-stubs on first GET so a fresh employer still
  // resolves to an object.
  const { data: employerProfileRes } = useQuery({
    queryKey: ["/api/v1/employer/profile"],
    queryFn: () => fetchJson("/api/v1/employer/profile"),
  });
  const employerProfile = employerProfileRes?.data || {};
  const { data: notifsRes } = useQuery({
    queryKey: ["/api/v1/notifications"],
    queryFn: () => fetchJson("/api/v1/notifications?limit=10"),
  });

  const allJobs = jobsRes?.data || [];
  const myJobs = allJobs.filter((j: any) => j.employerId === user?.id || j.agentId === user?.id);
  const activeJobs = myJobs.filter((j: any) => j.status === "active");
  const closedJobs = myJobs.filter((j: any) => j.status !== "active");
  const notifications = notifsRes?.data || [];

  if (jobsLoading) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      </div>
    );
  }

  // v0.4.30: parity with agent. "Active" entry dropped — it was a
  // redundant subset of "My Jobs" filtered to status=active. "All
  // Applicants" / "Applications Pipeline" added so the employer has a
  // cross-requisition candidate view (same component as agent's
  // /agent/applicants, endpoint now scopes by role).
  // v0.4.35 (Phase 4): nav rewritten requisition-first. "Requisitions"
  // replaces "My Jobs" as primary surface. "Agencies" new tab surfaces
  // the per-agency scorecard. "My Jobs" stays available for legacy
  // workflows but moved down in priority.
  const navItems: { key: string; label: string; icon: any; count: number | null; href?: string | null }[] = [
    { key: "overview",     label: "Dashboard",             icon: LayoutDashboard, count: null,                 href: null },
    { key: "requisitions", label: "Requisitions",          icon: Briefcase,       count: myJobs.length,        href: null },
    { key: "applicants",   label: "Applications Pipeline", icon: ClipboardList,   count: null,                 href: "/employer/applicants" },
    { key: "agencies",     label: "Agencies",              icon: Building,        count: null,                 href: null },
    { key: "placements",   label: "Offers & Placements",   icon: Handshake,       count: null,                 href: null },
    { key: "reports",      label: "Reports",               icon: TrendingUp,      count: null,                 href: null },
    { key: "activity",     label: "Activity",              icon: Activity,        count: notifications.length, href: null },
  ];

  // v0.4.32 (HPSEDC Item 1): verification status banner. Three states:
  //   - verified            → no banner
  //   - submitted, pending  → blue "under review" banner
  //   - rejected or untouched → red/amber "complete verification" CTA
  const isVerified = !!employerProfile.verified;
  const isSubmitted = !isVerified && !!employerProfile.submittedForReviewAt;
  const wasRejected = !isVerified && !!employerProfile.rejectionReason && !isSubmitted;

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-5">
      {!isVerified && (
        <div className={`mb-4 rounded-xl border p-4 flex items-start gap-3 ${
          isSubmitted ? "border-blue-200 bg-blue-50"
          : wasRejected ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
        }`}>
          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            isSubmitted ? "text-blue-600" : wasRejected ? "text-red-600" : "text-amber-600"
          }`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${
              isSubmitted ? "text-blue-900" : wasRejected ? "text-red-900" : "text-amber-900"
            }`}>
              {isSubmitted ? "Verification under review"
                : wasRejected ? "Verification was not approved"
                : "Complete company verification"}
            </p>
            <p className={`text-xs mt-0.5 ${
              isSubmitted ? "text-blue-700" : wasRejected ? "text-red-700" : "text-amber-700"
            }`}>
              {isSubmitted
                ? `Submitted ${new Date(employerProfile.submittedForReviewAt).toLocaleDateString("en-IN")}. HPSEDC usually decides within 48 hours.`
                : wasRejected
                  ? `Reason: ${employerProfile.rejectionReason}. Update your submission and re-submit.`
                  : "Upload your company documents and submit for HPSEDC review — required before you can publish requisitions."}
            </p>
          </div>
          <Button size="sm" onClick={() => setVerifyOpen(true)} className="flex-shrink-0">
            {isSubmitted ? "View details" : "Complete verification"}
          </Button>
        </div>
      )}

      {/* v0.7.5.0 — Verified employers can edit their profile post-approval.
          Contact fields edit freely; regulated fields reset verification. */}
      {isVerified && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              {employerProfile.companyName || "Verified employer"} — verified by HPSEDC
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              You can update contact info freely. Changes to company name, CIN, GST, PAN, or signatory identity will require re-verification.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setVerifyOpen(true)}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 flex-shrink-0">
            Edit profile
          </Button>
        </div>
      )}

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isVerified ? "Edit Company Profile" : "Company Verification"}</DialogTitle>
            <DialogDescription>
              {isVerified
                ? "Update your company info. Contact fields apply immediately; changes to regulated fields (company name, CIN, GST, PAN, signatory identity) will reset verification and require HPSEDC to re-approve."
                : "Provide your company KYB details + upload supporting documents. HPSEDC reviews submissions within 48 hours."}
            </DialogDescription>
          </DialogHeader>
          <EmployerVerificationForm onDone={() => setVerifyOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Mobile Nav */}
      <div className="lg:hidden mb-4">
        <div className="flex gap-1 overflow-x-auto bg-white rounded-xl border border-slate-200 p-1">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setActiveView(item.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap font-medium transition-all ${
                activeView === item.key ? "bg-blue-50 text-blue-700" : "text-slate-500"
              }`}>
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-6 xl:gap-7">
        {/* ── SIDEBAR ── */}
        <aside className="hidden lg:flex lg:flex-col gap-4 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pb-4">
          {/* Employer Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <InitialsAvatar name={user?.username || "E"} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-sm leading-snug truncate">{user?.username || "Employer"}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs w-full justify-center py-1 mb-3">
              Employer Account
            </Badge>
            <JobCreationForm />
          </div>

          {/* Navigation */}
          <nav className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm">
            {navItems.map(item => {
              const baseClass = `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                activeView === item.key
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              }`;
              const inner = (
                <>
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.count !== null && item.count > 0 && (
                    <span className={`text-[11px] font-semibold tabular-nums ${
                      activeView === item.key ? "text-blue-600" : "text-slate-400"
                    }`}>{item.count}</span>
                  )}
                </>
              );
              // v0.4.30: items with `href` are external routes (Link),
              // others are in-page tab switches (button).
              if (item.href) {
                return <Link key={item.key} href={item.href} className={baseClass}>{inner}</Link>;
              }
              return (
                <button key={item.key} onClick={() => setActiveView(item.key)} className={baseClass}>{inner}</button>
              );
            })}
          </nav>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Quick Stats</p>
            <div className="space-y-0.5">
              <MiniStat label="Active Jobs" value={activeJobs.length} icon={Briefcase} color="text-emerald-600" bg="bg-emerald-50" onClick={() => setActiveView("active")} />
              <MiniStat label="Total Posts" value={myJobs.length} icon={UserCheck} color="text-blue-600" bg="bg-blue-50" onClick={() => setActiveView("jobs")} />
              <MiniStat label="Closed" value={closedJobs.length} icon={Clock} color="text-slate-600" bg="bg-slate-50" onClick={() => { setJobStatusFilter("closed"); setActiveView("jobs"); }} />
              <MiniStat label="Updates" value={notifications.length} icon={Bell} color="text-orange-600" bg="bg-orange-50" onClick={() => setActiveView("activity")} />
            </div>
          </div>

          {/* Portal Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Portal Info</p>
            <div className="space-y-1.5 px-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-semibold text-emerald-600">● Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role</span>
                <span className="font-semibold text-slate-700">Employer</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Jobs</span>
                <span className="font-semibold text-slate-700">{myJobs.length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={activeView} variants={scaleIn} initial="initial" animate="animate" exit="exit">
              {activeView === "overview" && (
                <OverviewContent
                  myJobs={myJobs} activeJobs={activeJobs} closedJobs={closedJobs}
                  notifications={notifications} setActiveView={setActiveView}
                />
              )}
              {/* v0.4.35 (Phase 4): "requisitions" is the new primary
                  surface — renders RequisitionsView with per-req scorecard
                  + roll-up KPIs. "jobs" remains addressable but the nav
                  now points there only via deep-links / legacy URLs. */}
              {activeView === "requisitions" && <RequisitionsView />}
              {activeView === "jobs" && <JobsContent jobs={myJobs} title="All Job Postings" statusFilter={jobStatusFilter} setStatusFilter={setJobStatusFilter} />}
              {activeView === "agencies" && (
                <AgencyScorecardPanel
                  title="Agency Scorecard"
                  subtitle="Conversion rates per agency across all your requisitions. Use this to prioritise high-performing agencies for new picks."
                />
              )}
              {activeView === "placements" && <EmployerPlacements />}
              {activeView === "reports" && <ReportsBI />}
              {activeView === "activity" && <ActivityContent notifications={notifications} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ── Mini Stat ──
function MiniStat({ label, value, icon: Icon, color, bg, onClick }: { label: string; value: number | string; icon: React.ElementType; color: string; bg: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-left">
      <div className={`w-7 h-7 rounded-md ${bg} ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs text-slate-600 flex-1 truncate">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </button>
  );
}

// ── Stat Card ──
function StatCard({ icon: Icon, color, lightBg, value, label, subtitle, onClick }: {
  icon: React.ElementType; color: string; lightBg: string; value: number | string; label: string; subtitle: string; onClick?: () => void;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2 }}
      className={`bg-white rounded-xl border border-slate-200 p-4 transition-all shadow-sm hover:shadow-md ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`${lightBg} ${color} p-2 rounded-lg flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
            <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
        </div>
        {onClick && <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
      </div>
    </motion.div>
  );
}

// ── Overview ──
function OverviewContent({ myJobs, activeJobs, closedJobs, notifications, setActiveView }: any) {
  // v0.4.30: people-side metric for the 4th tile (was "Track
  // Placements — —" placeholder). Counts candidates currently in any
  // active pipeline stage across the employer's requisitions.
  const { data: applicantsRes } = useQuery({
    queryKey: ["/api/v1/agent/applicants"],
    queryFn: () => fetchJson("/api/v1/agent/applicants"),
  });
  const applicants: any[] = applicantsRes?.data ?? [];
  const inPipeline = applicants.filter((a) =>
    ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected"].includes(a.status)
  ).length;

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {/* Hero: Awaiting your decision — the employer's primary metric */}
      <AwaitingDecisionHero setActiveView={setActiveView} />

      {/* v0.4.30: Applications Pipeline strip — same 6 stages the agent
          and candidate see, scoped to the employer's requisitions. */}
      <EmployerPipelineStrip applicants={applicants} />

      <motion.div variants={fadeUp} className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Briefcase} color="text-blue-600" lightBg="bg-blue-50" value={activeJobs.length} label="Open requisitions" subtitle={`${myJobs.length} total posted`} onClick={() => setActiveView("jobs")} />
        <StatCard icon={UserCheck} color="text-emerald-600" lightBg="bg-emerald-50" value={applicants.length} label="Total applicants" subtitle={`${inPipeline} in active pipeline`} onClick={() => { window.location.href = "/employer/applicants"; }} />
        <StatCard icon={Bell} color="text-orange-600" lightBg="bg-orange-50" value={notifications.length} label="Updates" subtitle="New notifications" onClick={() => setActiveView("activity")} />
        <StatCard icon={Handshake} color="text-purple-600" lightBg="bg-purple-50" value={myJobs.length === 0 ? "—" : applicants.filter(a => ["selected", "placed"].includes(a.status)).length} label="Offers & Placements" subtitle="Selected + Placed" onClick={() => setActiveView("placements")} />
      </motion.div>

      {/* Requisitions with progress bars */}
      <RequisitionsProgress setActiveView={setActiveView} />

      {/* Recent Jobs */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-600" /> Recent Job Postings
          </h3>
          <Button variant="ghost" size="sm" className="text-xs text-blue-600 font-semibold" onClick={() => setActiveView("jobs")}>
            View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
        {myJobs.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No job postings yet</p>
            <p className="text-xs mt-1">Click "Post Job" to create your first listing</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myJobs.slice(0, 5).map((job: any) => (
              <CompactJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </motion.div>

      {/* Recent Activity */}
      {notifications.length > 0 && (
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-600" /> Recent Activity
            </h3>
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 font-semibold" onClick={() => setActiveView("activity")}>
              View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 3).map((n: any) => (
              <div key={n.id} className={`p-3 rounded-xl ${n.read ? 'bg-slate-50' : 'bg-blue-50 border-l-4 border-blue-500'}`}>
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                <p className="text-[11px] text-slate-400 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN') : ''}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Compact Job Row ──
function CompactJobRow({ job }: { job: any }) {
  return (
    <Link href={`/employer/review/${job.id}`}
      className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-purple-300 hover:bg-purple-50/40 transition-colors group cursor-pointer">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700">{job.title}</p>
        <p className="text-xs text-slate-400 flex items-center gap-1 flex-wrap">
          <MapPin className="w-3 h-3" /> {job.location}, {job.country}
          {job.salary && <span>· {job.salary}</span>}
          {job.category && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0 rounded bg-indigo-50 text-indigo-700 border border-indigo-100" title="Job category">
              <Tag className="w-2.5 h-2.5" /> {jobCategoryLabel(job.category)}
            </span>
          )}
        </p>
      </div>
      <Badge className={`text-[11px] flex-shrink-0 ${job.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{job.status}</Badge>
    </Link>
  );
}

// ── Jobs Content ──
// `statusFilter` narrows the list client-side. When `lockStatus` is true, the
// Active tab's filter is forced — the chip bar still shows so users know what
// they're looking at but the All chip is hidden.
function JobsContent({ jobs, title, statusFilter = "all", setStatusFilter, lockStatus = false }: {
  jobs: any[]; title: string;
  statusFilter?: "all" | "active" | "closed" | "draft";
  setStatusFilter?: (v: "all" | "active" | "closed" | "draft") => void;
  lockStatus?: boolean;
}) {
  type JobSort = "newest" | "oldest" | "deadline" | "priority";
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "standard" | "urgent" | "critical">("all");
  const [sortBy, setSortBy] = useState<JobSort>("newest");
  const countries = Array.from(new Set(jobs.map((j: any) => j.country).filter(Boolean))).sort();
  const counts = {
    all: jobs.length,
    active: jobs.filter((j: any) => j.status === "active").length,
    closed: jobs.filter((j: any) => j.status === "closed").length,
    draft: jobs.filter((j: any) => j.status === "draft").length,
  };
  const priorityRank: Record<string, number> = { critical: 3, urgent: 2, standard: 1 };
  const filtered = jobs.filter((j: any) => {
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchCountry = countryFilter === "all" || j.country === countryFilter;
    const matchPriority = priorityFilter === "all" || (j.priority || "standard") === priorityFilter;
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (j.title || "").toLowerCase().includes(s) ||
      (j.company || "").toLowerCase().includes(s) ||
      (j.location || "").toLowerCase().includes(s) ||
      (j.skills || []).some((sk: string) => sk.toLowerCase().includes(s));
    return matchStatus && matchCountry && matchPriority && matchSearch;
  });
  filtered.sort((a: any, b: any) => {
    switch (sortBy) {
      case "oldest":   return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "deadline": {
        const da = a.hiringDeadline ? new Date(a.hiringDeadline).getTime() : Infinity;
        const db = b.hiringDeadline ? new Date(b.hiringDeadline).getTime() : Infinity;
        return da - db;
      }
      case "priority": return (priorityRank[b.priority] ?? 1) - (priorityRank[a.priority] ?? 1);
      case "newest":
      default:         return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
  const chips: Array<["all" | "active" | "closed" | "draft", string, string]> = [
    ["all",    "All",    "bg-slate-100 text-slate-700"],
    ["active", "Active", "bg-emerald-100 text-emerald-800"],
    ["draft",  "Drafts", "bg-amber-100 text-amber-800"],
    ["closed", "Closed", "bg-slate-200 text-slate-700"],
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-600" /> {title}
          <span className="text-slate-400 text-xs font-normal">({filtered.length} of {jobs.length})</span>
        </h3>
      </div>

      {/* Filter chips + search + country — leverages the existing list without
          adding new nav elements. Chips are visible even in lock mode so users
          know what slice they're viewing. */}
      {!lockStatus && setStatusFilter && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {chips.map(([k, label, cls]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              aria-pressed={statusFilter === k}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition ${
                statusFilter === k ? `${cls} border-slate-500 shadow-sm` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}>
              {label} <span className="text-slate-500 tabular-nums ml-0.5">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input type="text" placeholder="Search title, company, location, skill…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] h-9 text-xs rounded-md border border-slate-200 px-3" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as JobSort)}
          className="h-9 text-xs rounded-md border border-slate-200 px-2 bg-white">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="deadline">Deadline (soonest)</option>
          <option value="priority">Priority (high→low)</option>
        </select>
        {countries.length > 1 && (
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All countries</option>
            {countries.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(["all", "critical", "urgent", "standard"] as const).map((p) => (
          <button key={p} onClick={() => setPriorityFilter(p)}
            aria-pressed={priorityFilter === p}
            className={`text-[11px] font-semibold px-2 py-1 rounded-md border transition ${
              priorityFilter === p
                ? (p === "critical" ? "bg-red-100 text-red-800 border-red-400"
                  : p === "urgent" ? "bg-amber-100 text-amber-800 border-amber-400"
                  : p === "standard" ? "bg-slate-100 text-slate-700 border-slate-400"
                  : "bg-blue-50 text-blue-700 border-blue-300")
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}>
            {p === "all" ? "All priorities" : p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
        {(countryFilter !== "all" || priorityFilter !== "all" || sortBy !== "newest") && (
          <button onClick={() => { setCountryFilter("all"); setPriorityFilter("all"); setSortBy("newest"); }}
            className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline">Clear</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">{jobs.length === 0 ? "No jobs yet" : "No jobs match the current filters"}</p>
          {jobs.length === 0 && <p className="text-xs mt-1">Click "Post Job" to create your first listing</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job: any) => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
}

// ── Rich Job Card ──
function JobCard({ job }: { job: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const isDraft = job.status === "draft";
  const isClosed = job.status === "closed";

  const statusMut = useMutation({
    mutationFn: async (nextStatus: "active" | "closed") => {
      const r = await fetch(`/api/v1/jobs/${job.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!r.ok) throw new Error((await r.json())?.error?.message || "Failed");
      return r.json();
    },
    onSuccess: (_, next) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/employer/requisitions"] });
      toast({ title: next === "closed" ? "Requisition closed" : "Requisition reopened" });
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const cloneMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/jobs/${job.id}/clone`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json())?.error?.message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/employer/requisitions"] });
      toast({ title: "Cloned as new draft", description: "Edit and publish when ready." });
    },
    onError: (e: any) => toast({ title: "Couldn't clone", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/jobs/${job.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json())?.error?.message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/employer/requisitions"] });
      toast({ title: isDraft ? "Draft deleted" : "Requisition deleted" });
    },
    onError: (e: any) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
              {job.title}
              {job.priority === "critical" && <Badge className="text-[10px] bg-red-100 text-red-700">critical</Badge>}
              {job.priority === "urgent" && <Badge className="text-[10px] bg-amber-100 text-amber-700">urgent</Badge>}
            </h4>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
              <span className="flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5" />{[job.location, job.country].filter(Boolean).join(", ") || <span className="italic">no location yet</span>}</span>
              {job.salary && <span>· {job.salary}</span>}
              {job.targetHires > 1 && <span>· {job.targetHires} hires</span>}
              {job.category && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0 rounded bg-indigo-50 text-indigo-700 border border-indigo-100" title="Job category">
                  <Tag className="w-2.5 h-2.5" /> {jobCategoryLabel(job.category)}
                </span>
              )}
            </div>
          </div>
          <Badge className={`text-[11px] flex-shrink-0 ${
            job.status === "active" ? "bg-emerald-100 text-emerald-700"
            : isDraft ? "bg-amber-100 text-amber-700"
            : isClosed ? "bg-slate-200 text-slate-700"
            : "bg-slate-100 text-slate-500"
          }`}>{job.status}</Badge>
        </div>

        {job.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {job.skills.slice(0, 5).map((s: string) => <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>)}
            {job.experience > 0 && <Badge variant="outline" className="text-[11px]">{job.experience}+ yrs</Badge>}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3 flex-wrap">
          <Calendar className="w-3.5 h-3.5" />
          Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString('en-IN') : 'recently'}
          {job.hiringDeadline && <span>· deadline {new Date(job.hiringDeadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
          {job.stats && job.targetHires > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
              <Users className="w-3 h-3" />
              {(job.stats.placed || 0) + (job.stats.selected || 0)} / {job.targetHires} hired
            </span>
          )}
          {job.stats?.awaitingDecision > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
              {job.stats.awaitingDecision} awaiting you
            </span>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {!isDraft && (
            <Link href={`/employer/review/${job.id}`}>
              <Button size="sm" className="rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-xs">
                <Eye className="w-3.5 h-3.5 mr-1" /> Review Candidates
              </Button>
            </Link>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}
            className="rounded-lg text-xs">
            <Edit className="w-3.5 h-3.5 mr-1" /> {isDraft ? "Continue" : "Edit"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => cloneMut.mutate()}
            disabled={cloneMut.isPending} className="rounded-lg text-xs">
            <Copy className="w-3.5 h-3.5 mr-1" /> Clone
          </Button>
          {job.status === "active" && (
            <Button size="sm" variant="outline"
              onClick={() => { if (confirm("Close this requisition? Derivative agent jobs will also auto-close. You can reopen later.")) statusMut.mutate("closed"); }}
              disabled={statusMut.isPending}
              className="rounded-lg text-xs border-slate-200 hover:border-amber-400 hover:text-amber-700">
              <PauseCircle className="w-3.5 h-3.5 mr-1" /> Close
            </Button>
          )}
          {isClosed && (
            <Button size="sm" variant="outline" onClick={() => statusMut.mutate("active")}
              disabled={statusMut.isPending}
              className="rounded-lg text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <PlayCircle className="w-3.5 h-3.5 mr-1" /> Reopen
            </Button>
          )}
          {(isDraft || isClosed) && (
            <Button size="sm" variant="outline"
              onClick={() => { if (confirm(isDraft ? "Delete this draft?" : "Delete this closed requisition?")) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
              className="rounded-lg text-xs border-red-200 text-red-700 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>
      <JobCreationForm editJob={job} controlledOpen={editOpen} onOpenChange={setEditOpen}
        trigger={<span style={{ display: "none" }} />} />
    </>
  );
}

// ── Activity Content ──
function ActivityContent({ notifications }: { notifications: any[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-orange-600" /> Recent Activity
      </h3>
      {notifications.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div key={n.id} className={`p-3 rounded-xl ${n.read ? 'bg-slate-50' : 'bg-blue-50 border-l-4 border-blue-500'}`}>
              <p className="text-sm font-medium text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
              <p className="text-[11px] text-slate-400 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN') : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Employer Placements / Offers ─────────────────────────────────────
function EmployerPlacements() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [letterUrl, setLetterUrl] = useState("");
  // v0.4.14: edit details (country/salary/startDate) dialog state
  const [editDetailsFor, setEditDetailsFor] = useState<any | null>(null);
  // Employer observer welfare note (FRS — employer-observable welfare).
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/agent/placements"],
    queryFn: () => fetchJson("/api/v1/agent/placements"),
  });
  const rows: any[] = res?.data ?? [];

  const uploadLetter = useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string }) => {
      const r = await fetch(`/api/v1/agent/placements/${id}/appointment-letter`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentLetterUrl: url }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Appointment letter linked" });
      setEditing(null); setLetterUrl("");
      qc.invalidateQueries({ queryKey: ["/api/v1/agent/placements"] });
    },
  });

  const saveNote = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const r = await fetch(`/api/v1/employer/placements/${id}/welfare-note`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Observation saved" });
      setNoteFor(null); setNoteText("");
      qc.invalidateQueries({ queryKey: ["/api/v1/agent/placements"] });
    },
    onError: () => toast({ title: "Couldn't save note", variant: "destructive" }),
  });

  const uploadLetterFile = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/v1/agent/placements/${id}/appointment-letter-file`, { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error?.message || (await r.json().catch(() => ({})))?.message || "Upload failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Appointment letter uploaded", description: "The candidate can now download it." });
      qc.invalidateQueries({ queryKey: ["/api/v1/agent/placements"] });
    },
    onError: (e: any) => toast({ title: "Couldn't upload letter", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Handshake className="w-5 h-5 text-orange-500" /> Offers & Placements ({rows.length})
        </h3>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Handshake className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No placements yet</p>
          <p className="text-xs text-slate-400 mt-1">Once a candidate is selected, their placement appears here for offer tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.placement.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {(r.candidate.fullName || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{r.candidate.fullName}</p>
                    <p className="text-xs text-slate-500">For <Link href={`/agent/jobs/${r.job.id}`} className="text-blue-600 hover:underline">{r.job.title}</Link> · {r.job.company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    // Welfare-overdue reminder. Only applies when placement is
                    // accepted/active AND start-date has passed the check-in
                    // threshold but the status field is empty.
                    const active = ["accepted", "active"].includes(r.placement.status);
                    const start = r.placement.startDate ? new Date(r.placement.startDate).getTime() : null;
                    if (!active || !start) return null;
                    const days = Math.floor((Date.now() - start) / 86_400_000);
                    const overdue: string[] = [];
                    if (days >= 35 && !r.placement.welfare30Day) overdue.push("30-day");
                    if (days >= 65 && !r.placement.welfare60Day) overdue.push("60-day");
                    if (days >= 95 && !r.placement.welfare90Day) overdue.push("90-day");
                    if (overdue.length === 0) return null;
                    return (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse">
                        ⚠ Welfare overdue: {overdue.join(", ")}
                      </Badge>
                    );
                  })()}
                  <Badge variant="outline" className={`capitalize ${r.placement.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.placement.status === "declined" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {r.placement.status}
                  </Badge>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-4 text-xs">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase text-slate-500 font-semibold">Destination</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-blue-600" />{r.placement.country}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase text-slate-500 font-semibold">Salary</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{r.placement.salary || "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase text-slate-500 font-semibold">Start date</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{r.placement.startDate ? new Date(r.placement.startDate).toLocaleDateString("en-IN") : "TBD"}</p>
                </div>
              </div>

              {/* Appointment letter (FRS 3.5) */}
              <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-900">Appointment letter</span>
                    {r.placement.appointmentLetterUrl
                      ? <a href={`/api/v1/agent/placements/${r.placement.id}/appointment-letter`} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline font-medium">View signed letter</a>
                      : <Badge variant="outline" className="bg-white text-[10px]">Not uploaded</Badge>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <label className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded border cursor-pointer ${uploadLetterFile.isPending ? "opacity-60" : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"}`}
                      title="Attach your signed appointment letter (PDF/JPG/PNG)">
                      {uploadLetterFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 rotate-180" />}
                      {r.placement.appointmentLetterUrl ? "Replace signed letter" : "Upload signed letter"}
                      <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                        disabled={uploadLetterFile.isPending}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLetterFile.mutate({ id: r.placement.id, file: f }); e.currentTarget.value = ""; }} />
                    </label>
                    <a href={`/api/v1/agent/placements/${r.placement.id}/offer-letter.pdf`}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-slate-200 bg-white hover:border-slate-400 text-slate-600"
                      title="System-generated portal template — not the signed contract">
                      <Download className="w-3.5 h-3.5" /> Portal template
                    </a>
                    <Button size="sm" variant="outline" onClick={() => setEditDetailsFor(r)}
                      title="Edit country, salary, and start date">
                      <Edit className="w-3.5 h-3.5 mr-1" /> Edit details
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r.placement.id); setLetterUrl(r.placement.appointmentLetterUrl || ""); }}>
                      or paste link
                    </Button>
                  </div>
                </div>
                {editing === r.placement.id && (
                  <div className="mt-2 flex gap-2">
                    <Input value={letterUrl} onChange={(e) => setLetterUrl(e.target.value)}
                      placeholder="https://... (link to signed PDF)" className="h-9 text-sm" />
                    <Button size="sm" disabled={!letterUrl || uploadLetter.isPending}
                      onClick={() => uploadLetter.mutate({ id: r.placement.id, url: letterUrl })}>
                      {uploadLetter.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setLetterUrl(""); }}>Cancel</Button>
                  </div>
                )}
              </div>

              {/* Deployment readiness (read-only — agency drives, employer observes) */}
              {r.deployment && (
                <div className="mt-3 p-3 bg-indigo-50/40 border border-indigo-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Deployment readiness</p>
                    <span className="text-[11px] font-semibold text-indigo-700">{r.deployment.summary.done}/{r.deployment.summary.total} done</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden mb-2">
                    <div className="h-full bg-indigo-500" style={{ width: `${r.deployment.summary.pct}%` }} />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-1.5 text-[11px]">
                    {r.deployment.checklist.map((it: any) => (
                      <div key={it.key} className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.status === "done" ? "bg-emerald-500" : it.status === "in_progress" ? "bg-blue-500" : it.status === "action_needed" ? "bg-amber-500" : "bg-slate-300"}`} />
                        <span className="text-slate-600 truncate">{it.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Welfare check-ins visibility (read-mostly for employer) */}
              {(r.placement.welfare30Day || r.placement.welfare60Day || r.placement.welfare90Day || r.placement.candidateWelfareNote || r.placement.employerWelfareNote || noteFor === r.placement.id) && (
                <div className="mt-3 p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-rose-800 flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> Post-placement welfare</p>
                    <button onClick={() => { setNoteFor(r.placement.id); setNoteText(r.placement.employerWelfareNote || ""); }}
                      className="text-[11px] font-semibold text-rose-700 hover:underline">
                      {r.placement.employerWelfareNote ? "Edit observation" : "Add observation"}
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 mt-2 text-[11px]">
                    {["30", "60", "90"].map((m) => {
                      const st = r.placement[`welfare${m}Day`];
                      const at = r.placement[`welfare${m}DayAt`];
                      return (
                        <div key={m} className="bg-white rounded border border-rose-100 p-2">
                          <p className="text-slate-500">{m}-day</p>
                          <p className={`font-semibold capitalize ${st === "ok" ? "text-emerald-700" : st === "concerns" ? "text-amber-700" : "text-slate-400"}`}>{st?.replace(/_/g, " ") ?? "Not recorded"}</p>
                          {at && <p className="text-[10px] text-slate-400">{new Date(at).toLocaleDateString("en-IN")}</p>}
                        </div>
                      );
                    })}
                  </div>
                  {r.placement.candidateWelfareNote && (
                    <div className="mt-2 bg-white rounded border border-rose-100 p-2">
                      <p className="text-[10px] uppercase text-rose-700 font-semibold">Candidate update</p>
                      <p className="text-xs text-slate-700 mt-0.5">{r.placement.candidateWelfareNote}</p>
                    </div>
                  )}
                  {r.placement.employerWelfareNote && noteFor !== r.placement.id && (
                    <div className="mt-2 bg-white rounded border border-indigo-100 p-2">
                      <p className="text-[10px] uppercase text-indigo-700 font-semibold">Your observation</p>
                      <p className="text-xs text-slate-700 mt-0.5">{r.placement.employerWelfareNote}</p>
                    </div>
                  )}
                  {noteFor === r.placement.id && (
                    <div className="mt-2 flex gap-2">
                      <Input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                        placeholder="How is the hire performing at destination?" className="h-9 text-sm" />
                      <Button size="sm" disabled={saveNote.isPending} onClick={() => saveNote.mutate({ id: r.placement.id, note: noteText.trim() })}>
                        {saveNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNoteText(""); }}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* v0.4.14: edit country/salary/startDate on an auto-created placement */}
      <PlacementDetailsModal
        row={editDetailsFor}
        onClose={() => setEditDetailsFor(null)}
        onSaved={() => {
          setEditDetailsFor(null);
          qc.invalidateQueries({ queryKey: ["/api/v1/agent/placements"] });
          toast({ title: "Placement updated" });
        }}
      />
    </div>
  );
}

function PlacementDetailsModal({ row, onClose, onSaved }: {
  row: any | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [country, setCountry] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");

  // Reset inputs when the dialog opens onto a new placement
  useEffect(() => {
    if (row) {
      setCountry(row.placement?.country || "");
      setSalary(row.placement?.salary || "");
      setStartDate(row.placement?.startDate ? new Date(row.placement.startDate).toISOString().split("T")[0] : "");
    }
  }, [row?.placement?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const body: any = { country: country.trim(), salary: salary.trim() || null };
      body.startDate = startDate || null;
      const r = await fetch(`/api/v1/agent/placements/${row.placement.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as any));
        throw new Error(e?.message || "Save failed");
      }
      return r.json();
    },
    onSuccess: onSaved,
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit className="w-5 h-5 text-indigo-600" /> Edit placement details</DialogTitle>
          <DialogDescription>
            {row?.candidate?.fullName ? <>for <span className="font-semibold text-slate-900">{row.candidate.fullName}</span></> : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Destination country</label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)}
              placeholder="UAE / Saudi Arabia / Germany …" className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Salary (with currency)</label>
            <Input value={salary} onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. AED 8,000 / month" className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]} className="mt-1 h-10 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!country.trim() || save.isPending} onClick={() => save.mutate()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Applications Pipeline strip (v0.4.30) ────────────────────────────
// Six-stage horizontal pill row, same shape as the candidate and agent
// versions. Counts the employer's applicants in each stage. Clicking a
// pill deep-links to /employer/applicants pre-filtered.
const EMPLOYER_PIPELINE = [
  { key: "submitted",           label: "Submitted",  bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  { key: "reviewed",            label: "Reviewed",   bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  { key: "shortlisted",         label: "Shortlisted",bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500" },
  { key: "interview_scheduled", label: "Interview",  bg: "bg-cyan-50",    text: "text-cyan-700",    dot: "bg-cyan-500" },
  { key: "selected",            label: "Selected",   bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  { key: "placed",              label: "Placed",     bg: "bg-green-50",   text: "text-green-700",   dot: "bg-green-600" },
] as const;

function EmployerPipelineStrip({ applicants }: { applicants: any[] }) {
  if (!applicants || applicants.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const s of EMPLOYER_PIPELINE) counts[s.key] = 0;
  for (const a of applicants) {
    if (a.status && counts[a.status] !== undefined) counts[a.status]++;
  }
  return (
    <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Route className="w-4 h-4 text-indigo-600" /> Applications Pipeline
          <span className="text-[11px] font-normal text-slate-500">{applicants.length} application{applicants.length !== 1 ? "s" : ""} across your requisitions</span>
        </h3>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {EMPLOYER_PIPELINE.map((s, i) => {
          const count = counts[s.key];
          const isEmpty = count === 0;
          return (
            <Link key={s.key} href={`/employer/applicants?status=${encodeURIComponent(s.key)}`}>
              <a className={`block rounded-lg px-3 py-2.5 text-left transition border cursor-pointer ${isEmpty ? "bg-slate-50 text-slate-400 border-slate-100" : `${s.bg} ${s.text} border-transparent hover:ring-2 hover:ring-slate-300`}`}
                 title={isEmpty ? `No applications in ${s.label} stage` : `View ${count} application${count === 1 ? "" : "s"} in ${s.label}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isEmpty ? "bg-slate-200" : s.dot}`} />
                  <span className="text-[10px] uppercase font-bold opacity-80">{i + 1}. {s.label}</span>
                </div>
                <div className="text-2xl font-bold tabular-nums mt-1">{count}</div>
              </a>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Awaiting-your-decision hero card ─────────────────────────────────
function AwaitingDecisionHero({ setActiveView }: { setActiveView: (v: string) => void }) {
  const { data: res } = useQuery({
    queryKey: ["/api/v1/employer/review-queue"],
    queryFn: () => fetchJson("/api/v1/employer/review-queue"),
  });
  const rows: any[] = res?.data ?? [];
  const awaiting = rows.filter((r) => r.application.status === "shortlisted" && !r.application.employerDecision);

  return (
    <motion.div variants={fadeUp}
      className="bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 text-white rounded-2xl p-6 shadow-lg">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-purple-200 font-semibold">Primary queue</p>
          <h2 className="text-2xl font-bold mt-1">Awaiting your decision</h2>
          <p className="text-sm text-purple-100 mt-1 max-w-xl">
            Candidates the agency has shortlisted against your requisitions. Approve them for interview, or request replacements.
          </p>
        </div>
        <div className="text-right">
          <p className="text-6xl font-bold tabular-nums">{awaiting.length}</p>
          <p className="text-xs text-purple-200 uppercase tracking-wide font-semibold">candidates</p>
        </div>
      </div>

      {awaiting.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-purple-200 mb-2">Next 3 to review:</p>
          <div className="space-y-2">
            {awaiting.slice(0, 3).map((r) => {
              const c = r.candidate, j = r.job;
              return (
                <Link key={r.application.id} href={`/employer/review/${j.id}`}
                  className="flex items-center justify-between bg-white/10 hover:bg-white/15 backdrop-blur rounded-lg p-3 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white/20 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {(c.fullName || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.fullName}</p>
                      <p className="text-[11px] text-purple-200 truncate">for {j.title}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-200" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Requisitions progress cards ──────────────────────────────────────
function RequisitionsProgress({ setActiveView }: { setActiveView: (v: string) => void }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/employer/requisitions"],
    queryFn: () => fetchJson("/api/v1/employer/requisitions"),
  });
  const rows: any[] = res?.data ?? [];
  if (isLoading || rows.length === 0) return null;

  return (
    <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-purple-600" /> Active Requisitions
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setActiveView("jobs")} className="text-xs text-purple-600 font-semibold">
          View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
      <div className="space-y-3">
        {rows.slice(0, 4).map((r: any) => {
          const pct = r.stats.progressPct;
          const isUrgent = r.priority === "urgent" || r.priority === "critical";
          return (
            <Link key={r.id} href={`/employer/review/${r.id}`}
              className="block bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200 hover:border-purple-400 hover:shadow-sm p-4 transition">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{r.title}</p>
                    {isUrgent && (
                      <Badge className={`text-[10px] ${r.priority === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.priority === "critical" ? "🔥 Critical" : "⚡ Urgent"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {r.location}, {r.country}
                    {r.hiringDeadline && (
                      <span className="ml-3">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        Deadline: {new Date(r.hiringDeadline).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {r.stats.placed + r.stats.selected}<span className="text-sm text-slate-400"> / {r.targetHires ?? 1}</span>
                  </p>
                  <p className="text-[10px] uppercase text-slate-500 font-semibold">Hires</p>
                </div>
              </div>

              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all"
                  style={{ width: `${pct}%` }} />
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px]">
                {r.stats.awaitingDecision > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-purple-700">
                    <Eye className="w-3.5 h-3.5" /> {r.stats.awaitingDecision} awaiting your review
                  </span>
                )}
                {r.stats.approvedForInterview > 0 && (
                  <span className="text-emerald-700">{r.stats.approvedForInterview} approved</span>
                )}
                {r.stats.selected > 0 && (
                  <span className="text-blue-700">{r.stats.selected} selected</span>
                )}
                <span className="ml-auto text-purple-600 font-medium">Review queue →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
