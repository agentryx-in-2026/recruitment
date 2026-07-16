import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Power, CreditCard, AlertTriangle, Loader2, Key, Calendar,
  Clock, Eye, EyeOff, Lock, CheckCircle, XCircle,
} from "lucide-react";

async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) return { data: null };
  return r.json();
}

interface Controls {
  fullLockdownEnabled: boolean;
  lockdownMessage: string;
  lockdownBypassKey: string;
  lockdownEta: string | null;
  showEta: boolean;
  showDowntime: boolean;
  lockdownEnabledAt: string | null;
  applicationsPaused: boolean;
  applicationsPauseMessage: string;
  jobPostingPaused: boolean;
  jobPostingPauseMessage: string;
}

// audit 2026-07-06 (Batch 3): preset messages are shown portal-wide to all
// citizens once saved, so they must be translatable. The presets are now
// maintenance.* i18n keys, resolved with t() at render time — the superadmin
// picks the message in the portal language they intend citizens to see
// (the saved value is a plain string served by the maintenance middleware).
const APP_PAUSE_PRESET_KEYS = [
  "maintenance.appPause1",
  "maintenance.appPause2",
  "maintenance.appPause3",
  "maintenance.appPause4",
];

const JOB_PAUSE_PRESET_KEYS = [
  "maintenance.jobPause1",
  "maintenance.jobPause2",
  "maintenance.jobPause3",
];

const LOCKDOWN_PRESET_KEYS = [
  "maintenance.lockdown1",
  "maintenance.lockdown2",
  "maintenance.lockdown3",
  "maintenance.lockdown4",
];

