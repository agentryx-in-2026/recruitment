import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, LogOut, Menu, X, ChevronDown, ExternalLink, RefreshCw, Flag } from "lucide-react";
import { api } from "../lib/api";
import { AskPanel } from "./AskPanel";

/**
 * Workspace shell, in the MGC tracker layout: a left navigation with collapsible
 * groups and a theme switch (Light / Dark / Navy menu), a serif title bar with
 * pill buttons, full-width content, and Ask Agentryx docked on the right with
 * an edge tab.
 * Every workspace page shares one /api/testing/overview load through context.
 */
export type Overview = {
  me: { id: string; name: string; role: string; level: string; isAdmin: boolean };
  ai: boolean;
  config: { portalUrl: string; accounts: { role: string; username: string }[]; password: string; testersCanRun: boolean; failNoteRequired: boolean; mobileNote: string };
  projects: { id: string; slug: string; name: string; build_ref: string; description: string; cases: Case[] }[];
  running: { id: string; scope: string; started_at: string } | null;
  findingsOpen: number;
  sessions: { n: number; title: string; role: string; account: string; minutes: number; intro: string; carry?: string }[];
};
export type Case = {
  id: string; project_id: string; projectSlug: string; item_ref: string; section: number; section_title: string;
  description: string; delivery_status: string; test_steps: string | null; expected_result: string | null; evidence: string | null;
  my_decision: "accepted" | "rejected" | "waived" | null; my_comment: string | null; my_at: string | null; comment_count: number;
  auto: { status: "passed" | "failed"; detail: string | null; screenshot: string | null; at: string } | null;
  autoScope: string | null;
  test_plan: "run" | "with" | "auto" | "blocked" | "later"; plan_note: string | null; session: number | null;
};
/** Cases the tester runs by hand (the others are checked together, automated, blocked or later). */
export const byHand = (c: Case) => c.test_plan === "run";

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

type Theme = "light" | "dark" | "navy";

/* Sidebar palette per theme. */
const SIDE: Record<Theme, { aside: string; brand: string; item: string; active: string; group: string; badge: string; muted: string; rule: string }> = {
  light: { aside: "bg-[#F6F4EF] border-r border-[#E7E2D8]", brand: "text-slate-900", item: "text-slate-800 hover:bg-[#ECE8DF]", active: "bg-[#E2E7F3] text-[#14213D] font-semibold shadow-[inset_3px_0_0_#14213D]", group: "text-slate-500", badge: "bg-white text-slate-600 border border-slate-200", muted: "text-slate-500", rule: "border-[#E3DED3]" },
  dark: { aside: "bg-[#111827] border-r border-[#1F2937]", brand: "text-white", item: "text-slate-200 hover:bg-white/5", active: "bg-white/10 text-white font-semibold shadow-[inset_3px_0_0_#FBBF24]", group: "text-slate-500", badge: "bg-white/10 text-slate-200", muted: "text-slate-400", rule: "border-white/10" },
  navy: { aside: "bg-[#14213D]", brand: "text-white", item: "text-slate-200 hover:bg-white/10", active: "bg-[#2A3A63] text-white font-semibold shadow-[inset_3px_0_0_#FBBF24]", group: "text-slate-400", badge: "bg-white/15 text-slate-100", muted: "text-slate-400", rule: "border-white/10" },
};

const SideCtx = createContext<{ theme: Theme; closed: Record<string, boolean>; toggle: (g: string) => void; close: () => void }>(null as any);

