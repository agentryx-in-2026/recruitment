import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, LogOut, PanelRightOpen, PanelRightClose, Menu, X } from "lucide-react";
import { api } from "../lib/api";
import { AskPanel } from "./AskPanel";

/**
 * Workspace shell (MGC-style): dark left navigation, progress strip on top,
 * content in the middle, Ask Agentryx docked on the right.
 * Every workspace page shares one /api/testing/overview load through context.
 */
export type Overview = {
  me: { name: string; role: string; level: string; isAdmin: boolean };
  ai: boolean;
  projects: { id: string; slug: string; name: string; build_ref: string; description: string; cases: Case[] }[];
  running: { id: string; scope: string; started_at: string } | null;
};
export type Case = {
  id: string; project_id: string; projectSlug: string; item_ref: string; section: number; section_title: string;
  description: string; delivery_status: string; test_steps: string | null; expected_result: string | null; evidence: string | null;
  my_decision: "accepted" | "rejected" | "waived" | null; my_comment: string | null; comment_count: number;
  auto: { status: "passed" | "failed"; detail: string | null; screenshot: string | null; at: string } | null;
  autoScope: string | null;
};

const Ctx = createContext<{ data: Overview | null; reload: () => Promise<void>; askAbout: (ref: string | null) => void; askRef: string | null } | null>(null);
export const useWorkspace = () => useContext(Ctx)!;

export const caseState = (c: Case) =>
  c.my_decision === "accepted" ? "passed" : c.my_decision === "rejected" ? "failed" : c.my_decision === "waived" ? "waived" : "notrun";

export function StatusChip({ c }: { c: Case }) {
  const s = caseState(c);
  const map: Record<string, [string, string]> = {
    passed: ["Passed", "bg-emerald-50 text-emerald-700 border-emerald-200"],
    failed: ["Failed", "bg-rose-50 text-rose-700 border-rose-200"],
    waived: ["Waived", "bg-slate-100 text-slate-600 border-slate-200"],
    notrun: ["Not run", "bg-white text-slate-500 border-slate-200"],
  };
  const [label, cls] = map[s];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{label}</span>;
}

export function AutoChip({ c }: { c: Case }) {
  if (!c.auto) return c.autoScope ? <span className="text-[11px] text-slate-400 whitespace-nowrap">Auto: not run</span> : null;
  return c.auto.status === "passed"
    ? <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">Auto ✓ passed</span>
    : <span className="text-[11px] font-semibold text-rose-700 whitespace-nowrap">Auto ✗ failed</span>;
}

function NavLink({ href, label, count, tone = "amber" }: { href: string; label: string; count?: number | string; tone?: "amber" | "slate" }) {
  const [loc] = useLocation();
  const active = loc === href || (href !== "/" && loc.startsWith(href.split("?")[0]) && href.split("?")[0] !== "/cases") || (href.includes("?") && typeof window !== "undefined" && (loc + window.location.search) === href);
  return (
    <Link href={href} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[15px] ${active ? "bg-white/15 text-white font-semibold" : "text-slate-200 hover:bg-white/10"}`}>
      <span className="truncate">{label}</span>
      {count !== undefined && <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${tone === "amber" ? "bg-amber-400 text-slate-900" : "bg-white/15 text-slate-100"}`}>{count}</span>}
    </Link>
  );
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mt-6"><div className="px-3 mb-1 text-[11px] font-bold tracking-[0.14em] uppercase text-slate-400">{title}</div><div className="space-y-0.5">{children}</div></div>
);

