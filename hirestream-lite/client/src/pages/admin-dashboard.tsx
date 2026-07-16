import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Briefcase, Handshake, Building, Download, Settings,
  UserCheck, BarChart3, Shield, TrendingUp, Activity, AlertTriangle,
  CheckCircle, Clock, FileText, FileSpreadsheet, MessageSquare, MessagesSquare, Send, GraduationCap,
  Loader2, Mail, Phone, Fingerprint, KeyRound, FolderLock, PlugZap, XCircle, Globe, LifeBuoy,
  Printer, Cpu, Network, Layers, Sigma, GitBranch, ScrollText,
  Server, Database, Smartphone, Lock, HardDrive, Boxes, Plug, FileCheck, Square, Plane,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ISO_COUNTRIES, COMMON_DESTINATION_CODES } from "@/lib/iso-countries";
// audit 2026-07-06 (Batch 3): dropped dead AgencyApprovalList import — the
// component is no longer mounted here (superseded by KYBReviewList); the
// component file itself stays for the e2e tests that import it directly.
import { KYBReviewList } from "@/components/admin/KYBReviewList";
import { ReadinessRing } from "@/components/shared/ReadinessRing";
import { TravelReadyBadge, type ReadinessStage } from "@/components/shared/TravelReadyBadge";
import { GrievanceThread } from "@/components/shared/GrievanceThread";
import { MatchingEnginePanel } from "@/components/admin/MatchingEnginePanel";
import JobImportPanel from "@/components/admin/JobImportPanel";
// HP-6: "Ask HPSEDC" inbox — shared with the agent dashboard (single-agency
// staff work from there). Human-answered today; the same thread model accepts
// an AI Responder later.
import { SupportInboxPanel } from "@/components/shared/SupportInboxPanel";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  // readiness 2026-07-07: only the new Deployment Readiness strings are
  // translated (readiness.* namespace) — the legacy admin labels stay
  // hard-coded English like the rest of this staff console.
  const { t } = useTranslation();
  // HP-3b: slim admin — hide the external employer/agency approval queues when
  // those roles are disabled (single-agency HP). Code stays; just not shown.
  const { capabilities } = useCapabilities();

  // Real data from admin reports API
  const { data: dashRes, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/reports/dashboard"],
    queryFn: () => fetchJson("/api/v1/admin/reports/dashboard"),
  });

  const { data: districtRes } = useQuery({
    queryKey: ["/api/v1/admin/reports/by-district"],
    queryFn: () => fetchJson("/api/v1/admin/reports/by-district"),
  });

  const { data: skillRes } = useQuery({
    queryKey: ["/api/v1/admin/reports/by-skill"],
    queryFn: () => fetchJson("/api/v1/admin/reports/by-skill"),
  });

  const { data: funnelRes } = useQuery({
    queryKey: ["/api/v1/admin/reports/by-placement-status"],
    queryFn: () => fetchJson("/api/v1/admin/reports/by-placement-status"),
  });

  const { data: countryRes } = useQuery({
    queryKey: ["/api/v1/admin/reports/by-country"],
    queryFn: () => fetchJson("/api/v1/admin/reports/by-country"),
  });

  const { data: notifsRes } = useQuery({
    queryKey: ["/api/v1/notifications"],
    queryFn: () => fetchJson("/api/v1/notifications?limit=10"),
  });

  const { data: grievancesRes } = useQuery({
    queryKey: ["/api/v1/grievances"],
    queryFn: () => fetchJson("/api/v1/grievances"),
  });

  const { data: pendingDrivesRes } = useQuery({
    queryKey: ["/api/v1/drives", "pending"],
    queryFn: () => fetchJson("/api/v1/drives?status=pending"),
  });
  // HP-4c: Assisted-tier callback requests.
  const { data: callbacksRes } = useQuery({
    queryKey: ["/api/v1/admin/callback-requests"],
    queryFn: () => fetchJson("/api/v1/admin/callback-requests"),
  });
  const callbacks = callbacksRes?.data || [];
  const callbackCount = callbacks.length;

  // HP-6: "Ask HPSEDC" support inbox — one thread per candidate.
  const { data: supportThreadsRes } = useQuery({
    queryKey: ["/api/v1/support/threads"],
    queryFn: () => fetchJson("/api/v1/support/threads"),
    refetchInterval: 20000,
  });
  const supportThreads = supportThreadsRes?.data || [];
  const supportUnread = supportThreads.reduce((n: number, t: any) => n + (Number(t.unread) || 0), 0);

  const queryClient = useQueryClient();

  const stats = dashRes?.data || {};
  const districts = districtRes?.data || [];
  const skills = skillRes?.data || { demand: [], supply: [] };
  const funnel = funnelRes?.data || { funnel: [], summary: {} };
  const countries = countryRes?.data || [];
  const notifications = notifsRes?.data || [];
  const grievanceList = grievancesRes?.data || [];
  // "Open" grievances = not terminal — matches the Pending Verifications card
  // and the dashboard's `grievances.open` count. Tab badge + section header
  // both use this so they stay in sync with the rest of the dashboard.
  const openGrievances = grievanceList.filter((g: any) => g.status !== "resolved" && g.status !== "escalated" && g.status !== "closed");
  const pendingDrives = pendingDrivesRes?.data || [];

  // Controlled tab state so cross-card shortcuts (e.g. "Review now →") can switch panes.
  const [tab, setTab] = useState("overview");

  // Sidebar navigation — grouped semantically, replaces the 20-tab horizontal
  // overflow that was wrapping to 2 lines. New tabs land in any group without
  // a layout change. Pattern mirrors the superadmin Ops Console sidebar.
  const navGroupsAll: { label: string; items: { key: string; label: string; icon: any; count?: number }[] }[] = [
    { label: "OVERVIEW & ANALYTICS", items: [
      { key: "overview", label: "Overview", icon: BarChart3 },
      { key: "reports", label: "Reports", icon: FileText },
      { key: "funnel", label: "Funnel", icon: TrendingUp },
      { key: "leaderboard", label: "Leaderboard", icon: Activity },
    ]},
    { label: "PEOPLE & ORGS", items: [
      { key: "users", label: "Users", icon: Users },
      { key: "callbacks", label: "Callbacks", icon: Phone, count: callbackCount },
      { key: "placement_support", label: "Placement Support", icon: LifeBuoy },
      { key: "agencies", label: "Agencies", icon: Building },
      { key: "employers", label: "Employers", icon: Briefcase },
    ]},
    { label: "OPERATIONS", items: [
      { key: "import_jobs", label: "Import Jobs", icon: FileSpreadsheet },
      { key: "lifecycle", label: "Lifecycle", icon: Clock },
      { key: "drives", label: "Drives", icon: Handshake, count: pendingDrives.length },
      { key: "matching", label: "Matching Engine", icon: Cpu },
      // readiness 2026-07-07: fleet-wide pre-departure readiness (ring/stage/CSV)
      { key: "deployment_readiness", label: t("readiness.admin.navLabel"), icon: Plane },
      { key: "welfare", label: "Welfare SLA", icon: GraduationCap },
    ]},
    { label: "RISK & COMPLIANCE", items: [
      { key: "compliance", label: "Compliance", icon: Shield },
      { key: "audit", label: "Audit Log", icon: FolderLock },
      { key: "fraud", label: "Fraud Watch", icon: AlertTriangle },
      { key: "duplicates", label: "Duplicates", icon: Fingerprint },
    ]},
    { label: "COMMUNICATION", items: [
      { key: "messages", label: "Messages", icon: MessagesSquare, count: supportUnread },
      { key: "grievances", label: "Grievances", icon: MessageSquare, count: openGrievances.length },
      { key: "templates", label: "Notifications", icon: Mail },
    ]},
    { label: "SYSTEM", items: [
      { key: "architecture", label: "Architecture", icon: Network },
      { key: "integrations", label: "Integrations", icon: PlugZap },
      { key: "countries", label: "Countries", icon: Globe },
      { key: "settings", label: "System Config", icon: Settings },
    ]},
  ];
  // Drop the employer/agency approval tabs when those capabilities are off;
  // remove any group left empty. Re-enabling the capability restores them.
  const navGroups = navGroupsAll
    .map(g => ({
      ...g,
      items: g.items.filter(it =>
        (it.key !== "employers" || capabilities.employerSelfRegistration) &&
        (it.key !== "agencies" || capabilities.agencySelfRegistration) &&
        // Agency leaderboard is meaningless with a single mega-agency.
        (it.key !== "leaderboard" || capabilities.agencySelfRegistration)),
    }))
    .filter(g => g.items.length > 0);
  const flatNavItems = navGroups.flatMap(g => g.items);

  if (isLoading) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-8 space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-lg p-5 mb-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-40" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Admin Console</h2>
              <p className="text-slate-300 text-xs md:text-sm">HPSEDC Overseas Placement Portal — System Administration</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* HP-3/HP-4: drop the Agencies export in single-agency mode. */}
            {["candidates", "jobs", "applications", "agencies", "placements"]
              .filter(entity => entity !== "agencies" || capabilities.agencySelfRegistration)
              .map(entity => (
              <Button key={entity} variant="outline" size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-lg text-xs capitalize"
                onClick={() => window.open(`/api/v1/admin/reports/export/${entity}.csv`, "_blank")}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> {entity} CSV
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile chip nav (lg:hidden) — horizontal scroll of all 20 items */}
      <div className="lg:hidden mb-2">
        <div className="flex gap-1 overflow-x-auto bg-white rounded-xl border border-slate-200 p-1">
          {flatNavItems.map(item => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap font-medium transition-all ${
                tab === item.key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-700"
              }`}>
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              {typeof item.count === "number" && item.count > 0 && (
                <span className="ml-1 text-[10px] font-semibold text-red-600 tabular-nums">({item.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/*
        Desktop layout (lg+): sidebar on left, TabsContent panels in right
        column. Below lg: chip nav above handles navigation; TabsContent
        panels stack full-width.

        The <Tabs> wrapper preserves Radix routing — each TabsContent reads
        `value={tab}` from context and renders only when active.
      */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-6 lg:grid lg:grid-cols-[minmax(220px,260px)_1fr] lg:gap-6 lg:space-y-0">
        <aside className="hidden lg:flex lg:flex-col gap-3 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pb-4">
          <nav className="bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
            {navGroups.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-3 pt-3 border-t border-slate-100" : ""}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
                  {group.label}
                </p>
                {group.items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-all ${
                      tab === item.key
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {typeof item.count === "number" && item.count > 0 && (
                      <span className={`text-[11px] font-semibold tabular-nums ${
                        tab === item.key ? "text-blue-600" : "text-red-500"
                      }`}>{item.count}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 lg:col-start-2 space-y-6">

        {/* ── Overview Tab ──────────────────────────────── */}
        <TabsContent value="overview">
          {/* Key Metrics — ALL REAL */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <MetricCard icon={<Users />} color="bg-blue-600" label="Candidates" value={stats.users?.candidates || 0} onClick={() => setTab("users")} />
            <MetricCard icon={<Briefcase />} color="bg-emerald-600" label="Open Job Vacancies" value={stats.jobs?.active || 0} onClick={() => setTab("funnel")} />
            <MetricCard icon={<Handshake />} color="bg-orange-500" label="Placements" value={stats.placements?.total || 0} onClick={() => setTab("lifecycle")} />
            {capabilities.agencySelfRegistration && (
              <MetricCard icon={<Building />} color="bg-purple-600" label="Agencies" value={`${stats.agencies?.verified || 0} / ${stats.agencies?.total || 0}`} sub="verified" onClick={() => setTab("agencies")} />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left — Analytics */}
            <div className="lg:col-span-2 space-y-6">
              {/* Application Funnel — REAL */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <TrendingUp className="text-blue-600 mr-2 w-5 h-5" /> Application Pipeline
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                  <div onClick={() => setTab("users")} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("users"); } }}
                    className="bg-blue-50 p-4 rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-200 transition">
                    <p className="text-2xl font-bold text-blue-600">{funnel.summary?.registered || 0}</p>
                    <p className="text-xs text-gray-500">Registered</p>
                  </div>
                  <div onClick={() => setTab("funnel")} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("funnel"); } }}
                    className="bg-emerald-50 p-4 rounded-lg cursor-pointer hover:ring-2 hover:ring-emerald-200 transition">
                    <p className="text-2xl font-bold text-emerald-600">{funnel.summary?.applied || 0}</p>
                    <p className="text-xs text-gray-500">Applied</p>
                  </div>
                  <div onClick={() => setTab("lifecycle")} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("lifecycle"); } }}
                    className="bg-orange-50 p-4 rounded-lg cursor-pointer hover:ring-2 hover:ring-orange-200 transition">
                    <p className="text-2xl font-bold text-orange-600">{funnel.summary?.placed || 0}</p>
                    <p className="text-xs text-gray-500">Placed</p>
                  </div>
                </div>
                {funnel.funnel?.length > 0 && (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={funnel.funnel.map((s: any) => ({ name: (s.stage ?? s.status ?? "").replace(/_/g, ' '), count: s.count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* By District — REAL */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidates by District</h3>
                {districts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No district data yet</p>
                ) : (
                  <div className="space-y-3">
                    {districts.slice(0, 8).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 w-32">{d.district}</span>
                        <div className="flex-1 mx-4 bg-gray-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min((d.candidates / (districts[0]?.candidates || 1)) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-12 text-right">{d.candidates}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By Country — REAL with Pie Chart */}
              {(() => {
                // Normalise empty / missing country into a labelled "Not specified"
                // slice instead of an unlabelled wedge. Jobs in draft with no
                // country are real data but should be displayed explicitly so
                // operators can spot them.
                const chartData = countries.map((c: any) => ({
                  ...c,
                  displayName: (c.country && String(c.country).trim()) ? c.country : "Not specified (drafts)",
                }));
                return (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Jobs by Destination Country</h3>
                {chartData.length === 0 ? (
                  <p className="text-gray-500 text-sm">No country data yet</p>
                ) : (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width="50%" height={200}>
                      <PieChart>
                        <Pie data={chartData.map((c: any) => ({ name: c.displayName, value: c.total_jobs }))}
                          dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
                          {chartData.map((c: any, i: number) => (
                            <Cell key={i} fill={c.displayName.startsWith("Not specified") ? "#cbd5e1" : ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"][i % 7]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {chartData.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.displayName.startsWith("Not specified") ? "#cbd5e1" : ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"][i % 7] }} />
                          <span className="text-sm text-gray-700">{c.displayName}</span>
                          <span className="text-xs text-gray-400">{c.total_jobs} jobs, {c.total_applications} apps</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
              })()}
            </div>

            {/* Right — Status + Actions */}
            <div className="lg:col-span-1 space-y-6">
              {/* Pending Verifications — FRS 4.11. Renamed from generic "Pending
                  Actions" + "Agency Verifications" so a reviewer scanning the
                  dashboard matches the FRS wording at a glance. */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Verifications</h3>
                <div className="space-y-3">
                  {capabilities.agencySelfRegistration && (
                    <PendingItem icon={<UserCheck />} label="Agency Verifications" count={stats.agencies?.pendingVerification || 0} color="bg-yellow-50 border-yellow-200" onClick={() => setTab("agencies")} />
                  )}
                  <PendingItem icon={<Clock />} label="Drive Approvals" count={stats.drives?.pendingApproval || 0} color="bg-blue-50 border-blue-200" onClick={() => setTab("drives")} />
                  <PendingItem icon={<MessageSquare />} label="Open Grievances" count={stats.grievances?.open || 0} color="bg-red-50 border-red-200" onClick={() => setTab("grievances")} />
                </div>
                {capabilities.agencySelfRegistration && (
                  <button
                    onClick={() => setTab("agencies")}
                    className="mt-3 w-full text-xs font-semibold px-3 py-2 rounded bg-slate-900 text-white hover:bg-slate-800">
                    Review now →
                  </button>
                )}
              </div>

              {/* Skills Demand — REAL */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Skills (Demand)</h3>
                {skills.demand?.length === 0 ? (
                  <p className="text-gray-500 text-sm">No skill data yet</p>
                ) : (
                  <div className="space-y-2">
                    {skills.demand?.slice(0, 6).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">{s.skill}</Badge>
                        <span className="text-sm text-gray-600">{s.job_count} jobs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity — REAL from notifications */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                {notifications.length === 0 ? (
                  <p className="text-gray-500 text-sm">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.slice(0, 5).map((n: any) => (
                      <div key={n.id} className="border-l-2 border-blue-300 pl-3">
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500">{n.createdAt ? new Date(n.createdAt).toLocaleString('en-IN') : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Agencies Tab ─────────────────────────────── */}
        {/* v0.4.32 (HPSEDC Item 3): swapped from minimal approve-only list to
            full KYB doc review queue. The legacy AgencyApprovalList stays
            exported but is no longer mounted — kept around for the e2e tests
            that import it directly until they migrate. */}
        <TabsContent value="agencies">
          <KYBReviewList subject={{
            kind: "agency",
            label: "Agency",
            listUrl: "/api/v1/admin/agencies",
            verifyUrl: (id) => `/api/v1/admin/agencies/${id}/verify`,
            docsListUrl: (id) => `/api/v1/admin/agencies/${id}/documents`,
            docVerifyUrl: (rowId, docId) => `/api/v1/admin/agencies/${rowId}/documents/${docId}`,
            docDownloadUrl: (_rowId, docId) => `/api/v1/agencies/documents/${docId}/download`,
            nameField: "agencyName",
            secondaryLabel: "Licence",
            secondaryField: "licenseNumber",
          }} />
        </TabsContent>

        {/* ── Employers Tab (v0.4.32 HPSEDC Item 1) ────── */}
        <TabsContent value="employers">
          <KYBReviewList subject={{
            kind: "employer",
            label: "Company",
            listUrl: "/api/v1/admin/employers",
            verifyUrl: (id) => `/api/v1/admin/employers/${id}/verify`,
            docsListUrl: (id) => `/api/v1/admin/employers/${id}/documents`,
            docVerifyUrl: (rowId, docId) => `/api/v1/admin/employers/${rowId}/documents/${docId}`,
            docDownloadUrl: (_rowId, docId) => `/api/v1/employer/documents/${docId}/download`,
            nameField: "companyName",
            secondaryLabel: "CIN",
            secondaryField: "cin",
          }} />
        </TabsContent>

        {/* ── Matching Engine Tab (v0.4.33 Phase 3, HPSEDC Item 2) ──── */}
        <TabsContent value="matching">
          <MatchingEnginePanel />
        </TabsContent>

        {/* ── Reports Tab ──────────────────────────────── */}
        {/* v0.4.18: full rendering. Cards expand inline to show charts/
            tables rather than toast-only placeholders. */}
        <TabsContent value="reports">
          <div className="space-y-4">
            <AdminReport title="By District" desc="Candidates by home district (top 10)" endpoint="by-district" kind="district" />
            <AdminReport title="By Country" desc="Jobs & placements by destination" endpoint="by-country" kind="country" />
            <AdminReport title="By Placement Status" desc="Application funnel — pipeline distribution" endpoint="by-placement-status" kind="funnel" />
            <AdminReport title="By Agency" desc="Per-agency throughput: applications, selections, placements" endpoint="by-agency" kind="agency" />
            <AdminReport title="By Skill" desc="Demand (jobs) vs supply (candidates)" endpoint="by-skill" kind="skill" />
            <AdminReport title="By Sector / Company" desc="Top companies by job count" endpoint="by-sector" kind="sector" />
          </div>
        </TabsContent>

        {/* ── Drives Approval Tab ─────────────────────── */}
        <TabsContent value="drives">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-lg font-semibold mb-4">Pending Drive Approvals</h3>
            {pendingDrives.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No drives pending approval</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingDrives.map((d: any) => (
                  <DriveApprovalCard key={d.id} drive={d} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Grievances Tab ────────────────────────────── */}
        <TabsContent value="import_jobs"><JobImportPanel /></TabsContent>
        <TabsContent value="messages"><SupportInboxPanel /></TabsContent>
        <TabsContent value="grievances">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-lg font-semibold mb-4">Grievances ({grievanceList.length})</h3>
            {grievanceList.length === 0 ? (
              <p className="text-gray-500">No grievances submitted yet</p>
            ) : (
              <div className="space-y-4">
                {grievanceList.map((g: any) => (
                  <GrievanceCard key={g.id} grievance={g} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Compliance Oversight ─────────────────────── */}
        <TabsContent value="compliance">
          <CompliancePanel />
        </TabsContent>

        {/* ── Deployment Readiness (fleet view) ────────── */}
        <TabsContent value="deployment_readiness">
          <DeploymentReadinessPanel />
        </TabsContent>

        {/* ── Welfare SLA Monitor ──────────────────────── */}
        <TabsContent value="welfare">
          <WelfareSlaPanel />
        </TabsContent>

        {/* ── User Management ──────────────────────────── */}
        <TabsContent value="users">
          <UserManagementPanel />
        </TabsContent>

        {/* ── Audit Log Viewer ─────────────────────────── */}
        <TabsContent value="audit">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="lifecycle">
          <LifecyclePanel />
        </TabsContent>

        <TabsContent value="leaderboard"><AgencyLeaderboardPanel /></TabsContent>
        <TabsContent value="callbacks"><CallbackRequestsPanel /></TabsContent>
        <TabsContent value="placement_support"><PostPlacementPanel /></TabsContent>
        <TabsContent value="funnel"><FunnelPanel /></TabsContent>
        <TabsContent value="fraud"><FraudWatchlistPanel /></TabsContent>
        <TabsContent value="duplicates"><DuplicatesPanel /></TabsContent>
        <TabsContent value="countries"><CountryInfoAdminPanel /></TabsContent>
        <TabsContent value="architecture"><ArchitecturePanel /></TabsContent>

        <TabsContent value="templates">
          <NotificationTemplatesPanel />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsPanel />
        </TabsContent>

        {/* ── System Config Tab ─────────────────────────── */}
        <TabsContent value="settings">
          <SystemConfigPanel />
        </TabsContent>
        </div>{/* /main column wrapper */}
      </Tabs>
    </div>
  );
}

// ── Agency Leaderboard (HPSEDC operational view) ─────────────────────
// Ranked by placements with welfare-compliance / time-to-offer / grievance
// signals. Data is all derived from existing tables.
// HP-4c: Assisted-tier callback queue — candidates who asked HPSEDC to call
// them back. Staff call, complete the profile, then mark "Done".
function PostPlacementPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["/api/v1/post-placement"],
    queryFn: () => fetchJson("/api/v1/post-placement"),
  });
  const rows: any[] = data?.data || [];
  const open = rows.filter((r) => r.status === "open" || r.status === "needs_help").length;
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/v1/post-placement/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/post-placement"] }),
  });
  const catLabel = (c: string) => ({ salary_unpaid: "Salary not paid", contract: "Contract issue", safety: "Safety/harassment", health: "Health", documents: "Documents held", other: "Other", ok: "All well", needs_help: "Needs help" } as any)[c] || c;
  const chip = (st: string) => {
    const m: any = { open: "bg-amber-100 text-amber-700", in_progress: "bg-blue-100 text-blue-700", resolved: "bg-emerald-100 text-emerald-700", ok: "bg-emerald-100 text-emerald-700", needs_help: "bg-red-100 text-red-700" };
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m[st] || m.open}`}>{st.replace("_", " ")}</span>;
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <LifeBuoy className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-slate-900">Post-placement support</h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{open} need action</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">Issues + monthly check-ins from candidates placed overseas (UAT-03 #16/#19). Call them, then update status.</p>
      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">No submissions yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${r.kind === "issue" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{(r.candidateName || "?")[0]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{r.candidateName || "Candidate"} <span className="text-xs font-normal text-slate-400">· {r.kind === "issue" ? "Issue" : "Check-in"} · {catLabel(r.category)}{r.country ? ` · ${r.country}` : ""}</span></p>
                {r.message && <p className="text-xs text-slate-500 truncate">{r.message}</p>}
                {r.candidatePhone && <a href={`tel:${r.candidatePhone}`} className="text-xs text-blue-600 font-medium">{r.candidatePhone}</a>}
              </div>
              {chip(r.status)}
              {r.status !== "resolved" && (
                <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: "resolved" })} className="rounded-lg text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> Resolve
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CallbackRequestsPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["/api/v1/admin/callback-requests"],
    queryFn: () => fetchJson("/api/v1/admin/callback-requests"),
  });
  const rows: any[] = data?.data || [];
  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/v1/admin/callback-requests/${id}/done`, { method: "PATCH", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/callback-requests"] }),
  });
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="w-5 h-5 text-emerald-600" />
        <h3 className="text-lg font-semibold text-slate-900">Callback requests</h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{rows.length} pending</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">Candidates who asked HPSEDC to call them back and help complete their registration. Call them, fill their profile, then mark done.</p>
      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">No pending callback requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">{(c.fullName || "?")[0]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{c.fullName}</p>
                <p className="text-xs text-slate-500 truncate">
                  <a href={`tel:${c.phone}`} className="text-blue-600 font-medium">{c.phone}</a>
                  {c.trade && c.trade !== "—" ? ` · ${c.trade}` : ""}{c.location ? ` · ${c.location}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={markDone.isPending}
                onClick={() => markDone.mutate(c.id)}
                className="rounded-lg text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Done
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgencyLeaderboardPanel() {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/agency-leaderboard"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/agency-leaderboard"),
  });
  const rows: any[] = res?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" /> Agency leaderboard
        </h3>
        <p className="text-xs text-slate-500">Ranked by accepted placements · ties by rating · then fewer grievances</p>
      </div>
      {isLoading ? <Skeleton className="h-48 w-full" /> : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No verified agencies yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2 px-2 w-10">#</th>
                <th className="text-left py-2 px-2">Agency</th>
                <th className="text-right py-2 px-2">Placements</th>
                <th className="text-right py-2 px-2">Accepted</th>
                <th className="text-right py-2 px-2">Avg days → offer</th>
                <th className="text-right py-2 px-2">Welfare %</th>
                <th className="text-right py-2 px-2">Rating</th>
                <th className="text-right py-2 px-2">Grievances 30d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2 font-bold text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="py-2 px-2">
                    <div className="font-semibold text-slate-900">{a.agencyName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{a.licenseNumber}</div>
                  </td>
                  <td className="py-2 px-2 text-right font-semibold tabular-nums">{a.placements ?? 0}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{a.acceptedPlacements}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{a.avgDaysToOffer ?? "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{a.welfareCompliancePct != null ? `${a.welfareCompliancePct}%` : "—"}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{a.rating ?? 0} / 5</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${a.grievanceCount >= 3 ? "text-red-700" : "text-slate-700"}`}>{a.grievanceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Architecture & Logic: Matching Engine ────────────────────────────
// Reference page documenting how the candidate↔job match score is built.
// Mirrors the "HireStream Matching Engine — Logic & Specification" doc.
function ArchMono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12px] bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 break-words">{children}</code>;
}
function ArchSection({ n, title, icon, children }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <h3 className="flex items-center gap-2.5 text-base font-bold text-slate-900 mb-4">
        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{n}</span>
        <span className="flex items-center gap-2">{icon}{title}</span>
      </h3>
      {children}
    </section>
  );
}
function ArchHero({ icon, title, subtitle, badge }: { icon: React.ReactNode; title: string; subtitle: string; badge?: string }) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">{icon} {title}</h2>
          <p className="text-indigo-100 text-sm mt-1">{subtitle}</p>
        </div>
        {badge && <span className="text-[11px] font-bold bg-white/15 border border-white/30 rounded-full px-3 py-1 whitespace-nowrap">{badge}</span>}
      </div>
    </div>
  );
}
function ArchTable({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          {cols.map((c, i) => <th key={i} className="px-3 py-2 font-semibold">{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-slate-100 align-top">
              {r.map((cell, ci) => <td key={ci} className={`px-3 py-2 ${ci === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Architecture & Logic — sub-tabbed reference hub (Matching · Stack · Infra).
function ArchitecturePanel() {
  const [sub, setSub] = useState<"matching" | "stack" | "infra">("matching");
  const TABS = [
    { k: "matching", label: "Matching Engine", icon: <Sigma className="w-4 h-4" /> },
    { k: "stack", label: "Tech Stack", icon: <Layers className="w-4 h-4" /> },
    { k: "infra", label: "Infrastructure", icon: <Server className="w-4 h-4" /> },
  ] as const;
  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap gap-1.5 bg-white rounded-xl border border-slate-200 shadow-sm p-1.5">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setSub(t.k)}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${sub === t.k ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {sub === "matching" && <MatchingEngineDoc />}
      {sub === "stack" && <TechStackDoc />}
      {sub === "infra" && <InfraDoc />}
    </div>
  );
}

// ── Architecture › Tech Stack ─────────────────────────────────────────
function TechStackDoc() {
  return (
    <div className="space-y-5">
      <ArchHero icon={<Layers className="w-5 h-5" />} title="Technology Stack"
        subtitle="Secure, bilingual, cloud-native — built on a modern, proven, open-source stack · HPSEDC" badge="open-source" />

      <ArchSection n={1} title="System Architecture — Three Logical Tiers" icon={<Network className="w-4 h-4 text-indigo-600" />}>
        <div className="space-y-2">
          <div className="rounded-lg bg-blue-600 text-white p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-80 mb-1">Presentation</div>
            <div className="text-sm">Responsive Web SPA (React + Vite · Tailwind) &nbsp;•&nbsp; React Native + Expo apps (Android / iOS)</div>
          </div>
          <div className="text-center text-[11px] text-slate-400">▼ HTTPS / TLS · REST · JSON · <ArchMono>/api/v1</ArchMono></div>
          <div className="rounded-lg bg-indigo-600 text-white p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-80 mb-1.5">Application — Node.js + Express</div>
            <div className="flex flex-wrap gap-1.5">
              {["RBAC & auth", "Domain APIs", "Matching engine", "Notifications", "Security: Helmet · rate-limit · Zod", "Audit log"].map((x) => <span key={x} className="text-[11px] bg-white/15 border border-white/25 rounded px-2 py-0.5">{x}</span>)}
            </div>
          </div>
          <div className="text-center text-[11px] text-slate-400">▼ Drizzle ORM</div>
          <div className="rounded-lg bg-slate-700 text-white p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-80 mb-1">Data — PostgreSQL</div>
            <div className="text-sm">~36 tables + immutable audit log &nbsp;•&nbsp; namespaced file storage</div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="font-semibold text-slate-800 text-sm">Nginx · PM2 · Linux</div><div className="text-[12px] text-slate-500">TLS reverse proxy · process mgmt · gov-cloud / SDC</div></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="font-semibold text-slate-800 text-sm">Pluggable integrations</div><div className="text-[12px] text-slate-500">HIM SSO · Aadhaar/UIDAI · DigiLocker · Email/SMS</div></div>
          </div>
        </div>
      </ArchSection>

      <ArchSection n={2} title="Web Front-end" icon={<Boxes className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Core", <b>React 18 + Vite + TypeScript</b>],
          ["Routing & data", "Wouter (routing), TanStack Query (server-state & caching)"],
          ["Forms & validation", <>React Hook Form + <b>Zod</b> (schema validation)</>],
          ["UI & styling", <>Radix UI / shadcn components, <b>Tailwind CSS</b>, Recharts (charts)</>],
          ["Localisation", <><b>i18next</b> — bilingual English + Hindi</>],
        ]} />
      </ArchSection>

      <ArchSection n={3} title="Back-end & API" icon={<Server className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Runtime", <b>Node.js + Express + TypeScript</b>],
          ["API", <>Versioned <b>REST</b> API (<ArchMono>/api/v1</ArchMono>), JSON over HTTPS</>],
          ["Data access", <><b>Drizzle ORM</b> + drizzle-zod (schema-derived validation)</>],
          ["Background jobs", "node-cron (digests, SLA checks), Winston (structured logging)"],
        ]} />
      </ArchSection>

      <ArchSection n={4} title="Database & Storage" icon={<Database className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Database", <><b>PostgreSQL</b> — ~36 relational tables + an immutable audit log</>],
          ["Files", "Namespaced document/photo storage; uploads verified by file type & magic-bytes (PDF / JPG / PNG)"],
        ]} />
      </ArchSection>

      <ArchSection n={5} title="Security" icon={<Lock className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Access control", <><b>Role-Based Access Control</b> (Candidate / Agency / Employer / Admin)</>],
          ["Authentication", <>passport + express-session (PostgreSQL-backed, rolling idle timeout), <b>OTP</b> (otplib), <b>JWT</b> for mobile, bcrypt password hashing</>],
          ["Hardening", "Helmet security headers, rate limiting, input validation, encrypted integration credentials, full audit trail"],
        ]} />
      </ArchSection>

      <ArchSection n={6} title="Mobile Application" icon={<Smartphone className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Apps", <><b>React Native + Expo</b> — Android & iOS, consuming the same REST API</>],
          ["Features", "Mobile auth (refresh tokens), push notifications, offline-tolerant config"],
        ]} />
      </ArchSection>

      <ArchSection n={7} title="Documents, Messaging & Integrations" icon={<Plug className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Generation", "PDFKit (PDF), QRCode, Archiver (bulk ZIP export)"],
          ["Messaging", "In-app notifications, Nodemailer (email), pluggable SMS adapters"],
        ]} />
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
          <b>External integrations — pluggable & admin-configurable.</b> HIM Access SSO · Aadhaar / UIDAI · DigiLocker · Email & SMS gateways are all designed as adapters and activated from the admin console once production credentials are provided. <b>No code change required</b> to switch providers.
        </div>
      </ArchSection>

      <ArchSection n={8} title="Infrastructure, Standards & Why This Stack" icon={<HardDrive className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Area", "Technology"]} rows={[
          ["Hosting", <><b>Linux</b> · <b>Nginx</b> (TLS reverse proxy) · <b>PM2</b> process management</>],
          ["Cloud", <>Deployable to government cloud / <b>State Data Centre</b>; stateless API scales horizontally</>],
          ["Targets", <>Page load <b>&lt; 3s</b> · <b>5,000</b> concurrent users · <b>99.9%</b> uptime · data backups + health monitoring</>],
        ]} />
        <div className="grid sm:grid-cols-2 gap-3 mt-3 text-[12px]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-semibold text-slate-800 mb-1">Standards & compliance</div>
            <ul className="text-slate-600 space-y-1 list-disc pl-4">
              <li><b>GIGW</b> — accessibility for divyangjans, State-Government header uniformity</li>
              <li><b>HTTPS / TLS</b> in transit; sensitive data encrypted at rest</li>
              <li><b>ISO 27001</b>-aligned security; GDPR / PDPA-equivalent data protection</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-semibold text-slate-800 mb-1">Why this stack</div>
            <ul className="text-slate-600 space-y-1 list-disc pl-4">
              <li><b>Modern & proven</b> — industry-standard, actively maintained open source</li>
              <li><b>Secure by design</b> — RBAC, encryption, hardened sessions, audit trails</li>
              <li><b>Scalable & cloud-ready</b> — stateless API, horizontal scaling</li>
              <li><b>Maintainable</b> — TypeScript end-to-end, modular, documented for handover</li>
            </ul>
          </div>
        </div>
      </ArchSection>
    </div>
  );
}

// ── Architecture › Infrastructure Provisioning ────────────────────────
function InfraDoc() {
  return (
    <div className="space-y-5">
      <ArchHero icon={<Server className="w-5 h-5" />} title="Infrastructure Provisioning Request"
        subtitle="Hardware · Software · Network · Access — Staging & Production · HPSEDC" badge="STG + PROD" />

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-[12px] text-rose-900">
          <div className="font-bold mb-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Air-gapped</div>
          The VMs are isolated from the internet, accessed via SSH through a Windows jump host. All §2 software must be pre-installed (or on an internal mirror); HTIS delivers the app + dependencies as a <b>pre-built artifact</b> via the jump host — no online build runs on the server.
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-[12px] text-blue-900">
          <div className="font-bold mb-1 flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5" /> Assumptions — please confirm</div>
          HP State Data Centre hosting; PROD sized to the FRS target of <b>5,000 concurrent users</b>; one VM per environment (application + PostgreSQL co-located); 99.9% uptime via a single VM + standard backups (a standby DB replica can be added if a penalty-backed SLA applies).
        </div>
      </div>

      <ArchSection n={1} title="Hardware" icon={<Cpu className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Resource", "Staging (STG)", "Production (PROD)"]} rows={[
          ["vCPU", "4", <b>8</b>],
          ["RAM", "8 GB", <b>16 GB</b>],
          ["Disk (SSD)", "100 GB", <><b>200 GB</b> (expandable)</>],
          ["Apps hosted", "HireStream + Verify + DB", "HireStream + DB"],
        ]} />
        <p className="text-[11px] text-slate-400 mt-2"><b>Separate VMs.</b> Candidate document uploads grow disk over time — please allow online disk expansion, or provide object storage.</p>
      </ArchSection>

      <ArchSection n={2} title="Software to Pre-install / Stage on Disk (air-gapped)" icon={<Boxes className="w-4 h-4 text-indigo-600" />}>
        <ArchTable cols={["Category", "Software", "Version", "Purpose"]} rows={[
          ["Operating system", <b>Ubuntu Server LTS</b>, "24.04 LTS (Noble)", "Base OS — same as our other deployments"],
          ["Base & build", "build-essential (gcc, g++, make), python3", "distro", "Native module builds (e.g. bcrypt)"],
          ["Base & build", "git, curl, wget, unzip, tar, rsync", "distro", "Deployment / artifact transfer"],
          ["Base & build", "ca-certificates, openssl", "distro", "TLS / crypto"],
          ["Runtime", <b>Node.js</b>, "20.x LTS (20.20+)", "Application runtime"],
          ["Runtime", <><b>PM2</b> (global npm)</>, "6.x", "Process manager — clustering + auto-restart"],
          ["Database", <><b>PostgreSQL</b> server + client + contrib</>, "16.x (16.14+)", "Primary database"],
          ["Web / proxy", <b>Nginx</b>, "1.24+", "TLS reverse proxy, static serving, rate limiting"],
          ["Optional", "Redis", "7.x", "Session store / cache"],
        ]} />
        <p className="text-[11px] text-slate-400 mt-2">Our application's own npm dependencies are bundled into the delivered artifact, so those are <b>not</b> needed from IT — only the runtime/build tools above.</p>
      </ArchSection>

      <ArchSection n={3} title="Network & Integration Egress" icon={<Network className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600"><b>Ports:</b> 443 (HTTPS in) · 80 → 443 redirect · 22 (SSH, from jump host only) · Node ↔ PostgreSQL on localhost.</p>
        <p className="text-sm text-slate-600 mt-2">Internet egress is blocked, but the portal needs <b>outbound reachability</b> to these government services (internal network or firewall exception) — otherwise the integrations cannot function:</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {["HIM Parivar / HIM Access SSO", "Aadhaar / UIDAI", "DigiLocker", "Government Email (SMTP)", "Government SMS gateway"].map((x) => <span key={x} className="text-[11px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-800 rounded px-2 py-0.5">{x}</span>)}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Please advise which are reachable on the internal government network vs. require firewall exceptions.</p>
      </ArchSection>

      <ArchSection n={4} title="TLS Certificates & Access" icon={<Lock className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 mb-3">Air-gapped, so Let's Encrypt / ACME is not possible. Please provide <b>CA-issued certificates</b> (full chain + private key) for both the PROD and STG domains.</p>
        <ArchTable cols={["#", "Access", "Detail"]} rows={[
          ["1", "SSH via jump host", <>Named service account with <b>sudo</b> (app, PM2, Nginx)</>],
          ["2", "File transfer via jump host", "SCP/SFTP path for the app artifact + updates"],
          ["3", "PostgreSQL", "Database + role able to create schema / extensions"],
          ["4", "Backup target", "Location for DB dumps + VM snapshots"],
        ]} />
      </ArchSection>

      <ArchSection n={5} title="Deployment, Operations & IT Checklist" icon={<FileCheck className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 mb-3">HTIS builds the release on a matching platform → transfers it via the jump host → runs database migrations → restarts under PM2 (rollback = previous artifact + DB snapshot). Daily PostgreSQL dump + WAL archiving to the backup target supports the 99.9% target.</p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-800 text-sm mb-2">Checklist for the IT team</div>
          <ul className="space-y-1.5 text-[13px] text-slate-700">
            {[
              "STG + PROD VMs provisioned (4 / 8 / 100 · 8 / 16 / 200)",
              "Ubuntu 24.04 LTS + Node 20 + PM2 + PostgreSQL 16 + Nginx (pre-installed or staged offline)",
              "TLS certificates provided for both domains",
              "Firewall: 443 / 80 / 22 + integration egress",
              "SSH service account + SFTP path + PostgreSQL database & role",
              "Backup target allocated",
            ].map((x) => <li key={x} className="flex items-start gap-2"><Square className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />{x}</li>)}
          </ul>
        </div>
      </ArchSection>
    </div>
  );
}

function MatchingEngineDoc() {
  const FACTORS = [
    { tier: "Hard criteria", tierPts: 60, tierColor: "text-rose-700 bg-rose-50", factor: "Skills match", wt: 30, what: "Overlap between job's required skills and candidate's listed skills" },
    { tier: "", factor: "Experience", wt: 20, what: "Candidate meets job's years-of-experience requirement" },
    { tier: "", factor: "Qualification", wt: 10, what: "Candidate's education level meets the job's stated minimum" },
    { tier: "Preferences", tierPts: 25, tierColor: "text-amber-700 bg-amber-50", factor: "Country", wt: 15, what: "Job's destination is in candidate's preferred countries list" },
    { tier: "", factor: "Language proficiency", wt: 10, what: "Candidate meets job's language requirement (CEFR or IELTS)" },
    { tier: "Compatibility", tierPts: 15, tierColor: "text-emerald-700 bg-emerald-50", factor: "Job category", wt: 10, what: "Job's role category is in candidate's preferred categories" },
    { tier: "", factor: "Salary expectation", wt: 5, what: "Job salary falls within candidate's expected range" },
  ];
  const LOGIC = [
    { f: "Skills match", pts: 30, code: "round((matched / required) × 30)", note: <>Case-insensitive overlap of <ArchMono>job.skills[]</ArchMono> against <ArchMono>candidate.skills[]</ArchMono>. Job with no skills listed → neutral 15.</>, c: "border-rose-400" },
    { f: "Experience", pts: 20, code: "round(min(have/required, 1) × 20)", note: <>Candidate's years vs job's required. Capped at 100% — extra experience not penalised. <ArchMono>required=0</ArchMono> → full 20.</>, c: "border-amber-400" },
    { f: "Qualification", pts: 10, code: "school < diploma < bachelor < master < doctorate", note: <>Meets/exceeds: 10. One tier below: 5. Two+ below: 0. No requirement on job: 10.</>, c: "border-rose-400" },
    { f: "Country preference", pts: 15, code: "job.country ∈ candidate.preferred ? 15 : 0", note: <>Hard match against the candidate's preferred destinations. Empty prefs → neutral 7.</>, c: "border-emerald-400" },
    { f: "Language proficiency", pts: 10, code: "prorated | CEFR for non-English | IELTS band for English", note: <>Each required language scored individually then averaged. For IELTS countries (UK/AUS/NZ/CAN/IE), job stores required overall band; candidate stores actual band. Meets/exceeds = full, one band/level below = half, more below = 0. No requirement → 10.</>, c: "border-emerald-400" },
    { f: "Job category", pts: 10, code: "job.category ∈ candidate.preferred ? 10 : 0", note: <>Controlled vocabulary (Factory Worker, Construction, Driver, Electrician, Plumber, Helper, Hospitality, Caregiver, Healthcare, IT …). Empty candidate prefs → neutral 5.</>, c: "border-emerald-400" },
    { f: "Salary expectation", pts: 5, code: "within range → 5 | ≤10% below → 3 | outside → 0 | either blank → 5 (neutral)", note: <>Compares <ArchMono>job.salary</ArchMono> against the candidate's expected range (min/max, currency-normalised). Lowest-weighted because salary in overseas placement is often negotiated post-shortlist.</>, c: "border-emerald-400" },
  ];
  const MISSING = [
    { f: "Skills (30)", job: "Half → 15 pts", cand: "Zero → 0 pts", both: "Half", why: "Job-blank: generous (employer was sloppy). Candidate-blank: 0 — no skills to match." },
    { f: "Experience (20)", job: "Full → 20 pts", cand: "Zero → 0 pts", both: "Full", why: "Job-blank (0 required): no constraint. Candidate-blank = 0 yrs, scored 0 against any positive requirement." },
    { f: "Qualification (10)", job: "Full → 10 pts", cand: "Half → 5 pts", both: "Full", why: "Encourages profile completion without blocking." },
    { f: "Country (15)", job: "n/a*", cand: "Half → 7 pts", both: "Half", why: "Empty prefs ≠ disinterest — neutral instead of zero." },
    { f: "Language (10)", job: "Full → 10 pts", cand: "Zero → 0 pts", both: "Full", why: "Gaps must surface — candidate hasn't claimed proficiency." },
    { f: "Category (10)", job: "n/a*", cand: "Half → 5 pts", both: "Half", why: "Candidate may have wide interests." },
    { f: "Salary (5)", job: "Full → 5 pts", cand: "Full → 5 pts", both: "Full", why: "Salary often disclosed post-shortlist — don't penalise either side." },
  ];
  return (
    <div className="space-y-5 max-w-5xl">
      {/* hero */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><Network className="w-5 h-5" /> Matching Engine — Architecture &amp; Logic</h2>
            <p className="text-indigo-100 text-sm mt-1">How every candidate ↔ job fit score is built · Government of Himachal Pradesh · HPSEDC Overseas Placement Portal</p>
          </div>
          <span className="text-[11px] font-bold bg-white/15 border border-white/30 rounded-full px-3 py-1 whitespace-nowrap">v2 · explainable</span>
        </div>
      </div>

      <ArchSection n={1} title="Purpose" icon={<ScrollText className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 leading-relaxed">
          The engine produces a <b>0–100 fit score</b> for every candidate ↔ job pair. The score drives the candidate's <i>Jobs for You</i>, the agent's ranked applicant list, and the match badge on every application. Every score comes with a per-factor breakdown so candidates and agents can see <i>why</i> — the algorithm is <b>fully explainable</b>. All weights, missing-criteria policies and the recommendation threshold are admin-tunable at runtime via the Matching Engine Parameters module (§7) — no code redeploy needed.
        </p>
      </ArchSection>

      <ArchSection n={2} title="Scoring Framework" icon={<Sigma className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 mb-3">Total <b>100 points</b> across <b>7 factors</b> in three tiers — Hard criteria (60) gate the match, Preferences (25) rank it, Compatibility (15) breaks ties.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Tier</th><th className="px-3 py-2 font-semibold">Factor</th><th className="px-3 py-2 font-semibold text-center">Wt</th><th className="px-3 py-2 font-semibold">What it measures</th>
            </tr></thead>
            <tbody>
              {FACTORS.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.tier && <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${r.tierColor}`}>{r.tier} · {r.tierPts}</span>}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.factor}</td>
                  <td className="px-3 py-2 text-center font-bold text-slate-900 tabular-nums">{r.wt}</td>
                  <td className="px-3 py-2 text-slate-600">{r.what}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-900 text-white">
                <td className="px-3 py-2" /><td className="px-3 py-2 font-bold text-right">TOTAL</td><td className="px-3 py-2 text-center font-extrabold tabular-nums">100</td><td className="px-3 py-2 font-semibold">Final match score (0–100)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ArchSection>

      <ArchSection n={3} title="Per-Factor Logic" icon={<GitBranch className="w-4 h-4 text-indigo-600" />}>
        <div className="grid sm:grid-cols-2 gap-3">
          {LOGIC.map((l) => (
            <div key={l.f} className={`rounded-lg border-l-4 ${l.c} bg-slate-50 p-3`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-800 text-sm">{l.f}</span>
                <span className="text-[10px] font-bold bg-slate-900 text-white rounded px-1.5 py-0.5">{l.pts} pts</span>
              </div>
              <div className="font-mono text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 mb-1.5 break-words">{l.code}</div>
              <p className="text-[12px] text-slate-600 leading-snug">{l.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-[12px] text-indigo-900">
          <b>Defaults are baseline only.</b> All seven weights + missing-criteria policies + the recommendation threshold live in <ArchMono>system_settings.matching.*</ArchMono> and are exposed to admin via the Matching Engine Parameters module (§7). The engine reads the live config on every score request — tuning takes effect immediately.
        </div>
      </ArchSection>

      <ArchSection n={4} title="Missing-Criteria Behaviour" icon={<Layers className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 mb-3">When a job doesn't specify a criterion, or a candidate hasn't filled a field, the engine applies a per-factor <b>"missing → neutral"</b> policy. Read each cell as <ArchMono>policy → points awarded</ArchMono>.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Factor</th><th className="px-3 py-2 font-semibold">Job-side missing</th><th className="px-3 py-2 font-semibold">Candidate-side missing</th><th className="px-3 py-2 font-semibold">Both</th><th className="px-3 py-2 font-semibold">Rationale</th>
            </tr></thead>
            <tbody>
              {MISSING.map((m) => (
                <tr key={m.f} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{m.f}</td>
                  <td className="px-3 py-2"><span className="text-[11px] font-semibold text-blue-700">{m.job}</span></td>
                  <td className="px-3 py-2"><span className="text-[11px] font-semibold text-amber-700">{m.cand}</span></td>
                  <td className="px-3 py-2"><span className="text-[11px] font-semibold text-slate-600">{m.both}</span></td>
                  <td className="px-3 py-2 text-[12px] text-slate-600">{m.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2"><b>Both-missing rule:</b> the engine checks the job side first; the job-side-missing policy applies when both are blank. Each direction is independently tunable from §7. <b>* n/a</b> = a required field on the job (Country, Category) — it can never be blank.</p>
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[12px] text-emerald-900">
          <b>Worked example.</b> Job: Software Engineer in UAE, skills [React, Node], 3y experience — no qualification / languages / salary specified. Candidate: skills [React, Node, Python], 5y, preferredCountries=[UAE], no qualification / categories / salary.<br />
          <span className="font-mono">Skills 30 + Exp 20 + Qual 10 (job missing) + Country 15 + Lang 10 (job missing) + Cat 5 (cand half) + Salary 5 (both missing)</span> = <b>95/100</b>. A partially-filled profile against a partially-filled job still yields a meaningful, defensible score.
        </div>
      </ArchSection>

      <ArchSection n={5} title="Threshold, Sort & Explainability" icon={<Cpu className="w-4 h-4 text-indigo-600" />}>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Recommendation cut-off</h4>
            <p className="text-slate-600">The candidate's <i>Jobs for You</i> view shows only jobs scoring ≥ the configured threshold. Default <b>50</b>; admin adjusts at runtime via <ArchMono>matching.recommendation_threshold_pct</ArchMono>.</p>
            <h4 className="font-semibold text-slate-800 mb-1 mt-3">Sort &amp; tie-break</h4>
            <p className="text-slate-600">Default sort on the agent's per-job list: match score descending; ties broken by <ArchMono>appliedAt</ArchMono> (most recent first). Agent can override via dropdown.</p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Explainability</h4>
            <p className="text-slate-600">Every score is returned with a structured per-factor breakdown (score + max + plain-English detail) that the UI renders inline on every match.</p>
            <p className="text-slate-600 mt-2"><b>Why it matters:</b> HPSEDC is a government scheme — candidates have a right to know why they were or weren't matched. The breakdown avoids grievance escalations and gives agents data to coach candidates ("Add Hindi → you'd jump from 65 to 72").</p>
          </div>
        </div>
      </ArchSection>

      <ArchSection n={6} title="Implementation" icon={<GitBranch className="w-4 h-4 text-indigo-600" />}>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Where it lives</h4>
            <ul className="text-slate-600 space-y-1 list-disc pl-4">
              <li><ArchMono>calculateScoreBreakdown(candidate, job)</ArchMono> in <ArchMono>server/routes/application.routes.ts</ArchMono></li>
              <li>Cached on <ArchMono>applications.matchScore</ArchMono> at apply-time; recomputed on candidate profile change (toggleable setting)</li>
              <li>Engine version exposed via <ArchMono>/api/v1/matching/version</ArchMono></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 mb-1">Backward compatibility</h4>
            <ul className="text-slate-600 space-y-1 list-disc pl-4">
              <li>v2 adds four new factors. Each defaults per §4 when its input is missing — v1-era profiles don't lose points unfairly.</li>
              <li>Old scores in <ArchMono>applications.matchScore</ArchMono> stay valid until next recompute.</li>
              <li>v2 rolls out without a one-time backfill.</li>
            </ul>
          </div>
        </div>
      </ArchSection>

      <ArchSection n={7} title="Parameters Module (Admin)" icon={<Settings className="w-4 h-4 text-indigo-600" />}>
        <p className="text-sm text-slate-600 mb-3">Every parameter the engine uses is admin-tunable from the live <b>Matching Engine</b> tab (Operations → Matching Engine) — no code change required.</p>
        <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
          {[
            ["7.1 · Weight tuner", "Seven vertical sliders (one per factor) — “music equalizer” UI. Sum-to-100 enforced on save; engine reads the live config on every score request."],
            ["7.2 · Missing-criteria policy", "Each cell in the §4 table is an editable dropdown (Full / Half / Zero) — tighten matching as the candidate pool matures."],
            ["7.3 · Threshold & engine toggle", "Recommendation threshold slider (0–100, default 50), engine version v1/v2 (rollback safety), recompute-on-profile-change, show-breakdown-to-candidate."],
            ["7.4 · Live preview", "Pick a candidate + job; the breakdown renders live as weights are dragged — verify a tuning change before saving."],
            ["7.5 · Audit trail", "Every weight/policy/threshold change writes to audit_log with actor, from, to, timestamp and an optional reason note."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-800 mb-0.5">{t}</div>
              <p className="text-slate-600 leading-snug">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
          <b>Operational guardrail.</b> Weights must sum to exactly 100. The admin UI rejects any non-summing change with "Weights must sum to exactly 100 (current sum: X)." A "Reset to defaults" button restores the v2 baseline.
        </div>
      </ArchSection>

      <ArchSection n={8} title="Not in v2 — Future Roadmap" icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}>
        <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
          {[
            ["Soft-skills weighting", "Collaboration, leadership — requires text analysis; deferred until an extractor is in place."],
            ["Employer reputation", "Placement success rate per employer fed back into the score; needs ≥1000 placements."],
            ["Freshness decay", "Score halves over 30 days; encourages active candidates."],
            ["ML-driven re-rank", "Learn optimal weights from (features → placement_success) once enough outcome data exists."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-dashed border-slate-300 p-3">
              <div className="font-semibold text-slate-700 mb-0.5">{t}</div>
              <p className="text-slate-500 leading-snug">{d}</p>
            </div>
          ))}
        </div>
      </ArchSection>
    </div>
  );
}

// ── Continuous conversion pipeline ───────────────────────────────────
// One glossy pipe that tapers stage→stage. Each stage is a constant-height
// block (height ∝ volume) joined by smooth tapers; a gauge at every joint
// shows the pass-through rate. Pure SVG so it scales crisply.
function PipelineFlow({ funnel, stageLabel }: { funnel: any[]; stageLabel: Record<string, string> }) {
  const N = funnel.length;
  if (!N) return null;
  const segW = 116, joinW = 56;
  const W = N * segW + (N - 1) * joinW;
  const maxHalf = 72;
  const cyTop = 30;            // space above pipe for the joint gauges
  const cy = cyTop + maxHalf;  // pipe centre-line
  const H = cy + maxHalf + 68; // space below for labels (stage · applications · %)
  const top = funnel[0]?.count || 1;
  const half = (c: number) => Math.max(13, (c / top) * maxHalf);
  const X = (i: number) => i * (segW + joinW);

  // Outline: top edge L→R then bottom edge R→L. Straight tapers between the
  // constant-height stage blocks give a continuous, accurate pipe.
  const topPts: [number, number][] = [];
  const botPts: [number, number][] = [];
  funnel.forEach((s, i) => {
    const x = X(i), hh = half(s.count);
    topPts.push([x, cy - hh], [x + segW, cy - hh]);
    botPts.push([x, cy + hh], [x + segW, cy + hh]);
  });
  const d =
    `M ${topPts[0][0]} ${topPts[0][1]} ` +
    topPts.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(" ") + " " +
    [...botPts].reverse().map((p) => `L ${p[0]} ${p[1]}`).join(" ") + " Z";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: 280 }} role="img" aria-label="Conversion pipeline">
      <defs>
        {/* applicant-blue flowing into placement-green */}
        <linearGradient id="pipeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="38%" stopColor="#3b82f6" />
          <stop offset="68%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        {/* vertical sheen for a glossy 3-D pipe */}
        <linearGradient id="pipeSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.40" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="58%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </linearGradient>
        <filter id="pipeShadow" x="-5%" y="-20%" width="110%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.18" />
        </filter>
      </defs>

      <path d={d} fill="url(#pipeGrad)" filter="url(#pipeShadow)" />
      <path d={d} fill="url(#pipeSheen)" />

      {funnel.map((s, i) => {
        const cxx = X(i) + segW / 2;
        const hh = half(s.count);
        const overall = Math.round((s.count / top) * 100);
        return (
          <g key={s.stage}>
            <text x={cxx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="800" fill="#ffffff">{s.count}</text>
            {/* tick from pipe down to the label */}
            <line x1={cxx} y1={cy + hh} x2={cxx} y2={H - 54} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 3" />
            <text x={cxx} y={H - 40} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">{stageLabel[s.stage] ?? s.stage}</text>
            <text x={cxx} y={H - 22} textAnchor="middle" fontSize="12" fontWeight="600" fill="#475569">{s.count} application{s.count === 1 ? "" : "s"}</text>
            <text x={cxx} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{overall}% of total</text>
          </g>
        );
      })}

      {/* pass-through gauges, aligned in a row above each joint */}
      {funnel.slice(1).map((s, idx) => {
        const i = idx + 1;
        const jointX = X(i) - joinW / 2;
        const prev = funnel[i - 1].count || 1;
        const pass = Math.round((s.count / prev) * 100);
        const stroke = pass >= 60 ? "#059669" : pass >= 40 ? "#d97706" : "#dc2626";
        const bg = pass >= 60 ? "#ecfdf5" : pass >= 40 ? "#fffbeb" : "#fef2f2";
        const pillW = 46, pillY = 6, pillH = 21;
        const pipeTop = cy - Math.min(half(s.count), half(funnel[i - 1].count));
        return (
          <g key={s.stage}>
            <line x1={jointX} y1={pillY + pillH} x2={jointX} y2={pipeTop} stroke={stroke} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 3" />
            <rect x={jointX - pillW / 2} y={pillY} width={pillW} height={pillH} rx={10.5} fill={bg} stroke={stroke} strokeOpacity="0.45" />
            <text x={jointX} y={pillY + pillH / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="800" fill={stroke}>{pass}%</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Funnel Analytics ─────────────────────────────────────────────────
function FunnelPanel() {
  const [country, setCountry] = useState<string>("all");
  const [agentId, setAgentId] = useState<string>("all");
  const qs = `country=${encodeURIComponent(country)}&agentId=${encodeURIComponent(agentId)}`;
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/funnel", country, agentId],
    queryFn: () => fetchJson(`/api/v1/admin/oversight/funnel?${qs}`),
  });
  const funnel: any[] = res?.data?.funnel ?? [];
  const max = Math.max(1, ...funnel.map((s: any) => s.count));

  const stageLabel: Record<string, string> = {
    submitted: "Submitted", reviewed: "Reviewed", shortlisted: "Shortlisted",
    interview_scheduled: "Interview", selected: "Selected", placed: "Placed",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-600" /> Pipeline funnel
        </h3>
        <div className="flex items-center gap-2">
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="country (or 'all')" className="h-8 text-xs w-36" />
        </div>
      </div>
      {isLoading ? <Skeleton className="h-48 w-full" /> : (
        <>
          {/* Funnel — original left-aligned bars (stage · volume · drop-off) */}
          <div className="space-y-2">
            {funnel.map((s: any) => (
              <div key={s.stage} className="grid grid-cols-[120px_1fr_70px_80px] items-center gap-3 text-sm">
                <span className="text-slate-700 font-medium">{stageLabel[s.stage] ?? s.stage}</span>
                <div className="relative h-6 bg-slate-100 rounded overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-purple-600"
                    style={{ width: `${(s.count / max) * 100}%` }} />
                </div>
                <span className="text-right font-semibold tabular-nums">{s.count}</span>
                <span className={`text-right text-xs tabular-nums ${s.dropPct > 50 ? "text-red-600" : "text-slate-500"}`}>
                  {s.dropPct > 0 ? `-${s.dropPct}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Drop-off % is relative to the previous stage. Filter by country to see regional variations.</p>

          {/* Horizontal conversion pipeline — flow + pass-through ratio between stages */}
          <div className="mt-7 pt-5 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Conversion pipeline
            </h4>
            <p className="text-[11px] text-slate-400 mb-2">One continuous pipe — it narrows as candidates drop off. The gauge at each joint is the pass-through rate from the previous stage.</p>
            <PipelineFlow funnel={funnel} stageLabel={stageLabel} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Duplicate Candidates Panel ───────────────────────────────────────
// Shows groups of candidates that share aadhaar / phone / email, with a
// Merge button per group. Protects the downstream funnel analytics from
// inflation caused by agencies re-uploading the same person.
function DuplicatesPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/duplicate-candidates"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/duplicate-candidates"),
  });
  const groups: any[] = res?.data ?? [];

  const merge = useMutation({
    mutationFn: async ({ primaryId, secondaryId }: { primaryId: string; secondaryId: string }) => {
      const r = await fetch("/api/v1/admin/oversight/candidates/merge", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryId, secondaryId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? "Merge failed");
      return j.data;
    },
    onSuccess: (data) => {
      toast({ title: "Merged", description: `Migrated ${data?.mergedApplications ?? 0} applications` });
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/oversight/duplicate-candidates"] });
    },
    onError: (e: any) => toast({ title: "Couldn't merge", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" /> Duplicate candidates
      </h3>
      <p className="text-xs text-slate-500 mb-4">Groups of candidate records sharing an Aadhaar / phone / email. Merging consolidates applications under the <strong>oldest</strong> record. Irreversible.</p>
      {isLoading ? <Skeleton className="h-40 w-full" /> : groups.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No duplicates detected. Nice — the data is clean.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g, gi) => {
            const primary = g.candidates[0];
            return (
              <div key={`${g.match_type}-${gi}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs">
                    <Badge variant="outline" className="capitalize mr-2">{g.match_type}</Badge>
                    <span className="font-mono text-slate-500">{g.match_value || "—"}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{g.candidates.length} records</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-400">
                    <tr><th className="text-left py-1">Keep?</th><th className="text-left py-1">Name</th><th className="text-left py-1">Email</th><th className="text-left py-1">Phone</th><th className="text-left py-1">Created</th><th className="text-left py-1"></th></tr>
                  </thead>
                  <tbody>
                    {g.candidates.map((c: any, i: number) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2">{i === 0 ? <Badge className="bg-emerald-100 text-emerald-700">primary</Badge> : null}</td>
                        <td className="py-1.5 pr-2 font-medium">{c.fullName}</td>
                        <td className="py-1.5 pr-2 text-slate-500">{c.email}</td>
                        <td className="py-1.5 pr-2 text-slate-500">{c.phone}</td>
                        <td className="py-1.5 pr-2 text-slate-400">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="py-1.5">
                          {i > 0 && (
                            <Button size="sm" variant="outline" disabled={merge.isPending}
                              onClick={() => {
                                if (confirm(`Merge "${c.fullName}" into "${primary.fullName}"?\n\nApplications are reassigned to the primary record; the duplicate candidate row is deleted. This cannot be undone.`)) {
                                  merge.mutate({ primaryId: primary.id, secondaryId: c.id });
                                }
                              }}
                              className="text-[11px] border-red-200 text-red-700 hover:bg-red-50">
                              Merge into primary
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Country Info Admin Panel ─────────────────────────────────────────
// Manage the canonical list of overseas destination countries. Edit
// per-country reference info (embassy / visa / wage / labor law / climate /
// entry requirements), enable / disable a destination without losing
// history, and add new countries by ISO 3166 alpha-2 code.
//
// Flow:
//   * Left rail: searchable list with active / disabled badges + data-
//     completeness pip. Click a row → load it into the edit pane.
//   * Right pane: fields grouped into sections (Identity / Embassy /
//     Logistics / Practical / Danger Zone) so it's not a wall of inputs.
//   * "+ Add country" button at top of left rail opens a small modal
//     asking only for ISO code + name → creates the row, selects it,
//     operator fills the rest.
//   * Disable / Re-enable button in the Danger Zone — soft toggle; jobs
//     historically posted to a disabled country are preserved.
function CountryInfoAdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/content/countries"],
    queryFn: () => fetchJson("/api/v1/content/countries"),
  });
  const allCountries: any[] = res?.data ?? [];

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<{ code: string; name: string } | null>(null);

  // Lowercase haystack for the search filter.
  const filtered = allCountries.filter((c) =>
    !search
      ? true
      : (c.name ?? "").toLowerCase().includes(search.toLowerCase())
        || (c.code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Auto-select first row on first load + when selection becomes invalid.
  React.useEffect(() => {
    if (!selected && allCountries.length) setSelected(allCountries[0].code);
    if (selected && !allCountries.find((c) => c.code === selected) && allCountries.length) {
      setSelected(allCountries[0].code);
    }
  }, [allCountries, selected]);

  const current = allCountries.find((c) => c.code === selected) ?? null;
  React.useEffect(() => { if (current) setDraft({ ...current }); }, [current?.code]);

  // ─ Data-completeness pip: rough heuristic, not a hard validation ─
  // A country is "complete" when it has all 12 reference fields filled.
  function completenessOf(c: any): { filled: number; total: number; pct: number } {
    if (!c) return { filled: 0, total: 12, pct: 0 };
    const FIELDS_FOR_COMPLETENESS = [
      "embassyPhone","embassyEmail","embassyAddress","embassyWebsite",
      "visaTimelineDays","minWageNote","laborLawSummary","costOfLivingNote",
      "climateNote","entryRequirements","emergencyContact",
    ];
    const filled = FIELDS_FOR_COMPLETENESS.filter((k) => {
      const v = c[k];
      if (typeof v === "number") return v > 0;
      return typeof v === "string" && v.trim().length > 0;
    }).length;
    const total = FIELDS_FOR_COMPLETENESS.length + 1; // +1 for name (always present for valid rows)
    return { filled: filled + 1, total, pct: Math.round(((filled + 1) / total) * 100) };
  }

  function flagFor(code: string): string {
    // ISO 3166 alpha-2 → regional indicator emoji. Works for every valid
    // 2-letter code; falls back to a globe if invalid.
    if (!/^[A-Z]{2}$/.test(code)) return "🌐";
    const [a, b] = code.toUpperCase().split("");
    const offset = 0x1F1E6 - 0x41;
    return String.fromCodePoint(a.charCodeAt(0) + offset) + String.fromCodePoint(b.charCodeAt(0) + offset);
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/content/countries/${draft.code}`, {
        method: "PUT", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? "Save failed");
      return j.data;
    },
    onSuccess: () => {
      toast({ title: "Country info saved" });
      qc.invalidateQueries({ queryKey: ["/api/v1/content/countries"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (nextIsActive: boolean) => {
      const r = await fetch(`/api/v1/content/countries/${current.code}`, {
        method: "PUT", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextIsActive }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? "Toggle failed");
      return j.data;
    },
    onSuccess: (data) => {
      toast({ title: data.isActive ? "Destination enabled" : "Destination disabled — no new postings allowed" });
      qc.invalidateQueries({ queryKey: ["/api/v1/content/countries"] });
    },
    onError: (e: any) => toast({ title: "Couldn't toggle", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!addSelected) throw new Error("Pick a country from the list first.");
      const r = await fetch(`/api/v1/content/countries/${addSelected.code}`, {
        method: "PUT", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: addSelected.name, isActive: true }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? "Create failed");
      return j.data;
    },
    onSuccess: (data) => {
      toast({ title: `Added ${data.name}`, description: "Fill in the embassy, visa, and labor-law details next." });
      qc.invalidateQueries({ queryKey: ["/api/v1/content/countries"] });
      setAddOpen(false);
      setAddSearch("");
      setAddSelected(null);
      setSelected(data.code);
    },
    onError: (e: any) => toast({ title: "Couldn't add country", description: e.message, variant: "destructive" }),
  });

  // ─ Field groups for the edit form ─
  const SECTIONS: { title: string; fields: { key: string; label: string; long?: boolean; placeholder?: string }[] }[] = [
    { title: "Identity", fields: [
      { key: "name", label: "Display name", placeholder: "e.g. United Arab Emirates" },
    ]},
    { title: "Indian Embassy / High Commission", fields: [
      { key: "embassyPhone", label: "Phone", placeholder: "+971-2-4492700" },
      { key: "embassyEmail", label: "Email", placeholder: "cons1.abudhabi@mea.gov.in" },
      { key: "embassyAddress", label: "Address" },
      { key: "embassyWebsite", label: "Website", placeholder: "https://www.eoiabudhabi.gov.in" },
    ]},
    { title: "Logistics", fields: [
      { key: "visaTimelineDays", label: "Typical visa timeline (days)", placeholder: "30" },
      { key: "entryRequirements", label: "Entry requirements", long: true, placeholder: "Passport 6+ months validity, medical fitness, police clearance…" },
    ]},
    { title: "Practical info shown to candidates", fields: [
      { key: "minWageNote", label: "Wage & pay notes", long: true },
      { key: "laborLawSummary", label: "Labor law summary", long: true },
      { key: "costOfLivingNote", label: "Cost of living vs Himachal", long: true },
      { key: "climateNote", label: "Climate & work hours", long: true },
      { key: "emergencyContact", label: "Emergency contacts", long: true },
    ]},
  ];

  const activeCount = allCountries.filter((c) => c.isActive).length;
  const disabledCount = allCountries.length - activeCount;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" /> Destination countries
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Canonical list of overseas destinations. Edit per-country info shown to candidates; add new
            destinations by ISO code; disable a destination to pause new postings without losing history.
            <span className="ml-2 font-medium text-slate-700">{activeCount} active · {disabledCount} disabled</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap">
          + Add country
        </Button>
      </div>

      {/* Add modal — searchable country picker */}
      {addOpen && (() => {
        // Build picker items: full ISO list minus countries already in
        // country_info (so operator can't add Germany twice). Common Indian
        // overseas destinations (Gulf, ASEAN, Western) are surfaced at the
        // top when no search is typed.
        const existingCodes = new Set(allCountries.map((c: any) => c.code));
        const allAvailable = ISO_COUNTRIES.filter((c) => !existingCodes.has(c.code));
        const q = addSearch.trim().toLowerCase();
        const matches = q
          ? allAvailable.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
          : allAvailable;
        const common = q ? [] : allAvailable.filter((c) => COMMON_DESTINATION_CODES.includes(c.code));
        const rest   = q ? matches : allAvailable.filter((c) => !COMMON_DESTINATION_CODES.includes(c.code));
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-md w-full space-y-3 max-h-[85vh] flex flex-col">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Add a destination country</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Pick from the standard ISO 3166 country list. After it's added, you'll fill in the
                  embassy, visa, wage and labor-law details. India is intentionally excluded — this
                  is the overseas placement portal.
                </p>
              </div>

              <Input
                value={addSearch}
                onChange={(e) => { setAddSearch(e.target.value); setAddSelected(null); }}
                placeholder="Search by name (e.g. Netherlands) or ISO code (e.g. NL)…"
                className="text-sm h-9"
                autoFocus
              />

              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
                {matches.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    {q ? `No countries match "${addSearch}".` : "All countries already added."}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {!q && common.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                          Common Indian overseas destinations
                        </div>
                        {common.map((c) => (
                          <button key={c.code} onClick={() => setAddSelected(c)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 ${
                              addSelected?.code === c.code ? "bg-blue-50 text-blue-900" : "text-slate-700"
                            }`}>
                            <span className="text-lg">{flagFor(c.code)}</span>
                            <span className="flex-1">{c.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                          </button>
                        ))}
                        {rest.length > 0 && (
                          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                            All other countries
                          </div>
                        )}
                      </>
                    )}
                    {rest.map((c) => (
                      <button key={c.code} onClick={() => setAddSelected(c)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 ${
                          addSelected?.code === c.code ? "bg-blue-50 text-blue-900" : "text-slate-700"
                        }`}>
                        <span className="text-lg">{flagFor(c.code)}</span>
                        <span className="flex-1">{c.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {addSelected && (
                <div className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-md p-2 flex items-center gap-2">
                  <span className="text-lg">{flagFor(addSelected.code)}</span>
                  Selected: <span className="font-semibold">{addSelected.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">({addSelected.code})</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); setAddSearch(""); setAddSelected(null); }}>Cancel</Button>
                <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !addSelected}
                  className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {create.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  Add {addSelected?.name ?? "country"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {isLoading ? <Skeleton className="h-96 w-full" /> : (
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* ── Left rail: searchable country list ── */}
          <div className="space-y-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…" className="text-sm h-9" />
            <div className="space-y-0.5 max-h-[600px] overflow-y-auto -mx-1 px-1">
              {filtered.length === 0 && (
                <div className="text-xs text-slate-400 px-2 py-3 text-center">No countries match "{search}"</div>
              )}
              {filtered.map((c) => {
                const isActive = c.isActive !== false;
                const comp = completenessOf(c);
                const isSelected = current?.code === c.code;
                return (
                  <button key={c.code} onClick={() => setSelected(c.code)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? "bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                        : "hover:bg-slate-50 text-slate-700"
                    } ${!isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg flex-shrink-0">{flagFor(c.code)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{c.name}</span>
                          {!isActive && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-300 text-slate-500">Off</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-[9px] text-slate-400">{c.code}</span>
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${comp.pct === 100 ? "bg-emerald-400" : comp.pct >= 70 ? "bg-blue-400" : "bg-amber-400"}`} style={{ width: `${comp.pct}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-400 tabular-nums">{comp.filled}/{comp.total}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right pane: sectioned edit form ── */}
          {draft ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{flagFor(draft.code)}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{draft.name || "(no name yet)"}</div>
                    <div className="font-mono text-[10px] text-slate-500">{draft.code}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={draft.isActive !== false ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-200 text-slate-600 border-0"}>
                    {draft.isActive !== false ? "Active" : "Disabled"}
                  </Badge>
                </div>
              </div>

              {SECTIONS.map((section) => (
                <div key={section.title} className="border border-slate-100 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{section.title}</h4>
                  <div className={`grid ${section.fields.length > 1 ? "md:grid-cols-2" : ""} gap-3`}>
                    {section.fields.map((f) => (
                      <div key={f.key} className={f.long ? "md:col-span-2" : ""}>
                        <label className="text-[11px] font-medium text-slate-600">{f.label}</label>
                        {f.long
                          ? <Textarea value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                              placeholder={f.placeholder} className="text-sm" rows={3} />
                          : <Input value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: f.key === "visaTimelineDays" ? (parseInt(e.target.value) || 0) : e.target.value })}
                              placeholder={f.placeholder} className="text-sm h-9" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <Button onClick={() => save.mutate()} disabled={save.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white">
                  {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                  Save changes
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive.mutate(draft.isActive === false)}
                  disabled={toggleActive.isPending}
                  className={draft.isActive !== false ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}>
                  {toggleActive.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> :
                    (draft.isActive !== false ? <XCircle className="w-3.5 h-3.5 mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />)}
                  {draft.isActive !== false ? "Disable destination" : "Re-enable"}
                </Button>
              </div>
              {draft.isActive === false && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  ⚠ This destination is disabled. New jobs cannot be posted to it. Historical jobs are preserved.
                </p>
              )}
              {draft.updatedAt && (
                <p className="text-[10px] text-slate-400">Last updated {new Date(draft.updatedAt).toLocaleString("en-IN")}{draft.updatedBy ? ` by ${draft.updatedBy.slice(0, 8)}` : ""}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a country to edit, or add a new one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fraud / Anomaly Watchlist ────────────────────────────────────────
function FraudWatchlistPanel() {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/fraud-watchlist"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/fraud-watchlist"),
  });
  const data = res?.data ?? { recentReports: [], flaggedAgencies: [] };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-600" /> Recent fraud reports
        </h3>
        {isLoading ? <Skeleton className="h-24 w-full" /> : data.recentReports.length === 0 ? (
          <p className="text-sm text-slate-400">No fraud reports received.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentReports.map((r: any) => (
              <div key={r.id} className="py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{r.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{r.description}</div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono">
                      by {r.username ?? "—"} · reason: {r.metadata?.reason ?? "—"} · {r.metadata?.jobId ? `job ${r.metadata.jobId.slice(0, 8)}…` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">{r.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Agencies with grievance spike (last 30 days)
        </h3>
        {data.flaggedAgencies.length === 0 ? (
          <p className="text-sm text-slate-400">No agencies flagged. ≥ 3 grievances in 30 days triggers a listing.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2 px-2">Agency</th>
                <th className="text-left py-2 px-2">License</th>
                <th className="text-right py-2 px-2">Grievances 30d</th>
              </tr>
            </thead>
            <tbody>
              {data.flaggedAgencies.map((a: any) => (
                <tr key={a.agency_id} className="border-b border-slate-100">
                  <td className="py-2 px-2 font-semibold">{a.agency_name}</td>
                  <td className="py-2 px-2 text-xs font-mono text-slate-500">{a.license_number}</td>
                  <td className="py-2 px-2 text-right font-bold text-red-700 tabular-nums">{a.grievance_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Third-Party Integrations Panel ───────────────────────────────────
// One card per integration; standard form fields per provider type. Secrets
// never leave the server — the API returns only "secretFieldsPresent" flags
// so the form can show a "••••• (saved)" placeholder and preserve the field
// when the admin edits everything else.
// Field labels are provider-aware: different vendors call the same concept by
// different names (Twilio "Account SID" vs MSG91 "Authkey" vs Gupshup "User
// ID"). An admin comparing the form to the vendor's dashboard should see the
// vendor's own wording — generic labels ("API key / authkey") confused more
// than they helped (Twilio has no "API key" at all).
//
// Structure: INTEGRATION_META[id].fieldLabels[providerType || "_default"][key]
// The "_default" bucket is a last-resort fallback for providers we haven't
// given dedicated labels to yet.
// Known-good host/port defaults per email provider — pre-populated when the
// admin picks a provider from the dropdown so they can skip typing the host
// from memory. Never overwrites values the admin already entered.
const EMAIL_PRESETS: Record<string, { host?: string; port?: number; secure?: boolean }> = {
  smtp2go:     { host: "mail.smtp2go.com",           port: 2525, secure: false },
  mailtrap:    { host: "sandbox.smtp.mailtrap.io",   port: 2525, secure: false },
  brevo:       { host: "smtp-relay.brevo.com",       port: 587,  secure: false },
  sendgrid:    { host: "smtp.sendgrid.net",          port: 587,  secure: false },
  ses:         { host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
  mailgun:     { host: "smtp.mailgun.org",           port: 587,  secure: false },
  gmail:       { host: "smtp.gmail.com",             port: 587,  secure: false },
};

const INTEGRATION_META: Record<string, {
  label: string; subtitle: string; Icon: any; color: string;
  providerTypes: { value: string; label: string }[];
  fieldLabels: Record<string, Record<string, string>>;
  helpByProviderType?: Record<string, string>;
}> = {
  email: {
    label: "Email gateway", subtitle: "SMTP for OTPs, password resets, status emails.",
    Icon: Mail, color: "from-blue-500 to-blue-600",
    providerTypes: [
      { value: "smtp", label: "Generic SMTP" },
      { value: "smtp2go", label: "SMTP2GO (1 000 free / month)" },
      { value: "mailtrap", label: "Mailtrap (dev/UAT sandbox)" },
      { value: "brevo", label: "Brevo (ex-Sendinblue, 300 free / day)" },
      { value: "sendgrid", label: "SendGrid (SMTP relay)" },
      { value: "sendgrid-api", label: "SendGrid (HTTP API)" },
      { value: "ses", label: "Amazon SES (SMTP)" },
      { value: "mailgun", label: "Mailgun (SMTP)" },
      { value: "gmail", label: "Gmail (app password)" },
    ],
    fieldLabels: {
      _default:    { host: "SMTP host", port: "SMTP port", user: "SMTP username", from: "From address", secure: "TLS on connect (port 465)", pass: "SMTP password / API key" },
      smtp2go:     { host: "SMTP host (mail.smtp2go.com)", port: "SMTP port (2525 or 587)", user: "SMTP username", from: "From address (sender)", secure: "TLS on connect (leave off for 2525/587)", pass: "SMTP password" },
      mailtrap:    { host: "SMTP host (sandbox.smtp.mailtrap.io)", port: "SMTP port (2525 / 587 / 465)", user: "Mailtrap username", from: "Any address (mails land in inbox, not delivered)", secure: "TLS on connect", pass: "Mailtrap password" },
      brevo:       { host: "SMTP host (smtp-relay.brevo.com)", port: "SMTP port (587)", user: "Brevo login email", from: "Sender address (must be verified)", secure: "TLS on connect (leave off — port 587 STARTTLS)", pass: "SMTP key from Brevo dashboard" },
      gmail:       { host: "SMTP host (smtp.gmail.com)", port: "SMTP port (587)", user: "your.name@gmail.com", from: "your.name@gmail.com", secure: "TLS on connect (leave off for 587)", pass: "16-char app password (not your Google password)" },
    },
    helpByProviderType: {
      smtp2go:     "Sign up at smtp2go.com, go to Sending → SMTP Users, click Add SMTP user — that gives you a username + password. Host is mail.smtp2go.com, port 2525 (or 587 if your network blocks 2525). Free tier: 1,000 emails / month, no card required.",
      mailtrap:    "Sign up at mailtrap.io → create an Email Testing inbox → open 'SMTP Settings' dropdown → pick Nodemailer integration. Everything goes to the Mailtrap inbox (nothing delivered to real recipients) — perfect for UAT.",
      brevo:       "Sign up at brevo.com → left nav 'SMTP & API' → SMTP tab → Generate a new SMTP key. Use your Brevo login email as the SMTP username and the generated key as the password. Free tier: 300 emails / day.",
      sendgrid:    "From SendGrid dashboard: Settings → API Keys → Create API Key with 'Mail Send' permission. SMTP user is literally the string 'apikey' and the password is the API key value. Host: smtp.sendgrid.net, port 587.",
      ses:         "Amazon SES → Create SMTP credentials (different from AWS Access keys). Region-specific hosts like email-smtp.us-east-1.amazonaws.com. Port 587.",
      mailgun:     "Mailgun → Sending → Domain settings → SMTP credentials. Host is smtp.mailgun.org (or smtp.eu.mailgun.org for EU), port 587.",
      gmail:       "Needs 2FA on the Google account, then: myaccount.google.com/apppasswords → generate 16-char app password (NOT your Google login). Delivery is subject to Google's anti-spam heuristics — fine for dev, flaky for production.",
      smtp:        "Any RFC-compliant SMTP server: enter host, port, user, pass, from.",
    },
  },
  sms: {
    label: "SMS gateway", subtitle: "OTP and notification SMS delivery.",
    Icon: Phone, color: "from-emerald-500 to-emerald-600",
    providerTypes: [
      { value: "mock", label: "Mock / dev (logs to console)" },
      { value: "msg91", label: "MSG91 (India)" },
      { value: "twilio", label: "Twilio" },
      { value: "gupshup", label: "Gupshup Enterprise" },
      { value: "nic", label: "NIC SMS (HP Govt)" },
    ],
    fieldLabels: {
      twilio:  { accountSid: "Account SID", from: "Twilio phone number (From)", endpoint: "Endpoint override (optional)", authToken: "Auth Token" },
      msg91:   { authkey: "Authkey", flowId: "Flow ID (template)", senderId: "Sender ID (6 chars)", endpoint: "Endpoint override (optional)", apiKey: "API key" },
      gupshup: { userId: "User ID", senderId: "Sender mask", password: "Password / API key" },
      nic:     { endpoint: "NIC gateway endpoint", user: "Username", senderId: "Sender ID", password: "Password" },
      mock:    { },
      _default:{ senderId: "Sender ID / Short code", endpoint: "Endpoint", apiKey: "API key", apiSecret: "API secret" },
    },
    helpByProviderType: {
      twilio: "From your Twilio Console: Account SID + Auth Token on the home page; 'My Twilio phone number' under Phone Numbers → Manage. Free-trial accounts can only SMS verified numbers.",
      msg91:  "Authkey from MSG91 Dashboard → API → Authkey. Flow ID is the template id from Flow Builder.",
      gupshup:"User ID + password from the Gupshup Enterprise dashboard. Sender mask must match a pre-approved DLT header.",
      nic:    "HP NIC provisions the endpoint + credentials after DoT registration — contact HPSEDC IT for values.",
      mock:   "Logs SMS to the server console instead of delivering. Use during dev / UAT when no real SMS is desired.",
    },
  },
  aadhaar: {
    label: "Aadhaar / UIDAI", subtitle: "eKYC identity verification at candidate registration.",
    Icon: Fingerprint, color: "from-amber-500 to-orange-600",
    providerTypes: [{ value: "uidai", label: "UIDAI Auth / eKYC" }],
    fieldLabels: { _default: { endpoint: "UIDAI endpoint", authCode: "AUA code", apiKey: "API key", licenseKey: "License key (ASA/AUA)" } },
  },
  himaccess: {
    label: "HIM Access SSO", subtitle: "Single sign-on for HP residents / staff.",
    Icon: KeyRound, color: "from-purple-500 to-purple-700",
    providerTypes: [{ value: "oauth2", label: "OAuth 2.0 / OIDC" }],
    fieldLabels: { _default: { endpoint: "Authorize URL", clientId: "Client ID", redirectUri: "Redirect URI", scope: "Scopes", clientSecret: "Client secret" } },
  },
  digilocker: {
    label: "DigiLocker", subtitle: "Pull documents (passport, certificates) from DigiLocker.",
    Icon: FolderLock, color: "from-rose-500 to-rose-600",
    providerTypes: [{ value: "oauth2", label: "DigiLocker OAuth 2.0" }],
    fieldLabels: { _default: { endpoint: "Authorize URL", clientId: "Client ID", redirectUri: "Redirect URI", scope: "Scopes", clientSecret: "Client secret" } },
  },
};

function IntegrationsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/integrations"],
    queryFn: () => fetchJson("/api/v1/admin/integrations"),
  });
  const integrations: any[] = res?.data ?? [];

  async function save(id: string, body: any) {
    const r = await fetch(`/api/v1/admin/integrations/${id}`, {
      method: "PUT", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error?.message || "Save failed");
    await qc.invalidateQueries({ queryKey: ["/api/v1/admin/integrations"] });
    toast({ title: "Integration saved", description: "The service will pick up the new config on its next call." });
  }

  async function test(id: string, opts: { testPhone?: string; testEmail?: string }) {
    const r = await fetch(`/api/v1/admin/integrations/${id}/test`, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    });
    const j = await r.json();
    await qc.invalidateQueries({ queryKey: ["/api/v1/admin/integrations"] });
    if (j.success) {
      toast({
        title: "Test passed",
        description: j.info || "Configuration is reachable.",
      });
    } else {
      toast({ title: "Test failed", description: j.error?.message || "Check the saved config", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <PlugZap className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Third-party integrations</h3>
            <p className="text-sm text-slate-600 mt-1">
              Configure the external services listed in the FRS. Secrets are encrypted at rest and never returned to the browser.
              Each integration accepts a fallback from environment variables for local dev; the settings saved here always take precedence in production.
            </p>
          </div>
        </div>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {integrations.map((it) => <IntegrationCard key={it.id} it={it} onSave={save} onTest={test} />)}
      </div>
    </div>
  );
}

function IntegrationCard({ it, onSave, onTest }: {
  it: any;
  onSave: (id: string, body: any) => Promise<void>;
  onTest: (id: string, opts: { testPhone?: string; testEmail?: string }) => Promise<void>;
}) {
  const meta = INTEGRATION_META[it.id];
  const { Icon } = meta;
  const [providerType, setProviderType] = useState<string>(it.providerType);
  const [enabled, setEnabled] = useState<boolean>(it.enabled);
  const [config, setConfig] = useState<Record<string, any>>(it.config || {});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState<string>("");
  const [testEmail, setTestEmail] = useState<string>("");
  // When set, the ToggleConfirmDialog is open with `target` = requested state.
  // Clear on cancel / confirm.
  const [pendingToggle, setPendingToggle] = useState<{ target: boolean } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  // Resolve the label for a field in the CURRENTLY-SELECTED provider's
  // terminology. Falls back to the integration's `_default` bucket and
  // finally the raw key so an unrecognised field still renders something.
  const fieldLabel = (k: string) => {
    const byProvider = meta.fieldLabels[providerType] ?? {};
    const fallback = meta.fieldLabels._default ?? {};
    return byProvider[k] ?? fallback[k] ?? k;
  };
  const secretPresent = (k: string) => it.secretFieldsPresent?.includes(k);

  // Field list is provider-aware. Backend returns fieldsByProviderType[provider]
  // so the form swaps instantly when the admin picks a different Provider —
  // no round-trip, no field keys left over from the previous provider's shape.
  const currentFields = it.fieldsByProviderType?.[providerType] ?? it.fields ?? { configFields: [], secretFields: [] };
  const helpText = meta.helpByProviderType?.[providerType];

  async function handleSave() {
    try {
      setBusy("save");
      // Any secret field with a non-empty value replaces; empty string clears;
      // missing key is preserved server-side.
      // Deliberately do NOT ship `enabled` — that field is only editable via
      // the /toggle endpoint which requires the admin's password. This keeps
      // the regular Save to config + provider + secrets.
      await onSave(it.id, { providerType, config, secrets });
      setSecrets({});
    } finally { setBusy(null); }
  }
  async function handleTest() {
    try {
      setBusy("test");
      await onTest(it.id, { testPhone: testPhone || undefined, testEmail: testEmail || undefined });
    } finally { setBusy(null); }
  }

  const statusBadge = (() => {
    if (!it.enabled) return <Badge variant="outline" className="text-slate-500">Disabled</Badge>;
    if (it.lastTestStatus === "ok") return <Badge className="bg-emerald-100 text-emerald-700">Test OK</Badge>;
    if (it.lastTestStatus === "fail") return <Badge className="bg-red-100 text-red-700">Test failed</Badge>;
    if (it.source === "env") return <Badge className="bg-amber-100 text-amber-700">Using env fallback</Badge>;
    return <Badge className="bg-blue-100 text-blue-700">Enabled</Badge>;
  })();

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className={`h-1.5 bg-gradient-to-r ${meta.color}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} text-white flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900">{meta.label}</h4>
              <p className="text-xs text-slate-500">{meta.subtitle}</p>
            </div>
          </div>
          {statusBadge}
        </div>

        <div className="space-y-3 mt-4">
          {/* Provider type */}
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Provider</span>
            <select value={providerType} onChange={(e) => {
              const next = e.target.value;
              setProviderType(next);
              // Pre-populate well-known host/port for the picked provider when
              // those fields are empty, so the admin can jump straight to
              // username + password. Never overwrites what the admin typed.
              const preset = EMAIL_PRESETS[next];
              if (preset) {
                setConfig((prev) => ({
                  host:  prev.host  || preset.host  || "",
                  port:  prev.port  || preset.port  || "",
                  secure: prev.secure ?? preset.secure ?? false,
                  user:  prev.user  ?? "",
                  from:  prev.from  ?? "",
                  ...prev,
                }));
              }
            }}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm">
              {meta.providerTypes.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>

          {/* Enabled toggle — re-auth required for any on/off change. Disabling
              email breaks password-reset / OTP / notifications; enabling a
              misconfigured SMS gateway spams on cost. Both warrant a confirm. */}
          <div className="flex items-start gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={enabled}
                onChange={(e) => {
                  // Intercept — don't mutate local state yet. Open the dialog;
                  // it calls the toggle endpoint on confirm and then updates
                  // enabled via the onDone callback.
                  setPendingToggle({ target: e.target.checked });
                }}
                className="rounded border-slate-300" />
              <span className={`font-medium ${enabled ? "text-emerald-700" : "text-slate-500"}`}>
                {enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="text-slate-500 font-normal">(the service will prefer this config over env variables)</span>
            </label>
          </div>

          {/* Per-provider help blurb (Twilio "where to find these", etc.) */}
          {helpText && (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 leading-snug">
              💡 {helpText}
            </p>
          )}

          {/* Non-secret config fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {currentFields.configFields?.map((k: string) => (
              <label key={k} className="block">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{fieldLabel(k)}</span>
                <Input value={config[k] ?? ""} onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
                  className="mt-0.5 text-sm" />
              </label>
            ))}
          </div>

          {/* Secret fields */}
          {currentFields.secretFields?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 mt-2">
              {currentFields.secretFields.map((k: string) => (
                <label key={k} className="block">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1">
                    {fieldLabel(k)}
                    {secretPresent(k) && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                  </span>
                  <Input type="password"
                    placeholder={secretPresent(k) ? "•••••••• (saved — leave blank to keep)" : "Enter value"}
                    value={secrets[k] ?? ""}
                    onChange={(e) => setSecrets({ ...secrets, [k]: e.target.value })}
                    className="mt-0.5 text-sm font-mono" />
                </label>
              ))}
            </div>
          )}

          {/* Test controls */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-100 flex-wrap">
            {it.id === "sms" && (
              <Input placeholder="Test phone (e.g. +919876543210)" value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="text-sm max-w-[240px]" />
            )}
            {it.id === "email" && (
              <Input placeholder="Test email (e.g. you@example.com)" value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                type="email"
                className="text-sm max-w-[260px]"
                title="Leave blank to just verify the SMTP handshake. Enter an address to send an actual test email." />
            )}
            <Button size="sm" variant="outline" onClick={handleTest}
              disabled={busy !== null}
              className="text-xs">
              {busy === "test" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PlugZap className="w-3.5 h-3.5 mr-1" />}
              Test connection
            </Button>
            <Button size="sm" onClick={handleSave}
              disabled={busy !== null}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {busy === "save" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
              Save
            </Button>
            {it.lastTestedAt && (
              <span className="text-[11px] text-slate-400 ml-auto">
                Last tested {new Date(it.lastTestedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                {it.lastTestError && <span className="text-red-600"> — {String(it.lastTestError).slice(0, 80)}</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {pendingToggle && (
        <ToggleConfirmDialog
          integrationId={it.id}
          integrationLabel={meta.label}
          fromEnabled={enabled}
          toEnabled={pendingToggle.target}
          onCancel={() => setPendingToggle(null)}
          onDone={(newState) => { setEnabled(newState); setPendingToggle(null); }}
        />
      )}
    </div>
  );
}

// Re-auth prompt shown before an integration's enable/disable takes effect.
// Calls POST /admin/integrations/:id/toggle which verifies the admin's own
// password, writes an audit row, and flips the flag server-side. The caller
// then syncs local `enabled` state via onDone so the UI matches the server.
function ToggleConfirmDialog({ integrationId, integrationLabel, fromEnabled, toEnabled, onCancel, onDone }: {
  integrationId: string;
  integrationLabel: string;
  fromEnabled: boolean;
  toEnabled: boolean;
  onCancel: () => void;
  onDone: (newState: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = toEnabled ? "Enable" : "Disable";
  const consequence = toEnabled
    ? `The app will start using this configuration live. Incoming messages (OTPs, notifications) will route through ${integrationLabel} immediately.`
    : `The app will stop using this configuration. Depending on env fallbacks, some messages may queue or fail until re-enabled.`;

  async function confirm() {
    setError(null);
    if (!password) { setError("Password is required"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/admin/integrations/${integrationId}/toggle`, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: toEnabled, password }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setError(j?.error?.message || "Toggle failed");
        return;
      }
      onDone(toEnabled);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
        <h3 className={`text-base font-bold ${toEnabled ? "text-emerald-700" : "text-red-700"}`}>
          {action} {integrationLabel}?
        </h3>
        <p className="text-sm text-slate-700 mt-1">
          Changing from <span className="font-mono font-semibold">{fromEnabled ? "ENABLED" : "DISABLED"}</span> to <span className="font-mono font-semibold">{toEnabled ? "ENABLED" : "DISABLED"}</span>.
        </p>
        <p className="text-xs text-slate-600 mt-2 bg-amber-50 border border-amber-200 rounded-md p-2 leading-snug">
          {consequence}
        </p>

        <label className="block mt-4">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Confirm with your admin password</span>
          <input type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) confirm(); }}
            autoFocus
            placeholder="Your account password"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono" />
        </label>

        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} disabled={busy}
            className="text-xs font-semibold px-3 py-2 rounded border border-slate-200 hover:bg-slate-50">Cancel</button>
          <button onClick={confirm} disabled={busy || !password}
            className={`text-xs font-semibold px-4 py-2 rounded text-white disabled:opacity-50 ${
              toEnabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
            }`}>
            {busy ? "Confirming…" : `${action} ${integrationLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── System Configuration Panel ───────────────────────────────────────
function SystemConfigPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/settings"],
    queryFn: () => fetchJson("/api/v1/admin/settings"),
  });

  const update = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const r = await fetch(`/api/v1/admin/settings/${encodeURIComponent(key)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({} as any));
        throw new Error(err?.message || "Update failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/settings"] });
      toast({ title: "Setting saved", description: "Applied across the portal immediately." });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;

  const settings: any[] = res?.data ?? [];
  const byCategory = settings.reduce((m: Record<string, any[]>, s: any) => {
    (m[s.category] = m[s.category] || []).push(s);
    return m;
  }, {});
  const catMeta: Record<string, { label: string; icon: React.ReactNode; color: string; subtitle: string }> = {
    pipeline:      { label: "Applicant Pipeline",   icon: <TrendingUp className="w-5 h-5" />,    color: "from-indigo-500 to-indigo-700",   subtitle: "Control how applications move through the hiring stages." },
    rejection:     { label: "Rejection",            icon: <AlertTriangle className="w-5 h-5" />, color: "from-red-500 to-red-700",         subtitle: "Rules for rejecting and un-rejecting candidates." },
    access:        { label: "Access & Gating",      icon: <Shield className="w-5 h-5" />,        color: "from-emerald-500 to-emerald-700", subtitle: "Who can publish jobs, what needs admin approval, and agency limits." },
    notifications: { label: "Notifications & SLAs", icon: <MessageSquare className="w-5 h-5" />, color: "from-amber-500 to-orange-600",    subtitle: "When the portal alerts users and auto-escalates stale items." },
    matching:      { label: "Matching & Discovery", icon: <Settings className="w-5 h-5" />,      color: "from-purple-500 to-purple-700",   subtitle: "Tune match thresholds and the agency leaderboard formula." },
    lifecycle:     { label: "Application Lifecycle", icon: <Clock className="w-5 h-5" />,        color: "from-teal-500 to-teal-700",       subtitle: "When applications expire and who is eligible to apply." },
    uploads:       { label: "File Uploads",         icon: <FileText className="w-5 h-5" />,      color: "from-violet-500 to-violet-700",   subtitle: "Document size and type restrictions." },
    security:      { label: "Security & Sessions", icon: <Shield className="w-5 h-5" />,         color: "from-slate-700 to-slate-900",     subtitle: "Session timeouts, password policy, rate limits. Changes recommended to be reviewed with HPSEDC security." },
    // audit 2026-07-06 (Batch 4B): emigration-compliance gates (passport validity, PDO/PBBY, offer letter + expiry).
    compliance:    { label: "Emigration Compliance", icon: <Shield className="w-5 h-5" />,       color: "from-cyan-600 to-sky-800",        subtitle: "Passport-validity, PDO/PBBY and offer-letter gates required for overseas placement." },
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">System Configuration</h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Change the portal's behaviour without a code deploy. Settings take effect immediately and are written to the audit log.
              Use the defaults (recommended for HPSEDC) unless a specific operational need comes up.
            </p>
          </div>
        </div>
      </div>

      {Object.keys(byCategory).map((cat) => {
        const meta = catMeta[cat] || { label: cat, icon: <Settings className="w-5 h-5" />, color: "from-slate-500 to-slate-700", subtitle: "" };
        return (
          <div key={cat} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`bg-gradient-to-r ${meta.color} text-white p-4`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">{meta.icon}</div>
                <div>
                  <h3 className="font-bold">{meta.label}</h3>
                  {meta.subtitle && <p className="text-xs text-white/80">{meta.subtitle}</p>}
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {byCategory[cat].map((s: any) => (
                <SettingRow key={s.key} spec={s} onChange={(v) => update.mutate({ key: s.key, value: v })}
                  saving={update.isPending && update.variables?.key === s.key} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingRow({ spec, onChange, saving }: { spec: any; onChange: (v: any) => void; saving: boolean }) {
  const [local, setLocal] = useState<any>(spec.value);
  const dirty = JSON.stringify(local) !== JSON.stringify(spec.value);

  return (
    <div className="flex items-start gap-4 p-4 hover:bg-slate-50/60 transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{spec.label}</p>
          {spec.isDefault && <Badge variant="outline" className="text-[10px] bg-slate-50">Default</Badge>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 max-w-xl">{spec.description}</p>
        <p className="text-[10px] text-slate-400 mt-1 font-mono">{spec.key}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {spec.type === "boolean" && (
          <button
            onClick={() => onChange(!spec.value)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${spec.value ? "bg-emerald-500" : "bg-slate-300"}`}
            aria-pressed={spec.value}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${spec.value ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        )}
        {spec.type === "number" && (
          <div className="flex items-center gap-2">
            <input type="number" value={local} min={spec.min} max={spec.max}
              onChange={(e) => setLocal(Number(e.target.value))}
              className="w-20 h-9 text-sm rounded-md border border-slate-200 px-2" />
            {dirty && (
              <Button size="sm" onClick={() => onChange(local)} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            )}
          </div>
        )}
        {spec.type === "string_array" && spec.options && (
          <div className="flex flex-wrap gap-1 max-w-sm justify-end">
            {spec.options.map((opt: string) => {
              const active = (local as string[])?.includes?.(opt);
              return (
                <button key={opt}
                  onClick={() => {
                    const next = active ? (local as string[]).filter((x) => x !== opt) : [...(local as string[]), opt];
                    setLocal(next);
                    onChange(next);
                  }}
                  disabled={saving}
                  className={`text-[11px] px-2 py-1 rounded border transition ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                  {opt.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deployment Readiness fleet panel ─────────────────────────────────
// readiness 2026-07-07: HPSEDC cohort view over GET /admin/oversight/
// deployment-readiness — stat tiles, a by-stage distribution (plain
// proportion bars, deliberately no chart lib), and the candidate table
// (server already sorts travel-ready first). Auto-refreshes.
const READINESS_STAGES: { key: ReadinessStage; bar: string }[] = [
  { key: "registered", bar: "bg-slate-400 dark:bg-slate-500" },
  { key: "documents", bar: "bg-blue-500 dark:bg-blue-400" },
  { key: "compliance", bar: "bg-violet-500 dark:bg-violet-400" },
  { key: "deployment", bar: "bg-amber-500 dark:bg-amber-400" },
  { key: "travel_ready", bar: "bg-emerald-500 dark:bg-emerald-400" },
];

function DeploymentReadinessPanel() {
  const { t } = useTranslation();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/deployment-readiness"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/deployment-readiness"),
    refetchInterval: 30000,
  });
  const d = res?.data;
  const counts = d?.counts ?? { travelReady: 0, inCompliance: 0, blocked: 0, total: 0 };
  const byStage: Record<string, number> = d?.byStage ?? {};
  const rows: any[] = d?.candidates ?? [];
  const stageMax = Math.max(1, counts.total);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Plane className="text-blue-600 mr-2 w-5 h-5" /> {t("readiness.admin.title")}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t("readiness.admin.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-lg text-xs"
          onClick={() => window.open("/api/v1/admin/oversight/deployment-readiness/export.csv", "_blank")}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> {t("readiness.admin.exportCsv")}
        </Button>
      </div>

      {/* Stat tiles — same MetricCard as the Overview tab */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<Plane />} color="bg-emerald-600" label={t("readiness.admin.tileTravelReady")} value={counts.travelReady} />
        <MetricCard icon={<Shield />} color="bg-blue-600" label={t("readiness.admin.tileInCompliance")} value={counts.inCompliance} />
        <MetricCard icon={<AlertTriangle />} color="bg-rose-600" label={t("readiness.admin.tileBlocked")} value={counts.blocked} />
        <MetricCard icon={<Users />} color="bg-purple-600" label={t("readiness.admin.tileTotal")} value={counts.total} />
      </div>

      {/* By-stage distribution — simple horizontal proportion bars */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">{t("readiness.admin.byStage")}</h4>
        <div className="space-y-2">
          {READINESS_STAGES.map(({ key, bar }) => {
            const n = Number(byStage[key] ?? 0);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-600">{t(`readiness.stages.${key}`)}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar} transition-all duration-500`}
                    style={{ width: `${(n / stageMax) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Candidate table — travel-ready first (server-sorted) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Plane className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("readiness.admin.empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3 font-bold">{t("readiness.admin.colCandidate")}</th>
                  <th className="py-2 pr-3 font-bold">{t("readiness.admin.colDestination")}</th>
                  <th className="py-2 pr-3 font-bold">{t("readiness.admin.colReadiness")}</th>
                  <th className="py-2 pr-3 font-bold">{t("readiness.admin.colStage")}</th>
                  <th className="py-2 font-bold">{t("readiness.admin.colPending")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr key={c.candidateId} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2 pr-3 font-semibold text-slate-900 whitespace-nowrap">{c.fullName}</td>
                    <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{c.destination || "—"}</td>
                    <td className="py-2 pr-3">
                      <ReadinessRing pct={c.pct} size="sm" isTravelReady={c.isTravelReady} blockers={c.blockers} actionNeeded={c.actionNeeded} />
                    </td>
                    <td className="py-2 pr-3">
                      <TravelReadyBadge stage={c.stage} isTravelReady={c.isTravelReady} size="sm" />
                    </td>
                    <td className="py-2">
                      {(c.pending?.length ?? 0) === 0 ? (
                        <span className="text-xs text-emerald-600 font-semibold">0</span>
                      ) : (
                        // Pending labels come from the backend checklist; show the
                        // count + first items so staff can triage without a click.
                        <span className="text-xs text-slate-600" title={(c.pending ?? []).join(", ")}>
                          <span className="font-bold text-amber-600 tabular-nums">{c.pending.length}</span>
                          <span className="text-slate-400"> · {(c.pending ?? []).slice(0, 2).join(", ")}{c.pending.length > 2 ? "…" : ""}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, color, label, value, sub, onClick }: { icon: React.ReactNode; color: string; label: string; value: string | number; sub?: string; onClick?: () => void }) {
  const lightMap: Record<string, string> = {
    "bg-blue-600": "bg-blue-50 text-blue-600",
    "bg-emerald-600": "bg-emerald-50 text-emerald-600",
    "bg-orange-500": "bg-orange-50 text-orange-600",
    "bg-purple-600": "bg-purple-50 text-purple-600",
    // readiness 2026-07-07: rose tile for the "Blocked" readiness count
    "bg-rose-600": "bg-rose-50 text-rose-600",
  };
  const light = lightMap[color] || "bg-slate-50 text-slate-600";
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all ${onClick ? "cursor-pointer hover:border-blue-300" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`${light} p-2 rounded-lg flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
            <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          </div>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function DriveApprovalCard({ drive }: { drive: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/drives/${drive.id}/approve`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/drives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/reports/dashboard"] });
      toast({ title: "Drive Approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/drives/${drive.id}/reject`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Does not meet requirements" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/drives"] });
      // audit 2026-07-06 (C10a): reject must refresh the dashboard report like approve does
      queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/reports/dashboard"] });
      toast({ title: "Drive Rejected" });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium text-gray-900">{drive.title}</h4>
          {drive.description && <p className="text-sm text-gray-500 mt-1">{drive.description}</p>}
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-2">
            <span>{drive.date ? new Date(drive.date).toLocaleDateString("en-IN") : "—"}</span>
            <span>{drive.location}</span>
            {drive.expectedCandidates && <span>{drive.expectedCandidates} expected</span>}
          </div>
          {drive.targetRoles?.length > 0 && (
            <div className="flex gap-1 mt-2">
              {drive.targetRoles.map((r: string) => <Badge key={r} variant="outline" className="text-xs">{r}</Badge>)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

function GrievanceCard({ grievance: g }: { grievance: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState("");

  // One mutation for the whole lifecycle. Flow is linear:
  // submitted → under_review → action_taken → resolved (Resolve is the LAST step).
  const setStatus = useMutation({
    mutationFn: async (payload: { status: string; resolutionNotes?: string }) => {
      const res = await fetch(`/api/v1/grievances/${g.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Update failed"); }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances"] });
      setResolving(false);
      toast({ title: vars.status === "resolved" ? "Grievance resolved" : `Marked "${vars.status.replace(/_/g, " ")}"` });
    },
  });

  const statusBadge: Record<string, string> = {
    resolved: "bg-emerald-600", action_taken: "bg-indigo-600", under_review: "bg-blue-600",
    escalated: "bg-red-600", submitted: "bg-orange-500",
  };
  const isTerminal = g.status === "resolved" || g.status === "escalated";

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{g.subject}</h4>
          <p className="text-sm text-gray-500 mt-1">{g.description}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs capitalize">{g.category?.replace(/_/g, " ")}</Badge>
            <Badge className={`text-xs ${statusBadge[g.status] || "bg-orange-500"} text-white`}>
              {g.status?.replace(/_/g, " ")}
            </Badge>
            {/* Submitter + owner badges — surfaces the auto-routing decision
             *  so admins can see at a glance who's expected to act. The
             *  "Unassigned" badge highlights the admin-queue bucket. */}
            {g.submitter && (
              <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
                From: <span className="font-semibold ml-1">{g.submitter.username}</span>
                <span className="text-slate-500 ml-1">({g.submitter.role})</span>
              </Badge>
            )}
            {g.owner ? (
              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                Assigned to: <span className="font-semibold ml-1">{g.owner.username}</span>
                <span className="text-indigo-500 ml-1">({g.owner.role})</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Unassigned — admin queue
              </Badge>
            )}
          </div>
          {g.adminNotes && (
            <p className="text-[11px] text-slate-400 mt-1 italic">{g.adminNotes}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className="text-xs text-gray-400">{g.createdAt ? new Date(g.createdAt).toLocaleDateString("en-IN") : ""}</span>
          {!isTerminal && (
            <div className="flex gap-1 mt-1">
              {g.status === "submitted" && (
                <Button size="sm" variant="outline" className="text-xs h-7" disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: "under_review" })}>
                  Start Review
                </Button>
              )}
              {g.status === "under_review" && (
                <Button size="sm" variant="outline" className="text-xs h-7" disabled={setStatus.isPending}
                  onClick={() => setResolving((v) => !v)}>
                  Mark Action Taken
                </Button>
              )}
              {g.status === "action_taken" && (
                <span className="text-[11px] text-amber-600 font-medium">Awaiting complainant's confirmation</span>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Staff record what they did; the complainant then confirms resolution. */}
      {resolving && g.status === "under_review" && (
        <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-2">
          <textarea
            className="w-full min-h-[60px] p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="What action did you take? (the complainant will see this and confirm if resolved)…"
            value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setStatus.mutate({ status: "action_taken", resolutionNotes: notes })} disabled={!notes.trim() || setStatus.isPending}>
              Mark Action Taken
            </Button>
            <Button size="sm" variant="outline" onClick={() => setResolving(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {g.resolutionNotes && (
        <div className="mt-3 bg-emerald-50 p-3 rounded text-sm">
          <p className="font-medium text-emerald-800">Resolution:</p>
          <p className="text-emerald-700">{g.resolutionNotes}</p>
        </div>
      )}
      {/* Two-way conversation with the complainant — admin is staff here. */}
      <GrievanceThread grievanceId={g.id} isStaff={true} />
    </div>
  );
}

function PendingItem({ icon, label, count, color, onClick }: { icon: React.ReactNode; label: string; count: number; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`flex items-center justify-between p-3 ${color} border rounded-lg ${onClick ? "cursor-pointer hover:brightness-95 transition" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-5 h-5">{icon}</span>
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      <Badge variant={count > 0 ? "destructive" : "secondary"}>{count}</Badge>
    </div>
  );
}

// ── Compliance Oversight Panel (MEA policy enforcement) ──────────────
function CompliancePanel() {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/compliance"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/compliance"),
  });
  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  const d = res?.data ?? { totals: { candidates: 0, activePlacements: 0 }, coverage: {}, riskFlags: {}, visa: { counts: {}, deployed: 0 } };
  const cov = d.coverage;
  const risk = d.riskFlags;
  const visa = d.visa ?? { counts: {}, deployed: 0 };
  const vc = visa.counts ?? {};

  const row = (key: string, label: string, target: number = 90) => {
    const c = cov[key] || { count: 0, pct: 0 };
    const ok = c.pct >= target;
    return (
      <div key={key} className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          <span className={`text-[10px] font-bold px-1.5 rounded ${ok ? "bg-emerald-100 text-emerald-700" : c.pct >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
            {c.pct}%
          </span>
        </div>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{c.count}<span className="text-sm text-slate-400"> / {d.totals.candidates}</span></p>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
          <div className={`h-full ${ok ? "bg-emerald-500" : c.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${c.pct}%` }} />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Target: {target}%</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 mt-1" />
          <div>
            <h2 className="text-xl font-bold">Compliance Oversight</h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Track Emigration Act / MEA compliance across all candidates. The percentages show what portion of the candidate pool has each regulatory item recorded.
            </p>
          </div>
        </div>
      </div>

      {/* Coverage tiles */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Coverage across {d.totals.candidates} candidates</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {row("passportOnFile", "Passport on file", 80)}
          {row("ecrSet", "ECR / ECNR declared", 90)}
          {row("pccSubmitted", "PCC submitted", 60)}
          {row("medicalFit", "Medical — fit", 70)}
          {row("pdoCompleted", "PDO completed", 50)}
          {row("pbbyEnrolled", "PBBY enrolled", 50)}
          {row("ieltsRecorded", "IELTS recorded", 40)}
        </div>
      </div>

      {/* Visa pipeline across deployed placements */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Visa pipeline — {visa.deployed} deployed</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "not_applied", label: "Not applied", cls: "text-slate-600" },
            { key: "applied", label: "Applied", cls: "text-blue-700" },
            { key: "approved", label: "Approved", cls: "text-emerald-700" },
            { key: "rejected", label: "Rejected", cls: "text-red-700" },
          ].map((s) => (
            <div key={s.key} className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{vc[s.key] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Risk flags */}
      <div className="grid md:grid-cols-2 gap-4">
        <RiskList title="Placed without PDO" icon="⚠️" severity="critical" rows={risk.placedMissingPDO ?? []} />
        <RiskList title="Placed without PBBY" icon="⚠️" severity="critical" rows={risk.placedMissingPBBY ?? []} />
        <RiskList title="Placed without passport on file" icon="🚨" severity="critical" rows={risk.placedMissingPassport ?? []} />
        <RiskList title="Passport expiring in < 6 months" icon="⏰" severity="warning" rows={risk.passportExpiringSoon ?? []} />
        <RiskList title="Placed, visa not yet approved" icon="✈️" severity="warning" rows={risk.placedVisaNotApproved ?? []} />
        <RiskList title="Visa rejected" icon="🚨" severity="critical" rows={risk.visaRejected ?? []} />
      </div>
    </div>
  );
}

function RiskList({ title, icon, severity, rows }: { title: string; icon: string; severity: "critical" | "warning"; rows: any[] }) {
  const border = severity === "critical" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40";
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-900">{icon} {title}</h4>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${severity === "critical" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-emerald-700">✓ None flagged</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {rows.slice(0, 20).map((r: any, i: number) => (
            <div key={r.id || r.placementId || r.candidateId || i} className="text-xs bg-white rounded px-2 py-1 border border-slate-100 flex justify-between gap-2">
              <span className="font-medium text-slate-800 truncate">{r.fullName}</span>
              {r.passportExpiry
                ? <span className="text-slate-500 shrink-0">{new Date(r.passportExpiry).toLocaleDateString("en-IN")}</span>
                : r.country ? <span className="text-slate-500 shrink-0">{r.country}</span> : null}
            </div>
          ))}
          {rows.length > 20 && <p className="text-[10px] text-slate-500 italic mt-1">+{rows.length - 20} more</p>}
        </div>
      )}
    </div>
  );
}

// ── Welfare SLA Monitor ──────────────────────────────────────────────
function WelfareSlaPanel() {
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/welfare-sla"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/welfare-sla"),
  });
  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  // v0.4.40: endpoint now returns { overdue, missingStartDate } (was a bare
  // array). Tolerate both shapes so a stale cache can't crash the panel.
  const overdue: any[] = Array.isArray(res?.data) ? res.data : (res?.data?.overdue ?? []);
  const missingStartDate: any[] = Array.isArray(res?.data) ? [] : (res?.data?.missingStartDate ?? []);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-rose-600 to-pink-700 text-white rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 mt-1" />
          <div>
            <h2 className="text-xl font-bold">Welfare SLA Monitor</h2>
            <p className="text-sm text-rose-100 mt-1 max-w-2xl">
              30/60/90-day post-placement check-ins that are past due. MEA expects every placed candidate to be checked on at these milestones.
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-4xl font-bold">{overdue.length}</p>
            <p className="text-xs text-rose-200 uppercase tracking-wide font-semibold">overdue</p>
          </div>
        </div>
      </div>

      {/* Data-quality flag: placements with no start date set — the welfare
          clock is estimated from the created date so they still get tracked. */}
      {missingStartDate.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900">⏱️ Placed, no start date set</h4>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white">{missingStartDate.length}</span>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">Welfare due-dates estimated from the placement creation date. Set a real start date to make the SLA exact.</p>
          <div className="flex flex-wrap gap-1.5">
            {missingStartDate.slice(0, 30).map((r: any, i: number) => (
              <span key={r.placementId || i} className="text-xs bg-white rounded px-2 py-1 border border-amber-100 text-slate-700">{r.candidateName} · {r.country}</span>
            ))}
          </div>
        </div>
      )}

      {overdue.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-semibold text-slate-700">All welfare check-ins up to date</p>
          <p className="text-xs text-slate-500 mt-1">Every placed candidate has their due milestones recorded.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Candidate</th>
                <th className="text-left px-3 py-2">Placement</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-center px-3 py-2">Milestone</th>
                <th className="text-center px-3 py-2">Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((r) => (
                <tr key={`${r.placementId}-${r.milestone}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.candidateName}</td>
                  <td className="px-3 py-2 text-slate-600">{r.jobTitle} · {r.company}</td>
                  <td className="px-3 py-2 text-slate-600">{r.country}</td>
                  <td className="px-3 py-2 text-center"><Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{r.milestone}-day</Badge></td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-bold tabular-nums ${r.daysOverdue > 30 ? "text-red-600" : r.daysOverdue > 14 ? "text-amber-600" : "text-slate-600"}`}>
                      {r.daysOverdue}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Admin user management ────────────────────────────────────────────
function UserManagementPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/oversight/users"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/users"),
  });
  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/v1/admin/oversight/users/${id}/toggle-active`, { method: "PATCH" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "User updated" }); qc.invalidateQueries({ queryKey: ["/api/v1/admin/oversight/users"] }); },
  });
  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  const rows: any[] = res?.data ?? [];

  const roleColor: Record<string, string> = {
    candidate: "bg-blue-100 text-blue-700", agent: "bg-emerald-100 text-emerald-700",
    employer: "bg-purple-100 text-purple-700", admin: "bg-red-100 text-red-700", superadmin: "bg-amber-100 text-amber-700",
  };

  // Group by role category for separated tabs.
  const candidates = rows.filter((u) => u.role === "candidate");
  const agencies = rows.filter((u) => u.role === "agent");
  const employers = rows.filter((u) => u.role === "employer");
  const staff = rows.filter((u) => u.role === "admin" || u.role === "superadmin");

  const renderTable = (data: any[]) => (
    <div className="overflow-x-auto">
      {data.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">No users in this category.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left py-2 px-2">Username</th>
              <th className="text-left py-2 px-2">Email</th>
              <th className="text-left py-2 px-2">Role</th>
              <th className="text-center py-2 px-2">Active</th>
              <th className="text-left py-2 px-2">Last login</th>
              <th className="text-right py-2 px-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2 px-2 font-medium text-slate-900">{u.username}</td>
                <td className="py-2 px-2 text-slate-600">{u.email}</td>
                <td className="py-2 px-2"><Badge className={`text-[10px] ${roleColor[u.role] || "bg-slate-100 text-slate-700"}`}>{u.role}</Badge></td>
                <td className="py-2 px-2 text-center">
                  {u.isActive ? <CheckCircle className="w-4 h-4 text-emerald-500 inline" /> : <span className="text-red-500">Disabled</span>}
                </td>
                <td className="py-2 px-2 text-xs text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-IN") : "Never"}</td>
                <td className="py-2 px-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate(u.id)}>
                    {u.isActive ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" /> Users ({rows.length})
        </h3>
        <Tabs defaultValue="candidates">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
            <TabsTrigger value="agencies">Agencies ({agencies.length})</TabsTrigger>
            <TabsTrigger value="employers">Employers ({employers.length})</TabsTrigger>
            <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
            <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="candidates" className="mt-4">{renderTable(candidates)}</TabsContent>
          <TabsContent value="agencies" className="mt-4">{renderTable(agencies)}</TabsContent>
          <TabsContent value="employers" className="mt-4">{renderTable(employers)}</TabsContent>
          <TabsContent value="staff" className="mt-4">{renderTable(staff)}</TabsContent>
          <TabsContent value="all" className="mt-4">{renderTable(rows)}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Audit log viewer ─────────────────────────────────────────────────
function AuditLogPanel() {
  const [resourceType, setResourceType] = useState<string>("all");
  const [actionContains, setActionContains] = useState<string>("");
  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ["/api/v1/admin/oversight/audit-log"],
    queryFn: () => fetchJson("/api/v1/admin/oversight/audit-log?limit=200"),
  });
  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  const allRows: any[] = res?.data ?? [];
  const rows = allRows.filter((r) => {
    if (resourceType !== "all" && r.resourceType !== resourceType) return false;
    if (actionContains && !String(r.action ?? "").toLowerCase().includes(actionContains.toLowerCase())) return false;
    return true;
  });
  const resourceTypes = Array.from(new Set(allRows.map((r) => r.resourceType).filter(Boolean))).sort();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" /> Audit Log
          <span className="text-xs font-normal text-slate-500 ml-2">{rows.length} of {allRows.length} shown</span>
        </h3>
        <div className="flex items-center gap-2">
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
            <option value="all">All resources</option>
            {resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" value={actionContains} onChange={(e) => setActionContains(e.target.value)}
            placeholder="Action contains…"
            className="text-xs border border-slate-200 rounded px-2 py-1 w-40" />
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-7 text-xs">Refresh</Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          {allRows.length === 0 ? "No audit entries yet." : "No entries match the filters."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2 px-2">When</th>
                <th className="text-left py-2 px-2">Who</th>
                <th className="text-left py-2 px-2">Action</th>
                <th className="text-left py-2 px-2">Resource</th>
                <th className="text-left py-2 px-2">Resource ID</th>
                <th className="text-left py-2 px-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2 whitespace-nowrap text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                  <td className="py-2 px-2 font-medium text-slate-900">{r.username ?? "system"} <span className="text-[10px] text-slate-400">({r.userRole})</span></td>
                  <td className="py-2 px-2"><Badge variant="outline" className="text-[10px] capitalize">{r.action}</Badge></td>
                  <td className="py-2 px-2 text-slate-600 capitalize">{r.resourceType}</td>
                  <td className="py-2 px-2 font-mono text-[10px] text-slate-400 truncate max-w-[120px]">{r.resourceId}</td>
                  <td className="py-2 px-2 text-slate-500 max-w-md truncate" title={r.details ? JSON.stringify(r.details, null, 2) : ""}>
                    {(() => {
                      const d = r.details || {};
                      if (d.from && d.to) {
                        return (
                          <span>
                            <span className="font-mono text-slate-600">{d.from}</span>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="font-mono text-emerald-700">{d.to}</span>
                            {d.reason && <span className="text-slate-400"> · {String(d.reason).slice(0, 40)}</span>}
                          </span>
                        );
                      }
                      if (d.reason) return <span>Reason: {String(d.reason).slice(0, 80)}</span>;
                      const s = JSON.stringify(d);
                      return s.length > 2 ? s.slice(0, 80) : "—";
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Job Lifecycle Panel (PWS §4) ─────────────────────────────────────
function LifecyclePanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/admin/lifecycle/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || body?.message || "Failed");
      setSummary(body.data);
      toast({ title: "Lifecycle run complete",
        description: `${body.data.closedByDeadline.length + body.data.closedByStaleness.length} closed, ${body.data.nudged.length} nudged` });
    } catch (e: any) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" /> Job Lifecycle
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Nightly at 02:00 IST the system automatically closes jobs past their hiring deadline,
            closes stale jobs without a deadline (older than <code>job.auto_expire_days</code>),
            and nudges owners <code>job.auto_close_nudge_days_before_deadline</code> days before deadlines.
            Trigger it on demand for testing or ops.
          </p>
        </div>
        <Button onClick={runNow} disabled={running}
          className="bg-blue-600 hover:bg-blue-700 text-white">
          {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Clock className="w-4 h-4 mr-1" />}
          Run Lifecycle Now
        </Button>
      </div>

      {summary && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] uppercase text-slate-500 font-semibold">Duration</p>
            <p className="text-lg font-bold text-slate-900">{summary.durationMs} ms</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-[10px] uppercase text-red-700 font-semibold">Closed (deadline)</p>
            <p className="text-lg font-bold text-red-900">{summary.closedByDeadline.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] uppercase text-amber-700 font-semibold">Closed (stale)</p>
            <p className="text-lg font-bold text-amber-900">{summary.closedByStaleness.length}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-[10px] uppercase text-blue-700 font-semibold">Nudged</p>
            <p className="text-lg font-bold text-blue-900">{summary.nudged.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notification Templates Panel (PWS §5) ────────────────────────────
function NotificationTemplatesPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/admin/notification-templates"],
    queryFn: () => fetchJson("/api/v1/admin/notification-templates"),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: async ({ eventKey, recipientRole, title, body, hideEmployerName, enabled }: any) => {
      const r = await fetch(`/api/v1/admin/notification-templates/${encodeURIComponent(eventKey)}/${encodeURIComponent(recipientRole)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, hideEmployerName, enabled }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e?.message || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/notification-templates"] });
      toast({ title: "Template saved", description: "Next event will use the new wording." });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 inline" /></div>;
  const templates: any[] = res?.data ?? [];
  const byEvent = templates.reduce((m: Record<string, any[]>, t: any) => {
    (m[t.eventKey] = m[t.eventKey] || []).push(t);
    return m;
  }, {});

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-amber-600" /> Notification Templates
          <span className="text-xs font-normal text-slate-500 ml-2">
            {templates.length} variants across {Object.keys(byEvent).length} events
          </span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Every pipeline transition fires an event with templates keyed by recipient role.
          Changes take effect immediately — no restart required.
          Candidate-facing messages with <em>Hide employer name</em> on will scrub the employer's company name automatically.
        </p>
      </div>

      {Object.entries(byEvent).sort(([a], [b]) => a.localeCompare(b)).map(([event, rows]) => (
        <div key={event} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <code className="text-xs font-mono font-semibold text-slate-700">{event}</code>
          </div>
          <div className="divide-y divide-slate-100">
            {(rows as any[]).map((t) => (
              <div key={`${t.eventKey}-${t.recipientRole}`} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] capitalize">{t.recipientRole}</Badge>
                    {t.hideEmployerName && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">scrub employer</Badge>}
                    {!t.enabled && <Badge className="text-[10px] bg-slate-100 text-slate-600">disabled</Badge>}
                  </div>
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap line-clamp-2">{t.body}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...t })}>Edit</Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit template</DialogTitle>
              <DialogDescription>
                <code className="text-xs">{editing.eventKey}</code> · for <Badge variant="outline" className="text-[10px] capitalize ml-1">{editing.recipientRole}</Badge>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Title</label>
                <Input value={editing.title} maxLength={200}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Body</label>
                <Textarea value={editing.body} maxLength={2000}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  rows={4} className="mt-1 text-sm" />
                <p className="text-[10px] text-slate-400 mt-1">
                  Use <code>{`{{candidate.fullName}}`}</code>, <code>{`{{job.title}}`}</code>, <code>{`{{agent.agencyName}}`}</code>, <code>{`{{employer.companyName}}`}</code>, <code>{`{{extra.daysLeft}}`}</code> etc.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="scrub" checked={editing.hideEmployerName}
                  onChange={(e) => setEditing({ ...editing, hideEmployerName: e.target.checked })} />
                <label htmlFor="scrub" className="text-xs text-slate-600">Scrub employer company name (candidate-facing negatives)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="enabled" checked={editing.enabled}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                <label htmlFor="enabled" className="text-xs text-slate-600">Enabled (turn off to silence this template)</label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate(editing)} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Admin Reports renderer (v0.4.18) ─────────────────────────────────
// One component per Reports-tab card. Click "View Report" → fetches the
// /api/v1/admin/reports/<endpoint> JSON and renders an appropriate
// visualisation inline (recharts for charts, a plain table for tabular
// data). Before v0.4.18 the Reports tab just toasted "N entries" and
// never showed the data.
type AdminReportKind = "district" | "country" | "funnel" | "agency" | "skill" | "sector";
function AdminReport({ title, desc, endpoint, kind }: { title: string; desc: string; endpoint: string; kind: AdminReportKind }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  // Each report card gets a unique DOM id so the print handler can
  // isolate its content (vs printing the entire admin console).
  const reportId = `admin-report-${endpoint}`;

  const fetchReport = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/reports/${endpoint}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message || "Failed");
      setData(j.data);
      setOpen(true);
    } catch (e: any) {
      toast({ title: "Couldn't load report", description: e?.message ?? "Server error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    try {
      const csv = reportToCsv(kind, data);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `hirestream-${endpoint}-${stamp}.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: filename });
    } catch (e: any) {
      toast({ title: "Couldn't export CSV", description: e?.message ?? "—", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!data) return;
    // Open a new window with just this report rendered in a clean,
    // print-optimised layout and trigger the browser print dialog.
    // Using innerHTML of the existing DOM node is the simplest path —
    // recharts SVGs survive the copy and Chrome prints them fine.
    const node = document.getElementById(reportId);
    if (!node) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups to print this report.", variant: "destructive" });
      return;
    }
    const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — HireStream</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1e293b; padding: 24px 32px; }
        header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: baseline; }
        header h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
        header .sub { font-size: 11px; color: #64748b; }
        header .brand { font-size: 11px; color: #64748b; }
        h4, p.report-desc { display: none; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f1f5f9; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; }
        td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        button { display: none !important; }
        footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print { @page { size: A4 landscape; margin: 12mm; } body { padding: 0; } }
      </style></head>
      <body>
        <header>
          <div>
            <h1>${title}</h1>
            <div class="sub">${desc}</div>
          </div>
          <div class="brand">HireStream · HPSEDC Overseas Placement · ${today}</div>
        </header>
        <main>${node.innerHTML}</main>
        <footer>
          <span>HireStream Admin Report — ${endpoint}</span>
          <span>Government of Himachal Pradesh · HPSEDC</span>
        </footer>
        <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-5 flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">{title}</h4>
          <p className="text-sm text-gray-500 mt-0.5 report-desc">{desc}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {open && data && (
            <>
              <Button size="sm" variant="outline" onClick={handleExportCsv} title="Download CSV of this report's data">
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} title="Open a print-friendly view of this report">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Hide</Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={fetchReport} disabled={loading}>
            {loading
              ? <span className="inline-block animate-pulse">Loading…</span>
              : <><BarChart3 className="w-4 h-4 mr-1" /> {open && data ? "Refresh" : "View Report"}</>}
          </Button>
        </div>
      </div>
      {open && data && (
        <div id={reportId} className="px-5 pb-5 border-t border-slate-100 pt-4">
          <AdminReportBody kind={kind} data={data} />
        </div>
      )}
    </div>
  );
}

// Convert a report's response payload to CSV. Each report shape is
// handled explicitly so we always emit clean, human-readable column
// names rather than the raw API field names.
function reportToCsv(kind: AdminReportKind, data: any): string {
  const esc = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rowsToCsv = (headers: string[], rows: any[][]) => [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");

  if (kind === "district") {
    const rows: any[] = Array.isArray(data) ? data : [];
    return rowsToCsv(["District", "Candidates", "Applications", "Placements"],
      rows.map(r => [r.district, r.candidates, r.applications, r.placements]));
  }
  if (kind === "country") {
    const rows: any[] = Array.isArray(data) ? data : [];
    return rowsToCsv(["Country", "Total Jobs", "Total Applications", "Placements", "Avg Match Score"],
      rows.map(r => [r.country, r.total_jobs, r.total_applications, r.placements, r.avg_match_score ?? ""]));
  }
  if (kind === "funnel") {
    const funnel: any[] = data?.funnel ?? [];
    const summary = data?.summary ?? {};
    const out: string[] = [];
    out.push("Section,Key,Value");
    out.push(`Summary,Registered,${esc(summary.registered ?? 0)}`);
    out.push(`Summary,Applied,${esc(summary.applied ?? 0)}`);
    out.push(`Summary,Placed,${esc(summary.placed ?? 0)}`);
    out.push("");
    out.push("Status,Count");
    funnel.forEach((f: any) => out.push(`${esc(f.status)},${esc(f.count)}`));
    return out.join("\n");
  }
  if (kind === "agency") {
    const rows: any[] = Array.isArray(data) ? data : [];
    return rowsToCsv(["Agency", "Verified", "Rating", "Total Jobs", "Applications", "Selections", "Placements", "Avg Match Score"],
      rows.map(r => [r.agency_name, r.verified ? "Yes" : "No", r.rating ?? "", r.total_jobs, r.total_applications, r.selections, r.placements, r.avg_match_score ?? ""]));
  }
  if (kind === "skill") {
    const demand: any[] = data?.demand ?? [];
    const supply: any[] = data?.supply ?? [];
    const out: string[] = [];
    out.push("Section,Skill,Count");
    demand.forEach((d: any) => out.push(`Demand (jobs),${esc(d.skill)},${esc(d.job_count)}`));
    supply.forEach((s: any) => out.push(`Supply (candidates),${esc(s.skill)},${esc(s.candidate_count)}`));
    return out.join("\n");
  }
  if (kind === "sector") {
    const rows: any[] = Array.isArray(data) ? data : [];
    return rowsToCsv(["Company / Sector", "Total Jobs", "Total Applications", "Placements"],
      rows.map(r => [r.sector, r.total_jobs, r.total_applications, r.placements]));
  }
  return "kind,data\n" + esc(kind) + "," + esc(JSON.stringify(data));
}

function AdminReportBody({ kind, data }: { kind: AdminReportKind; data: any }) {
  // Helper for the chart palette
  const palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

  if (kind === "district") {
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return <p className="text-sm text-gray-500">No district data yet.</p>;
    const top = rows.slice(0, 10);
    return (
      <div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={top}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="district" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="candidates" fill="#3b82f6" name="Candidates" radius={[4, 4, 0, 0]} />
            <Bar dataKey="applications" fill="#10b981" name="Applications" radius={[4, 4, 0, 0]} />
            <Bar dataKey="placements" fill="#f59e0b" name="Placements" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-gray-400 mt-2">{rows.length} district{rows.length === 1 ? "" : "s"} total · showing top 10</p>
      </div>
    );
  }

  if (kind === "country") {
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return <p className="text-sm text-gray-500">No country data yet.</p>;
    return (
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={rows.map((c: any) => ({ name: c.country, value: c.total_jobs }))}
              dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.name}>
              {rows.map((_: any, i: number) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr><th className="text-left py-1.5">Country</th><th className="text-right">Jobs</th><th className="text-right">Apps</th><th className="text-right">Placed</th></tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium text-gray-800">{r.country}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.total_jobs}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.total_applications}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-700 font-semibold">{r.placements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (kind === "funnel") {
    const funnel: any[] = data?.funnel ?? [];
    const summary = data?.summary ?? {};
    if (funnel.length === 0) return <p className="text-sm text-gray-500">No applications yet.</p>;
    const max = Math.max(...funnel.map((f: any) => f.count || 0), 1);
    return (
      <div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[10px] uppercase font-bold text-blue-700">Registered</p>
            <p className="text-2xl font-bold text-blue-900 mt-1 tabular-nums">{summary.registered ?? 0}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-[10px] uppercase font-bold text-amber-700">Applied</p>
            <p className="text-2xl font-bold text-amber-900 mt-1 tabular-nums">{summary.applied ?? 0}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Placed</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{summary.placed ?? 0}</p>
          </div>
        </div>
        <div className="space-y-2">
          {funnel.map((f: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-700 w-40 capitalize">{String(f.status).replace(/_/g, " ")}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3 relative">
                <div className="h-3 rounded-full" style={{ width: `${(f.count / max) * 100}%`, backgroundColor: palette[i % palette.length] }} />
              </div>
              <span className="text-sm font-semibold text-gray-900 w-12 text-right tabular-nums">{f.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "agency") {
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return <p className="text-sm text-gray-500">No agency data yet.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left py-1.5">Agency</th>
              <th className="text-center">Verified</th>
              <th className="text-right">Jobs</th>
              <th className="text-right">Apps</th>
              <th className="text-right">Selected</th>
              <th className="text-right">Placed</th>
              <th className="text-right">Avg match</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 font-medium text-gray-800">{r.agency_name}</td>
                <td className="py-1.5 text-center">{r.verified ? <span className="text-emerald-600">✓</span> : <span className="text-slate-400">—</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{r.total_jobs}</td>
                <td className="py-1.5 text-right tabular-nums">{r.total_applications}</td>
                <td className="py-1.5 text-right tabular-nums">{r.selections}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-emerald-700">{r.placements}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">{r.avg_match_score ?? "—"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (kind === "skill") {
    const demand: any[] = data?.demand ?? [];
    const supply: any[] = data?.supply ?? [];
    if (demand.length === 0 && supply.length === 0) return <p className="text-sm text-gray-500">No skill data yet.</p>;
    return (
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Demand (jobs)</p>
          {demand.length === 0 ? <p className="text-sm text-gray-400">—</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={demand.slice(0, 10)} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="job_count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Supply (candidates)</p>
          {supply.length === 0 ? <p className="text-sm text-gray-400">—</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={supply.slice(0, 10)} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="candidate_count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  }

  if (kind === "sector") {
    const rows: any[] = Array.isArray(data) ? data : [];
    if (rows.length === 0) return <p className="text-sm text-gray-500">No sector data yet.</p>;
    return (
      <ResponsiveContainer width="100%" height={Math.max(200, rows.slice(0, 15).length * 26)}>
        <BarChart data={rows.slice(0, 15)} layout="vertical">
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="sector" width={150} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="total_jobs" fill="#8b5cf6" name="Jobs" radius={[0, 4, 4, 0]} />
          <Bar dataKey="placements" fill="#10b981" name="Placements" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return <pre className="text-xs text-gray-500 overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>;
}