export default function SystemControlsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: res } = useQuery({
    queryKey: ["/api/v1/superadmin/system-controls"],
    queryFn: () => fetchJson("/api/v1/superadmin/system-controls"),
    enabled: !!user && user.role === "superadmin",
  });

  const [draft, setDraft] = useState<Controls | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pendingAction, setPendingAction] = useState<null | { kind: string; patch: Partial<Controls> }>(null);

  useEffect(() => { if (res?.data) setDraft(res.data); }, [res?.data]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Controls>) => {
      const r = await fetch("/api/v1/superadmin/system-controls", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Controls updated" });
      qc.invalidateQueries({ queryKey: ["/api/v1/superadmin/system-controls"] });
      if (data?.data) setDraft(data.data);
      setPendingAction(null); setConfirmText("");
    },
    onError: () => toast({ title: "Couldn't update", variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!user || user.role !== "superadmin") {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <Lock className="w-12 h-12 mx-auto mb-3 text-red-400" />
        <h1 className="text-2xl font-bold text-slate-900">Super Admin access required</h1>
        <p className="text-sm text-slate-500 mt-2">System Controls are locked to the super-admin account.</p>
        <Button onClick={() => setLocation("/")} className="mt-6">Back to dashboard</Button>
      </div>
    );
  }

  if (!draft) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  const runCritical = (kind: string, patch: Partial<Controls>) => {
    setPendingAction({ kind, patch });
    setConfirmText("");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">System Controls</h1>
          <p className="text-sm text-slate-500">Critical operations — changes take effect immediately.</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-900">Critical Operations Area</p>
          <p className="text-sm text-red-800/80">Every toggle here affects users portal-wide the instant you save. Critical toggles require you to type a confirmation phrase.</p>
        </div>
      </div>

      {/* ── Applications Pipeline ───────────────────────────────── */}
      <Section
        icon={<CreditCard className="w-5 h-5" />} iconClass="text-blue-600 bg-blue-50"
        title="Applications Pipeline"
        subtitle="Control whether candidates can submit new applications. Existing applications are unaffected."
        active={!draft.applicationsPaused}
        activeLabel="ACCEPTING APPLICATIONS"
        pausedLabel="APPLICATIONS PAUSED"
      >
        <Toggle
          label={draft.applicationsPaused ? "Applications are PAUSED" : "Applications are ACTIVE"}
          subtitle={draft.applicationsPaused ? "Candidates see a friendly pause message when they try to apply." : "Candidates can apply normally. Click to pause."}
          value={!draft.applicationsPaused}
          onToggle={() => runCritical(
            draft.applicationsPaused ? "resume-applications" : "pause-applications",
            { applicationsPaused: !draft.applicationsPaused },
          )}
        />
        <PresetMessagePicker
          label="Pause message shown to candidates"
          value={draft.applicationsPauseMessage}
          presets={APP_PAUSE_PRESET_KEYS.map((k) => t(k))}
          onChange={(v) => save.mutate({ applicationsPauseMessage: v })}
        />
      </Section>

      {/* ── Job Posting Pipeline ────────────────────────────────── */}
      <Section
        icon={<CreditCard className="w-5 h-5" />} iconClass="text-emerald-600 bg-emerald-50"
        title="Job Posting Pipeline"
        subtitle="Control whether agencies and employers can publish new jobs. Existing jobs stay live."
        active={!draft.jobPostingPaused}
        activeLabel="POSTING ENABLED"
        pausedLabel="POSTING PAUSED"
      >
        <Toggle
          label={draft.jobPostingPaused ? "Job posting is PAUSED" : "Job posting is ACTIVE"}
          subtitle={draft.jobPostingPaused ? "Agents and employers can't publish new jobs." : "Agents and employers can post normally. Click to pause."}
          value={!draft.jobPostingPaused}
          onToggle={() => runCritical(
            draft.jobPostingPaused ? "resume-jobs" : "pause-jobs",
            { jobPostingPaused: !draft.jobPostingPaused },
          )}
        />
        <PresetMessagePicker
          label="Pause message shown to posters"
          value={draft.jobPostingPauseMessage}
          presets={JOB_PAUSE_PRESET_KEYS.map((k) => t(k))}
          onChange={(v) => save.mutate({ jobPostingPauseMessage: v })}
        />
      </Section>

      {/* ── Full Maintenance Lockdown ───────────────────────────── */}
      <Section
        icon={<Power className="w-5 h-5" />} iconClass="text-red-600 bg-red-50"
        title="Maintenance Mode (Full Lockdown)"
        subtitle="When enabled, ALL users are blocked from accessing the portal except those carrying the bypass key."
        active={!draft.fullLockdownEnabled}
        activeLabel="PORTAL OPEN"
        pausedLabel="FULL LOCKDOWN"
        danger
      >
        <Toggle
          label={draft.fullLockdownEnabled ? "Portal is LOCKED DOWN" : "Portal is OPEN"}
          subtitle={draft.fullLockdownEnabled ? "Every visitor sees the maintenance splash unless they have the bypass key." : "All users have access. Click to lock down."}
          value={!draft.fullLockdownEnabled}
          onToggle={() => runCritical(
            draft.fullLockdownEnabled ? "disable-lockdown" : "enable-lockdown",
            { fullLockdownEnabled: !draft.fullLockdownEnabled },
          )}
          danger
        />

        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> Bypass key (secret)</label>
          <p className="text-[11px] text-slate-500 mt-1">Users can bypass lockdown by visiting <code className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">?access_key=YOUR_KEY</code></p>
          <div className="flex gap-2 mt-2">
            <Input value={draft.lockdownBypassKey}
              onChange={(e) => setDraft({ ...draft, lockdownBypassKey: e.target.value })}
              className="h-9 text-sm font-mono" />
            <Button size="sm" onClick={() => save.mutate({ lockdownBypassKey: draft.lockdownBypassKey })} disabled={save.isPending}>Save key</Button>
          </div>
        </div>

        <PresetMessagePicker
          label="Maintenance message displayed to users"
          value={draft.lockdownMessage}
          presets={LOCKDOWN_PRESET_KEYS.map((k) => t(k))}
          onChange={(v) => save.mutate({ lockdownMessage: v })}
        />

        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Back-to-service ETA</label>
            <Input type="datetime-local"
              value={draft.lockdownEta ? draft.lockdownEta.slice(0, 16) : ""}
              onChange={(e) => setDraft({ ...draft, lockdownEta: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="mt-2 h-9 text-sm" />
            <div className="flex items-center gap-4 mt-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.showEta}
                  onChange={(e) => setDraft({ ...draft, showEta: e.target.checked })}
                  className="w-3.5 h-3.5" />
                Show ETA to users
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.showDowntime}
                  onChange={(e) => setDraft({ ...draft, showDowntime: e.target.checked })}
                  className="w-3.5 h-3.5" />
                Show downtime duration
              </label>
            </div>
            <Button size="sm" className="mt-3 w-full"
              onClick={() => save.mutate({
                lockdownEta: draft.lockdownEta, showEta: draft.showEta, showDowntime: draft.showDowntime,
              })}
              disabled={save.isPending}>Save ETA & display options</Button>
          </div>

          {/* Live preview */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-900 text-white rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1.5 mb-2">
              <Eye className="w-3.5 h-3.5" /> Preview (what users will see)
            </p>
            <div className="text-2xl mb-2">🛠️</div>
            <p className="font-bold text-lg">We'll be right back</p>
            <p className="text-sm text-slate-300 mt-1">{draft.lockdownMessage}</p>
            {draft.showEta && draft.lockdownEta && (
              <p className="text-xs mt-3 px-2 py-1 rounded bg-white/10 inline-block">
                Back by {new Date(draft.lockdownEta).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
            {draft.showDowntime && draft.lockdownEnabledAt && (
              <p className="text-[11px] text-slate-400 mt-2">
                Down since {new Date(draft.lockdownEnabledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Confirmation dialog for critical toggles */}
      {pendingAction && (
        <ConfirmOverlay
          kind={pendingAction.kind}
          confirmText={confirmText}
          setConfirmText={setConfirmText}
          onCancel={() => { setPendingAction(null); setConfirmText(""); }}
          onConfirm={() => save.mutate(pendingAction.patch)}
          pending={save.isPending}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function Section({ icon, iconClass, title, subtitle, active, activeLabel, pausedLabel, children, danger }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border mb-5 overflow-hidden ${danger && !active ? "border-red-400 ring-2 ring-red-100" : "border-slate-200"}`}>
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconClass}`}>{icon}</div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <Badge variant="outline" className={active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
          {active ? <CheckCircle className="w-3 h-3 mr-1 inline" /> : <XCircle className="w-3 h-3 mr-1 inline" />}
          {active ? activeLabel : pausedLabel}
        </Badge>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </motion.div>
  );
}

function Toggle({ label, subtitle, value, onToggle, danger }: any) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <button onClick={onToggle}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
          value ? "bg-emerald-500" : (danger ? "bg-red-500" : "bg-slate-400")
        }`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function PresetMessagePicker({ label, value, presets, onChange }: { label: string; value: string; presets: string[]; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(value);
  const isPreset = presets.includes(value);
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      <div className="mt-2 space-y-1.5">
        {presets.map((p) => (
          <label key={p} className="flex items-start gap-2 cursor-pointer text-sm hover:bg-white rounded px-2 py-1.5 transition">
            <input type="radio" name={label} checked={value === p} onChange={() => onChange(p)} className="mt-1 w-3.5 h-3.5" />
            <span className="text-slate-700">{p}</span>
          </label>
        ))}
        <div className="flex items-start gap-2 px-2 py-1.5">
          <input type="radio" name={label} checked={!isPreset} onChange={() => onChange(custom || "")} className="mt-2.5 w-3.5 h-3.5" />
          <div className="flex-1">
            <p className="text-xs text-slate-600 mb-1">Custom message</p>
            <Input value={!isPreset ? value : custom} onChange={(e) => { setCustom(e.target.value); onChange(e.target.value); }}
              placeholder="Type a custom message…" className="h-9 text-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmOverlay({ kind, confirmText, setConfirmText, onCancel, onConfirm, pending }: any) {
  const labels: Record<string, { title: string; phrase: string; danger: boolean; btn: string }> = {
    "enable-lockdown":       { title: "Enable Full Lockdown",       phrase: "LOCK DOWN HIRESTREAM", danger: true,  btn: "Lock down portal" },
    "disable-lockdown":      { title: "Disable Full Lockdown",      phrase: "REOPEN HIRESTREAM",    danger: false, btn: "Reopen portal" },
    "pause-applications":    { title: "Pause Applications Pipeline", phrase: "PAUSE APPLICATIONS",   danger: true,  btn: "Pause applications" },
    "resume-applications":   { title: "Resume Applications Pipeline", phrase: "RESUME APPLICATIONS", danger: false, btn: "Resume applications" },
    "pause-jobs":            { title: "Pause Job Posting Pipeline",  phrase: "PAUSE JOB POSTING",    danger: true,  btn: "Pause job posting" },
    "resume-jobs":           { title: "Resume Job Posting Pipeline", phrase: "RESUME JOB POSTING",   danger: false, btn: "Resume job posting" },
  };
  const meta = labels[kind];
  if (!meta) return null;
  const ok = confirmText.trim().toUpperCase() === meta.phrase;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.danger ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
            {meta.danger ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{meta.title}</h3>
            <p className="text-sm text-slate-500 mt-0.5">This change takes effect immediately. Type the phrase below to confirm.</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Type to confirm</p>
          <p className="text-sm font-mono font-bold text-slate-900 mb-2">{meta.phrase}</p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type the phrase above" autoFocus className="h-10" />
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button disabled={!ok || pending} onClick={onConfirm}
            className={`flex-1 text-white ${meta.danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : meta.btn}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
