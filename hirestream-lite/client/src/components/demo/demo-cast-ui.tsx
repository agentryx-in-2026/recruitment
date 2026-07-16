/**
 * Shared Demo-cast UI — one-click login roster used by BOTH the auth-page
 * Demo Panel and the floating Demo Switcher. Driven by shared/demo-cast.ts.
 * Gated server-side by `feature.quick_login_enabled` (off in production).
 */
import { useState } from "react";
import { DEMO_CAST, DEMO_TAB_LABELS, type DemoTab, type DemoTone, type DemoCastMember } from "@shared/demo-cast";
import { useCapabilities } from "@/hooks/use-capabilities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RotateCcw } from "lucide-react";

const TONE: Record<DemoTone, string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-rose-100 text-rose-700 border-rose-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export function useDemoLogin() {
  const [loadingUser, setLoadingUser] = useState<string | null>(null);
  const login = async (username: string) => {
    setLoadingUser(username);
    try {
      const res = await fetch("/api/v1/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });
      if (!res.ok) { setLoadingUser(null); return false; }
      window.location.href = "/"; // full reload so auth state rehydrates
      return true;
    } catch {
      setLoadingUser(null);
      return false;
    }
  };
  return { login, loadingUser };
}

export function useDemoReset() {
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    if (!window.confirm(
      "Reset ALL demo data to the clean master set?\n\nThis permanently deletes everything created during testing (applications, placements, drafts, new accounts) and re-seeds the original cast: 10 candidates, 4 agencies, 4 employers.\n\nContinue?"
    )) return;
    setResetting(true);
    try {
      const res = await fetch("/api/v1/auth/demo-reset", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert("Reset failed: " + (data?.error?.message || res.status)); setResetting(false); return; }
      window.location.reload(); // back to a clean state
    } catch (e: any) {
      window.alert("Reset failed: " + (e?.message || "network error"));
      setResetting(false);
    }
  };
  return { reset, resetting };
}

/** Small destructive "Reset demo data" button, shared by the panel + switcher. */
export function DemoResetButton({ className = "" }: { className?: string }) {
  const { reset, resetting } = useDemoReset();
  return (
    <button onClick={reset} disabled={resetting}
      title="Wipe all data and restore the clean master demo set"
      className={`flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-md px-2.5 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60 transition-colors ${className}`}>
      {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
      {resetting ? "Resetting demo data…" : "Reset demo data"}
    </button>
  );
}

function Avatar({ name, photo, showPhoto }: { name: string; photo?: string; showPhoto: boolean }) {
  const [err, setErr] = useState(false);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (showPhoto && photo && !err)
    return <img src={photo} alt="" onError={() => setErr(true)} className="w-8 h-8 rounded-full object-cover bg-slate-100 flex-shrink-0" />;
  return (
    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-slate-600">
      {initials}
    </span>
  );
}

export function DemoCastTabs({
  onLogin, loadingUser, currentUsername,
}: {
  onLogin: (username: string) => void;
  loadingUser: string | null;
  currentUsername?: string;
}) {
  // HP-3/HP-4: single-agency shape. In HP the marketplace "Agencies" group is
  // re-purposed into a "Super Agency" tab showing just HPSEDC (the mega-agency);
  // Employers is hidden. Marketplace mode keeps the reference behaviour.
  const { capabilities } = useCapabilities();
  const singleAgency = !capabilities.agencySelfRegistration;
  const HPSEDC_SUPER_AGENCY: DemoCastMember = {
    username: "hpsedc_agency", name: "HPSEDC", subtitle: "Overseas Placement Cell",
    status: "Super Agency", tone: "green", note: "The single mega-agency — owns all jobs.",
  };
  const tabs = (Object.keys(DEMO_CAST) as DemoTab[]).filter((t) =>
    t !== "employers" || capabilities.employerSelfRegistration);
  const labelFor = (t: DemoTab) => (t === "agencies" && singleAgency ? "Super Agency" : DEMO_TAB_LABELS[t]);
  const castFor = (t: DemoTab): DemoCastMember[] => (t === "agencies" && singleAgency ? [HPSEDC_SUPER_AGENCY] : DEMO_CAST[t]);
  const defaultTab = tabs.includes("candidates") ? "candidates" : tabs[0];
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full h-8 p-0.5" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => (
          <TabsTrigger key={t} value={t} className="text-[11px] px-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            {labelFor(t)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab} value={tab} className="mt-2">
          <div className={`space-y-1.5 ${tab === "candidates" ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
            {castFor(tab).map((m) => {
              const isCurrent = m.username === currentUsername;
              return (
                <button
                  key={m.username}
                  onClick={() => onLogin(m.username)}
                  disabled={loadingUser !== null}
                  title={m.note}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all disabled:opacity-60
                    ${isCurrent ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200" : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
                >
                  <Avatar name={m.name} photo={m.photo} showPhoto={tab === "candidates"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-900 truncate">
                      {m.name}{isCurrent && <span className="ml-1.5 text-[9px] font-bold text-blue-600">● current</span>}
                    </span>
                    <span className="block text-[10px] text-slate-500 truncate">{m.subtitle}</span>
                  </span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0 ${TONE[m.tone]}`}>
                    {m.status}
                  </span>
                  {loadingUser === m.username && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
