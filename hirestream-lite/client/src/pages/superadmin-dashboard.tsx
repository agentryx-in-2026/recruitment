import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Shield, ShieldAlert, Users, Settings, Activity, Database, Server,
  UserPlus, UserCog, UserX, UserCheck, Loader2, CheckCircle,
  Search, Filter, LayoutDashboard, Lock, Key, FileText,
  ArrowRight, AlertTriangle, Cpu, Clock, Globe, ChevronDown,
  ToggleLeft, ToggleRight, Terminal, Plug, Sliders, Mail, Phone,
  XCircle, RefreshCw, History, Eye, Send, Power, TrendingUp,
  Zap, Wifi, HardDrive, Briefcase, Award, Calendar
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

const ROLES = [
  { value: "candidate", label: "Job Seeker", color: "bg-blue-100 text-blue-700" },
  { value: "agent", label: "Agency", color: "bg-emerald-100 text-emerald-700" },
  { value: "employer", label: "Employer", color: "bg-purple-100 text-purple-700" },
  { value: "admin", label: "Admin", color: "bg-red-100 text-red-700" },
  { value: "superadmin", label: "Super Admin", color: "bg-amber-100 text-amber-700" },
];

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeView, setActiveView] = useState("overview");
  const handleNav = (item: any) => {
    if (item.external) setLocation(item.external);
    else setActiveView(item.key);
  };

  const { data: statsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/stats"],
    queryFn: () => fetchJson("/api/v1/superadmin/stats"),
  });

  const stats = statsRes?.data || { totalUsers: 0, byRole: {}, active: 0, inactive: 0, uptime: 0, nodeVersion: "", environment: "" };

  if (isLoading) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-5 space-y-5">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      </div>
    );
  }

  const navItems = [
    { key: "overview", label: "Ops Overview", icon: Activity, count: null },
    { key: "system-controls", label: "System Controls", icon: ShieldAlert, count: null, external: "/admin/system-controls" },
    { key: "operator-console", label: "Operator Console", icon: LayoutDashboard, count: null, external: "/admin/operator-console" },
    { key: "signals", label: "Signals", icon: AlertTriangle, count: null },
    { key: "pipeline", label: "Pipeline", icon: TrendingUp, count: null },
    { key: "trends", label: "Trends", icon: Activity, count: null },
    { key: "resources", label: "Resources", icon: Cpu, count: null },
    { key: "syscheck", label: "System Info", icon: Server, count: null },
    { key: "lookup", label: "Lookup", icon: Search, count: null },
    { key: "reports", label: "DB Reports", icon: Database, count: null },
    { key: "sqlsandbox", label: "SQL Sandbox", icon: Terminal, count: null },
    { key: "backups", label: "Backups", icon: HardDrive, count: null },
    { key: "users", label: "User Management", icon: Users, count: stats.totalUsers },
    { key: "flags", label: "Feature Flags", icon: ToggleLeft, count: null },
    { key: "logs", label: "Logs Viewer", icon: Terminal, count: null },
    { key: "integrations", label: "Integrations", icon: Plug, count: null },
    { key: "settings", label: "Settings", icon: Sliders, count: null },
    { key: "roles", label: "Roles & Access", icon: Lock, count: null },
    { key: "system", label: "System Health", icon: Server, count: null },
    { key: "audit", label: "Audit & Security", icon: Shield, count: null },
  ];

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-5">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 rounded-xl shadow-lg p-5 mb-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-40" />
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-md">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
                Super Admin Console
                <Badge className="bg-white/20 text-white border-white/30 text-[10px] uppercase tracking-wider">Restricted</Badge>
              </h2>
              <p className="text-orange-100 text-xs md:text-sm">Full system control — user management, roles, audit, and infrastructure</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-orange-100/90 bg-white/10 rounded-lg px-3 py-1.5">
            <Shield className="w-3.5 h-3.5" />
            Signed in as <span className="font-semibold text-white">{user?.username}</span>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="lg:hidden mb-4">
        <div className="flex gap-1 overflow-x-auto bg-white rounded-xl border border-slate-200 p-1">
          {navItems.map(item => (
            <button key={item.key} onClick={() => handleNav(item)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap font-medium transition-all ${
                activeView === item.key ? "bg-amber-50 text-amber-700" : "text-slate-500"
              }`}>
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-6 xl:gap-7">
        {/* ── SIDEBAR ── */}
        <aside className="hidden lg:flex lg:flex-col gap-4 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pb-4">
          {/* Nav */}
          <nav className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => handleNav(item)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeView === item.key
                    ? "bg-amber-50 text-amber-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.count !== null && item.count > 0 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${
                    activeView === item.key ? "text-amber-600" : "text-slate-400"
                  }`}>{item.count}</span>
                )}
              </button>
            ))}
          </nav>

          {/* System Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">System</p>
            <div className="space-y-2 px-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 flex items-center gap-1"><Cpu className="w-3 h-3" /> Env</span>
                <Badge className="text-[10px] capitalize bg-slate-100 text-slate-700">{stats.environment || "production"}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Uptime</span>
                <span className="font-mono text-slate-700">{formatUptime(stats.uptime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 flex items-center gap-1"><Server className="w-3 h-3" /> Node</span>
                <span className="font-mono text-slate-700 text-[10px]">{stats.nodeVersion}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200/60 p-3 shadow-sm">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-2 px-1">Danger Zone</p>
            <div className="space-y-1.5 text-xs text-amber-900/80 px-1 pb-1">
              <p className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Actions here affect the entire system</p>
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={activeView} variants={scaleIn} initial="initial" animate="animate" exit="exit">
              {activeView === "overview" && <OverviewView stats={stats} setActiveView={setActiveView} />}
              {activeView === "signals" && <SignalsView />}
              {activeView === "pipeline" && <PipelineView />}
              {activeView === "trends" && <TrendsView />}
              {activeView === "resources" && <ResourcesView />}
              {activeView === "syscheck" && <SystemInfoView />}
              {activeView === "lookup" && <LookupView />}
              {activeView === "reports" && <ReportsView />}
              {activeView === "sqlsandbox" && <SqlSandboxView />}
              {activeView === "backups" && <BackupsView />}
              {activeView === "users" && <UsersView setActiveView={setActiveView} />}
              {activeView === "flags" && <FeatureFlagsView />}
              {activeView === "logs" && <LogsView />}
              {activeView === "integrations" && <IntegrationsView />}
              {activeView === "settings" && <SettingsView />}
              {activeView === "roles" && <RolesView stats={stats} />}
              {activeView === "system" && <SystemView stats={stats} />}
              {activeView === "audit" && <AuditView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ── Overview ──
function OverviewView({ stats, setActiveView }: any) {
  // Auto-refresh ops overview every 30 seconds
  const { data: opsRes } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/overview"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/overview"),
    refetchInterval: 30000,
  });
  const ops = opsRes?.data;

  if (!ops) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm text-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading Ops Console...</p>
      </div>
    );
  }

  const healthColor = ops.health.score >= 80 ? "emerald" : ops.health.score >= 50 ? "amber" : "red";

  return (
    <div className="space-y-5">
      {/* Health + Alerts Hero */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-5 flex-wrap">
          {/* Health Score Ring */}
          <div className="relative flex-shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none"
                stroke={healthColor === "emerald" ? "#10b981" : healthColor === "amber" ? "#f59e0b" : "#ef4444"}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - ops.health.score / 100)}`}
                className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold text-${healthColor}-600 tabular-nums`}>{ops.health.score}</span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase">{ops.health.status}</span>
            </div>
          </div>

          {/* Alert Bar */}
          <div className="flex-1 min-w-[300px]">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Ops Console</h2>
              <Badge className={`bg-${healthColor}-100 text-${healthColor}-700 border-0`}>
                {ops.health.status === "healthy" ? "ONLINE" : ops.health.status.toUpperCase()}
              </Badge>
              <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">v{ops.process.app_version}</Badge>
            </div>
            {ops.alerts.total > 0 ? (
              <button onClick={() => setActiveView("signals")}
                className="w-full flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left group">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {ops.alerts.total} alert{ops.alerts.total !== 1 ? "s" : ""} detected
                    {ops.alerts.critical > 0 && <Badge className="ml-2 bg-red-100 text-red-700 border-0 text-[10px]">{ops.alerts.critical} CRITICAL</Badge>}
                    {ops.alerts.warning > 0 && <Badge className="ml-2 bg-amber-200 text-amber-800 border-0 text-[10px]">{ops.alerts.warning} WARNING</Badge>}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">{ops.alerts.top[0]?.title}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-900">All systems healthy — no alerts</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Process / Memory / Version Row */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpsStatCard icon={Server} label="Process" value={ops.process.status?.toUpperCase()} sub={`PID ${ops.process.pid}`} color="emerald" />
        <OpsStatCard icon={Clock} label="Uptime" value={ops.process.uptime_display} sub={`${ops.process.restarts} restart(s)`} color="blue" />
        <OpsStatCard icon={Cpu} label="Node Heap" value={`${ops.memory.heap_used_mb} MB`} sub={`RSS ${ops.memory.rss_mb} MB`} color="purple" />
        <OpsStatCard icon={Zap} label="App Version" value={`v${ops.process.app_version}`} sub={ops.process.node_version} color="amber" />
      </motion.div>

      {/* External Dependencies */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Plug className="w-4 h-4 text-violet-600" /> External Dependencies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(ops.dependencies).map(([key, dep]: any) => {
            const isOk = dep.status === "ok" || dep.status === "configured" || dep.status === "active";
            const isStub = dep.status === "stub";
            const dotColor = isOk ? "bg-emerald-500" : isStub ? "bg-amber-500" : "bg-red-500";
            const Icon = key === "database" ? Database : key === "smtp" ? Mail : key === "sms" ? Phone :
                         key === "sessions" ? Users : key === "storage" ? HardDrive : Shield;
            return (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 truncate">{dep.label}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
                  <span className="text-xs text-slate-500">
                    {dep.latency || dep.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {ops.db_pool && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex gap-4">
            <span>DB Pool — Total: <strong className="text-slate-700">{ops.db_pool.total}</strong></span>
            <span>Idle: <strong className="text-slate-700">{ops.db_pool.idle}</strong></span>
            <span>Waiting: <strong className="text-slate-700">{ops.db_pool.waiting}</strong></span>
          </div>
        )}
      </motion.div>

      {/* User Distribution + Quick Links — preserved from before */}
      <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-blue-600" /> User Distribution by Role
        </h3>
        <div className="space-y-3">
          {ROLES.map(r => {
            const count = stats.byRole?.[r.value] || 0;
            const pct = stats.totalUsers > 0 ? Math.round((count / stats.totalUsers) * 100) : 0;
            return (
              <div key={r.value}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Badge className={`${r.color} text-[11px] border-0`}>{r.label}</Badge>
                    <span className="text-xs text-slate-500">{count} users</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${
                    r.value === "candidate" ? "bg-blue-500" :
                    r.value === "agent" ? "bg-emerald-500" :
                    r.value === "employer" ? "bg-purple-500" :
                    r.value === "admin" ? "bg-red-500" : "bg-amber-500"
                  }`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

function OpsStatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-slate-500">
        <Icon className={`w-4 h-4 text-${color}-500`} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function QuickLink({ icon: Icon, title, desc, onClick }: { icon: React.ElementType; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/30 transition-all text-left group">
      <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}

// ── Users View ──
// audit 2026-07-06 (C16): "View Audit Trail" used to window.open the raw JSON
// API. It now jumps to the in-app Audit tab pre-filtered by that user; this
// module-scoped handoff seeds AuditView's userId filter on its next mount.
let pendingAuditUserId = "";

function UsersView({ setActiveView }: { setActiveView?: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("candidate");  // default to the largest category
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: usersRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/users"],
    queryFn: () => fetchJson("/api/v1/superadmin/users"),
  });

  const users = usersRes?.data || [];
  const filtered = users.filter((u: any) => {
    const matchesSearch = !search ||
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    let matchesRole = false;
    if (roleFilter === "all") matchesRole = true;
    else if (roleFilter === "staff") matchesRole = u.role === "admin" || u.role === "superadmin";
    else matchesRole = u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Counts per category (against the unsearched list — tabs show absolute totals)
  const counts = {
    all: users.length,
    candidate: users.filter((u: any) => u.role === "candidate").length,
    agent: users.filter((u: any) => u.role === "agent").length,
    employer: users.filter((u: any) => u.role === "employer").length,
    staff: users.filter((u: any) => u.role === "admin" || u.role === "superadmin").length,
  };

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch(`/api/v1/superadmin/users/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/stats"] });
      toast({ title: "Role updated" });
    },
    onError: () => toast({ title: "Failed to update role", variant: "destructive" }),
  });

  const activeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/v1/superadmin/users/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_: any, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/stats"] });
      toast({ title: vars.isActive ? "User enabled" : "User disabled" });
    },
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" /> User Management ({filtered.length})
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}
          className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-semibold shadow-md">
          <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Create User
        </Button>
      </div>

      {/* Role tabs — replaces the single dropdown filter */}
      <Tabs value={roleFilter} onValueChange={setRoleFilter} className="mb-4">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="candidate">Candidates ({counts.candidate})</TabsTrigger>
          <TabsTrigger value="agent">Agencies ({counts.agent})</TabsTrigger>
          <TabsTrigger value="employer">Employers ({counts.employer})</TabsTrigger>
          <TabsTrigger value="staff">Staff ({counts.staff})</TabsTrigger>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search (within the selected category) */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by username or email..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-10 rounded-lg" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-amber-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u: any) => {
            const roleInfo = ROLES.find(r => r.value === u.role);
            return (
              <div key={u.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:shadow-sm hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 bg-gradient-to-br ${
                    u.role === "superadmin" ? "from-amber-500 to-orange-600" :
                    u.role === "admin" ? "from-red-500 to-red-600" :
                    u.role === "agent" ? "from-emerald-500 to-emerald-600" :
                    u.role === "employer" ? "from-purple-500 to-purple-600" :
                    "from-blue-500 to-blue-600"
                  }`}>
                    {(u.username || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.username}</p>
                      {u.isActive === false && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500">Disabled</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={`${roleInfo?.color || "bg-slate-100 text-slate-600"} text-[11px] border-0`}>
                    {roleInfo?.label || u.role}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="rounded-lg text-xs h-8">
                        Actions <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem className="text-xs text-slate-500" disabled>Change Role</DropdownMenuItem>
                      {ROLES.filter(r => r.value !== u.role).map(r => (
                        <DropdownMenuItem key={r.value} onClick={() => roleMutation.mutate({ id: u.id, role: r.value })}>
                          <UserCog className="w-3.5 h-3.5 mr-2" /> Set as {r.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      {/* audit 2026-07-06 (C16): open the in-app Audit tab pre-filtered, not the raw JSON API */}
                      <DropdownMenuItem onClick={() => { pendingAuditUserId = u.id; setActiveView?.("audit"); }}>
                        <History className="w-3.5 h-3.5 mr-2" /> View Audit Trail
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {u.isActive !== false ? (
                        <DropdownMenuItem className="text-red-600" onClick={() => activeMutation.mutate({ id: u.id, isActive: false })}>
                          <UserX className="w-3.5 h-3.5 mr-2" /> Disable User
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-emerald-600" onClick={() => activeMutation.mutate({ id: u.id, isActive: true })}>
                          <UserCheck className="w-3.5 h-3.5 mr-2" /> Enable User
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

// ── Create User Dialog ──
function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/stats"] });
      toast({ title: "User created" });
      setUsername(""); setEmail(""); setPassword(""); setRole("admin");
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-600" /> Create New User
          </DialogTitle>
          <DialogDescription>
            Create any user directly — including admins and super admins. Registration form only allows candidate/agent/employer.
          </DialogDescription>
        </DialogHeader>
        {/* audit 2026-07-06 (Batch 3): labels were not associated with their inputs — added htmlFor/id */}
        <div className="space-y-3 mt-2">
          <div>
            <label htmlFor="create-user-username" className="text-xs font-semibold text-slate-600 mb-1 block">Username</label>
            <Input id="create-user-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="demo_admin2" className="rounded-lg" />
          </div>
          <div>
            <label htmlFor="create-user-email" className="text-xs font-semibold text-slate-600 mb-1 block">Email</label>
            <Input id="create-user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@hirestream.dev" className="rounded-lg" />
          </div>
          <div>
            <label htmlFor="create-user-password" className="text-xs font-semibold text-slate-600 mb-1 block">Password</label>
            <Input id="create-user-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 chars, mixed case" className="rounded-lg" />
          </div>
          <div>
            <label htmlFor="create-user-role" className="text-xs font-semibold text-slate-600 mb-1 block">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="create-user-role" className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-3">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-lg">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!username || !email || !password || createMutation.isPending}
              className="flex-1 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create User"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Roles View ──
function RolesView({ stats }: any) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-amber-600" /> Role Matrix & Permissions
        </h3>
        <div className="space-y-3">
          {ROLES.map(r => (
            <div key={r.value} className="border border-slate-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={`${r.color} border-0`}>{r.label}</Badge>
                  <span className="text-xs text-slate-500">{stats.byRole?.[r.value] || 0} users</span>
                </div>
              </div>
              <p className="text-xs text-slate-600">{getRoleDescription(r.value)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {getRoleCapabilities(r.value).map((cap, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] bg-slate-50 text-slate-600">
                    {cap}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getRoleDescription(role: string): string {
  switch (role) {
    case "candidate": return "Job seekers — browse and apply for overseas positions";
    case "agent": return "Licensed recruitment agencies — post jobs and manage drives";
    case "employer": return "Overseas employers — direct hiring and candidate search";
    case "admin": return "HPSEDC government officers — approve agencies, manage grievances, view reports";
    case "superadmin": return "System-level access — user management, role assignment, audit logs, infrastructure";
    default: return "";
  }
}

function getRoleCapabilities(role: string): string[] {
  switch (role) {
    case "candidate": return ["Apply to jobs", "Save jobs", "Upload documents", "Track applications"];
    case "agent": return ["Post jobs", "Create drives", "Search candidates", "Manage applicants"];
    case "employer": return ["Post jobs", "View candidates", "Manage applications"];
    case "admin": return ["Verify agencies", "Approve drives", "Resolve grievances", "View reports"];
    case "superadmin": return ["All Admin", "Create/Edit users", "Change roles", "Enable/Disable users", "System health"];
    default: return [];
  }
}

// ── System View ──
function SystemView({ stats }: any) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-emerald-600" /> System Health
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard icon={Cpu} label="Environment" value={stats.environment || "—"} color="text-blue-600" lightBg="bg-blue-50" />
          <InfoCard icon={Clock} label="Uptime" value={formatUptime(stats.uptime)} color="text-emerald-600" lightBg="bg-emerald-50" />
          <InfoCard icon={Server} label="Node.js" value={stats.nodeVersion || "—"} color="text-purple-600" lightBg="bg-purple-50" />
          <InfoCard icon={Database} label="Database" value="Connected" color="text-amber-600" lightBg="bg-amber-50" />
        </div>
      </div>

      <DataManagementPanel />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">Advanced System Controls</p>
          <p className="text-xs text-amber-700 mt-0.5">Service restart, migrations, and low-level DB operations are CLI-only. Use <code className="bg-white/60 px-1 py-0.5 rounded text-[11px]">npm run db:push</code> for schema changes.</p>
        </div>
      </div>
    </div>
  );
}

// ── Data Management (Reset & Reseed) ──
// v0.4.36: rebuilt with 4 modes. The old version called a stale endpoint
// that silently failed (wrong table names + missing FK-child tables).
type ResetChoice =
  | { kind: "reseed" }
  | { kind: "full" }
  | { kind: "activity" }
  | { kind: "selective"; classes: string[] };

function DataManagementPanel() {
  const [pending, setPending] = useState<ResetChoice | null>(null);  // which action is awaiting confirm
  const [selected, setSelected] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: optionsRes } = useQuery({
    queryKey: ["/api/v1/superadmin/reset/options"],
    queryFn: () => fetchJson("/api/v1/superadmin/reset/options"),
  });
  const classes: { key: string; label: string; note: string }[] = optionsRes?.data || [];

  const run = useMutation({
    mutationFn: async (choice: ResetChoice) => {
      if (choice.kind === "reseed") {
        const res = await fetch("/api/v1/superadmin/reseed", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "RESEED_HIRESTREAM" }),
        });
        if (!res.ok) throw new Error((await res.json()).message || "Reseed failed");
        return { type: "reseed", data: await res.json() };
      }
      const body: any = { confirmation: "RESET_HIRESTREAM", mode: choice.kind };
      if (choice.kind === "selective") body.classes = choice.classes;
      const res = await fetch("/api/v1/superadmin/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Reset failed");
      return { type: choice.kind, data: await res.json() };
    },
    onSuccess: (result) => {
      setLastResult(result);
      queryClient.invalidateQueries();
      toast({ title: "Done", description: result.data?.message || "Completed" });
      setPending(null);
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const cardBtn = "w-full rounded-lg text-xs font-semibold";

  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border-2 border-red-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-red-900 flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-red-600" /> Danger Zone — Data Management
      </h3>
      <p className="text-xs text-red-700/80 mb-4">Testing utilities — destructive, FK-safe wipes. Super Admin login + system config (settings, integrations, templates) are always preserved.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Full + Reseed */}
        <ResetCard
          icon={UserPlus} tone="orange"
          title="Full wipe + reseed"
          desc="Clear everything, then load the demo dataset (candidates, agencies, employers, jobs, applications)."
          actionLabel="Wipe + Reseed"
          confirmLabel="Confirm — wipe & reseed"
          armed={pending?.kind === "reseed"}
          onArm={() => setPending({ kind: "reseed" })}
          onCancel={() => setPending(null)}
          onConfirm={() => run.mutate({ kind: "reseed" })}
          busy={run.isPending}
        />

        {/* Full empty */}
        <ResetCard
          icon={Database} tone="red"
          title="Full wipe (empty)"
          desc="Clear ALL data to a blank portal. No demo data — for testing onboarding from zero."
          actionLabel="Wipe to empty"
          confirmLabel="Confirm — wipe to empty"
          armed={pending?.kind === "full"}
          onArm={() => setPending({ kind: "full" })}
          onCancel={() => setPending(null)}
          onConfirm={() => run.mutate({ kind: "full" })}
          busy={run.isPending}
        />

        {/* Activity only */}
        <ResetCard
          icon={Database} tone="amber"
          title="Activity-only reset"
          desc="Clear applications, interviews, placements, notifications, drives & grievances. Keep users, candidates, agencies, employers, jobs."
          actionLabel="Clear activity"
          confirmLabel="Confirm — clear activity"
          armed={pending?.kind === "activity"}
          onArm={() => setPending({ kind: "activity" })}
          onCancel={() => setPending(null)}
          onConfirm={() => run.mutate({ kind: "activity" })}
          busy={run.isPending}
        />
      </div>

      {/* Selective */}
      <div className="mt-3 bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Database className="w-4 h-4" /></div>
          <div>
            <p className="text-sm font-bold text-slate-900">Per-entity selective</p>
            <p className="text-[11px] text-slate-500">Pick exactly which data classes to wipe. Each cascades to its dependents (e.g. Candidates also clears their applications & interviews).</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          {classes.map((c) => {
            const on = selected.includes(c.key);
            return (
              <button key={c.key} type="button"
                onClick={() => setSelected(on ? selected.filter((x) => x !== c.key) : [...selected, c.key])}
                className={`text-left p-2 rounded-lg border text-[11px] transition ${
                  on ? "bg-red-50 border-red-300 text-red-800" : "bg-white border-slate-200 hover:border-slate-300 text-slate-600"
                }`}>
                <span className="font-semibold flex items-center gap-1">
                  {on && <span className="text-red-500">✓</span>}{c.label}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{c.note}</span>
              </button>
            );
          })}
        </div>
        {pending?.kind !== "selective" ? (
          <Button size="sm" variant="outline" disabled={selected.length === 0}
            className="rounded-lg text-red-600 border-red-200 hover:bg-red-50 text-xs"
            onClick={() => setPending({ kind: "selective", classes: selected })}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Wipe {selected.length} selected class{selected.length === 1 ? "" : "es"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-red-700 font-semibold flex-1">Confirm wipe of: {selected.join(", ")}</p>
            <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => setPending(null)}>Cancel</Button>
            <Button size="sm" className="rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs"
              onClick={() => run.mutate({ kind: "selective", classes: selected })} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm wipe"}
            </Button>
          </div>
        )}
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="mt-4 bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-emerald-400 font-bold">{String(lastResult.type).toUpperCase()} · Success</span>
            {/* audit 2026-07-06 (Batch 3): icon-only dismiss needed an aria-label (superadmin-only, English) */}
            <button onClick={() => setLastResult(null)} aria-label="Dismiss result" className="text-slate-400 hover:text-white">✕</button>
          </div>
          <pre className="whitespace-pre-wrap break-words overflow-auto max-h-48">{JSON.stringify(lastResult.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ResetCard({ icon: Icon, tone, title, desc, actionLabel, confirmLabel, armed, onArm, onCancel, onConfirm, busy }: any) {
  const tones: any = {
    red: { bg: "bg-red-100", text: "text-red-600", btn: "bg-red-600 hover:bg-red-700", border: "border-red-200", outline: "text-red-600 border-red-200 hover:bg-red-50" },
    orange: { bg: "bg-orange-100", text: "text-orange-600", btn: "bg-orange-600 hover:bg-orange-700", border: "border-orange-200", outline: "text-orange-600 border-orange-200 hover:bg-orange-50" },
    amber: { bg: "bg-amber-100", text: "text-amber-600", btn: "bg-amber-600 hover:bg-amber-700", border: "border-amber-200", outline: "text-amber-700 border-amber-200 hover:bg-amber-50" },
  };
  const t = tones[tone];
  return (
    <div className={`bg-white rounded-lg border ${t.border} p-4 flex flex-col`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-9 h-9 rounded-lg ${t.bg} ${t.text} flex items-center justify-center flex-shrink-0`}><Icon className="w-4 h-4" /></div>
        <p className="text-sm font-bold text-slate-900">{title}</p>
      </div>
      <p className="text-[11px] text-slate-500 mb-3 flex-1">{desc}</p>
      {!armed ? (
        <Button size="sm" variant="outline" className={`w-full rounded-lg text-xs ${t.outline}`} onClick={onArm}>
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> {actionLabel}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-700 font-semibold">Cannot be undone.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 rounded-lg text-xs" onClick={onCancel}>Cancel</Button>
            <Button size="sm" className={`flex-1 rounded-lg text-white text-xs ${t.btn}`} onClick={onConfirm} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, color, lightBg }: any) {
  return (
    <div className="p-4 rounded-xl border border-slate-100 bg-white">
      <div className={`w-9 h-9 rounded-lg ${lightBg} ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}

// ── Audit View ──
function AuditView() {
  // audit 2026-07-06 (C16): seed the user filter when arriving via "View Audit Trail"
  const [userId, setUserId] = useState(() => { const seed = pendingAuditUserId; pendingAuditUserId = ""; return seed; });
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");

  const { data: auditRes, isLoading, refetch } = useQuery({
    queryKey: ["/api/v1/superadmin/audit", userId, action, resourceType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (action) params.set("action", action);
      if (resourceType) params.set("resourceType", resourceType);
      return fetchJson(`/api/v1/superadmin/audit?${params}`);
    },
  });

  const logs = auditRes?.data || [];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-600" /> Audit & Security Log ({logs.length})
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="rounded-lg gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          <Input placeholder="Filter by User ID" value={userId} onChange={e => setUserId(e.target.value)} className="rounded-lg text-sm" />
          <Select value={action || "all"} onValueChange={v => setAction(v === "all" ? "" : v)}>
            <SelectTrigger className="rounded-lg"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={resourceType || "all"} onValueChange={v => setResourceType(v === "all" ? "" : v)}>
            <SelectTrigger className="rounded-lg"><SelectValue placeholder="Resource Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              <SelectItem value="superadmin">Super Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="job">Job</SelectItem>
              <SelectItem value="application">Application</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-amber-600" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No audit entries matching filters</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {logs.map((l: any) => (
              <div key={l.id} className="p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge className={`text-[10px] ${
                      l.action === "create" ? "bg-emerald-100 text-emerald-700" :
                      l.action === "delete" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{l.action?.toUpperCase()}</Badge>
                    <Badge variant="outline" className="text-[10px]">{l.resourceType}</Badge>
                    <span className="text-[11px] font-mono text-slate-500 truncate">{l.userId?.slice(0, 8)}</span>
                    {l.ipAddress && <span className="text-[11px] text-slate-400">· {l.ipAddress}</span>}
                  </div>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "—"}
                  </span>
                </div>
                {l.details && (
                  <pre className="text-[11px] text-slate-500 mt-2 bg-slate-50 rounded px-2 py-1.5 overflow-x-auto font-mono">
                    {typeof l.details === "string" ? l.details : JSON.stringify(l.details, null, 0).slice(0, 200)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feature Flags View ──
function FeatureFlagsView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: flagsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/flags"],
    queryFn: () => fetchJson("/api/v1/superadmin/flags"),
  });

  const flags = flagsRes?.data || [];
  const featureFlags = flags.filter((f: any) => f.category === "feature_flag");
  // v0.4.35.2: `system.controls` is also category=maintenance but its value
  // is a config OBJECT (pipeline pauses), managed on the System Controls
  // surface — not a maintenance message. Rendering it here as a React child
  // crashed the page with error #31. Exclude it + only keep the two intended
  // maintenance keys (mode toggle + message string).
  const maintenanceSettings = flags.filter((f: any) =>
    f.category === "maintenance" && f.key !== "system.controls"
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const res = await fetch(`/api/v1/superadmin/flags/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/flags"] });
      toast({ title: "Flag updated" });
    },
    onError: () => toast({ title: "Failed to update flag", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      {/* Feature Flags */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <ToggleLeft className="w-4 h-4 text-blue-600" /> Feature Flags
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {featureFlags.map((flag: any) => (
              <div key={flag.key} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{flag.key.replace("feature.", "").replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{flag.description}</p>
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ key: flag.key, value: !flag.value })}
                  disabled={toggleMutation.isPending}
                  className="flex-shrink-0 transition-all hover:scale-105"
                >
                  {flag.value ? (
                    <ToggleRight className="w-10 h-10 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-slate-300" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance Mode */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border-2 border-red-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-red-900 flex items-center gap-2 mb-3">
          <Power className="w-4 h-4" /> Maintenance Mode
        </h3>
        <p className="text-xs text-red-700/80 mb-4">
          When enabled, all non-superadmin API requests return 503. Super admins continue to have full access so you can toggle off.
        </p>
        {maintenanceSettings.map((flag: any) => (
          <div key={flag.key} className="mb-3 last:mb-0">
            {flag.key === "system.maintenance_mode" ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-red-200">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Maintenance Mode</p>
                  <p className="text-xs text-slate-500">{flag.value ? "🔴 ACTIVE — portal locked" : "🟢 Off — portal accessible"}</p>
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ key: flag.key, value: !flag.value })}
                  disabled={toggleMutation.isPending}
                  className="transition-all hover:scale-105"
                >
                  {flag.value ? (
                    <ToggleRight className="w-10 h-10 text-red-500" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-slate-300" />
                  )}
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white border border-red-200">
                <p className="text-xs font-semibold text-slate-700 mb-1">Maintenance Message</p>
                {/* Guard: never render a raw object as a React child (error #31). */}
                <p className="text-sm text-slate-600 italic">"{typeof flag.value === "string" ? flag.value : JSON.stringify(flag.value)}"</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Logs Viewer ──
function LogsView() {
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: logsRes, isLoading, refetch } = useQuery({
    queryKey: ["/api/v1/superadmin/logs", level, searchDebounced],
    queryFn: () => {
      const params = new URLSearchParams();
      if (level !== "all") params.set("level", level);
      if (searchDebounced) params.set("search", searchDebounced);
      params.set("limit", "300");
      return fetchJson(`/api/v1/superadmin/logs?${params}`);
    },
    refetchInterval: false,
  });

  const logs = logsRes?.data || [];
  const levelColors: Record<string, string> = {
    error: "text-red-500 bg-red-50",
    warn: "text-amber-600 bg-amber-50",
    info: "text-blue-500 bg-blue-50",
    debug: "text-slate-400 bg-slate-50",
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-600" /> Application Logs ({logs.length})
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="rounded-lg gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search in logs (message, path, userId)..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-10 rounded-lg" />
          </div>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Terminal className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No log entries match filters</p>
            {logsRes?.message && <p className="text-xs mt-2 italic">{logsRes.message}</p>}
          </div>
        ) : (
          <div className="font-mono text-[11px] bg-slate-950 text-slate-100 rounded-lg p-3 max-h-[600px] overflow-y-auto">
            {logs.map((l: any, i: number) => (
              <div key={i} className="py-1 border-b border-slate-800 last:border-0">
                <div className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold flex-shrink-0 ${levelColors[l.level] || "text-slate-400 bg-slate-800"}`}>
                    {l.level}
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">
                    {l.timestamp ? new Date(l.timestamp).toLocaleTimeString("en-IN") : "—"}
                  </span>
                  <span className="text-slate-200 break-all">{l.message}</span>
                </div>
                {(l.method || l.path) && (
                  <div className="ml-2 text-slate-400 text-[10px]">
                    {l.method} {l.path} {l.statusCode && `→ ${l.statusCode}`} {l.duration && `(${l.duration}ms)`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Integrations View ──
function IntegrationsView() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");

  const { data: intRes, isLoading, refetch } = useQuery({
    queryKey: ["/api/v1/superadmin/integrations"],
    queryFn: () => fetchJson("/api/v1/superadmin/integrations"),
  });

  const integrations = intRes?.data || [];

  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/superadmin/integrations/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: (data) => toast({ title: "Test email sent", description: data.message }),
    onError: (err: any) => toast({ title: "SMTP test failed", description: err.message, variant: "destructive" }),
  });

  const iconFor = (key: string) => {
    switch (key) {
      case "smtp": return Mail;
      case "sms": return Phone;
      case "aadhaar": return Shield;
      case "him_access": return Key;
      case "captcha": return Lock;
      case "database": return Database;
      default: return Plug;
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plug className="w-4 h-4 text-violet-600" /> External Integrations
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="rounded-lg gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {integrations.map((int: any) => {
              const Icon = iconFor(int.key);
              const statusColor = int.status === "configured" || int.status === "connected"
                ? "emerald" : int.status === "stub" ? "amber" : "slate";
              return (
                <div key={int.key} className="p-4 rounded-xl border border-slate-200 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-${statusColor}-100 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 text-${statusColor}-600`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{int.name}</p>
                        <Badge className={`text-[10px] bg-${statusColor}-100 text-${statusColor}-700 border-0`}>
                          {int.status === "configured" || int.status === "connected" ? "✓ " : ""}
                          {int.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{int.description}</p>
                      {int.host && <p className="text-[11px] text-slate-400 mt-1 font-mono">{int.host}{int.port ? `:${int.port}` : ""}</p>}
                    </div>
                  </div>

                  {/* SMTP test action */}
                  {int.key === "smtp" && int.configured && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                      <Input placeholder="test@example.com" value={testEmail}
                        onChange={e => setTestEmail(e.target.value)} className="h-9 rounded-lg text-xs" />
                      <Button size="sm" onClick={() => testSmtpMutation.mutate()} disabled={!testEmail || testSmtpMutation.isPending}
                        className="h-9 rounded-lg text-xs bg-blue-600 text-white gap-1.5">
                        {testSmtpMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Test
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-1">
        <p><Badge className="bg-emerald-100 text-emerald-700 border-0 mr-1.5 text-[10px]">configured</Badge> Integration has real credentials and is wired up.</p>
        <p><Badge className="bg-amber-100 text-amber-700 border-0 mr-1.5 text-[10px]">stub</Badge> Endpoint exists but returns placeholder response until creds provisioned.</p>
        <p><Badge className="bg-slate-100 text-slate-700 border-0 mr-1.5 text-[10px]">not_configured</Badge> Missing env vars. Feature unavailable.</p>
      </div>
    </div>
  );
}

// ── Settings View ──
function SettingsView() {
  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/settings"],
    queryFn: () => fetchJson("/api/v1/superadmin/settings"),
  });

  const groups = settingsRes?.data || [];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Sliders className="w-4 h-4 text-indigo-600" /> System Settings (Read-Only Snapshot)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Secret values are redacted. To modify, update <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">.env</code> and restart the server.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
        ) : (
          <div className="space-y-4">
            {groups.map((group: any) => (
              <div key={group.group}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{group.group}</p>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {group.items.map((item: any) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50">
                      <span className="text-xs font-mono text-slate-600">{item.key}</span>
                      <span className="text-xs font-mono text-slate-900 text-right break-all">{item.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ──
function StatCard({ icon: Icon, color, lightBg, value, label, subtitle, onClick }: any) {
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

// ── Helpers ──
function formatUptime(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─────────────────────────────────────────────────────────────────────
// ── OPS CONSOLE VIEWS (v1.2.2 — Homestay-style expansion) ───────────
// ─────────────────────────────────────────────────────────────────────

// ── Signals View ──
function SignalsView() {
  const { data: sigRes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/signals"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/signals"),
    refetchInterval: 60000,
  });

  const signals = sigRes?.data || [];
  const summary = sigRes?.summary || { total: 0, critical: 0, warning: 0, info: 0 };

  const sevColor: any = {
    critical: { bg: "bg-red-50", border: "border-red-300", badge: "bg-red-100 text-red-700", icon: "text-red-600" },
    warning: { bg: "bg-amber-50", border: "border-amber-300", badge: "bg-amber-100 text-amber-700", icon: "text-amber-600" },
    info: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", icon: "text-blue-500" },
  };
  const catIcons: any = {
    pipeline: TrendingUp, verification: UserCheck, approval: CheckCircle, grievance: AlertTriangle,
    system: Server, security: Shield, integration: Plug, engagement: Users,
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Smart Signals ({summary.total})
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="rounded-lg gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600 tabular-nums">{summary.critical}</p>
            <p className="text-[11px] text-red-700 font-semibold uppercase">Critical</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{summary.warning}</p>
            <p className="text-[11px] text-amber-700 font-semibold uppercase">Warning</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600 tabular-nums">{summary.info}</p>
            <p className="text-[11px] text-blue-700 font-semibold uppercase">Info</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-amber-600" /></div>
        ) : signals.length === 0 ? (
          <div className="text-center py-12 bg-emerald-50 rounded-xl border border-emerald-200">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-800">All clear — no signals firing</p>
            <p className="text-xs text-emerald-600 mt-1">System is operating normally</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((s: any) => {
              const c = sevColor[s.severity] || sevColor.info;
              const CatIcon = catIcons[s.category] || AlertTriangle;
              return (
                <div key={s.id} className={`flex items-start gap-3 p-3 rounded-lg border ${c.bg} ${c.border}`}>
                  <CatIcon className={`w-5 h-5 ${c.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                      <Badge className={`${c.badge} text-[10px] border-0 uppercase`}>{s.severity}</Badge>
                      <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-4 text-center">Auto-refreshes every 60 seconds. 16 conditions monitored.</p>
      </div>
    </div>
  );
}

// ── Pipeline View ──
function PipelineView() {
  const { data: pipeRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/pipeline"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/pipeline"),
    refetchInterval: 60000,
  });

  const stages = pipeRes?.data?.stages || [];
  const bottleneck = pipeRes?.data?.bottleneck;

  const stageColors = ["from-blue-500", "from-indigo-500", "from-violet-500", "from-purple-500",
                       "from-pink-500", "from-rose-500", "from-emerald-500"];

  const maxCount = Math.max(...stages.map((s: any) => s.count), 1);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-600" /> Placement Pipeline Health
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
            <div className="space-y-3">
              {stages.map((s: any, i: number) => {
                const widthPct = (s.count / maxCount) * 100;
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                        {s.conversion !== null && i > 0 && (
                          <Badge className={`text-[10px] border-0 ${
                            s.conversion >= 50 ? "bg-emerald-100 text-emerald-700" :
                            s.conversion >= 20 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {s.conversion}% conversion
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{s.count.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${stageColors[i]} to-${stageColors[i].split("-")[1]}-600 rounded-full transition-all duration-700`}
                        style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {bottleneck && (
              <div className="mt-5 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Bottleneck detected</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Biggest drop is from <strong>{bottleneck.from}</strong> → <strong>{bottleneck.to}</strong>:
                    lost {bottleneck.dropped} candidate(s) ({bottleneck.retention}% retention).
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Lookup View ──
function LookupView() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/lookup", debounced],
    queryFn: () => fetchJson(`/api/v1/superadmin/ops/lookup?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const data = results?.data || { users: [], candidates: [], agencies: [], jobs: [] };
  const totalFound = (data.users?.length || 0) + (data.candidates?.length || 0) + (data.agencies?.length || 0) + (data.jobs?.length || 0);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-blue-600" /> Cross-Entity Lookup
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Search across users, candidates, agencies, and jobs. Min 2 characters.
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type a name, email, agency, license, job title..."
            className="pl-10 h-11 rounded-lg" autoFocus />
        </div>

        {q.length < 2 ? (
          <div className="text-center py-12 text-slate-400">
            <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Start typing to search</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
        ) : totalFound === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">No matches for "{debounced}"</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.users.length > 0 && (
              <LookupGroup title="Users" icon={Users} items={data.users.map((u: any) => ({
                primary: u.username,
                secondary: u.email,
                meta: u.role,
                id: u.id,
              }))} />
            )}
            {data.candidates.length > 0 && (
              <LookupGroup title="Candidates" icon={UserCheck} items={data.candidates.map((c: any) => ({
                primary: c.fullName,
                secondary: c.email,
                meta: c.location || "—",
                id: c.id,
              }))} />
            )}
            {data.agencies.length > 0 && (
              <LookupGroup title="Agencies" icon={Briefcase} items={data.agencies.map((a: any) => ({
                primary: a.agencyName,
                secondary: a.licenseNumber,
                meta: a.verified ? "Verified" : "Pending",
                id: a.id,
              }))} />
            )}
            {data.jobs.length > 0 && (
              <LookupGroup title="Jobs" icon={Briefcase} items={data.jobs.map((j: any) => ({
                primary: j.title,
                secondary: j.company,
                meta: `${j.country} · ${j.status}`,
                id: j.id,
              }))} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LookupGroup({ title, icon: Icon, items }: any) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title} ({items.length})
      </p>
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
        {items.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{item.primary}</p>
              <p className="text-xs text-slate-500 truncate">{item.secondary}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="outline" className="text-[10px]">{item.meta}</Badge>
              <span className="text-[10px] text-slate-400 font-mono">{item.id?.slice(0, 8)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DB Reports View ──
function ReportsView() {
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const { data: reportsListRes } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/reports"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/reports"),
  });
  const reports = reportsListRes?.data || [];

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/reports", activeReport],
    queryFn: () => fetchJson(`/api/v1/superadmin/ops/reports/${activeReport}`),
    enabled: !!activeReport,
  });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-purple-600" /> Pre-Built DB Reports ({reports.length})
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Read-only queries computed live from the database. SQL sandbox for custom queries is planned for v1.3.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {reports.map((r: any) => (
            <button key={r.key}
              onClick={() => setActiveReport(r.key)}
              className={`text-left p-4 rounded-xl border transition-all ${
                activeReport === r.key
                  ? "border-purple-300 bg-purple-50 shadow-sm"
                  : "border-slate-200 hover:border-purple-200 hover:bg-slate-50"
              }`}>
              <p className="text-sm font-semibold text-slate-900">{r.name}</p>
              <p className="text-xs text-slate-500 mt-1">{r.description}</p>
            </button>
          ))}
        </div>

        {/* Result Panel */}
        {activeReport && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">
                {reportData?.report?.name || "Loading..."}
              </p>
              <Badge variant="outline" className="text-xs">{reportData?.rowCount ?? "—"} rows</Badge>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              {reportLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>
              ) : reportData?.data && reportData.data.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      {Object.keys(reportData.data[0]).map(col => (
                        <th key={col} className="px-3 py-2 text-left font-semibold uppercase tracking-wide">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.data.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {Object.values(row).map((val: any, j) => (
                          <td key={j} className="px-3 py-2 font-mono text-slate-700">
                            {val === null ? "—" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">No data</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ── v1.3 OPS CONSOLE — CPU/RAM/DISK, SYSTEM, SQL SANDBOX, BACKUPS, TRENDS
// ─────────────────────────────────────────────────────────────────────

// ── Radial gauge dial for a resource (CPU / RAM / Storage) ──
function ResourceDial({ label, pct, center, sub }: { label: string; pct: number; center: string; sub: string }) {
  const R = 46, C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = v >= 90 ? "#ef4444" : v >= 75 ? "#f59e0b" : "#10b981";
  const tint = v >= 90 ? "text-red-600" : v >= 75 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex flex-col items-center p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle cx="55" cy="55" r={R} fill="none" stroke="#f1f5f9" strokeWidth="9" />
          <circle cx="55" cy="55" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)}
            style={{ transition: "stroke-dashoffset .6s ease, stroke .3s" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-extrabold tabular-nums ${tint}`}>{center}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 text-center leading-tight">{sub}</p>
    </div>
  );
}

// ── Resources View — CPU/RAM/Disk with sparklines ──
function ResourcesView() {
  const { data: resRes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/resources"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/resources"),
    refetchInterval: 5000,
  });

  const r = resRes?.data;
  // Primary storage volume for the Storage dial (root mount, else largest).
  const pd = r?.disk?.find((d: any) => d.mount === "/") || r?.disk?.[0] || { used_pct: 0, used_gb: 0, size_gb: 0, mount: "—" };
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-600" /> System Resources
          </h3>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="rounded-lg gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {isLoading || !r ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ResourceDial label="CPU Load" pct={r.cpu.currentLoad} center={`${r.cpu.currentLoad}%`}
                sub={`${r.cpu.cores} cores (${r.cpu.physicalCores} physical) · load avg ${r.cpu.loadAvg}`} />
              <ResourceDial label="Memory" pct={r.memory.used_pct} center={`${r.memory.used_pct}%`}
                sub={`${r.memory.used_gb} / ${r.memory.total_gb} GB · swap ${r.memory.swap_used_gb}/${r.memory.swap_total_gb} GB`} />
              <ResourceDial label="Storage" pct={pd.used_pct} center={`${pd.used_pct}%`}
                sub={`${pd.used_gb} / ${pd.size_gb} GB · ${pd.mount}`} />
            </div>

            {r.history && r.history.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 mb-2">CPU Load (last {r.history.length} samples)</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={r.history}>
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="ts" hide />
                      <YAxis domain={[0, 100]} hide />
                      <RTooltip formatter={(v: any) => [`${v}%`, "CPU"]} labelFormatter={(ts: any) => formatTime(ts)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fill="url(#cpuGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 mb-2">Memory Used (last {r.history.length} samples)</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={r.history}>
                      <defs>
                        <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="ts" hide />
                      <YAxis domain={[0, 100]} hide />
                      <RTooltip formatter={(v: any) => [`${v}%`, "Memory"]} labelFormatter={(ts: any) => formatTime(ts)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="mem" stroke="#10b981" strokeWidth={2} fill="url(#memGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" /> Disk Mounts
              </p>
              <div className="space-y-2">
                {r.disk.map((d: any) => (
                  <div key={d.mount}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono text-slate-600">{d.mount}</span>
                      <span className="text-slate-700 font-semibold">{d.used_gb} / {d.size_gb} GB ({d.used_pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${d.used_pct > 90 ? "bg-red-500" : d.used_pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${d.used_pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-200 pt-3">
              {r.os.distro} {r.os.release} · {r.os.hostname} · uptime {Math.floor(r.os.uptime_sec / 86400)}d {Math.floor((r.os.uptime_sec % 86400) / 3600)}h
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── System Info View ──
function SystemInfoView() {
  const { data: sysRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/system"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/system"),
    refetchInterval: 30000,
  });
  const s = sysRes?.data;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-purple-600" /> System Info
        </h3>

        {isLoading || !s ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <p className="text-xs text-slate-500 font-semibold uppercase">All Processes</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{s.process_summary.all}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-xs text-emerald-600 font-semibold uppercase">Running</p>
                <p className="text-xl font-bold text-emerald-700 tabular-nums">{s.process_summary.running}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                <p className="text-xs text-amber-600 font-semibold uppercase">Sleeping</p>
                <p className="text-xl font-bold text-amber-700 tabular-nums">{s.process_summary.sleeping}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                <p className="text-xs text-blue-600 font-semibold uppercase">TCP Connections</p>
                <p className="text-xl font-bold text-blue-700 tabular-nums">{s.established_connections}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Top 10 by CPU</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-1.5 text-left">PID</th>
                      <th className="px-3 py-1.5 text-left">Name</th>
                      <th className="px-3 py-1.5 text-right">CPU%</th>
                      <th className="px-3 py-1.5 text-right">Mem%</th>
                      <th className="px-3 py-1.5 text-left">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.top_by_cpu.map((p: any) => (
                      <tr key={`cpu-${p.pid}`} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono text-slate-600">{p.pid}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-900">{p.name}</td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums">{p.cpu}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{p.mem}</td>
                        <td className="px-3 py-1.5 text-slate-500">{p.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Listening Ports ({s.listening_ports.length})</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Proto</th>
                      <th className="px-3 py-1.5 text-left">Address</th>
                      <th className="px-3 py-1.5 text-right">Port</th>
                      <th className="px-3 py-1.5 text-left">Process</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.listening_ports.map((p: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono text-slate-600">{p.protocol}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-700">{p.local_address}</td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums">{p.local_port}</td>
                        <td className="px-3 py-1.5 text-slate-500 truncate">{p.process || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SQL Sandbox View ──
function SqlSandboxView() {
  const [query, setQuery] = useState("SELECT username, role FROM users LIMIT 10");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const sampleQueries = [
    { name: "Recent users", q: "SELECT id, username, email, role FROM users ORDER BY last_login_at DESC NULLS LAST LIMIT 20" },
    { name: "Top jobs by skills", q: "SELECT title, company, array_length(skills, 1) AS skill_count FROM jobs WHERE skills IS NOT NULL ORDER BY skill_count DESC LIMIT 10" },
    { name: "App status counts", q: "SELECT status, COUNT(*)::int FROM applications GROUP BY status ORDER BY count DESC" },
    { name: "Verified agencies", q: "SELECT agency_name, license_number, placements, rating FROM recruitment_agents WHERE verified = true" },
    { name: "Schema tables", q: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name" },
  ];

  const runQuery = async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/v1/superadmin/ops/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        toast({ title: `${data.rowCount} rows`, description: `${data.elapsed_ms}ms${data.truncated ? " (truncated to 500)" : ""}` });
      } else {
        setError(data.message);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Terminal className="w-4 h-4 text-purple-600" /> SQL Sandbox (read-only)
        </h3>

        <div className="flex gap-2 flex-wrap mb-3">
          {sampleQueries.map(s => (
            <button key={s.name} onClick={() => setQuery(s.q)}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-700 transition-colors">
              {s.name}
            </button>
          ))}
        </div>

        <textarea value={query} onChange={e => setQuery(e.target.value)}
          rows={6}
          className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-slate-950 text-slate-100"
          placeholder="SELECT * FROM users LIMIT 10" />

        <div className="flex items-center justify-between mt-3">
          <p className="text-[11px] text-slate-500">
            ⚠️ SELECT, WITH, EXPLAIN only · 5s timeout · 30 queries / 5min · max 500 rows
          </p>
          <Button size="sm" onClick={runQuery} disabled={running}
            className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Execute
          </Button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-mono">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 flex items-center justify-between border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700">{result.rowCount} rows · {result.elapsed_ms}ms</span>
              {result.truncated && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Truncated to 500</Badge>}
            </div>
            <div className="overflow-x-auto max-h-96">
              {result.data.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      {Object.keys(result.data[0]).map(c => (
                        <th key={c} className="px-3 py-1.5 text-left font-bold text-slate-700 uppercase tracking-wide">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.data.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {Object.values(row).map((v: any, j) => (
                          <td key={j} className="px-3 py-1.5 font-mono text-slate-700">
                            {v === null ? <span className="text-slate-400 italic">NULL</span> :
                              typeof v === "object" ? JSON.stringify(v) : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">No rows returned</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Process Restart Button (used inside System Info / Backups) ──
function ProcessRestartButton() {
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { toast } = useToast();

  const restart = async () => {
    setRestarting(true);
    try {
      const res = await fetch("/api/v1/superadmin/ops/process/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESTART_PROCESS" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Restart scheduled", description: data.message });
        setTimeout(() => window.location.reload(), 5000);
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
        setRestarting(false);
      }
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
      setRestarting(false);
    }
  };

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}
        className="rounded-lg gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
        <Power className="w-3.5 h-3.5" /> Restart Process
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-red-600">Confirm restart? Brief downtime.</span>
      <Button size="sm" onClick={restart} disabled={restarting}
        className="rounded-lg bg-red-600 text-white text-xs">
        {restarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Restart"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)} className="rounded-lg text-xs">
        Cancel
      </Button>
    </div>
  );
}

// ── Backups View ──
// Full-system snapshots: HireStream DB + Verify DB + uploads from both apps
// bundled into one tar.gz per snapshot. Manual creates plus scheduled auto
// backups with admin-configurable retention. Backend logic in
// server/services/backup.service.ts.
function BackupsView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: bkRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/backups"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/backups"),
    refetchInterval: 30_000, // pick up the auto-scheduler's runs without manual refresh
  });

  const createBackup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/superadmin/ops/backups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "CREATE_BACKUP" }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/ops/backups"] });
      const w = data.data?.warnings?.length;
      toast({
        title: "Snapshot created",
        description: `${data.data.name} (${data.data.size_mb} MB${w ? `, ${w} warnings` : ""})`,
      });
    },
    onError: (err: any) => toast({ title: "Snapshot failed", description: err.message, variant: "destructive" }),
  });

  const deleteBackup = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/v1/superadmin/ops/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/ops/backups"] });
      toast({ title: "Backup deleted" });
    },
  });

  // ── Schedule + retention controls. State is hydrated from the server's
  // settings on the first list-fetch, then echoed-through to the server on
  // every change so the scheduler picks it up within 60s of the user toggling.
  const settings = bkRes?.settings;
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [scheduleHour, setScheduleHour] = useState<number>(2);
  const [retentionDays, setRetentionDays] = useState<number>(14);
  useEffect(() => {
    if (settings && autoEnabled === null) {
      setAutoEnabled(!!settings.autoEnabled);
      setScheduleHour(Number(settings.scheduleHour ?? 2));
      setRetentionDays(Number(settings.retentionDays ?? 14));
    }
  }, [settings, autoEnabled]);

  const saveSettings = useMutation({
    mutationFn: async (patch: any) => {
      const res = await fetch("/api/v1/superadmin/ops/backups/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/superadmin/ops/backups"] }),
    onError: (err: any) => toast({ title: "Couldn't save schedule", description: err.message, variant: "destructive" }),
  });

  const backups = bkRes?.data || [];
  const hourFmt = (h: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${suffix}`;
  };

  return (
    <div className="space-y-5">

      {/* ── Schedule + retention panel ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-indigo-600" /> Automatic Backup Schedule
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Toggle */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Auto-backup</label>
              <button
                onClick={() => {
                  const next = !autoEnabled;
                  setAutoEnabled(next);
                  saveSettings.mutate({ autoEnabled: next });
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${autoEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${autoEnabled ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {autoEnabled
                ? `Runs daily at ${hourFmt(scheduleHour)} server time. Old snapshots auto-prune after ${retentionDays} days.`
                : "Disabled — only manual snapshots will be created."}
            </p>
          </div>
          {/* Hour */}
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="text-xs font-semibold text-slate-700 block mb-2">Schedule hour (24h)</label>
            <select
              value={scheduleHour}
              onChange={(e) => {
                const h = Number(e.target.value);
                setScheduleHour(h);
                saveSettings.mutate({ scheduleHour: h });
              }}
              className="w-full text-sm rounded border-slate-200 px-2 py-1"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00  ({hourFmt(h)})</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">Server time (UTC on staging). Pick a low-traffic hour.</p>
          </div>
          {/* Retention */}
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="text-xs font-semibold text-slate-700 block mb-2">Retention (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(e) => {
                const d = Math.max(1, Math.min(365, parseInt(e.target.value) || 14));
                setRetentionDays(d);
              }}
              onBlur={() => saveSettings.mutate({ retentionDays })}
              className="w-full text-sm rounded border-slate-200 px-2 py-1"
            />
            <p className="text-[10px] text-slate-500 mt-1">Snapshots older than this are auto-deleted after each run.</p>
          </div>
        </div>

        {/* Last-run status pill */}
        {settings?.lastRunAt && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-slate-500">Last auto-run:</span>
            <span className="font-mono text-slate-700">{new Date(settings.lastRunAt).toLocaleString("en-IN")}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
              (settings.lastRunStatus || "").startsWith("ok") ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}>{settings.lastRunStatus}</span>
          </div>
        )}
      </div>

      {/* ── Manual create + snapshots list ───────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600" /> Snapshots ({backups.length})
          </h3>
          <Button size="sm" onClick={() => createBackup.mutate()} disabled={createBackup.isPending}
            className="rounded-lg bg-emerald-600 text-white gap-1.5">
            {createBackup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            {createBackup.isPending ? "Bundling…" : "Create Snapshot Now"}
          </Button>
        </div>

        <div className="text-xs text-slate-500 mb-3 flex items-center gap-3 flex-wrap">
          {bkRes?.db_size_mb && <span>Live HireStream DB: <strong>{bkRes.db_size_mb} MB</strong></span>}
          {bkRes?.backup_dir && <span className="font-mono text-[10px]">{bkRes.backup_dir}</span>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <HardDrive className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No snapshots yet — click "Create Snapshot Now"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b: any) => {
              const isLegacy = b.kind === "legacy_sql" || (b.name && b.name.endsWith(".sql"));
              return (
                <div key={b.name} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-mono font-semibold text-slate-900 truncate">{b.name}</p>
                      {isLegacy && (
                        <span className="text-[9px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded" title="DB-only — predates the full-system snapshot format">
                          legacy
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {b.size_mb} MB · created {new Date(b.created_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => window.open(`/api/v1/superadmin/ops/backups/${encodeURIComponent(b.name)}/download`, "_blank")}
                      className="rounded-lg text-xs">
                      Download
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteBackup.mutate(b.name)}
                      className="rounded-lg text-xs text-red-600 border-red-200 hover:bg-red-50">
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          <strong>What's in a snapshot:</strong> HireStream DB (<code className="bg-white/60 px-1 rounded">pg_dump</code>) +
          Agentryx Verify DB + both apps' <code className="bg-white/60 px-1 rounded">uploads/</code> directories +
          a JSON manifest. Single <code className="bg-white/60 px-1 rounded">.tar.gz</code> bundle per snapshot.
          Restore with <code className="bg-white/60 px-1 rounded">scripts/restore-snapshot.sh &lt;file.tar.gz&gt;</code>.
        </div>
      </div>

      {/* Danger Zone — Process Restart */}
      <div className="bg-red-50 rounded-xl border-2 border-red-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-red-900 flex items-center gap-2 mb-2">
          <Power className="w-4 h-4" /> Process Control
        </h3>
        <p className="text-xs text-red-700 mb-3">
          Gracefully restart the Node.js process. Recommended after deployment, env changes, or to clear memory leaks.
          Requires PM2 or systemd to relaunch the process. Brief downtime expected (1-3 seconds).
        </p>
        <ProcessRestartButton />
      </div>
    </div>
  );
}

// ── Trends View — time series charts ──
function TrendsView() {
  const { data: tRes, isLoading } = useQuery({
    queryKey: ["/api/v1/superadmin/ops/trends"],
    queryFn: () => fetchJson("/api/v1/superadmin/ops/trends"),
    refetchInterval: 60000,
  });
  const t = tRes?.data;
  const formatDay = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const ChartCard = ({ title, data, color }: { title: string; data: any[]; color: string }) => {
    if (!data || data.length === 0) {
      return (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center text-slate-400 text-sm">
          {title} — no data in last 30 days
        </div>
      );
    }
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-xs font-bold text-slate-700 mb-2">{title}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip labelFormatter={(d: any) => formatDay(d)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-blue-600" /> Activity Trends (last 30 days)
        </h3>

        {isLoading || !t ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            <ChartCard title="Application Submissions" data={t.submissions} color="#3b82f6" />
            <ChartCard title="Placements" data={t.placements} color="#10b981" />
            <ChartCard title="User Logins" data={t.registrations} color="#a855f7" />
          </div>
        )}
      </div>
    </div>
  );
}
