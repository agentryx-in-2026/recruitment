import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ClipboardCheck, Sparkles, ArrowRight, Lightbulb, ListChecks, ArrowDown, Eye, EyeOff, Smartphone } from "lucide-react";
import { Header } from "../components/Header";
import { api } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";

const PROJECT_ORDER: Record<string, { icon: "frs" | "mobile" | "smoke" | "extras"; badge: string; badgeColor: string; tip: string }> = {
  "hirestream-lite":        { icon: "frs",    badge: "START HERE", badgeColor: "bg-emerald-600 text-white",     tip: "The web portal HPSEDC will launch. Test each role, then retest the known defects in §6 once they are fixed." },
  "hirestream-v1.4":        { icon: "frs",    badge: "ARCHIVE",    badgeColor: "bg-slate-200 text-slate-700",     tip: "Earlier multi-agency build — superseded by HireStream Lite. Hidden from testers." },
  "hirestream-mobile-v1.0": { icon: "mobile", badge: "STEP 2",     badgeColor: "bg-sky-100 text-sky-800",       tip: "Android mobile app testing. Install Expo Go, scan the QR code on the project page, and test candidate features." },
  "hirestream-htis-smoke":  { icon: "smoke",  badge: "STEP 3",     badgeColor: "bg-sky-100 text-sky-800",       tip: "HTIS generic QA smoke checklist (77 rows, 15 sections). Verdicts from the Apr 22 workbook are pre-loaded in the HTIS signoff column." },
  "hirestream-v1.5-extras": { icon: "extras", badge: "STEP 4",     badgeColor: "bg-indigo-100 text-indigo-700", tip: "Beyond-FRS enhancements delivered above the contracted scope. Hidden from non-admin reviewers by default — admin can re-enable." },
};

export function Home() {
  const { reviewer, loading } = useRequireAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);

  const reload = () => api.listProjects().then(setProjects).catch(() => {});
  useEffect(() => { if (reviewer) reload(); }, [reviewer]);

  if (loading) return <div><Header /><div className="p-10 text-slate-400">Loading...</div></div>;

  const isAdmin = reviewer?.role === "admin" || reviewer?.role === "delivery";

  // Server already filters hidden projects for non-admin. Order defers to the
  // `sort_order` column from the server (FRS=0, smoke=1, extras=2) so the UI
  // doesn't need a second opinion on sequence.
  const sorted = projects;

  async function toggleVisibility(slug: string, next: boolean) {
    setToggling(slug);
    try {
      await api.setProjectVisibility(slug, next);
      await reload();
    } catch (e) {
      alert(`Could not update visibility: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div>
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold text-slate-900">Projects under verification</h1>
        <p className="text-slate-500 mt-1">Reviewer portal for scope-to-delivery sign-off across HTIS, HPSEDC Staging, and HPSEDC Final.</p>

        <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-50 via-amber-50 to-orange-50 border-2 border-amber-300 px-6 py-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-amber-900">How to review</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shadow">1</span>
              <div>
                <div className="font-semibold text-amber-900">Open HireStream Lite</div>
                <div className="text-amber-700 text-xs mt-0.5">The web portal HPSEDC will launch — start here.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shadow">2</span>
              <div>
                <div className="font-semibold text-amber-900">Review each role</div>
                <div className="text-amber-700 text-xs mt-0.5">Pick a role card (Candidate, Agency, etc.) and sign off its requirements.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shadow">3</span>
              <div>
                <div className="font-semibold text-amber-900">Then the mobile app</div>
                <div className="text-amber-700 text-xs mt-0.5">Test the Android app the same way, and verify its open issues.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center my-3">
          <ArrowDown className="w-5 h-5 text-amber-400 animate-bounce" />
        </div>

        <div className="mt-8 grid gap-5">
          {sorted.length === 0 && <div className="text-slate-400 text-sm">No projects seeded yet.</div>}
          {sorted.map((p) => {
            const meta = PROJECT_ORDER[p.slug];
            const variant = meta?.icon ?? "extras";
            const hidden = !p.visibleToNonAdmin;
            // Per-variant colour map. Kept inline rather than in a lookup so
            // Tailwind's JIT doesn't prune the classes (dynamic template
            // strings aren't detected by the class scanner).
            const border =
              variant === "frs"   ? "border-emerald-300 bg-emerald-50/50 hover:border-emerald-500" :
              variant === "mobile"? "border-violet-300 bg-violet-50/40 hover:border-violet-500"    :
              variant === "smoke" ? "border-sky-300 bg-sky-50/40 hover:border-sky-500"             :
                                    "border-slate-200 bg-white hover:border-indigo-400";
            const iconBox =
              variant === "frs"   ? "bg-emerald-600 text-white" :
              variant === "mobile"? "bg-violet-600 text-white"  :
              variant === "smoke" ? "bg-sky-600 text-white"     :
                                    "bg-indigo-100 text-indigo-600";
            const arrow =
              variant === "frs"   ? "text-emerald-500" :
              variant === "mobile"? "text-violet-500"  :
              variant === "smoke" ? "text-sky-500"     :
                                    "text-slate-400";
            const tipColor =
              variant === "frs"   ? "text-emerald-700" :
              variant === "mobile"? "text-violet-700"  :
              variant === "smoke" ? "text-sky-700"     :
                                    "text-indigo-600";
            return (
              <div key={p.id} className={`group relative rounded-xl border-2 p-6 transition-all hover:shadow-md ${border} ${hidden ? "opacity-75" : ""}`}>
                <Link href={`/p/${p.slug}`} className="block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center ${iconBox}`}>
                        {variant === "frs"
                          ? <ClipboardCheck className="w-6 h-6" />
                          : variant === "mobile"
                            ? <Smartphone className="w-6 h-6" />
                            : variant === "smoke"
                              ? <ListChecks className="w-6 h-6" />
                              : <Sparkles className="w-6 h-6" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {meta && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${meta.badgeColor}`}>
                              {meta.badge}
                            </span>
                          )}
                          <span className="font-semibold text-slate-900 text-lg">{p.name}</span>
                          {hidden && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700 border border-slate-300" title="Hidden from non-admin reviewers">
                              <EyeOff className="w-3 h-3" /> Hidden
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">{p.description}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span>{p.contractor} → {p.client}</span>
                          <span>build {p.buildRef}</span>
                          {/* Dev-team scoreboard. Renders as a red pill when
                              there's anything to fix; collapses to a quiet
                              green pill when the project is clean. The
                              click-through opens the project — reviewers
                              can flip on the "Needs fixing" chip there to
                              focus on just the open items. */}
                          {typeof p.needsFix === "number" && p.reviewable > 0 && (
                            p.needsFix > 0 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 font-medium">
                                🔧 {p.needsFix} need{p.needsFix === 1 ? "s" : ""} fixing
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                ✓ no open defects
                              </span>
                            )
                          )}
                        </div>
                        {meta && (
                          <div className={`mt-3 text-xs ${tipColor}`}>
                            {meta.tip}
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className={`shrink-0 w-5 h-5 mt-3 transition-transform group-hover:translate-x-1 ${arrow}`} />
                  </div>
                </Link>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleVisibility(p.slug, !p.visibleToNonAdmin); }}
                    disabled={toggling === p.slug}
                    className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    title={hidden ? "Show to non-admin reviewers" : "Hide from non-admin reviewers"}
                  >
                    {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {hidden ? "Hidden" : "Visible"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
