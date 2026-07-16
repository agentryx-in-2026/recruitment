/**
 * v0.4.33 (Phase 3, HPSEDC Item 2): Admin Matching Engine Parameters.
 *
 * Five panels driven by the HireStream_Matching_Engine.pdf §7 spec:
 *   1. Weight tuner — 7 vertical sliders ("music equalizer"). Sum must
 *      equal 100; save button surfaces a banner with the running sum so
 *      admin sees instant feedback while dragging.
 *   2. Missing-criteria policy — per-factor full/half/zero dropdown.
 *   3. Threshold & engine toggle — recommendation threshold + v1/v2
 *      radio + show-breakdown-to-candidate toggle.
 *   4. Live preview — pick any candidate + job, see the live breakdown
 *      rebuilt server-side via /api/v1/matching/preview every time the
 *      admin saves a setting.
 *   5. Audit trail — last 20 setting.update entries in audit_log scoped
 *      to keys starting with `matching.`.
 *
 * Settings are written via PUT /api/v1/admin/settings/:key (existing
 * endpoint); the engine reads them on every score request so changes are
 * live-effect — no redeploy.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sliders, ShieldCheck, Eye, History, AlertTriangle, Loader2, Save,
  Sparkles, Settings,
} from "lucide-react";

const FACTORS = [
  { key: "skill",         label: "Skills",          color: "from-blue-500 to-blue-600",     accent: "text-blue-600" },
  { key: "experience",    label: "Experience",      color: "from-emerald-500 to-emerald-600", accent: "text-emerald-600" },
  { key: "qualification", label: "Qualification",   color: "from-violet-500 to-violet-600", accent: "text-violet-600" },
  { key: "country",       label: "Country",         color: "from-amber-500 to-amber-600",   accent: "text-amber-600" },
  { key: "language",      label: "Language",        color: "from-cyan-500 to-cyan-600",     accent: "text-cyan-600" },
  { key: "category",      label: "Category",        color: "from-rose-500 to-rose-600",     accent: "text-rose-600" },
  { key: "salary",        label: "Salary",          color: "from-indigo-500 to-indigo-600", accent: "text-indigo-600" },
] as const;

type FactorKey = (typeof FACTORS)[number]["key"];
type Policy = "full" | "half" | "zero";
// v0.4.35.1: per-direction policy — job-side vs candidate-side missing.
interface PolicyPair { jobMissing: Policy; candidateMissing: Policy; }

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  skill: 30, experience: 20, qualification: 10, country: 15,
  language: 10, category: 10, salary: 5,
};
const DEFAULT_POLICY: Record<FactorKey, PolicyPair> = {
  skill:         { jobMissing: "half", candidateMissing: "zero" },
  experience:    { jobMissing: "full", candidateMissing: "full" },
  qualification: { jobMissing: "full", candidateMissing: "half" },
  country:       { jobMissing: "full", candidateMissing: "half" },
  language:      { jobMissing: "full", candidateMissing: "zero" },
  category:      { jobMissing: "full", candidateMissing: "half" },
  salary:        { jobMissing: "full", candidateMissing: "full" },
};

// Normalise whatever the API returns (could be legacy string shape) into
// the per-direction shape the editor expects.
function coercePolicy(raw: any): Record<FactorKey, PolicyPair> {
  const out: Record<FactorKey, PolicyPair> = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  if (!raw || typeof raw !== "object") return out;
  for (const f of FACTORS) {
    const v = raw[f.key];
    if (v === "full" || v === "half" || v === "zero") {
      out[f.key] = { jobMissing: v, candidateMissing: v };
    } else if (v && typeof v === "object") {
      if (["full","half","zero"].includes(v.jobMissing)) out[f.key].jobMissing = v.jobMissing;
      if (["full","half","zero"].includes(v.candidateMissing)) out[f.key].candidateMissing = v.candidateMissing;
    }
  }
  return out;
}

export function MatchingEnginePanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: versionRes, isLoading: vLoading } = useQuery({
    queryKey: ["/api/v1/matching/version"],
    queryFn: async () => {
      const r = await fetch("/api/v1/matching/version");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
  const live = versionRes?.data || {};

  const [weights, setWeights] = useState<Record<FactorKey, number>>(DEFAULT_WEIGHTS);
  const [policy, setPolicy] = useState<Record<FactorKey, PolicyPair>>(DEFAULT_POLICY);
  const [threshold, setThreshold] = useState<number>(40);
  const [engineVersion, setEngineVersion] = useState<"v1" | "v2">("v2");
  const [showBreakdown, setShowBreakdown] = useState<boolean>(true);

  // Hydrate state from live settings on first load
  useEffect(() => {
    if (live.weights) setWeights({ ...DEFAULT_WEIGHTS, ...live.weights });
    if (live.policy) setPolicy(coercePolicy(live.policy));
    if (typeof live.thresholdPct === "number") setThreshold(live.thresholdPct);
    if (live.version) setEngineVersion(live.version);
  }, [live.version]);

  const weightsSum = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const validSum = weightsSum === 100;

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const r = await fetch(`/api/v1/admin/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || err.error?.message || "Save failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/matching/version"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/matching/audit"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  async function saveWeights() {
    if (!validSum) {
      toast({ title: "Weights must sum to 100", description: `Current sum: ${weightsSum}`, variant: "destructive" });
      return;
    }
    await saveMutation.mutateAsync({ key: "matching.weights", value: weights });
    toast({ title: "Weights saved", description: "Next score uses these immediately." });
  }
  async function savePolicy() {
    await saveMutation.mutateAsync({ key: "matching.policy", value: policy });
    toast({ title: "Policy saved" });
  }
  async function saveThreshold() {
    await saveMutation.mutateAsync({ key: "matching.recommendation_threshold_pct", value: threshold });
    toast({ title: "Threshold saved" });
  }
  async function saveEngineVersion(v: "v1" | "v2") {
    setEngineVersion(v);
    await saveMutation.mutateAsync({ key: "matching.engine_version", value: v });
    toast({ title: `Switched to engine ${v}` });
  }
  async function saveShowBreakdown(v: boolean) {
    setShowBreakdown(v);
    await saveMutation.mutateAsync({ key: "matching.show_breakdown_to_candidate", value: v });
  }

  if (vLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Banner — engine + sum status */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Matching Engine — live configuration</p>
            <p className="text-xs text-slate-500">
              Engine <span className="font-semibold">{engineVersion}</span> · Threshold {threshold}% · Weights sum {weightsSum}/100
              {!validSum && <span className="text-red-600 font-semibold ml-2">⚠ Sum must equal 100 before save</span>}
            </p>
          </div>
        </div>
        <Badge className={validSum ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
          {validSum ? "Ready" : "Tuning…"}
        </Badge>
      </div>

      {/* Panel 1 — Weight equalizer */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <SectionHeader icon={Sliders} title="Weight tuner" subtitle="Drag the sliders to rebalance. The 7 weights must sum to 100." />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
          {FACTORS.map((f) => (
            <div key={f.key} className="flex flex-col items-center gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{f.label}</div>
              <div className="relative h-40 w-12 bg-slate-100 rounded-lg overflow-hidden">
                <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t ${f.color} transition-all`}
                  style={{ height: `${Math.min(100, (weights[f.key] / 50) * 100)}%` }} />
              </div>
              <input type="range" min={0} max={50} step={1}
                value={weights[f.key]}
                onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })}
                className="w-12 cursor-pointer"
              />
              <Input type="number" min={0} max={100} value={weights[f.key]}
                onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) || 0 })}
                className="w-14 h-7 text-center text-xs" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Defaults: {FACTORS.map((f) => `${f.label.slice(0,3)} ${DEFAULT_WEIGHTS[f.key]}`).join(" · ")}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>Reset</Button>
            <Button size="sm" onClick={saveWeights} disabled={!validSum || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Save weights
            </Button>
          </div>
        </div>
      </section>

      {/* Panel 2 — Missing-criteria policy (per-direction) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <SectionHeader icon={ShieldCheck} title="Missing-criteria policy" subtitle="Per factor: what to award when the JOB didn't specify vs when the CANDIDATE didn't provide the data. (Both missing → job-side rule applies.)" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {FACTORS.map((f) => (
            <div key={f.key} className="rounded-lg border border-slate-200 p-3">
              <p className={`text-xs font-bold ${f.accent} mb-2`}>{f.label}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">Job didn't specify <span className="font-mono text-slate-400">(def: {DEFAULT_POLICY[f.key].jobMissing})</span></p>
                  <Select value={policy[f.key].jobMissing}
                    onValueChange={(v) => setPolicy({ ...policy, [f.key]: { ...policy[f.key], jobMissing: v as Policy } })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full (neutral)</SelectItem>
                      <SelectItem value="half">Half</SelectItem>
                      <SelectItem value="zero">Zero (strict)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">Candidate didn't provide <span className="font-mono text-slate-400">(def: {DEFAULT_POLICY[f.key].candidateMissing})</span></p>
                  <Select value={policy[f.key].candidateMissing}
                    onValueChange={(v) => setPolicy({ ...policy, [f.key]: { ...policy[f.key], candidateMissing: v as Policy } })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full (neutral)</SelectItem>
                      <SelectItem value="half">Half</SelectItem>
                      <SelectItem value="zero">Zero (strict)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
          <Button size="sm" onClick={savePolicy} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save policy
          </Button>
        </div>
      </section>

      {/* Panel 3 — Threshold + engine toggle + breakdown visibility */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <SectionHeader icon={Settings} title="Threshold & engine" subtitle="Recommendation threshold + which engine version is live." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">Recommendation threshold (%)</Label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={100} step={5}
                value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1" />
              <Input type="number" min={0} max={100} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                className="w-16 h-8 text-xs text-center" />
            </div>
            <Button size="sm" variant="outline" onClick={saveThreshold} className="mt-2 h-7 text-xs">Save threshold</Button>
            <p className="text-[10px] text-slate-400 mt-2">Jobs scoring below this don't appear in "Jobs for You".</p>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">Engine version</Label>
            <div className="flex items-center gap-2">
              {(["v1", "v2"] as const).map((v) => (
                <button key={v}
                  onClick={() => saveEngineVersion(v)}
                  className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition ${
                    engineVersion === v
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                  }`}>
                  {v.toUpperCase()} {v === "v2" ? "(7-factor)" : "(legacy)"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">v1 falls back to skill/exp/country only — useful for rollback.</p>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">Show breakdown to candidate</Label>
            <button onClick={() => saveShowBreakdown(!showBreakdown)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${showBreakdown ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${showBreakdown ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <p className="text-[10px] text-slate-400 mt-2">When ON, candidates see the 7-factor breakdown on recommendations + application detail.</p>
          </div>
        </div>
      </section>

      {/* Panel 4 — Live preview */}
      <LivePreviewPanel />

      {/* Panel 5 — Audit trail */}
      <AuditTrailPanel />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: any) {
  return (
    <div className="flex items-start gap-3 mb-1">
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function LivePreviewPanel() {
  const { toast } = useToast();
  const [candidateId, setCandidateId] = useState("");
  const [jobId, setJobId] = useState("");
  const [breakdown, setBreakdown] = useState<any>(null);

  const { data: candidatesRes } = useQuery({
    queryKey: ["/api/v1/agencies/candidates"],
    queryFn: async () => {
      const r = await fetch("/api/v1/agencies/candidates");
      if (!r.ok) return { data: [] };
      return r.json();
    },
  });
  const { data: jobsRes } = useQuery({
    queryKey: ["/api/v1/jobs?limit=50"],
    queryFn: async () => {
      const r = await fetch("/api/v1/jobs?limit=50");
      if (!r.ok) return { data: [] };
      return r.json();
    },
  });

  const candidates = candidatesRes?.data || [];
  const jobs = jobsRes?.data || [];

  async function preview() {
    if (!candidateId || !jobId) {
      toast({ title: "Pick a candidate and a job", variant: "destructive" });
      return;
    }
    const r = await fetch("/api/v1/matching/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, jobId }),
    });
    if (!r.ok) {
      toast({ title: "Preview failed", description: (await r.json()).message, variant: "destructive" });
      return;
    }
    const data = await r.json();
    setBreakdown(data.data);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <SectionHeader icon={Eye} title="Live preview" subtitle="Pick a candidate + job and see the live score using current weights/policy." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <Select value={candidateId} onValueChange={setCandidateId}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a candidate" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {candidates.slice(0, 50).map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobId} onValueChange={setJobId}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a job" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {jobs.slice(0, 50).map((j: any) => (
              <SelectItem key={j.id} value={j.id}>{j.title} · {j.country}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={preview} disabled={!candidateId || !jobId}>Run preview</Button>
      </div>

      {breakdown && (
        <div className="mt-5 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
          <p className="text-sm font-bold text-slate-900 mb-2">Total: <span className="text-2xl text-blue-700">{breakdown.total}</span>/100 · engine {breakdown.engineVersion}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {FACTORS.map((f) => {
              const r = breakdown[f.key];
              if (!r || r.max === 0) return null;
              const pct = r.max > 0 ? (r.score / r.max) * 100 : 0;
              return (
                <div key={f.key} className="rounded border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`font-bold ${f.accent}`}>{f.label}</span>
                    <span className="font-mono">{r.score}/{r.max}</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded mt-1 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${f.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{r.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AuditTrailPanel() {
  const { data: auditRes } = useQuery({
    queryKey: ["/api/v1/matching/audit"],
    queryFn: async () => {
      const r = await fetch("/api/v1/admin/audit?resourceType=setting&prefix=matching.&limit=20");
      if (!r.ok) return { data: [] };
      return r.json();
    },
  });
  const rows = (auditRes?.data || []) as any[];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <SectionHeader icon={History} title="Audit trail" subtitle="Last 20 matching-related setting changes. Filterable by actor + key + date in the full Audit Log tab." />
      {rows.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-400">No matching-engine changes recorded yet.</div>
      ) : (
        <div className="mt-3 space-y-1.5 max-h-80 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-slate-50 border border-slate-100 text-[11px]">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-slate-700 truncate">{r.resourceId}</p>
                <p className="text-slate-500">{r.userId?.slice(0,8) ?? "system"} · {r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN") : "—"}</p>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">{r.action}</Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