function NavLink({ href, label, count, tone = "amber", alsoActive = false, sub = false }: { href: string; label: string; count?: number | string; tone?: "amber" | "slate"; alsoActive?: boolean; sub?: boolean }) {
  const [loc] = useLocation();
  const { theme, close } = useContext(SideCtx);
  const t = SIDE[theme];
  const search = typeof window !== "undefined" ? window.location.search : "";
  const [path, qs] = href.split("?");
  const active = alsoActive || (qs ? loc === path && search === `?${qs}` : path === "/" ? loc === "/" : path === "/cases" ? loc === "/cases" && !search : loc.startsWith(path));
  return (
    <Link href={href} onClick={close} title={label} className={`flex items-center justify-between gap-2 rounded-md ${sub ? "pl-6 pr-3 py-1.5 text-[13px]" : "pl-4 pr-3 py-2 text-[15px]"} ${active ? t.active : t.item}`}>
      <span className="truncate">{sub && <span className="text-amber-500 mr-1.5">★</span>}{label}</span>
      {count !== undefined && <span className={`text-xs font-bold rounded-full min-w-[1.6rem] text-center px-2 py-0.5 ${tone === "amber" ? "bg-amber-400 text-slate-900" : t.badge}`}>{count}</span>}
    </Link>
  );
}
function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { theme, close } = useContext(SideCtx);
  return <button onClick={() => { onClick(); close(); }} className={`w-full text-left pl-4 pr-3 py-2 rounded-md text-[15px] ${SIDE[theme].item}`}>{label}</button>;
}
function Group({ title, children, here = false }: { title: string; children: ReactNode; here?: boolean }) {
  const { theme, closed, toggle } = useContext(SideCtx);
  const shut = !!closed[title] && !here; // the group holding the current page always shows
  return (
    <div className="mt-4">
      <button onClick={() => toggle(title)} aria-expanded={!shut} className={`w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold tracking-[0.14em] uppercase ${SIDE[theme].group} hover:opacity-80`}>
        <span className={`text-[9px] transition-transform ${shut ? "" : "rotate-90"}`}>▶</span>{title}
      </button>
      {!shut && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i); }, []);
  return now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });
}

