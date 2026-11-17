import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { Download, FileText, MessageSquare, AlertCircle, Filter, LogIn, ChevronRight, Lightbulb, MousePointerClick, CircleDot, X, Paperclip, Link2, Check } from "lucide-react";
import { Link } from "wouter";
import { Shell } from "../components/Shell";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { FeedbackCard, IdeasButton } from "../components/FeedbackCard";
import { FeedbackDialog } from "../components/FeedbackDialog";
import { SprintSection } from "../components/SprintSection";
import { ActivityFeed } from "../components/ActivityFeed";

type LevelKey = "agentryx" | "htis" | "hpsedc_staging" | "hpsedc_final";
type RoleKey = "candidate" | "agent" | "employer" | "officer" | "cross";

// Sequence of approval gates — left-to-right. Each must pass before the next
// pipeline meaningfully begins (though the portal doesn't enforce ordering;
// it's a process convention).
const LEVELS: { key: LevelKey; label: string; short: string }[] = [
  { key: "agentryx",        label: "Agentryx Internal",      short: "AGX" },
  { key: "htis",            label: "HTIS Review",            short: "HTIS" },
  { key: "hpsedc_staging",  label: "HPSEDC Staging",         short: "STG" },
  { key: "hpsedc_final",    label: "HPSEDC Final UAT",       short: "Final" },
];

const ROLES: { key: RoleKey; label: string; sections: number[]; accent: string }[] = [
  { key: "candidate", label: "Candidate",   sections: [1],                                    accent: "from-blue-500 to-blue-600" },
  { key: "agent",     label: "Agency",      sections: [2],                                    accent: "from-emerald-500 to-emerald-600" },
  { key: "employer",  label: "Employer",    sections: [3],                                    accent: "from-purple-500 to-purple-600" },
  { key: "officer",   label: "Officer",     sections: [4],                                    accent: "from-rose-500 to-rose-600" },
  { key: "cross",     label: "Cross-cutting (Sec 5–17)", sections: [5,6,7,8,9,10,11,12,13,14,15,16,17], accent: "from-slate-500 to-slate-700" },
  // Section 18 is a synthetic bucket for HTIS-reported field defects appended
  // post-v1.4.2. Kept as its own role so the "Field Defects" label is visible
  // on the overview strip — not buried inside Cross-cutting.
  { key: "htis" as any, label: "HTIS Findings (Sec 18)", sections: [18], accent: "from-purple-500 to-purple-700" },
];

type Decision = "accepted" | "rejected" | "waived";
interface Stat { total: number; reviewable: number; pass: number; partial: number; fail: number; pending: number; deferred: number; pct: number; }

// Returns true when this requirement's signoff needs a re-verify flag — i.e.
// the signoff is a rejection/waive that predates a deployed sprint which lists
// this item's ref as fixed. Reviewers see a 🔁 chip on the cell and can flip
// the decision without admin help.
function needsReverify(req: any, signoff: any | undefined, deployedSprints: any[] | undefined) {
  if (!signoff || !deployedSprints?.length) return false;
  if (!["rejected", "waived"].includes(signoff.decision)) return false;
  const signedAt = new Date(signoff.signedAt).getTime();
  return deployedSprints.some((sp) =>
    sp.deployedAt &&
    (sp.fixedItemRefs ?? []).includes(req.itemRef) &&
    new Date(sp.deployedAt).getTime() > signedAt
  );
}

// The most-recent deployed sprint that fixed this requirement after the
// reviewer's last decision. Used to compose the auto-comment when the
// reviewer one-click-passes the reverify chip.
function reverifySprint(req: any, signoff: any | undefined, deployedSprints: any[] | undefined) {
  if (!needsReverify(req, signoff, deployedSprints)) return null;
  const signedAt = new Date(signoff!.signedAt).getTime();
  const candidates = (deployedSprints ?? [])
    .filter((sp) => sp.deployedAt && (sp.fixedItemRefs ?? []).includes(req.itemRef) && new Date(sp.deployedAt).getTime() > signedAt)
    .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime());
  return candidates[0] ?? null;
}

function statFor(reqs: any[], signoffs: any[], level: LevelKey): Stat {
  const active = reqs.filter(r => r.status !== "deferred" && r.status !== "n_a");
  const deferred = reqs.filter(r => r.status === "deferred" || r.status === "n_a").length;
  let pass = 0, partial = 0, fail = 0;
  for (const r of active) {
    const so = signoffs.find(s => s.requirementId === r.id && s.level === level);
    if (so?.decision === "accepted") pass++;
    else if (so?.decision === "waived") partial++;
    else if (so?.decision === "rejected") fail++;
  }
  const reviewable = active.length;
  const total = reqs.length; // includes deferred + n_a — the full inventory
  const pending = reviewable - pass - partial - fail;
  // Percent stays measured against reviewable items — deferred can't be passed so they
  // shouldn't drag the percentage down.
  const pct = reviewable === 0 ? 0 : Math.round(((pass + partial * 0.5) / reviewable) * 100);
  return { total, reviewable, pass, partial, fail, pending, deferred, pct };
}

// Pipeline stages, ordered earliest-to-latest. Used to decide which signoff
// is the "current verdict" for a row — later stages override earlier ones.
const PIPELINE_ORDER: LevelKey[] = ["agentryx", "htis", "hpsedc_staging", "hpsedc_final"];

// Find the most-downstream signoff for a requirement. If HTIS rejected then
// HPSEDC Staging accepted, the row is considered cleared — Staging is later
// in the pipeline and represents the current state. Returns null when no
// reviewer has touched the row.
function latestSignoff(reqId: string, signoffs: any[]) {
  let latest: any = null;
  let latestIdx = -1;
  for (const s of signoffs) {
    if (s.requirementId !== reqId) continue;
    const idx = PIPELINE_ORDER.indexOf(s.level);
    if (idx > latestIdx) { latestIdx = idx; latest = s; }
  }
  return latest;
}

// Scope for the "Needs fixing" filter — different reviewers see different
// definitions of "their work" so we compute against the relevant scope.
//   - { kind: "level", level }: tester view. A row needs fixing if THEIR
//     level hasn't accepted it yet (pending or own Fail/Partial). Plus any
//     delivery-partial. This is each tester's personal funnel.
//   - { kind: "latest" }: admin/delivery view. A row needs fixing if the
//     most-downstream signoff is Fail/Partial, OR delivery-side partial.
//     Cross-stage backlog the dev team drives to zero.
type FixScope = { kind: "level"; level: LevelKey } | { kind: "latest" };

// Shared identifier to compute "needs fixing" — kept here so ContextStrip,
// RoleDetail, role chips, and section tabs all answer the same question.
function reqNeedsFix(r: any, signoffs: any[], scope: FixScope) {
  if (r.status === "deferred" || r.status === "n_a") return false;

  if (scope.kind === "level") {
    // Tester scope: items at MY level that I haven't passed. Includes
    // pending (no signoff yet), my own Fail (rejected), my own Partial
    // (waived). Delivery-side partial always counts so the tester sees
    // the unfinished items that need their decision.
    if (r.status === "partial" || r.status === "not_delivered") return true;
    const my = signoffs.find((s) => s.requirementId === r.id && s.level === scope.level);
    if (!my) return true;
    return my.decision === "rejected" || my.decision === "waived";
  }
  // Admin "latest" scope: most-downstream verdict + delivery-partial.
  if (r.status === "partial" || r.status === "not_delivered") return true;
  const latest = latestSignoff(r.id, signoffs);
  if (!latest) return false;
  return latest.decision === "rejected" || latest.decision === "waived";
}

// Role → default fix scope. Admin/delivery see the cross-stage view;
// every other reviewer sees their own pipeline level.
function defaultFixScope(role: string | undefined | null): FixScope {
  if (!role) return { kind: "latest" };
  if (role === "admin" || role === "delivery") return { kind: "latest" };
  if (role === "agentryx" || role === "htis" || role === "hpsedc_staging" || role === "hpsedc_final") {
    return { kind: "level", level: role as LevelKey };
  }
  return { kind: "latest" };
}

const NEEDS_FIX_KEY = "verify-needs-fix-only";