export function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [askOpen, setAskOpen] = useState(() => { try { return localStorage.getItem("verify-ask-open") !== "0"; } catch { return true; } });
  const [askRef, setAskRef] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [, navigate] = useLocation();

  const reload = useCallback(async () => {
    const r = await fetch("/api/testing/overview", { credentials: "include" });
    if (r.status === 401) { navigate("/login", { replace: true }); return; }
    setData(await r.json());
  }, [navigate]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { try { localStorage.setItem("verify-ask-open", askOpen ? "1" : "0"); } catch { /* */ } }, [askOpen]);
  const askAbout = (ref: string | null) => { setAskRef(ref); setAskOpen(true); };

  const all = data?.projects.flatMap((p) => p.cases) ?? [];
  const testable = all.filter((c) => c.delivery_status !== "not_delivered");
  const passed = all.filter((c) => caseState(c) === "passed").length;
  const failed = all.filter((c) => caseState(c) === "failed").length;
  const toRun = testable.filter((c) => caseState(c) === "notrun").length;
  const pct = all.length ? Math.round((passed / all.length) * 100) : 0;

  const nav = data && (
    <nav className="px-3 py-5">
      <Link href="/" className="flex items-center gap-2 px-3 text-white font-semibold text-lg"><CheckCircle2 className="w-5 h-5 text-amber-400" />Agentryx Verify</Link>
      <div className="mt-6 space-y-0.5">
        <NavLink href="/" label="Start here" />
      </div>
      <Group title="Testing">
        <NavLink href="/cases" label="All cases" count={all.length} tone="slate" />
        <NavLink href="/cases?show=torun" label="To run" count={toRun} />
        <NavLink href="/cases?show=failed" label="Failed — retest" count={failed} />
        <NavLink href="/cases?show=passed" label="Passed" count={passed} tone="slate" />
        {data.projects.map((p) => (
          <NavLink key={p.id} href={`/cases?project=${p.slug}`} label={p.slug === "hirestream-lite" ? "Web portal (Lite)" : "Mobile app"}
            count={`${p.cases.filter((c) => caseState(c) === "passed").length}/${p.cases.length}`} tone="slate" />
        ))}
        <NavLink href="/automation" label="Automated runs" count={data.running ? "running" : undefined} />
      </Group>
      <Group title="Resources">
        <NavLink href="/resources" label="Guides & videos" />
        <NavLink href="/product" label="Documents" />
      </Group>
      {data.me.isAdmin && (
        <Group title="Admin">
          <NavLink href="/questions" label="Questions inbox" />
          <NavLink href="/projects" label="Projects (classic view)" />
          <NavLink href="/admin/roadmap" label="Verify roadmap" />
        </Group>
      )}
    </nav>
  );

  return (
    <Ctx.Provider value={{ data, reload, askAbout, askRef }}>
      <div className="min-h-screen bg-slate-50 flex">
        <aside className="hidden lg:block w-64 shrink-0 bg-[#14213D] sticky top-0 h-screen overflow-y-auto">{nav}</aside>
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setNavOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[#14213D] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <button className="absolute right-3 top-4 text-slate-300" onClick={() => setNavOpen(false)} aria-label="Close menu"><X className="w-5 h-5" /></button>
              {nav}
            </aside>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
            <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
              <button className="lg:hidden text-slate-600" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu className="w-5 h-5" /></button>
              <div className="min-w-0">
                <div className="font-serif text-xl font-bold text-slate-900 truncate">{title ?? "HireStream UAT"}</div>
                <div className="text-xs text-slate-500">HireStream Lite + mobile app · {data ? `${data.me.name} · testing as ${data.me.level === "agentryx" ? "Agentryx" : data.me.level.replace("_", " ")}` : "…"}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setAskOpen(!askOpen)} className="hidden md:inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50">
                  {askOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />} Ask Agentryx
                </button>
                <button onClick={async () => { await api.logout(); location.href = "/login"; }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 px-2 py-1.5"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign out</span></button>
              </div>
            </div>
            {data && (
              <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-white bg-emerald-600 rounded-full px-2.5 py-0.5">{pct}%</span>
                <span className="text-slate-700"><b>{passed}</b> of {all.length} passed</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600"><b>{toRun}</b> to run</span>
                <span className="text-slate-300">·</span>
                <span className={failed ? "text-rose-700" : "text-slate-600"}><b>{failed}</b> failed</span>
                <div className="ml-auto hidden sm:flex items-center gap-4">
                  {data.projects.map((p) => {
                    const ok = p.cases.filter((c) => caseState(c) === "passed").length;
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-xs text-slate-500">
                        {p.slug === "hirestream-lite" ? "Web" : "Mobile"}
                        <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${p.cases.length ? (ok / p.cases.length) * 100 : 0}%` }} /></div>
                        <span className="tabular-nums">{ok}/{p.cases.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </header>
          <main className="flex-1 min-w-0">{data ? children : <div className="p-10 text-slate-400">Loading…</div>}</main>
        </div>
        {askOpen && data && (
          <aside className="hidden md:flex w-[380px] shrink-0 border-l border-slate-200 bg-white sticky top-0 h-screen flex-col">
            <AskPanel ai={data.ai} isAdmin={data.me.isAdmin} contextRef={askRef} onClose={() => setAskOpen(false)} clearContext={() => setAskRef(null)} />
          </aside>
        )}
      </div>
    </Ctx.Provider>
  );
}