function Pill({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = "inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50 whitespace-nowrap";
  return href ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <button onClick={onClick} className={cls}>{children}</button>;
}

function Menu2({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [open]);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Pill onClick={() => setOpen(!open)}>{label}<ChevronDown className="w-3.5 h-3.5 text-slate-400" /></Pill>
      {open && <div className="absolute right-0 mt-1 z-50 min-w-[260px] bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [askOpen, setAskOpen] = useState(() => { try { return localStorage.getItem("verify-ask-open") !== "0"; } catch { return true; } });
  const [askRef, setAskRef] = useState<string | null>(null);
  const [askCmd, setAskCmd] = useState<{ view: "new" | "list"; n: number } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => { try { return (localStorage.getItem("verify-theme") as Theme) || "light"; } catch { return "light"; } });
  const [closed, setClosed] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("verify-nav-closed") || "{}"); } catch { return {}; } });
  const [, navigate] = useLocation();
  const clock = useClock();

  const [starred, setStarred] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    fetch("/api/pm/documents", { credentials: "include" }).then((r) => r.ok ? r.json() : null)
      .then((j) => setStarred((j?.documents ?? []).filter((d: any) => d.pinned).map((d: any) => ({ id: d.id, title: d.title }))))
      .catch(() => {});
  }, []);
  const [loc] = useLocation();
  const onDoc = loc.startsWith("/docs/") ? loc.slice(6) : null;
  const docStarred = !!onDoc && starred.some((d) => d.id === onDoc);
  const inGroup = {
    testing: /^\/(cases|automation|findings|run)/.test(loc),
    help: loc.startsWith("/team-questions"),
    resources: /^\/(resources|docs)/.test(loc) || (loc.startsWith("/product") && !(data?.me.isAdmin)),
    manage: /^\/(questions|projects|admin|settings|audit|p\/|product)/.test(loc) && !!data?.me.isAdmin,
  };
  const reload = useCallback(async () => {
    const r = await fetch("/api/testing/overview", { credentials: "include" });
    if (r.status === 401) { navigate("/login", { replace: true }); return; }
    setData(await r.json());
  }, [navigate]);
  useEffect(() => { reload(); }, [reload]);
  // Heartbeat for the audit trail: time active counts only while this tab is open and in view.
  useEffect(() => {
    const beat = () => fetch("/api/audit/ping", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visible: !document.hidden }) }).catch(() => {});
    beat();
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, []);
  useEffect(() => { try { localStorage.setItem("verify-ask-open", askOpen ? "1" : "0"); } catch { /* */ } }, [askOpen]);
  useEffect(() => {
    try { localStorage.setItem("verify-theme", theme); } catch { /* */ }
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
  }, [theme]);
  useEffect(() => { try { localStorage.setItem("verify-nav-closed", JSON.stringify(closed)); } catch { /* */ } }, [closed]);
  useEffect(() => { document.title = title ? `${title} · Agentryx Verify` : "Agentryx Verify"; }, [title]);
  // Open the panel on a given view. Below the md breakpoint the panel is hidden, so go to the full page instead.
  const openAsk = (view: "new" | "list", ref: string | null = null) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) { navigate(view === "new" ? "/team-questions?new=1" : "/team-questions"); return; }
    setAskRef(ref); setAskOpen(true); setAskCmd((c) => ({ view, n: (c?.n ?? 0) + 1 }));
  };
  const askAbout = (ref: string | null) => openAsk("new", ref);

  const all = data?.projects.flatMap((p) => p.cases) ?? [];
  const hand = all.filter(byHand);
  const passed = hand.filter((c) => caseState(c) === "passed").length;
  const failed = all.filter((c) => c.test_plan !== "later" && caseState(c) === "failed").length;
  const toRun = hand.filter((c) => caseState(c) === "notrun").length;
  const pct = hand.length ? Math.round((passed / hand.length) * 100) : 0;
  const T = SIDE[theme];
  const groups = ["Testing", "Ask for help", "Resources", "Manage"];
  const allShut = groups.every((g) => closed[g]);

  const nav = data && (
    <nav className="flex flex-col min-h-full px-3 py-5">
      <Link href="/" className={`flex items-center gap-2 px-2 font-serif font-bold text-lg ${T.brand}`}><CheckCircle2 className="w-5 h-5 text-amber-500" />Agentryx Verify</Link>
      <div className="mt-5 space-y-0.5">
        <NavLink href="/" label="Start here" />
      </div>
      <div className="flex justify-end mt-2">
        <button onClick={() => setClosed(allShut ? {} : Object.fromEntries(groups.map((g) => [g, true])))} className={`text-xs ${T.muted} hover:underline px-2`}>{allShut ? "Expand all" : "Collapse all"}</button>
      </div>
      <Group title="Testing" here={inGroup.testing}>
        <NavLink href="/run" label="Test run — step by step" count={toRun} />
        <NavLink href="/cases" label="All cases" count={all.length} tone="slate" />
        <NavLink href="/cases?show=torun" label="To run" count={toRun} tone="slate" />
        <NavLink href="/cases?show=failed" label="Failed — retest" count={failed} />
        <NavLink href="/cases?show=passed" label="Passed" count={passed} tone="slate" />
        {data.projects.map((p) => (
          <NavLink key={p.id} href={`/cases?project=${p.slug}`} label={p.slug === "hirestream-lite" ? "Web portal (Lite)" : "Mobile app"}
            count={`${p.cases.filter((c) => caseState(c) === "passed").length}/${p.cases.length}`} tone="slate" />
        ))}
        <NavLink href="/automation" label="Automated runs" count={data.running ? "running" : undefined} />
        <NavLink href="/findings" label="Findings" count={data.findingsOpen || undefined} />
      </Group>
      <Group title="Ask for help" here={inGroup.help}>
        <NavButton label="Ask Agentryx" onClick={() => openAsk("new")} />
        <NavLink href="/team-questions" label="Team questions" />
      </Group>
      <Group title="Resources" here={inGroup.resources}>
        <NavLink href="/resources" label="Guides & videos" />
        <NavLink href="/product?tab=documents" label="Documents" alsoActive={!!onDoc && !docStarred && !data.me.isAdmin} />
        {starred.map((d) => <NavLink key={d.id} href={`/docs/${d.id}`} label={d.title} sub />)}
      </Group>
      {data.me.isAdmin && (
        <>
          <div className={`mt-5 mx-2 pt-3 border-t ${T.rule} text-[11px] font-bold tracking-[0.14em] uppercase ${T.group}`}>Admin</div>
          <Group title="Manage" here={inGroup.manage}>
            <NavLink href="/questions" label="Questions inbox" />
            <NavLink href="/product?tab=status" label="Product management" alsoActive={!!onDoc && !docStarred} />
            <NavLink href="/projects" label="Projects" />
            <NavLink href="/audit" label="Audit trail & usage" />
            <NavLink href="/admin/roadmap" label="Verify roadmap" />
            <NavLink href="/settings" label="Settings" />
          </Group>
        </>
      )}
      <div className={`mt-auto pt-6`}>
        <div className={`mx-2 pt-3 border-t ${T.rule}`}>
          <div className={`text-[11px] font-bold tracking-[0.14em] uppercase ${T.group}`}>Theme</div>
          <div className="mt-2 flex gap-1.5">
            {([["light", "Light"], ["dark", "Dark"], ["navy", "Navy menu"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTheme(v)} aria-pressed={theme === v}
                className={`text-xs whitespace-nowrap rounded-md border px-2 py-1 ${theme === v
                  ? theme === "light" ? "bg-[#E2E7F3] border-[#14213D] text-[#14213D] font-semibold" : "bg-white/15 border-white/40 text-white font-semibold"
                  : theme === "light" ? "bg-white border-slate-300 text-slate-700" : "border-white/20 text-slate-300 hover:bg-white/10"}`}>{l}</button>
            ))}
          </div>
          <div className={`mt-3 text-xs ${T.muted}`}>Phase-1 UAT · HireStream Lite</div>
        </div>
      </div>
    </nav>
  );

  return (
    <Ctx.Provider value={{ data, reload, askAbout, askRef }}>
      <SideCtx.Provider value={{ theme, closed, toggle: (g) => setClosed((c) => ({ ...c, [g]: !c[g] })), close: () => setNavOpen(false) }}>
      <div className="min-h-screen bg-[#FBFAF7] flex">
        <aside className={`hidden lg:block w-60 shrink-0 sticky top-0 h-screen overflow-y-auto ${T.aside}`}>{nav}</aside>
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setNavOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <aside className={`absolute left-0 top-0 bottom-0 w-72 overflow-y-auto ${T.aside}`} onClick={(e) => e.stopPropagation()}>
              <button className={`absolute right-3 top-5 ${T.muted}`} onClick={() => setNavOpen(false)} aria-label="Close menu"><X className="w-5 h-5" /></button>
              {nav}
            </aside>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 bg-[#FBFAF7]/95 backdrop-blur border-b border-slate-200">
            <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-3">
              <button className="lg:hidden text-slate-600" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu className="w-5 h-5" /></button>
              <div className="min-w-0">
                <div className="font-serif text-2xl font-bold text-slate-900 truncate leading-tight">HireStream Lite UAT</div>
                <div className="text-xs text-slate-500 mt-0.5"><b className="font-semibold text-slate-600">IST</b> {clock} <span className="text-slate-300 mx-1">·</span> Web portal + mobile app</div>
              </div>
              {data && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="hidden md:block">
                    <Menu2 label="Test accounts">
                      <div className="text-xs text-slate-500 mb-2">Portal: <span className="font-mono">{data.config.portalUrl.replace(/^https?:\/\//, "")}</span></div>
                      <table className="w-full"><tbody className="divide-y divide-slate-100">
                        {data.config.accounts.map(({ role: r, username: u }) => (
                          <tr key={u}><td className="py-1.5 text-slate-600">{r}</td><td className="py-1.5 font-mono text-slate-900">{u}</td></tr>
                        ))}
                      </tbody></table>
                      <div className="text-xs text-slate-500 mt-2">Password for all: <span className="font-mono">{data.config.password}</span></div>
                    </Menu2>
                  </div>
                  <span className="hidden md:inline-flex"><Pill onClick={() => navigate("/findings?new=1")}><Flag className="w-3.5 h-3.5 text-rose-600" /> Report a finding</Pill></span>
                  <span className="hidden md:inline-flex"><Pill href={`${data.config.portalUrl}/auth`}>Lite portal <ExternalLink className="w-3.5 h-3.5 text-slate-400" /></Pill></span>
                  <span className="hidden sm:inline-flex"><Pill onClick={() => reload()}><RefreshCw className="w-3.5 h-3.5" /><span className="sr-only">Refresh</span></Pill></span>
                  <Menu2 label={<><b className="font-semibold text-slate-900">{data.me.name.split(" ")[0]}</b><span className="hidden sm:inline text-xs text-slate-500">{data.me.level === "agentryx" ? "Agentryx" : data.me.level.replace("_", " ")}</span></>}>
                    <div className="font-semibold text-slate-900">{data.me.name}</div>
                    <div className="text-xs text-slate-500">Testing as {data.me.level === "agentryx" ? "Agentryx" : data.me.level.replace("_", " ")}</div>
                    <button onClick={async () => { await api.logout(); location.href = "/login"; }} className="mt-3 w-full inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 border-t border-slate-100 pt-2"><LogOut className="w-4 h-4" /> Sign out</button>
                  </Menu2>
                </div>
              )}
            </div>
            {data && (
              <div className="px-4 sm:px-6 lg:px-8 pb-2.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-white bg-emerald-600 rounded-full px-2.5 py-0.5 text-xs">{pct}%</span>
                <span className="text-slate-700"><b>{passed}</b> of {hand.length} hand-run cases passed</span>
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
          <aside className="hidden md:flex w-[400px] xl:w-[460px] shrink-0 border-l border-slate-200 bg-white sticky top-0 h-screen flex-col">
            {/* Edge tab, as in the MGC portal: collapses the panel. */}
            <button onClick={() => setAskOpen(false)} aria-label="Hide Ask Agentryx" title="Hide Ask Agentryx"
              className="absolute -left-9 top-1/2 -translate-y-1/2 w-9 py-4 rounded-l-lg bg-[#14213D] text-white text-xs font-semibold flex flex-col items-center gap-2 shadow-md hover:bg-[#1d2d52]">
              <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide">Ask Agentryx</span><span className="text-[10px]">▶</span>
            </button>
            <AskPanel ai={data.ai} isAdmin={data.me.isAdmin} contextRef={askRef} command={askCmd} onClose={() => setAskOpen(false)} clearContext={() => setAskRef(null)} />
          </aside>
        )}
        {!askOpen && data && (
          <button onClick={() => openAsk("list")} aria-label="Open Ask Agentryx" title="Open Ask Agentryx"
            className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 w-9 py-4 rounded-l-lg bg-[#14213D] text-white text-xs font-semibold flex-col items-center gap-2 shadow-md hover:bg-[#1d2d52]">
            <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide">Ask Agentryx</span><span className="text-[10px]">◀</span>
          </button>
        )}
      </div>
      </SideCtx.Provider>
    </Ctx.Provider>
  );
}

/** Page frame shared by every workspace page: full width (fills FHD), left-aligned, MGC heading. */
export function Page({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[26px] font-bold text-slate-900 leading-tight">{title}</h1>
          {sub && <p className="text-sm text-slate-600 mt-1">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