export function ProjectView() {
  const { slug } = useParams<{ slug: string }>();
  const { reviewer: me, loading: authLoading } = useRequireAuth();
  const [data, setData] = useState<any>(null);
  const [level, setLevel] = useState<LevelKey>("agentryx");
  const [activeRole, setActiveRole] = useState<RoleKey | null>(null);
  // Universal "Needs fixing" scope. Lives at project level so a single toggle
  // at the top filters every role chip count, every section, and every
  // detail view. Persisted in localStorage so a dev/tester who opens the
  // project tomorrow lands in the same view they left in.
  const [needsFixOnly, setNeedsFixOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(NEEDS_FIX_KEY) === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NEEDS_FIX_KEY, needsFixOnly ? "1" : "0");
    }
  }, [needsFixOnly]);

  // Each tester sees their own funnel; admin/delivery see the cross-stage
  // dev backlog. The scope feeds every needs-fix calculation so role chips,
  // section tabs, and the matrix all answer the same question.
  const fixScope: FixScope = useMemo(() => defaultFixScope(me?.role), [me]);

  // Which pipeline levels can the current reviewer actually sign off on?
  const allowedLevels: LevelKey[] = useMemo(() => {
    if (!me) return [];
    if (me.role === "admin" || me.role === "delivery") return ["agentryx", "htis", "hpsedc_staging", "hpsedc_final"];
    if (me.role === "agentryx" || me.role === "htis" || me.role === "hpsedc_staging" || me.role === "hpsedc_final") return [me.role];
    return [];
  }, [me]);

  // Default the tab to the reviewer's own level when they log in
  useEffect(() => {
    if (me && allowedLevels.length === 1) setLevel(allowedLevels[0]);
  }, [me, allowedLevels]);

  useEffect(() => { if (me) reload(); }, [slug, me]);
  // An archived or unknown project (e.g. an old bookmark) goes to the Dashboard instead of "Loading…" forever.
  function reload() { api.getProject(slug).then(setData).catch(() => { location.replace("/"); }); }

  // Deep-link support: `/p/<slug>#row=<itemRef>` opens the project, switches
  // to the right role, scrolls the row into view, and pulses an amber ring
  // on it for 2s. Lets reviewers paste row links to each other in chat.
  // The matching `id="req-<itemRef>"` is set on the table row below; the
  // section-tab fix-up happens inside RoleDetail via the same hash.
  useEffect(() => {
    if (!data) return;
    const m = window.location.hash.match(/^#row=(.+)$/);
    if (!m) return;
    const itemRef = decodeURIComponent(m[1]);
    const req = data.requirements.find((r: any) => r.itemRef === itemRef);
    if (!req) return;
    const role = ROLES.find((rl) => rl.sections.includes(req.section));
    if (role) setActiveRole(role.key as RoleKey);
    // Defer scroll until role/section render — RoleDetail handles its own
    // section selection from the same hash.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`req-${itemRef}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 2000);
    }, 250);
    return () => window.clearTimeout(t);
  }, [data]);

  const [feedbackOpen, setFeedbackOpen] = useState(false);

  if (authLoading || !data) return <Shell title="Project"><div className="p-10 text-slate-400">Loading…</div></Shell>;

  return (
    <Shell title="Project">
      <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6">
        {/* Project header */}
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-[26px] font-bold text-slate-900">{data.project.name}</h1>
            <div className="text-sm text-slate-500 mt-1">
              {data.project.contractor} → {data.project.client} · build {data.project.buildRef}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-white rounded px-3 py-2 hover:bg-amber-600 shadow"
              title="Submit an enhancement idea or suggestion">
              💡 Suggest an idea
            </button>
            <IdeasButton projectId={data.project.id} projectSlug={data.project.slug} />
            <a href={`/api/export/projects/${slug}/csv`} className="inline-flex items-center gap-2 text-sm bg-white border border-slate-200 rounded px-3 py-2 hover:border-agentryx-500"><Download className="w-4 h-4" />CSV</a>
            <a href={`/api/export/projects/${slug}/pdf`} className="inline-flex items-center gap-2 text-sm bg-white border border-slate-200 rounded px-3 py-2 hover:border-agentryx-500"><FileText className="w-4 h-4" />PDF</a>
          </div>
        </div>
        <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} projectId={data.project.id} />

        {/* Pipeline tabs + reviewer role badge.
            Only admin and delivery see all four pipelines. Other reviewers
            see exclusively their own tab (keeps each stage's sign-off
            confidential from the others). */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
            {LEVELS
              .filter((l) => {
                const isAdminLike = me.role === "admin" || me.role === "delivery";
                return isAdminLike || allowedLevels.includes(l.key);
              })
              .map((l) => {
                const canEdit = allowedLevels.includes(l.key);
                return (
                  <button key={l.key} onClick={() => { setLevel(l.key); setActiveRole(null); }}
                    className={`px-5 py-2 text-sm font-medium rounded transition flex items-center gap-2 ${
                      level === l.key
                        ? "bg-agentryx-600 text-white shadow"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}>
                    {l.label}
                    {me && !canEdit && <span title="Read-only for your role" className="text-[10px] opacity-70">🔒</span>}
                  </button>
                );
              })}
          </div>
          {me && <ReviewerBadge me={me} />}
        </div>

        {/* Subtle onboarding tip — role-aware, dismissible */}
        <ReviewerTip me={me} allowedLevels={allowedLevels} activeRole={activeRole} />

        {/* Persistent context strip — always visible so the user never loses place */}
        <ContextStrip
          data={data} level={level} activeRole={activeRole}
          onPickRole={setActiveRole}
          needsFixOnly={needsFixOnly}
          onToggleNeedsFix={() => setNeedsFixOnly((v) => !v)}
          fixScope={fixScope}
          me={me}
        />

        {/* Sign-in banner when un-authed on a role (so disabled circles aren't a mystery) */}
        {activeRole && !me && <SignInBanner />}

        {activeRole ? (
          <RoleDetail
            key={`${activeRole}-${level}`}
            slug={slug} data={data} me={me} level={level}
            canEditLevel={allowedLevels.includes(level)}
            role={ROLES.find(r => r.key === activeRole)!}
            needsFixOnly={needsFixOnly}
            onToggleNeedsFix={() => setNeedsFixOnly((v) => !v)}
            fixScope={fixScope}
            onChanged={reload}
          />
        ) : (
          <PipelineOverview
            data={data} level={level} onOpenRole={setActiveRole}
          />
        )}

        <ActivityFeed slug={slug} me={me} />
        <IssuesPanel slug={slug} canEdit={!!me} me={me} />
      </div>
    </Shell>
  );
}

function ReviewerTip({ me, allowedLevels, activeRole }: {
  me: any; allowedLevels: LevelKey[]; activeRole: RoleKey | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const isAdmin = me?.role === "admin" || me?.role === "delivery";
  const levelLabel = allowedLevels.length === 1
    ? LEVELS.find(l => l.key === allowedLevels[0])!.label
    : "all pipelines";

  if (activeRole) {
    return (
      <div className="mt-4 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border-2 border-indigo-300 px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-sm">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-indigo-900">Signing off requirements</h3>
          </div>
          <button onClick={() => setDismissed(true)} className="text-indigo-300 hover:text-indigo-500 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
            <CircleDot className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-indigo-900">Click the signoff circle</div>
              <div className="text-indigo-600 mt-0.5">Mark each requirement as <span className="text-emerald-600 font-bold">Pass</span>, <span className="text-amber-600 font-bold">Partial</span>, or <span className="text-red-600 font-bold">Fail</span></div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
            <MessageSquare className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-indigo-900">Add comments</div>
              <div className="text-indigo-600 mt-0.5">Click the chat icon to discuss a requirement or flag an issue</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
            <Filter className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-indigo-900">Filter & navigate</div>
              <div className="text-indigo-600 mt-0.5">Use the search bar and section tabs to find specific requirements</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-sm font-bold text-amber-900">
            {isAdmin ? "You can review all pipelines" : `You're reviewing at ${levelLabel}`}
          </h3>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-300 hover:text-amber-500 transition"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
          <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow">1</span>
          <div>
            <div className="font-semibold text-amber-900">Pick a role card below</div>
            <div className="text-amber-700 mt-0.5">Start with Candidate, then Agency, Employer, and so on</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
          <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow">2</span>
          <div>
            <div className="font-semibold text-amber-900">Review each requirement</div>
            <div className="text-amber-700 mt-0.5">Read the description, check the test steps, then sign off</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5 bg-white/60 rounded-lg px-3 py-2.5">
          <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow">3</span>
          <div>
            <div className="font-semibold text-amber-900">Mark Pass / Partial / Fail</div>
            <div className="text-amber-700 mt-0.5">Click the signoff circle next to each requirement to record your decision</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile App Setup Guide ──────────────────────────────────────────────
// Renders only on the mobile project page. Three tabs: Android setup,
// iOS setup (coming soon), and test accounts. Collapsible.
function MobileSetupGuide() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"android" | "ios" | "accounts">("android");
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Lightbox overlay */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Preview" className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl border-2 border-white/20" />
          <button className="absolute top-6 right-8 text-white/80 hover:text-white text-3xl font-light" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
      <div className="w-full flex items-stretch bg-gradient-to-r from-violet-600 to-indigo-600">
        <button onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center justify-between px-5 py-3.5 hover:from-violet-700 hover:to-indigo-700 transition">
          <div className="flex items-center gap-3">
            <span className="text-xl">📱</span>
            <div className="text-left">
              <div className="text-base font-bold text-white">HireStream Mobile — Mobile App</div>
              <div className="text-[11px] text-violet-100">Setup your test environment · Scan QR code · Start testing</div>
            </div>
          </div>
          <span className={`text-white/70 text-sm transition-transform mr-2 ${open ? "rotate-180" : ""}`}>▼</span>
        </button>
        {/* PDF guide — same content as this panel, printable. Useful for
            sharing with HPSEDC testers who prefer a hard copy or want
            offline access. */}
        <a href="/docs/HireStream_Mobile_Quick_Testing_Guide.pdf" target="_blank" rel="noopener noreferrer"
           onClick={(e) => e.stopPropagation()}
           className="flex items-center gap-1.5 px-4 py-3.5 bg-white/15 hover:bg-white/25 transition border-l border-white/20 text-white text-xs font-semibold whitespace-nowrap">
          <span className="text-base">📄</span> PDF guide
        </a>
      </div>

      {open && (
        <div className="border-t border-slate-100">
          <div className="flex gap-2 px-5 py-3 bg-slate-100 border-b border-slate-200">
            {([
              { key: "android" as const, icon: "🤖", label: "Android" },
              { key: "ios" as const, icon: "🍎", label: "iOS" },
              { key: "accounts" as const, icon: "👤", label: "Test Accounts" },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                  tab === t.key
                    ? "bg-violet-600 text-white shadow-md ring-2 ring-violet-300"
                    : "bg-white text-slate-600 border border-slate-300 hover:border-violet-400 hover:text-violet-700 hover:shadow"
                }`}>
                <span className="text-base">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "android" && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-5">
                <div className="space-y-2.5">
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                    <div className="text-sm"><strong className="text-slate-900">Install "Expo Go"</strong><span className="text-slate-500"> — Open <strong>Google Play Store</strong> → search "Expo Go" → Install. </span><span className="text-slate-400 text-xs">(Free, ~60 MB)</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                    <div className="text-sm"><strong className="text-slate-900">Open Expo Go</strong><span className="text-slate-500"> → tap <strong>"Enter URL manually"</strong> or <strong>scan QR code →</strong> (scanning will start loading the app)</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                    <div className="text-sm">
                      <strong className="text-slate-900">Enter this URL</strong><span className="text-slate-500"> → tap Connect:</span>
                      <div className="mt-1.5 bg-violet-50 border-2 border-dashed border-violet-300 rounded px-3 py-2 text-center">
                        <code className="text-sm font-bold text-violet-800">exps://hirestream-mobile.agentryx.dev</code>
                      </div>
                      <div className="text-[10px] text-red-500 mt-1 font-medium">⚠️ Use <code className="bg-red-50 px-0.5 rounded">exps://</code> not https://</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">4</span>
                    <div className="text-sm"><strong className="text-slate-900">Wait 15–30s</strong><span className="text-slate-500"> for the first load. Subsequent loads are faster.</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">5</span>
                    <div className="text-sm"><strong className="text-emerald-800">Login</strong><span className="text-slate-500"> — username </span><code className="bg-emerald-50 px-1 py-0.5 rounded font-bold text-emerald-800 text-xs">mobiletest</code><span className="text-slate-500"> · password </span><code className="bg-emerald-50 px-1 py-0.5 rounded font-bold text-emerald-800 text-xs">Mobile@123</code></div>
                  </div>
                  <div className="mt-1 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[10px] text-amber-800 leading-relaxed">
                    <strong>Troubleshooting:</strong> Won't load? Close Expo Go & reopen. Login fails? Case-sensitive lowercase usernames. Slow? First load is 15–30s.
                  </div>
                </div>
                {/* Preview screenshots — click to enlarge */}
                <div className="flex flex-col items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 p-3 min-w-[280px]">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">What you'll see <span className="text-slate-400 normal-case">(click to enlarge)</span></div>
                  <div className="flex gap-2 items-end">
                    {[
                      { src: "/mobile-preview-1.png", alt: "Expo Go home", n: 1 },
                      { src: "/mobile-preview-2.png", alt: "App loading", n: 2 },
                      { src: "/mobile-preview-3.png", alt: "Home screen", n: 3 },
                    ].map((img) => (
                      <div key={img.n} className="flex flex-col items-center gap-1 cursor-pointer group" onClick={() => setLightbox(img.src)}>
                        <img src={img.src} alt={img.alt} className="w-[80px] h-auto rounded shadow-sm border border-slate-200 group-hover:ring-2 group-hover:ring-violet-400 group-hover:shadow-md transition" />
                        <span className="text-[9px] font-bold text-violet-600 bg-violet-100 rounded-full w-4 h-4 flex items-center justify-center">{img.n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-400 text-center leading-tight mt-1">
                    1 — Expo Go &nbsp;·&nbsp; 2 — Loading &nbsp;·&nbsp; 3 — Home screen
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center bg-violet-50 rounded-lg border border-violet-200 p-5 min-w-[200px]">
                  <div className="text-xs font-semibold text-violet-700 mb-2">Scan to connect</div>
                  <img src="/qr-mobile.png" alt="QR Code" width="160" height="160" className="rounded-lg shadow border border-violet-200" />
                  <div className="mt-2 text-[10px] text-violet-400 font-mono text-center">exps://hirestream-mobile<br/>.agentryx.dev</div>
                </div>
              </div>
            )}

            {tab === "ios" && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
                <div className="space-y-2.5">
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                    <div className="text-sm"><strong className="text-slate-900">Install "Expo Go"</strong><span className="text-slate-500"> — Open the <strong>App Store</strong> on your iPhone → search "Expo Go" → Install. </span><span className="text-slate-400 text-xs">(Free, by Expo Project)</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                    <div className="text-sm">
                      <strong className="text-slate-900">Open Safari</strong><span className="text-slate-500"> (not Expo Go!) and <strong>manually type</strong> this URL in the address bar:</span>
                      <div className="mt-1.5 bg-violet-50 border-2 border-dashed border-violet-300 rounded px-3 py-2 text-center">
                        <code className="text-sm font-bold text-violet-800">exps://hirestream-mobile.agentryx.dev</code>
                      </div>
                      <div className="text-[10px] text-red-500 mt-1 font-medium">⚠️ Use <code className="bg-red-50 px-0.5 rounded">exps://</code> not https:// · QR codes do not work on iOS — you must type the URL manually</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                    <div className="text-sm"><strong className="text-slate-900">Tap "Open"</strong><span className="text-slate-500"> when iOS asks <em>"Open this page in Expo Go?"</em> — the app will launch and start loading.</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">4</span>
                    <div className="text-sm"><strong className="text-slate-900">Wait 15–30s</strong><span className="text-slate-500"> for the first load. Subsequent loads are faster.</span></div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold mt-0.5">5</span>
                    <div className="text-sm"><strong className="text-emerald-800">Login</strong><span className="text-slate-500"> — username </span><code className="bg-emerald-50 px-1 py-0.5 rounded font-bold text-emerald-800 text-xs">mobiletest</code><span className="text-slate-500"> · password </span><code className="bg-emerald-50 px-1 py-0.5 rounded font-bold text-emerald-800 text-xs">Mobile@123</code></div>
                  </div>
                  <div className="mt-1 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-[10px] text-blue-800 leading-relaxed">
                    <strong>📌 Why Safari?</strong> iOS Expo Go does not have "Enter URL manually" like Android. Type the URL in Safari — iOS automatically opens Expo Go.
                  </div>
                </div>
                {/* iOS preview screenshots — right column */}
                <div className="flex flex-col items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 p-3 min-w-[300px]">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">What you'll see <span className="text-slate-400 normal-case">(click to enlarge)</span></div>
                  <div className="flex gap-1.5 items-end">
                    {[
                      { src: "/ios-preview-1.png", alt: "Expo Go on iOS", n: 1, label: "Expo Go" },
                      { src: "/ios-preview-2.png", alt: "Type URL in Safari", n: 2, label: "Safari" },
                      { src: "/ios-preview-3.png", alt: "Open in Expo Go dialog", n: 3, label: "Tap Open" },
                      { src: "/ios-preview-4.png", alt: "App loading", n: 4, label: "Loading" },
                      { src: "/ios-preview-5.png", alt: "Home screen", n: 5, label: "Home" },
                    ].map((img) => (
                      <div key={img.n} className="flex flex-col items-center gap-0.5 cursor-pointer group" onClick={() => setLightbox(img.src)}>
                        <img src={img.src} alt={img.alt} className="w-[52px] h-auto rounded shadow-sm border border-slate-200 group-hover:ring-2 group-hover:ring-violet-400 group-hover:shadow-md transition" />
                        <span className="text-[8px] font-bold text-violet-600 bg-violet-100 rounded-full w-3.5 h-3.5 flex items-center justify-center">{img.n}</span>
                        <span className="text-[7px] text-slate-400 leading-none">{img.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "accounts" && (
              <div className="space-y-3">
                <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="text-[10px] uppercase text-slate-500 bg-slate-50">
                    <tr><th className="px-3 py-2 text-left">Username</th><th className="px-3 py-2 text-left">Password</th><th className="px-3 py-2 text-left">Profile</th><th className="px-3 py-2 text-left">Best for testing</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-emerald-50"><td className="px-3 py-2 font-mono font-bold text-emerald-800">mobiletest</td><td className="px-3 py-2 font-mono">Mobile@123</td><td className="px-3 py-2">Candidate</td><td className="px-3 py-2 text-slate-600">⭐ Start here</td></tr>
                    <tr><td className="px-3 py-2 font-mono">priya_verma</td><td className="px-3 py-2 font-mono">test123</td><td className="px-3 py-2">100% complete</td><td className="px-3 py-2 text-slate-600">Full profile, accepted placement</td></tr>
                    <tr><td className="px-3 py-2 font-mono">meera_iyer</td><td className="px-3 py-2 font-mono">test123</td><td className="px-3 py-2">88% complete</td><td className="px-3 py-2 text-slate-600">Missing documents</td></tr>
                    <tr><td className="px-3 py-2 font-mono">demo_candidate</td><td className="px-3 py-2 font-mono">test123</td><td className="px-3 py-2">Basic</td><td className="px-3 py-2 text-slate-600">Fresh testing</td></tr>
                    <tr><td className="px-3 py-2 font-mono">rohan_mehta</td><td className="px-3 py-2 font-mono">test123</td><td className="px-3 py-2">Basic</td><td className="px-3 py-2 text-slate-600">Alternate account</td></tr>
                  </tbody>
                </table>
                <div className="flex gap-3 text-[11px]">
                  <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800">💡 Same database as web portal <code className="bg-blue-100 px-0.5 rounded">hirestream-stg.agentryx.dev</code></div>
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-600">📝 Create new accounts via "Create Account" on login screen</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineOverview({ data, level, onOpenRole }: {
  data: any; level: LevelKey; onOpenRole: (r: RoleKey) => void;
}) {
  const isMobile = data.project.slug?.includes("mobile");
  return (
    <>
      {/* Mobile app setup guide — only on the mobile project */}
      {isMobile && <MobileSetupGuide />}

      {/* Role cards — only show roles that have requirements in this project */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLES.filter(r => r.key !== "cross").map((role) => {
          const reqs = data.requirements.filter((r: any) => role.sections.includes(r.section));
          if (reqs.length === 0) return null;
          const s = statFor(reqs, data.signoffs, level);
          return <RoleCard key={role.key} role={role} stat={s} onClick={() => onOpenRole(role.key)} />;
        })}
      </div>

      {/* Cross-cutting card (wider, full-width) */}
      <div className="mt-4">
        {(() => {
          const role = ROLES.find(r => r.key === "cross")!;
          const reqs = data.requirements.filter((r: any) => role.sections.includes(r.section));
          const s = statFor(reqs, data.signoffs, level);
          return <RoleCard role={role} stat={s} onClick={() => onOpenRole("cross")} wide />;
        })()}
      </div>
      {/* Ideas & Feedback — sibling of the sign-off cards. Distinct gradient
          (amber→orange) and "Future work" label signal that this is forward-
          looking, not signoff-tracking. */}
      <FeedbackCard projectId={data.project.id} projectSlug={data.project.slug} />
      {/* Sprint Releases — delivery-cycle tracking for post-feedback rework. */}
      <SprintSectionWrapper data={data} onChange={() => api.getProject(data.project.slug).then(() => {/* parent reload via reload() below */})} />
    </>
  );
}

// Thin wrapper so the section gets the reviewer's role from the outer scope.
function SprintSectionWrapper({ data, onChange }: { data: any; onChange?: () => void }) {
  const { reviewer: me } = useRequireAuth();
  const canManage = !!me && ["admin", "delivery", "agentryx"].includes(me.role);
  return (
    <SprintSection
      projectSlug={data.project.slug}
      canManage={canManage}
      currentBuildRef={data.project.buildRef}
      onSprintChange={onChange}
    />
  );
}

function GradientMeter({ pct }: { pct: number }) {
  // Fill spans amber (at 0%) → lime (50%) → emerald (100%).
  return (
    <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 30%, #84cc16 60%, #10b981 100%)",
          backgroundSize: `${Math.max(100, 10000 / Math.max(pct, 1))}% 100%`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700 mix-blend-luminosity">
        {pct}%
      </div>
    </div>
  );
}

function RoleCard({ role, stat, onClick, wide }: {
  role: (typeof ROLES)[number]; stat: Stat; onClick: () => void; wide?: boolean;
}) {
  // Headline metric reviewers asked for: at a glance, how many passed out of
  // total (+ what percent). Raw percent alone hides the denominator — 50% of
  // 24 is very different from 50% of 2.
  const signedOff = stat.pass + stat.partial + stat.fail;
  return (
    <button onClick={onClick}
      className={`group text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-agentryx-500 hover:shadow-md transition ${wide ? "w-full" : ""}`}>
      <div className={`h-1.5 bg-gradient-to-r ${role.accent}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">Role</div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">{role.label}</div>
            <div className="text-xs text-slate-400 mt-1">Sections {role.sections.join(", ")}</div>

            {/* Headline ratio — the primary number a reviewer scans for.
                Denominator is the reviewable count (active items a reviewer can actually
                sign off); deferred items are surfaced separately below so total inventory
                stays visible without distorting the pass-rate denominator. */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 tabular-nums">{stat.pass}</span>
              <span className="text-lg font-medium text-slate-400 tabular-nums">/ {stat.reviewable}</span>
              <span className="text-xs text-slate-500 ml-1">passed</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {signedOff} of {stat.reviewable} signed off · {stat.pending} pending
              {stat.deferred > 0 && (
                <span className="text-slate-400"> · <span className="text-slate-600 font-medium">{stat.deferred}</span> deferred</span>
              )}
            </div>
          </div>
          {/* Donut + total count directly under it — so the denominator is
              visible anywhere your eye lands on the card, not just next to the
              headline number. */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Donut pct={stat.pct} />
            <div className="text-[10px] text-slate-500 font-medium tabular-nums">
              <span className="text-slate-900 font-semibold">{stat.pass}</span>
              <span className="text-slate-400"> / {stat.reviewable}</span>
            </div>
          </div>
        </div>

        <div className={`grid ${stat.deferred > 0 ? "grid-cols-5" : "grid-cols-4"} gap-2 mt-5`}>
          <StatPill label="Pass"    count={stat.pass}    color="text-emerald-700 bg-emerald-50" />
          <StatPill label="Partial" count={stat.partial} color="text-amber-700 bg-amber-50" />
          <StatPill label="Fail"    count={stat.fail}    color="text-red-700 bg-red-50" />
          <StatPill label="Pending" count={stat.pending} color="text-slate-600 bg-slate-100" />
          {stat.deferred > 0 && (
            <StatPill label="Deferred" count={stat.deferred} color="text-slate-500 bg-slate-50" />
          )}
        </div>

        <div className="mt-4 text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
          <MousePointerClick className="w-3.5 h-3.5 text-slate-400 group-hover:text-agentryx-500 transition" />
          <span className="font-medium text-slate-700">{stat.total} total</span>
          {stat.deferred > 0 && (
            <span className="text-[10px] text-slate-400">
              ({stat.reviewable} reviewable + {stat.deferred} deferred)
            </span>
          )}
          <span className="text-slate-300">·</span>
          <span className="text-agentryx-600 font-medium group-hover:underline">click to review →</span>
        </div>
      </div>
    </button>
  );
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`${color} rounded-lg px-2 py-2 text-center`}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-xl font-semibold">{count}</div>
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const size = 56, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#84cc16" : pct >= 25 ? "#fbbf24" : "#f59e0b";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        className="fill-slate-800" fontSize="13" fontWeight="600">{pct}%</text>
    </svg>
  );
}

function RoleDetail({ slug, data, me, level, canEditLevel, role, onChanged, needsFixOnly, onToggleNeedsFix, fixScope }: {
  slug: string; data: any; me: any; level: LevelKey; canEditLevel: boolean;
  role: (typeof ROLES)[number]; onChanged: () => void;
  needsFixOnly: boolean; onToggleNeedsFix: () => void;
  fixScope: FixScope;
}) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [openReq, setOpenReq] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<number>(() => {
    // Honour `#row=<itemRef>` deep-links by landing the user on the section
    // that contains the requested row instead of the role's first section.
    const m = typeof window !== "undefined" ? window.location.hash.match(/^#row=(.+)$/) : null;
    if (m) {
      const itemRef = decodeURIComponent(m[1]);
      const req = data.requirements.find((r: any) => r.itemRef === itemRef);
      if (req && role.sections.includes(req.section)) return req.section;
    }
    return role.sections[0];
  });

  const reqsInRole = data.requirements.filter((r: any) => role.sections.includes(r.section));
  const reqsInSection = reqsInRole.filter((r: any) => r.section === activeSection);
  const stat = statFor(reqsInRole, data.signoffs, level);

  const filtered = reqsInSection.filter((r: any) => {
    const matchesText = !filter || r.itemRef.includes(filter) || r.description.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    // "My pending only" — show rows where this reviewer's level has no
    // signoff yet. Excludes deferred/n_a (those aren't signoffable). The
    // chip is hidden when there's nothing pending so it never lies.
    const isDeferredRow = r.status === "deferred" || r.status === "n_a";
    const so = data.signoffs.find((s: any) => s.requirementId === r.id && s.level === level);
    const matchesPending = !pendingOnly || (!isDeferredRow && !so);
    const matchesNeedsFix = !needsFixOnly || reqNeedsFix(r, data.signoffs, fixScope);
    return matchesText && matchesStatus && matchesPending && matchesNeedsFix;
  }).sort((a: any, b: any) => {
    const aDeferred = a.status === "deferred" || a.status === "n_a" ? 1 : 0;
    const bDeferred = b.status === "deferred" || b.status === "n_a" ? 1 : 0;
    return aDeferred - bDeferred;
  });

  const activeCount = filtered.filter((r: any) => r.status !== "deferred" && r.status !== "n_a").length;
  const deferredCount = filtered.filter((r: any) => r.status === "deferred").length;

  const sectionLabel = (n: number) => {
    const first = reqsInRole.find((r: any) => r.section === n);
    return first ? `§${n} — ${first.sectionTitle}` : `§${n}`;
  };

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="min-w-0">
      {/* Section tabs — avoids one long scrolling list. Per-section fix
          count surfaces here too so the tester can see at-a-glance which
          sections still have open work. */}
      {role.sections.length > 1 && (
        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 max-w-full">
          {role.sections.map((n) => {
            const reqs = reqsInRole.filter((r: any) => r.section === n);
            const s = statFor(reqs, data.signoffs, level);
            const fixCount = reqs.filter((r: any) => reqNeedsFix(r, data.signoffs, fixScope)).length;
            const isActive = activeSection === n;
            return (
              <button key={n} onClick={() => setActiveSection(n)}
                className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? "border-agentryx-600 text-agentryx-700 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}>
                {sectionLabel(n)} <span className="ml-1 text-[10px] text-slate-400">({s.pass}/{s.reviewable}{s.deferred > 0 ? ` +${s.deferred}⛔` : ""})</span>
                {fixCount > 0 && (
                  <span className="ml-1 inline-flex items-center text-[10px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-200"
                    title={`${fixCount} item${fixCount === 1 ? "" : "s"} need fixing in this section`}>
                    🔧 {fixCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2 items-center flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <input placeholder="Filter by ID or text…" value={filter} onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-[200px] border border-slate-200 rounded px-3 py-1.5 text-sm" />
        {(() => {
          // Pending count for the active level — drives both the visible
          // chip count and whether the chip renders at all (hidden at 0).
          const pendingCount = reqsInRole.filter((r: any) => {
            if (r.status === "deferred" || r.status === "n_a") return false;
            return !data.signoffs.some((s: any) => s.requirementId === r.id && s.level === level);
          }).length;
          if (pendingCount === 0 && !pendingOnly) return null;
          return (
            <button onClick={() => setPendingOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition ${
                pendingOnly
                  ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50"
              }`}
              title={pendingOnly ? "Showing only requirements awaiting your signoff. Click to show all." : "Show only requirements awaiting your signoff at this level."}>
              {pendingOnly && <Check className="w-3 h-3" />}
              ⏳ My pending {pendingCount > 0 && <span className="font-mono">({pendingCount})</span>}
            </button>
          );
        })()}
        {(() => {
          // Per-role count for the chip badge. Shares state with the
          // project-wide toggle in ContextStrip — toggling either flips
          // both, persisted in localStorage.
          const needsFixCount = reqsInRole.filter((r: any) => reqNeedsFix(r, data.signoffs, fixScope)).length;
          if (needsFixCount === 0 && !needsFixOnly) return null;
          return (
            <button onClick={onToggleNeedsFix}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition ${
                needsFixOnly
                  ? "bg-red-100 border-red-400 text-red-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:bg-red-50"
              }`}
              title={needsFixOnly
                ? "Universal Dev-fix view active across all roles + sections. Click to show all."
                : `Show only items that need fixing in ${role.label} (${needsFixCount}). Toggle is project-wide.`}>
              {needsFixOnly && <Check className="w-3 h-3" />}
              🔧 Needs fixing {needsFixCount > 0 && <span className="font-mono">({needsFixCount})</span>}
            </button>
          );
        })()}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded px-3 py-1.5 text-sm bg-white">
          <option value="all">All statuses</option>
          <option value="delivered">✅ Delivered</option>
          <option value="partial">🟡 Partial</option>
          <option value="not_delivered">❌ Missing</option>
          <option value="deferred">⛔ Deferred</option>
        </select>
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs uppercase text-slate-500 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left w-16">ID</th>
              <th className="px-3 py-2 text-left">Requirement</th>
              <th className="px-3 py-2 w-16 text-center">Status</th>
              <th className="px-3 py-2 w-40 text-center">{LEVELS.find(l => l.key === level)!.label}</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No requirements match.</td></tr>
            )}
            {filtered.map((r: any, idx: number) => {
              const isDeferred = r.status === "deferred" || r.status === "n_a";
              const so = data.signoffs.find((s: any) => s.requirementId === r.id && s.level === level);
              const isAdminLike = me?.role === "admin" || me?.role === "delivery";
              const otherLevels = isAdminLike
                ? LEVELS.filter(l => l.key !== level).map(l => ({
                    l, so: data.signoffs.find((s: any) => s.requirementId === r.id && s.level === l.key),
                  }))
                : [];
              const showDeferredDivider = isDeferred && idx > 0 && filtered[idx - 1]?.status !== "deferred" && filtered[idx - 1]?.status !== "n_a";
              return (
                <>
                  {showDeferredDivider && (
                    <tr key={`divider-${r.id}`}>
                      <td colSpan={5} className="bg-slate-100 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-slate-300" />
                          <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">Future phase — {deferredCount} items pending external integration</span>
                          <div className="h-px flex-1 bg-slate-300" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr key={r.id} id={`req-${r.itemRef}`} className={[
                    "group/row transition",
                    isDeferred
                      ? "border-t border-slate-100 bg-slate-50/70 opacity-50"
                      : "border-t border-slate-100 hover:bg-slate-50",
                    // Colour-coded left border keyed on row origin / external
                    // tracker refs. Precedence: htis_new > htis_smoke > FRS-
                    // with-external-refs (amber). isDeferred suppresses all
                    // colours so the deferred rendering stays consistent.
                    !isDeferred && r.source === "htis_new"   ? "border-l-4 border-l-purple-500 bg-purple-50/30" : "",
                    !isDeferred && r.source === "htis_smoke" ? "border-l-4 border-l-sky-500" : "",
                    !isDeferred && r.source === "frs" && Array.isArray(r.externalRefs) && r.externalRefs.length > 0
                      ? "border-l-4 border-l-amber-500 bg-amber-50/30" : "",
                  ].filter(Boolean).join(" ")}>
                    <td className={`px-3 py-2 font-mono text-xs ${isDeferred ? "text-slate-300" : "text-slate-500"}`}>
                      {r.itemRef}
                      {!isDeferred && Array.isArray(r.externalRefs) && r.externalRefs.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {r.externalRefs.map((ref: string) => (
                            <span key={ref}
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold border ${
                                r.source === "htis_new"
                                  ? "bg-purple-100 text-purple-800 border-purple-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                              title="HTIS bug reference">
                              {ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-2 ${isDeferred ? "text-slate-400" : ""}`}>
                      <span className={isDeferred ? "line-through decoration-slate-300" : ""}>{r.description}</span>
                      {isDeferred && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            Planned for future phase
                          </span>
                        </div>
                      )}
                      {!isDeferred && r.evidence && <div className="text-xs text-slate-400 mt-1">{r.evidence}</div>}
                      {!isDeferred && otherLevels.length > 0 && (
                        <div className="flex gap-2 mt-1">
                          {otherLevels.map(({ l, so }) => (
                            <span key={l.key} className="text-[10px] text-slate-400">
                              {l.short}: <DecisionDot d={so?.decision} />
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-lg">{isDeferred ? <span className="text-slate-300">⛔</span> : (STATUS_GLYPH[r.status] ?? "—")}</td>
                    {isDeferred ? (
                      <td className="px-3 py-2 text-center text-[10px] text-slate-400 italic">N/A</td>
                    ) : (
                      <SignoffCell slug={slug} reqId={r.id} level={level} current={so}
                        canEdit={!!me && canEditLevel}
                        reverify={needsReverify(r, so, data.deployedSprints)}
                        reverifySprint={reverifySprint(r, so, data.deployedSprints)}
                        onChanged={onChanged} />
                    )}
                    <td className="text-center">
                      {!isDeferred && (
                        <div className="inline-flex items-center gap-2">
                          {/* Copy-row-link — appears on row hover. Pasting the
                              URL anywhere (chat, ticket, email) reopens the
                              project on this exact row with an amber pulse. */}
                          <CopyRowLink itemRef={r.itemRef} />
                          <button onClick={() => setOpenReq(openReq === r.id ? null : r.id)}
                            className="text-slate-400 hover:text-agentryx-600"
                            title="Open instructions / discussion">
                            <MessageSquare className="w-4 h-4 inline" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {openReq === r.id && !isDeferred && (
                    <tr><td colSpan={5} className="bg-slate-50 px-6 py-4">
                      <RequirementInstructions slug={slug} req={r} me={me} onChanged={onChanged} />
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <CommentThread slug={slug} reqId={r.id} canPost={!!me} />
                      </div>
                    </td></tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Role dashboard sidebar — live stats for the selected role */}
      <aside className="lg:sticky lg:top-4 self-start">
        <RoleDashboard role={role} reqsInRole={reqsInRole} data={data} level={level} canEditLevel={canEditLevel} me={me} />
      </aside>
    </div>
  );
}

function RoleDashboard({ role, reqsInRole, data, level, canEditLevel, me }: {
  role: (typeof ROLES)[number]; reqsInRole: any[]; data: any;
  level: LevelKey; canEditLevel: boolean; me: any;
}) {
  const stat = statFor(reqsInRole, data.signoffs, level);
  const bySection = role.sections.map((n) => {
    const reqs = reqsInRole.filter((r: any) => r.section === n);
    return { n, title: reqs[0]?.sectionTitle ?? `Section ${n}`, s: statFor(reqs, data.signoffs, level) };
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${role.accent}`} />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Reviewing</div>
            <div className="text-lg font-semibold text-slate-900">{role.label}</div>
            <div className="text-[11px] text-slate-400">
              at {LEVELS.find(l => l.key === level)!.short}
              {me && !canEditLevel && <span className="ml-1 text-amber-600">· read-only</span>}
            </div>
          </div>
          {/* Donut + N/M count directly underneath — mirrors the role-card
              pattern so the denominator is visible everywhere. */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Donut pct={stat.pct} />
            <div className="text-[10px] text-slate-500 font-medium tabular-nums">
              <span className="text-slate-900 font-semibold">{stat.pass}</span>
              <span className="text-slate-400"> / {stat.reviewable}</span>
            </div>
          </div>
        </div>

        {/* Headline ratio + meter */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900 tabular-nums">{stat.pass}</span>
          <span className="text-base font-medium text-slate-400 tabular-nums">/ {stat.reviewable}</span>
          <span className="text-xs text-slate-500 ml-1">passed</span>
        </div>
        <div className="mt-2"><GradientMeter pct={stat.pct} /></div>

        <div className={`grid ${stat.deferred > 0 ? "grid-cols-3" : "grid-cols-2"} gap-2 mt-4`}>
          <StatPill label="Pass"    count={stat.pass}    color="text-emerald-700 bg-emerald-50" />
          <StatPill label="Partial" count={stat.partial} color="text-amber-700 bg-amber-50" />
          <StatPill label="Fail"    count={stat.fail}    color="text-red-700 bg-red-50" />
          <StatPill label="Pending" count={stat.pending} color="text-slate-600 bg-slate-100" />
          {stat.deferred > 0 && (
            <StatPill label="Deferred" count={stat.deferred} color="text-slate-500 bg-slate-50" />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px]">
          <span className="uppercase tracking-wide text-slate-500 font-medium">
            {reqsInRole.length} requirements{stat.deferred > 0 && <span className="text-slate-400 normal-case"> ({stat.reviewable} reviewable, {stat.deferred} deferred)</span>}
          </span>
          <span className="text-slate-500">
            <span className="font-semibold text-slate-700 tabular-nums">{stat.pass + stat.partial + stat.fail}</span>
            <span className="text-slate-400"> / {stat.reviewable}</span> signed off
          </span>
        </div>

        {role.sections.length > 1 && (
          <div className="mt-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Per section</div>
            <div className="space-y-2">
              {bySection.map(({ n, title, s }) => (
                <div key={n}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-700 font-medium truncate pr-2">§{n} {title}</span>
                    <span className="text-slate-500 font-mono shrink-0">{s.pass}/{s.reviewable}{s.deferred > 0 && <span className="text-slate-400"> +{s.deferred}⛔</span>}</span>
                  </div>
                  <div className="mt-0.5"><GradientMeter pct={s.pct} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status breakdown — how the delivery team classified each req */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Delivery status</div>
          <div className="space-y-1 text-xs">
            {([
              ["delivered", "✅ Delivered", "text-emerald-700"],
              ["partial", "🟡 Partial", "text-amber-700"],
              ["not_delivered", "❌ Missing", "text-red-700"],
              ["deferred", "⛔ Deferred", "text-slate-600"],
            ] as const).map(([k, label, cls]) => {
              const count = reqsInRole.filter((r: any) => r.status === k).length;
              return (
                <div key={k} className="flex items-center justify-between">
                  <span className={cls}>{label}</span>
                  <span className="font-mono text-slate-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Persistent context strip ─────────────────────────────────────────
// Always visible once the user is past the project header. Shows the
// breadcrumb, overall approval meter for the active pipeline, and a
// one-click chip per role so switching never requires going "back".
function ContextStrip({ data, level, activeRole, onPickRole, needsFixOnly, onToggleNeedsFix, fixScope, me }: {
  data: any; level: LevelKey; activeRole: RoleKey | null;
  onPickRole: (r: RoleKey | null) => void;
  needsFixOnly: boolean;
  onToggleNeedsFix: () => void;
  fixScope: FixScope;
  me: any;
}) {
  const overall = useMemo(() => statFor(data.requirements, data.signoffs, level), [data, level]);
  const levelLabel = LEVELS.find(l => l.key === level)!.label;
  const isAdminLike = me?.role === "admin" || me?.role === "delivery";
  // Project-wide open-defect count (all roles, all sections), scoped to
  // either the tester's own level or the admin's cross-stage view.
  const needsFixCount = useMemo(
    () => data.requirements.filter((r: any) => reqNeedsFix(r, data.signoffs, fixScope)).length,
    [data, fixScope]
  );
  // Source breakdown for the explainer. Counts the same rows as
  // `needsFixCount` and classifies each by why it's there.
  // - For the admin "latest" scope: by the most-downstream flagged level
  // - For a tester "level" scope: by their own status (pending vs. their flag)
  const breakdown = useMemo(() => {
    const b = {
      delivery: 0,
      agentryx: 0, htis: 0, hpsedc_staging: 0, hpsedc_final: 0,
      myPending: 0, myFlagged: 0,
    };
    for (const r of data.requirements) {
      if (!reqNeedsFix(r, data.signoffs, fixScope)) continue;
      if (r.status === "partial" || r.status === "not_delivered") { b.delivery++; continue; }
      if (fixScope.kind === "level") {
        const my = data.signoffs.find((s: any) => s.requirementId === r.id && s.level === fixScope.level);
        if (!my) b.myPending++;
        else b.myFlagged++;
        continue;
      }
      // admin "latest" scope
      const latest = latestSignoff(r.id, data.signoffs);
      if (latest) b[latest.level as keyof typeof b]++;
    }
    return b;
  }, [data, fixScope]);

  return (
    <div className={`mt-6 border rounded-xl p-4 transition ${
      needsFixOnly ? "bg-red-50/30 border-red-200" : "bg-white border-slate-200"
    }`}>
      {/* Breadcrumb — leads with "All projects" so reviewers always have a
          one-click path back to the projects list, not just to this project's
          own overview. Reviewers were getting stuck inside a deep section view
          with no obvious return path. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/projects" className="hover:text-agentryx-600 hover:underline">All projects</Link>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <button onClick={() => onPickRole(null)}
            className="hover:text-agentryx-600 hover:underline">Overview</button>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className="text-slate-700 font-medium">{levelLabel}</span>
          {activeRole && (<>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-900 font-semibold">{ROLES.find(r => r.key === activeRole)!.label}</span>
          </>)}
        </div>

        {/* Universal "Needs fixing" toggle — applies across every role and
            section in the project. Persisted in localStorage so the dev
            team's daily view stays consistent. Hidden when count is zero
            and the filter isn't already active (so it never lies). */}
        {(needsFixCount > 0 || needsFixOnly) && (
          <button onClick={onToggleNeedsFix}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
              needsFixOnly
                ? "bg-red-600 border-red-600 text-white shadow-sm"
                : "bg-white border-red-300 text-red-700 hover:bg-red-50"
            }`}
            title={fixScope.kind === "level"
              ? `Your funnel — items at ${LEVELS.find(l => l.key === fixScope.level)!.label} you haven't passed yet. Click to ${needsFixOnly ? "show all" : "scope the matrix to your work"}.`
              : `Cross-stage dev backlog — rows whose latest verdict is Fail/Partial or delivery-side incomplete. Click to ${needsFixOnly ? "show all" : "scope to open items"}.`}>
            {needsFixOnly && <Check className="w-3 h-3" />}
            🔧 {fixScope.kind === "level" ? "My funnel" : "Needs fixing"} <span className="font-mono">({needsFixCount})</span>
          </button>
        )}
      </div>

      {/* Active-filter explainer — copy adapts to the current scope so the
          tester sees their own funnel breakdown and the admin sees the
          cross-stage one. */}
      {needsFixOnly && (
        <div className="mt-3 rounded-md bg-red-100/60 border border-red-200 px-3 py-2 text-[11px] text-red-900 leading-snug">
          {fixScope.kind === "level" ? (
            <>
              <span className="font-semibold">Your funnel — </span>
              items at <span className="font-medium">{LEVELS.find(l => l.key === fixScope.level)!.label}</span> you haven't passed yet.
              {(breakdown.myPending + breakdown.myFlagged + breakdown.delivery) > 0 && (
                <> Currently: {
                  [
                    breakdown.myPending > 0 && <span key="p"><span className="font-mono">{breakdown.myPending}</span> pending your signoff</span>,
                    breakdown.myFlagged > 0 && <span key="m"><span className="font-mono">{breakdown.myFlagged}</span> you flagged Fail/Partial</span>,
                    breakdown.delivery > 0 && <span key="d"><span className="font-mono">{breakdown.delivery}</span> delivery-side partial</span>,
                  ].filter(Boolean).reduce((acc: any[], el, i) => i === 0 ? [el] : [...acc, " · ", el], [])
                }.</>
              )}
              {" "}Other reviewers' verdicts don't appear here — this is your work to clear.
            </>
          ) : (
            <>
              <span className="font-semibold">Dev-fix view (admin) — </span>
              rows whose <em>latest</em> reviewer verdict is Fail / Partial, plus delivery-side incomplete.
              {(breakdown.delivery + breakdown.agentryx + breakdown.htis + breakdown.hpsedc_staging + breakdown.hpsedc_final) > 0 && (
                <> Currently: {
                  [
                    breakdown.delivery > 0 && <span key="d"><span className="font-mono">{breakdown.delivery}</span> delivery-side partial</span>,
                    breakdown.agentryx > 0 && <span key="a"><span className="font-mono">{breakdown.agentryx}</span> still awaiting Agentryx</span>,
                    breakdown.htis > 0 && <span key="h"><span className="font-mono">{breakdown.htis}</span> awaiting HTIS</span>,
                    breakdown.hpsedc_staging > 0 && <span key="s"><span className="font-mono">{breakdown.hpsedc_staging}</span> rejected at HPSEDC Staging</span>,
                    breakdown.hpsedc_final > 0 && <span key="f"><span className="font-mono">{breakdown.hpsedc_final}</span> rejected at HPSEDC Final</span>,
                  ].filter(Boolean).reduce((acc: any[], el, i) => i === 0 ? [el] : [...acc, " · ", el], [])
                }.</>
              )}
              {" "}A later Pass on the same row clears it from this view.
              {isAdminLike && <span className="ml-1 italic text-red-700/80">(Per-level multi-select / OR / AND filter coming next.)</span>}
            </>
          )}
        </div>
      )}

      {/* Overall meter — compact, always visible.
          Headline ratio on the left makes the denominator explicit; without it
          a bare "17%" begs the question "of how many?". */}
      <div className="mt-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Overall {levelLabel}</span>
        </div>
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-2xl font-bold text-slate-900 tabular-nums">{overall.pass}</span>
          <span className="text-base font-medium text-slate-400 tabular-nums">/ {overall.reviewable}</span>
          <span className="text-xs text-slate-500 ml-0.5">passed</span>
          <span className="text-xs font-semibold text-slate-900 ml-2 px-1.5 py-0.5 rounded bg-slate-100 tabular-nums">{overall.pct}%</span>
        </div>
        <div className="flex-1 min-w-[180px]"><GradientMeter pct={overall.pct} /></div>
        <div className="text-xs text-slate-500 whitespace-nowrap">
          <span className="text-emerald-600 font-medium">{overall.pass}</span> pass ·
          <span className="text-amber-600 font-medium"> {overall.partial}</span> partial ·
          <span className="text-red-600 font-medium"> {overall.fail}</span> fail ·
          <span className="text-slate-500"> {overall.pending}</span> pending
          {overall.deferred > 0 && (
            <> · <span className="text-slate-600 font-medium">{overall.deferred}</span> deferred</>
          )}
          <span className="text-slate-400"> · </span>
          <span className="font-semibold text-slate-700 tabular-nums">{overall.total} total</span>
        </div>
      </div>

      {/* Role chips — click to open or switch. Small red "🔧 N" badge
          appears whenever a role has open defects, so the dev team can
          spot at-a-glance which roles still have work — independent of
          whether the top-level Needs-fixing filter is active. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {ROLES.map((role) => {
          const reqs = data.requirements.filter((r: any) => role.sections.includes(r.section));
          if (reqs.length === 0) return null;
          const s = statFor(reqs, data.signoffs, level);
          const fixCount = reqs.filter((r: any) => reqNeedsFix(r, data.signoffs, fixScope)).length;
          const isActive = activeRole === role.key;
          return (
            <button key={role.key} onClick={() => onPickRole(role.key)}
              className={`group flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-xs transition ${
                isActive
                  ? "border-agentryx-500 bg-agentryx-50 text-agentryx-900 shadow-sm"
                  : "border-slate-200 text-slate-600 hover:border-agentryx-300 hover:bg-slate-50"
              }`}>
              <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${role.accent}`} />
              <span className="font-medium">{role.label}</span>
              <span className="text-slate-400 font-mono">{s.pass}/{s.reviewable}{s.deferred > 0 ? ` +${s.deferred}⛔` : ""}</span>
              {fixCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200"
                  title={`${fixCount} item${fixCount === 1 ? "" : "s"} need fixing in ${role.label}`}>
                  🔧 {fixCount}
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                s.pct >= 80 ? "bg-emerald-100 text-emerald-700"
                : s.pct >= 50 ? "bg-lime-100 text-lime-700"
                : s.pct >= 25 ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-500"
              }`}>{s.pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Reviewer badge (who am I signed in as, and what can I touch) ──────
function ReviewerBadge({ me }: { me: any }) {
  const roleMeta: Record<string, { label: string; scope: string; color: string }> = {
    admin:           { label: "Admin",          scope: "All pipelines",          color: "bg-slate-900 text-white" },
    delivery:        { label: "Delivery",       scope: "All pipelines",          color: "bg-agentryx-600 text-white" },
    agentryx:        { label: "Agentryx",       scope: "Internal review only",   color: "bg-indigo-600 text-white" },
    htis:            { label: "HTIS",           scope: "HTIS review only",       color: "bg-blue-600 text-white" },
    hpsedc_staging:  { label: "HPSEDC STG",     scope: "Staging only",           color: "bg-emerald-600 text-white" },
    hpsedc_final:    { label: "HPSEDC Final",   scope: "Final UAT only",         color: "bg-purple-600 text-white" },
    observer:        { label: "Observer",       scope: "Read-only",              color: "bg-slate-500 text-white" },
  };
  const rm = roleMeta[me.role] ?? { label: me.role, scope: "—", color: "bg-slate-500 text-white" };
  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <div className="text-xs font-medium text-slate-700">{me.name}</div>
        <div className="text-[10px] text-slate-500">{rm.scope}</div>
      </div>
      <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${rm.color}`}>{rm.label}</span>
    </div>
  );
}

// ── Sign-in banner when unauthenticated on a role detail ──────────────
function SignInBanner() {
  return (
    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <LogIn className="w-5 h-5 text-amber-700" />
      <div className="flex-1 text-sm text-amber-900">
        <div className="font-medium">You're browsing in read-only mode.</div>
        <div className="text-xs text-amber-800/80">Sign in as a reviewer to record Pass / Partial / Fail decisions on each requirement.</div>
      </div>
      <Link href="/login"
        className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded px-4 py-2">
        Sign in
      </Link>
    </div>
  );
}

const STATUS_GLYPH: Record<string, string> = {
  delivered: "✅", partial: "🟡", not_delivered: "❌", deferred: "⛔", n_a: "—",
};

function DecisionDot({ d }: { d?: Decision | string }) {
  const cls = d === "accepted" ? "bg-emerald-500"
    : d === "rejected" ? "bg-red-500"
    : d === "waived" ? "bg-amber-500"
    : "bg-slate-300";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />;
}

function SignoffCell({ slug, reqId, level, current, canEdit, onChanged, reverify, reverifySprint }: any) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState(current?.comment ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mac users typically screenshot to clipboard (Cmd+Ctrl+Shift+4) or drag
  // the floating thumbnail. Handle both so file-picker isn't the only way in.
  function addFiles(incoming: File[]) {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...images].slice(0, 5));
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const images = items
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length > 0) {
      e.preventDefault();
      addFiles(images);
    }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length > 0) addFiles(dropped);
  }

  const glyph = current?.decision === "accepted" ? "✓"
    : current?.decision === "rejected" ? "✗"
    : current?.decision === "waived" ? "~" : "·";
  const cls = current?.decision === "accepted" ? "bg-emerald-600 text-white"
    : current?.decision === "rejected" ? "bg-red-600 text-white"
    : current?.decision === "waived" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400";
  const existingAttachments: any[] = current?.attachments ?? [];

  function cancel() {
    setComment(current?.comment ?? "");
    setFiles([]);
    setOpen(false);
  }
  async function decide(decision: string) {
    setBusy(true);
    try {
      await api.signoff(slug, reqId, level, decision, comment || undefined, files);
      setFiles([]); setOpen(false); onChanged();
    } catch (err: any) {
      // Surface the real reason — previously we swallowed errors via
      // try/finally, leaving the user clicking Pass/Partial with no feedback.
      // 413s can come from either nginx (client_max_body_size) or multer
      // (MAX_FILE_SIZE); the server message is the authoritative one, so
      // show it verbatim rather than guessing a byte count.
      const raw = String(err?.message ?? "");
      const msg = raw.includes("<!DOCTYPE")
        ? "The server rejected the upload before it reached the app (likely a size limit on the reverse proxy). Try a smaller screenshot."
        : raw || "Couldn't save — please try again.";
      alert(`Sign-off failed:\n\n${msg}`);
      console.error("signoff failed", err);
    } finally { setBusy(false); }
  }
  async function clear() {
    try { await api.clearSignoff(slug, reqId, level); } catch (e: any) { alert(e?.message ?? "Clear failed"); return; }
    setComment(""); setFiles([]); setOpen(false); onChanged();
  }
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") cancel(); }
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) cancel();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <td className="px-3 py-2 text-center relative">
      <button disabled={!canEdit} onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-semibold ${cls} ${canEdit ? "hover:ring-2 hover:ring-agentryx-300 cursor-pointer" : "cursor-not-allowed"}`}
        title={canEdit ? (current ? current.decision : "Not signed off") : "Your role cannot sign off at this level"}>{glyph}</button>
      {/* Re-verify chip — appears when a deployed sprint has listed this item as
          fixed and the reviewer's decision predates that deploy. Clicking it
          (when canEdit) flips the decision to Pass with an auto-comment naming
          the sprint + buildRef. Saves the four-click round-trip of opening the
          popover, retyping a comment, and clicking Pass. */}
      {reverify && (
        canEdit && reverifySprint ? (
          <button
            disabled={reverifying}
            onClick={async (e) => {
              e.stopPropagation();
              if (reverifying) return;
              const ok = window.confirm(
                `Mark this item as Pass after re-verifying against ${reverifySprint.buildRef ?? "the latest build"}?\n\n` +
                `Sprint: ${reverifySprint.name}\n` +
                `(You can still change this decision later.)`
              );
              if (!ok) return;
              setReverifying(true);
              try {
                const note = `Re-verified after ${reverifySprint.name}${reverifySprint.buildRef ? ` (${reverifySprint.buildRef})` : ""}.`;
                const previous = current?.comment ? `${current.comment}\n\n${note}` : note;
                await api.signoff(slug, reqId, level, "accepted", previous, []);
                onChanged();
              } catch (err: any) {
                alert(`Re-verify failed: ${err?.message ?? "please try again"}`);
              } finally {
                setReverifying(false);
              }
            }}
            className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 hover:bg-indigo-200 hover:border-indigo-400 disabled:opacity-50 transition whitespace-nowrap cursor-pointer"
            title={`Click to mark Pass after re-verifying. Auto-comments "${reverifySprint.name}".`}>
            {reverifying ? "saving…" : "🔁 re-verify ✓"}
          </button>
        ) : (
          <div className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap"
            title="This item was fixed in a recent sprint. Please re-verify.">
            🔁 re-verify
          </div>
        )
      )}
      {open && canEdit && (
        <div ref={popoverRef}
          onPaste={onPaste}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`absolute right-2 mt-1 z-20 bg-white border rounded-lg shadow-lg p-3 text-left w-72 transition ${
            dragOver ? "border-agentryx-500 ring-2 ring-agentryx-200" : "border-slate-200"
          }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Sign off</span>
            <button onClick={cancel} title="Close (Esc)" className="text-slate-400 hover:text-slate-700 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} onPaste={onPaste}
            placeholder="Comment (optional). You can paste a screenshot here (Cmd/Ctrl + V)."
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs h-16" />

          {/* One-click reasons — prepend a short tag into the comment so the
              most-common rejection / partial verdicts don't need typing.
              Reviewers can still edit the textarea after picking. */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[
              "Repro unclear",
              "Works on my build",
              "Wrong env / creds",
              "Out of scope",
              "Awaiting clarification",
              "Needs re-test",
            ].map((tag) => (
              <button key={tag} type="button"
                onClick={() => setComment((c: string) => c ? `${tag} — ${c}` : `${tag} — `)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 bg-white hover:border-agentryx-400 hover:text-agentryx-700 hover:bg-slate-50"
                title={`Prefill comment with "${tag}"`}>
                + {tag}
              </button>
            ))}
          </div>

          {existingAttachments.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Previously attached</div>
              <div className="flex flex-wrap gap-1">
                {existingAttachments.map((a: any) => (
                  <a key={a.id} href={api.attachmentUrl(a.id)} target="_blank" rel="noopener"
                    className="block w-10 h-10 rounded border border-slate-200 overflow-hidden hover:ring-2 hover:ring-agentryx-400"
                    title={a.originalName}>
                    <img src={api.attachmentUrl(a.id)} alt="" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilePick} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-slate-300 text-slate-600 hover:border-agentryx-400 hover:bg-slate-50 rounded px-2 py-1.5 transition">
              <Paperclip className="w-3 h-3" />
              Attach screenshots {files.length > 0 && <span className="text-agentryx-600 font-medium">({files.length}/5)</span>}
            </button>
            <p className="text-[10px] text-slate-400 mt-1 text-center">
              Click to pick · paste (Cmd/Ctrl + V) · or drag-drop here
            </p>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {files.map((f, i) => (
                  <div key={i} className="relative w-10 h-10 rounded border border-slate-200 overflow-hidden">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-slate-700 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-1 mt-2">
            <button disabled={busy} onClick={() => decide("accepted")} className="flex-1 bg-emerald-600 text-white rounded px-2 py-1 text-xs disabled:opacity-50">Pass</button>
            <button disabled={busy} onClick={() => decide("waived")}   className="flex-1 bg-amber-500 text-white rounded px-2 py-1 text-xs disabled:opacity-50">Partial</button>
            <button disabled={busy} onClick={() => decide("rejected")} className="flex-1 bg-red-600 text-white rounded px-2 py-1 text-xs disabled:opacity-50">Fail</button>
          </div>
          <div className="flex gap-1 mt-2">
            <button onClick={cancel}
              className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded px-2 py-1 text-xs">
              Cancel
            </button>
            {current && (
              <button onClick={clear}
                className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 rounded px-2 py-1 text-xs">
                Clear decision
              </button>
            )}
          </div>
        </div>
      )}
    </td>
  );
}

function RequirementInstructions({ slug, req, me, onChanged }: {
  slug: string; req: any; me: any; onChanged: () => void;
}) {
  const canEdit = me && (me.role === "admin" || me.role === "delivery");
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState(req.testSteps ?? "");
  const [expected, setExpected] = useState(req.expectedResult ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateRequirement(slug, req.id, { testSteps: steps, expectedResult: expected });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-slate-500">How to test</div>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs text-agentryx-600 hover:underline">Edit</button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Steps</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {req.testSteps || <span className="text-slate-400 italic">No steps recorded.</span>}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Expected</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {req.expectedResult || <span className="text-slate-400 italic">No expected outcome recorded.</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Steps</div>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Expected</div>
            <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={3}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); setSteps(req.testSteps ?? ""); setExpected(req.expectedResult ?? ""); }}
              className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1 text-xs bg-agentryx-600 text-white rounded disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentThread({ slug, reqId, canPost }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.getComments(slug, reqId).then(setItems); }, [reqId]);

  async function post() {
    if (!body.trim() && files.length === 0) return;
    setBusy(true);
    try {
      await api.postComment(slug, reqId, body, files);
      setBody(""); setFiles([]);
      api.getComments(slug, reqId).then(setItems);
    } finally { setBusy(false); }
  }
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  }
  // Paste-from-clipboard + drag-drop for screenshots (Mac-friendly).
  function addFiles(incoming: File[]) {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...images].slice(0, 5));
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgs = items
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (imgs.length > 0) { e.preventDefault(); addFiles(imgs); }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length > 0) addFiles(dropped);
  }

  return (
    <div onPaste={onPaste} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="text-xs uppercase text-slate-500 mb-2">Discussion</div>
      <div className="space-y-2">
        {items.length === 0 && <div className="text-xs text-slate-400">No comments yet.</div>}
        {items.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded p-2 text-sm">
            <div className="text-xs text-slate-500">{c.reviewerName} <span className="text-slate-400">· {c.reviewerOrg} · {new Date(c.createdAt).toLocaleString()}</span></div>
            {c.body && <div className="mt-1 whitespace-pre-wrap">{c.body}</div>}
            {c.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {c.attachments.map((a: any) => (
                  <a key={a.id} href={api.attachmentUrl(a.id)} target="_blank" rel="noopener"
                    className="block w-16 h-16 rounded border border-slate-200 overflow-hidden hover:ring-2 hover:ring-agentryx-400 transition"
                    title={a.originalName}>
                    <img src={api.attachmentUrl(a.id)} alt={a.originalName} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {canPost && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment… (paste Cmd/Ctrl+V to include a screenshot)"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); } }}
              onPaste={onPaste}
              className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm" />
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilePick} />
            <button onClick={() => fileInputRef.current?.click()} title="Attach screenshots"
              className="flex items-center gap-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded px-2 py-1 text-sm">
              <Paperclip className="w-3.5 h-3.5" />
              {files.length > 0 && <span className="text-[10px] text-agentryx-600 font-medium">{files.length}</span>}
            </button>
            <button disabled={busy} onClick={post} className="bg-agentryx-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50">
              {busy ? "..." : "Post"}
            </button>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="relative w-12 h-12 rounded border border-slate-200 overflow-hidden">
                  <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-slate-700 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Copy-link button on each row. Hidden until row hover (group/row hover) so
// the matrix stays visually clean; on click, copies the absolute URL with a
// `#row=<itemRef>` hash and flips to a check-mark for 1.5s as confirmation.
function CopyRowLink({ itemRef }: { itemRef: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#row=${encodeURIComponent(itemRef)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Fallback: prompt so user can manually copy.
      window.prompt("Copy this link:", url);
    });
  }
  return (
    <button onClick={copy}
      className={`opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition ${copied ? "text-emerald-600" : "text-slate-400 hover:text-agentryx-600"}`}
      title={copied ? "Link copied!" : `Copy link to row ${itemRef}`}>
      {copied ? <Check className="w-4 h-4 inline" /> : <Link2 className="w-4 h-4 inline" />}
    </button>
  );
}

function IssuesPanel({ slug, canEdit, me }: { slug: string; canEdit: boolean; me?: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ severity: "minor", description: "", itemRef: "" });
  // Per-row save state: "saving" → "saved" (ticker) → cleared, or "error".
  // Gives the reviewer visible confirmation the dropdown change was persisted
  // instead of a silent onChange → API call → no UI feedback.
  const [rowState, setRowState] = useState<Record<string, "saving" | "saved" | "error">>({});

  useEffect(() => { api.listIssues(slug).then(setItems); }, [slug]);
  async function create() {
    if (!form.description.trim()) return;
    await api.createIssue(slug, form);
    setForm({ severity: "minor", description: "", itemRef: "" });
    api.listIssues(slug).then(setItems);
  }
  async function setStatus(id: string, status: string) {
    setRowState((s) => ({ ...s, [id]: "saving" }));
    try {
      await api.updateIssue(slug, id, { status });
      const rows = await api.listIssues(slug);
      setItems(rows);
      setRowState((s) => ({ ...s, [id]: "saved" }));
      setTimeout(() => setRowState((s) => { const { [id]: _, ...rest } = s; return rest; }), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [id]: "error" }));
      alert(`Couldn't update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const isAdmin = me?.role === "admin" || me?.role === "delivery";
  const canEditRow = (i: any) => canEdit && (isAdmin || i.reportedById === me?.id);

  const sevColor: Record<string, string> = {
    blocker: "bg-red-100 text-red-800",
    major: "bg-orange-100 text-orange-800",
    minor: "bg-yellow-100 text-yellow-800",
    trivial: "bg-slate-100 text-slate-700",
  };
  const statusColor: Record<string, string> = {
    open: "bg-amber-50 text-amber-800 border-amber-200",
    in_progress: "bg-blue-50 text-blue-800 border-blue-200",
    needs_info: "bg-purple-50 text-purple-800 border-purple-200",
    resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    wont_fix: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Issues log</h2>
      <div className="mt-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Reporter</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400 text-center">No issues raised yet.</td></tr>}
            {items.map((i) => {
              const editable = canEditRow(i);
              const state = rowState[i.id];
              return (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{i.shortId}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{i.itemRef ?? "—"}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${sevColor[i.severity]}`}>{i.severity}</span></td>
                  <td className="px-3 py-2">{i.description}{i.resolution && <div className="text-xs text-slate-500 mt-1">→ {i.resolution}</div>}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium text-slate-700">{i.reporterUsername || "—"}</div>
                    {i.reporterOrg && <div className="text-slate-400">{i.reporterOrg}</div>}
                    {i.createdAt && <div className="text-slate-400">{fmtDate(i.createdAt)}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <div className="flex items-center gap-2">
                        <select value={i.status} onChange={(e) => setStatus(i.id, e.target.value)}
                          disabled={state === "saving"}
                          className={`border rounded px-2 py-1 text-xs bg-white ${statusColor[i.status] ?? "border-slate-200"}`}>
                          <option value="open">Open</option><option value="in_progress">In progress</option>
                          <option value="needs_info">Needs info</option><option value="resolved">Resolved</option>
                          <option value="closed">Closed</option><option value="wont_fix">Won't fix</option>
                        </select>
                        {state === "saving" && <span className="text-[10px] text-slate-400">Saving…</span>}
                        {state === "saved"  && <span className="text-[10px] text-emerald-600 font-semibold">✓ Saved</span>}
                        {state === "error"  && <span className="text-[10px] text-red-600 font-semibold">Failed</span>}
                      </div>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${statusColor[i.status] ?? "border-slate-200 text-slate-600"}`}
                        title={canEdit ? "Only the reporter or an admin can change this status" : ""}>
                        {i.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="mt-3 flex gap-2 items-end">
          <input placeholder="Item ref (e.g. 1.18)" value={form.itemRef}
            onChange={(e) => setForm({ ...form, itemRef: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 text-sm w-28" />
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 text-sm bg-white">
            <option value="blocker">Blocker</option><option value="major">Major</option>
            <option value="minor">Minor</option><option value="trivial">Trivial</option>
          </select>
          <input placeholder="Describe the issue…" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm" />
          <button onClick={create} className="bg-agentryx-600 text-white rounded px-3 py-1 text-sm">Add</button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        Issues are project-wide — every reviewer can see them. Only the reporter or an admin can change the status of a given entry.
      </p>
    </div>
  );
}
