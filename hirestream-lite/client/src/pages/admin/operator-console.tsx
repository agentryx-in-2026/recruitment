/**
 * Operator Console — Phase 4 deliverable.
 *
 * Two tabs:
 *   Status         — synthetic monitor health, daily log digest, LLM triage
 *                    hypotheses, Loki log search
 *   System Config  — per-feature cards (enable/disable, edit URL+credentials,
 *                    Test connection button)
 *
 * Superadmin-only. Server endpoints are gated by requireRole(["superadmin"]).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Activity, AlertTriangle, CheckCircle2, XCircle, Cpu, Database, Bell, Brain, FileText, RefreshCw, Loader2, Search } from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Types

type SyntheticStatus = {
  result: "PASS" | "FAIL" | "TIMEOUT" | "SKIP";
  target: string;
  generatedAt: string;
  exitCode: number;
  durationMs?: number;
  summary?: { pass: number; warn: number; fail: number };
  failures?: string[];
} | null;

type DigestStatus = {
  generatedAt: string;
  windowHours: number;
  totals: { currentWindowErrors: number; baselineAvgErrorsPerWindow: number; pctChangeVsBaseline: number };
  topErrors: Array<{ route: string; errRate: number; p95: number }>;
  slowestRoute?: { route: string; p95: number };
  novelClasses: Array<{ errorClass: string; count: number; sampleRoute: string; sampleMsg: string }>;
  regressions: Array<{ route: string; p95Ms: number; baselineMedianMs: number; pctIncrease: number }>;
  errorClasses: Array<{ errorClass: string; count: number; sampleRoute: string; sampleMsg: string }>;
  idle?: boolean;
} | null;

type TriageStatus = {
  generatedAt: string;
  llm: { baseUrl: string; model: string };
  clustersTriaged: number;
  failureCount: number;
  results: Array<{ errorClass: string; count: number; sampleRoute: string; hypothesis: string | null; error?: string }>;
} | null;

type FeatureRow = {
  feature: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
  defaults?: { enabled: boolean; config: Record<string, unknown> };
};

const FEATURE_LABEL: Record<string, string> = {
  synthetic_monitor: "Synthetic Monitor",
  llm_triage: "LLM Triage",
  daily_digest: "Daily Log Digest",
  loki: "Loki (Log Search)",
  notifications: "Notifications",
};

const FEATURE_ICON: Record<string, JSX.Element> = {
  synthetic_monitor: <Activity className="h-5 w-5 text-blue-600" />,
  llm_triage: <Brain className="h-5 w-5 text-purple-600" />,
  daily_digest: <FileText className="h-5 w-5 text-amber-600" />,
  loki: <Database className="h-5 w-5 text-emerald-600" />,
  notifications: <Bell className="h-5 w-5 text-rose-600" />,
};

function fmtAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ────────────────────────────────────────────────────────────────────────────
// Status Tab

function StatusCard({ children, title, icon }: { children: React.ReactNode; title: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function SyntheticCard({ s }: { s: SyntheticStatus }) {
  if (!s) return <p className="text-sm text-muted-foreground">No synthetic monitor data yet.</p>;
  const isPass = s.result === "PASS";
  const isFail = s.result === "FAIL" || s.result === "TIMEOUT";
  return (
    <>
      <div className="flex items-center gap-2">
        {isPass && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {isFail && <XCircle className="h-4 w-4 text-red-600" />}
        {s.result === "SKIP" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
        <Badge variant={isPass ? "default" : isFail ? "destructive" : "secondary"}>{s.result}</Badge>
        <span className="text-xs text-muted-foreground">{fmtAgo(s.generatedAt)}</span>
      </div>
      <p className="text-xs text-muted-foreground">target: {s.target}</p>
      {s.summary && (
        <p className="text-sm font-mono">
          pass=<b>{s.summary.pass}</b> warn=<b>{s.summary.warn}</b> FAIL=<b className={s.summary.fail > 0 ? "text-red-600" : ""}>{s.summary.fail}</b>
          {s.durationMs ? <span className="text-muted-foreground"> · {(s.durationMs / 1000).toFixed(1)}s</span> : null}
        </p>
      )}
      {s.failures && s.failures.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">first {s.failures.length} failures</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {s.failures.slice(0, 5).map((f, i) => <li key={i} className="font-mono">{f}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}

function DigestCard({ d }: { d: DigestStatus }) {
  if (!d) return <p className="text-sm text-muted-foreground">No digest data yet.</p>;
  if (d.idle) return <p className="text-sm text-muted-foreground">Last digest: {fmtAgo(d.generatedAt)} · no events.</p>;
  const trendDirection = d.totals.pctChangeVsBaseline >= 0 ? "▲" : "▼";
  return (
    <>
      <p className="text-sm">
        {d.totals.currentWindowErrors} errors {trendDirection} {Math.abs(d.totals.pctChangeVsBaseline)}% vs {d.windowHours}h baseline
        <span className="text-xs text-muted-foreground ml-2">{fmtAgo(d.generatedAt)}</span>
      </p>
      {d.errorClasses.length > 0 && (
        <div className="text-xs space-y-0.5">
          <p className="font-semibold text-muted-foreground">Top error classes:</p>
          {d.errorClasses.slice(0, 5).map((c, i) => (
            <p key={i} className="font-mono">{c.errorClass} <span className="text-muted-foreground">×{c.count}</span> <span className="text-muted-foreground">@ {c.sampleRoute}</span></p>
          ))}
        </div>
      )}
      {d.regressions.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{d.regressions.length} latency regression(s)</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {d.regressions.slice(0, 5).map((r, i) => (
              <li key={i} className="font-mono">{r.route} p95={r.p95Ms}ms (+{r.pctIncrease}%)</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function TriageCard({ t }: { t: TriageStatus }) {
  if (!t) return <p className="text-sm text-muted-foreground">No triage data yet. Enable LLM Triage in System Config and run <code className="text-xs">npm run log:triage</code>.</p>;
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {t.clustersTriaged} clusters · {t.failureCount} failed · {t.llm.model} · {fmtAgo(t.generatedAt)}
      </p>
      {t.results.length === 0 && <p className="text-sm">No clusters in last digest.</p>}
      {t.results.slice(0, 5).map((r, i) => (
        <div key={i} className="border-l-2 border-purple-300 pl-2 py-1 text-xs space-y-1">
          <p className="font-mono"><b>{r.errorClass}</b> ×{r.count} <span className="text-muted-foreground">@ {r.sampleRoute}</span></p>
          {r.hypothesis ? <p className="text-foreground/80">{r.hypothesis}</p> : <p className="text-muted-foreground italic">— {r.error || "no hypothesis"}</p>}
        </div>
      ))}
    </>
  );
}

function LogsCard() {
  const [query, setQuery] = useState('{job="hirestream"} |= ""');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useQuery<any>({
    queryKey: submitted ? [`/api/v1/admin/operator-console/logs?q=${encodeURIComponent(submitted)}&lookback=60&limit=50`] : ["__operator_logs_idle"],
    enabled: !!submitted,
  });
  const resp = data?.data;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-5 w-5 text-emerald-600" />Log Search (Loki)</CardTitle>
        </div>
        <CardDescription>LogQL. Available labels: job, level, service, method, status_code. Use <code>| json</code> to parse fields.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='{job="hirestream",status_code=~"5.."}' className="font-mono text-sm" />
          <Button onClick={() => setSubmitted(query)} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Querying Loki…</p>}
        {resp && !resp.available && <p className="text-xs text-amber-600">Loki disabled: {resp.reason}</p>}
        {resp && resp.available && !resp.ok && <p className="text-xs text-red-600">Loki error: {resp.error}</p>}
        {resp && resp.available && resp.ok && (
          <div className="text-xs max-h-96 overflow-y-auto border rounded bg-slate-50 p-2 font-mono space-y-1">
            <p className="text-muted-foreground">{resp.resultCount} matches (last {resp.lookbackMinutes}m)</p>
            {resp.lines?.map((l: any, i: number) => (
              <div key={i} className="border-l border-slate-300 pl-2">
                <span className="text-muted-foreground">{l.ts.slice(11, 19)}</span>{" "}
                <span className="text-blue-700">[{l.labels.level || "?"}]</span>{" "}
                <span className="break-all">{l.line.slice(0, 300)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/v1/admin/operator-console/status"],
    refetchInterval: 30000,
  });
  const status = data?.data;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/operator-console/status"] })}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>
      {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard title="Synthetic Monitor" icon={<Activity className="h-5 w-5 text-blue-600" />}>
          <SyntheticCard s={status?.synthetic ?? null} />
        </StatusCard>
        <StatusCard title="Daily Digest" icon={<FileText className="h-5 w-5 text-amber-600" />}>
          <DigestCard d={status?.digest ?? null} />
        </StatusCard>
        <StatusCard title="LLM Triage" icon={<Brain className="h-5 w-5 text-purple-600" />}>
          <TriageCard t={status?.triage ?? null} />
        </StatusCard>
      </div>
      <LogsCard />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// System Config Tab

function FeatureCard({ row, onEdit }: { row: FeatureRow; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number; details: string } | null>(null);

  const toggleEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch(`/api/v1/admin/system-config/${row.feature}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/system-config"] }),
  });

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`/api/v1/admin/system-config/${row.feature}/test`, {
        method: "POST", credentials: "include",
      });
      const j = await r.json();
      setTestResult(j?.data ?? { ok: false, latencyMs: 0, details: "no response" });
    } catch (e: any) {
      setTestResult({ ok: false, latencyMs: 0, details: String(e?.message ?? e) });
    } finally { setTesting(false); }
  }

  const configKeys = Object.keys(row.config);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            {FEATURE_ICON[row.feature] ?? <Cpu className="h-5 w-5" />}
            {FEATURE_LABEL[row.feature] ?? row.feature}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${row.feature}`} className="text-xs text-muted-foreground">
              {row.enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id={`enabled-${row.feature}`}
              checked={row.enabled}
              disabled={toggleEnabled.isPending}
              onCheckedChange={(v) => toggleEnabled.mutate(v)}
            />
          </div>
        </div>
        <CardDescription className="text-xs">
          Updated {fmtAgo(row.updatedAt)} {row.updatedBy ? `by ${row.updatedBy.slice(0, 8)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {configKeys.length > 0 && (
          <div className="text-xs space-y-0.5 font-mono bg-slate-50 p-2 rounded border max-h-32 overflow-y-auto">
            {configKeys.map((k) => (
              <div key={k} className="flex">
                <span className="text-muted-foreground mr-2">{k}:</span>
                <span className="break-all">{String(row.config[k] ?? "")}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>Edit config</Button>
          <Button variant="outline" size="sm" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Activity className="h-3 w-3 mr-1" />}
            Test
          </Button>
          {testResult && (
            <span className="text-xs">
              {testResult.ok
                ? <span className="text-green-600">✓ OK ({testResult.latencyMs}ms)</span>
                : <span className="text-red-600">✗ FAIL</span>}
              <span className="text-muted-foreground ml-2">{testResult.details.slice(0, 80)}</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditDialog({ row, onClose }: { row: FeatureRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string>(() => JSON.stringify(row.config, null, 2));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let parsed: any;
      try { parsed = JSON.parse(draft); } catch (e: any) {
        throw new Error(`Invalid JSON: ${e.message}`);
      }
      const r = await fetch(`/api/v1/admin/system-config/${row.feature}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/system-config"] });
      onClose();
    },
    onError: (e: any) => setError(String(e?.message ?? e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Edit configuration: {FEATURE_LABEL[row.feature] ?? row.feature}</CardTitle>
          <CardDescription>
            Editing the JSONB config blob. Secret fields shown as "***" must be replaced with the real value to update them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs h-72" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigTab() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/v1/admin/system-config"],
  });
  const [editing, setEditing] = useState<FeatureRow | null>(null);
  const rows: FeatureRow[] = data?.data ?? [];

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rows.map((r) => <FeatureCard key={r.feature} row={r} onEdit={() => setEditing(r)} />)}
      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page shell

export function OperatorConsole() {
  return (
    <div className="container mx-auto py-6 px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Operator Console</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic monitor, daily log digest, LLM triage, log search — plus per-feature configuration. Phase 4 of the embedded testing framework.
        </p>
      </div>
      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">System Config</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="mt-4"><StatusTab /></TabsContent>
        <TabsContent value="config" className="mt-4"><ConfigTab /></TabsContent>
      </Tabs>
    </div>
  );
}

export default OperatorConsole;
