// Smart Job Importer — admin panel. HPSEDC uploads the Government's Excel/CSV
// job file; we auto-map columns, validate + dedupe each row, let the admin
// review/adjust the mapping, then bulk-post the valid rows as live jobs.
// audit 2026-07-06 (Batch 4): headline single-super-agency feature.
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowLeft, RefreshCw, History } from "lucide-react";

type TargetField = string;
interface NormalizedRow { rowNumber: number; values: Record<string, any>; status: "valid" | "warning" | "error"; issues: string[]; duplicate?: boolean; }
interface PreviewData {
  fileName: string;
  headers: string[];
  mapping: Record<string, TargetField | null>;
  targetFields: TargetField[];
  rows: NormalizedRow[];
  summary: { total: number; valid: number; warnings: number; errors: number };
}

async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || body?.message || `Request failed (${r.status})`);
  return body;
}

export default function JobImportPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, TargetField | null>>({});
  const [result, setResult] = useState<any | null>(null);

  const history = useQuery<any>({ queryKey: ["/api/v1/admin/job-import/history"], queryFn: () => jfetch("/api/v1/admin/job-import/history") });

  // Upload (or re-map) → preview
  const runPreview = useMutation({
    mutationFn: async (opts: { f: File; mappingOverride?: Record<string, TargetField | null> }) => {
      const fd = new FormData();
      fd.append("file", opts.f);
      if (opts.mappingOverride) fd.append("mapping", JSON.stringify(opts.mappingOverride));
      return jfetch("/api/v1/admin/job-import/preview", { method: "POST", body: fd });
    },
    onSuccess: (res) => { const d: PreviewData = res.data; setPreview(d); setMapping(d.mapping || {}); setResult(null); },
    onError: (e: any) => toast({ title: t("jobImport.previewFailed"), description: e.message, variant: "destructive" }),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview");
      return jfetch("/api/v1/admin/job-import/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, mapping, fileName: preview.fileName }),
      });
    },
    onSuccess: (res) => {
      setResult(res.data);
      toast({ title: t("jobImport.importDone"), description: t("jobImport.createdN", { n: res.data.created }) });
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/job-import/history"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/reports/dashboard"] });
    },
    onError: (e: any) => toast({ title: t("jobImport.importFailed"), description: e.message, variant: "destructive" }),
  });

  const onPick = (f: File | null) => { setFile(f); if (f) runPreview.mutate({ f }); };
  const remap = (header: string, field: string) => {
    const next = { ...mapping, [header]: field === "__ignore__" ? null : field };
    setMapping(next);
    if (file) runPreview.mutate({ f: file, mappingOverride: next });
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; };

  const statusChip = (s: string) => {
    const m: any = {
      valid: ["bg-emerald-100 text-emerald-700", <CheckCircle2 key="i" className="w-3.5 h-3.5" />, t("jobImport.valid")],
      warning: ["bg-amber-100 text-amber-700", <AlertTriangle key="i" className="w-3.5 h-3.5" />, t("jobImport.warning")],
      error: ["bg-red-100 text-red-700", <XCircle key="i" className="w-3.5 h-3.5" />, t("jobImport.error")],
    };
    const [cls, icon, label] = m[s] || m.valid;
    return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{icon}{label}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900">{t("jobImport.title")}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">{t("jobImport.subtitle")}</p>

        {/* Step 1: upload */}
        {!preview && !result && (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-3">{t("jobImport.uploadHint")}</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] || null)} aria-label={t("jobImport.chooseFile")} />
            <Button onClick={() => fileRef.current?.click()} disabled={runPreview.isPending} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              {runPreview.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("jobImport.analyzing")}</> : <><Upload className="w-4 h-4 mr-2" />{t("jobImport.chooseFile")}</>}
            </Button>
            <p className="text-[11px] text-slate-400 mt-3">{t("jobImport.formats")}</p>
          </div>
        )}

        {/* Step 3: result */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center"><p className="text-2xl font-bold text-emerald-700">{result.created}</p><p className="text-xs text-emerald-600">{t("jobImport.created")}</p></div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center"><p className="text-2xl font-bold text-amber-700">{result.skipped}</p><p className="text-xs text-amber-600">{t("jobImport.skipped")}</p></div>
              <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center"><p className="text-2xl font-bold text-red-700">{result.failed}</p><p className="text-xs text-red-600">{t("jobImport.failed")}</p></div>
            </div>
            {Array.isArray(result.errors) && result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {result.errors.map((er: any, i: number) => (
                  <div key={i} className="flex gap-2 px-3 py-1.5 text-xs"><span className="font-mono text-slate-400 shrink-0">{t("jobImport.rowN", { n: er.rowNumber })}</span><span className="text-slate-600">{er.reason}</span></div>
                ))}
              </div>
            )}
            <Button onClick={reset} variant="outline" className="rounded-lg"><ArrowLeft className="w-4 h-4 mr-2" />{t("jobImport.importAnother")}</Button>
          </div>
        )}

        {/* Step 2: review mapping + preview */}
        {preview && !result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-slate-600"><FileSpreadsheet className="w-4 h-4 text-slate-400" /><span className="font-medium">{preview.fileName}</span></div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-600 font-semibold">{preview.summary.valid} {t("jobImport.valid")}</span>
                <span className="text-amber-600 font-semibold">{preview.summary.warnings} {t("jobImport.warning")}</span>
                <span className="text-red-600 font-semibold">{preview.summary.errors} {t("jobImport.error")}</span>
                <Button size="sm" variant="ghost" onClick={reset} className="text-slate-400 h-7"><RefreshCw className="w-3.5 h-3.5 mr-1" />{t("jobImport.startOver")}</Button>
              </div>
            </div>

            {/* Column mapping */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t("jobImport.columnMapping")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {preview.headers.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-xs">
                    <span className="truncate text-slate-600 flex-1" title={h}>{h}</span>
                    <span className="text-slate-300">→</span>
                    <select value={mapping[h] ?? "__ignore__"} onChange={(e) => remap(h, e.target.value)}
                      aria-label={t("jobImport.mapColumnAria", { col: h })}
                      className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex-1 min-w-0">
                      <option value="__ignore__">{t("jobImport.ignore")}</option>
                      {preview.targetFields.map((f) => <option key={f} value={f}>{t(`jobImport.field.${f}`)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview rows */}
            <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0"><tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">{t("jobImport.field.title")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("jobImport.field.country")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("jobImport.field.company")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("jobImport.statusCol")}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.slice(0, 200).map((r) => (
                    <tr key={r.rowNumber} className={r.status === "error" ? "bg-red-50/40" : r.status === "warning" ? "bg-amber-50/30" : ""}>
                      <td className="px-2 py-1.5 font-mono text-slate-400">{r.rowNumber}</td>
                      <td className="px-2 py-1.5 text-slate-700 max-w-[180px] truncate" title={r.values.title}>{r.values.title || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-slate-700">{r.values.country || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-slate-700">{r.values.company || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">{statusChip(r.status)}
                          {r.issues?.length > 0 && <span className="text-slate-400 truncate max-w-[220px]" title={r.issues.join(" · ")}>{r.issues[0]}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 200 && <p className="text-[11px] text-slate-400">{t("jobImport.showingFirst", { n: 200, total: preview.rows.length })}</p>}

            <div className="flex items-center gap-2">
              <Button onClick={() => commit.mutate()} disabled={commit.isPending || (preview.summary.valid + preview.summary.warnings) === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                {commit.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("jobImport.importing")}</> : t("jobImport.importN", { n: preview.summary.valid + preview.summary.warnings })}</Button>
              <span className="text-[11px] text-slate-400">{t("jobImport.errorsSkipped", { n: preview.summary.errors })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Import history */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4 text-slate-400" /><h4 className="text-sm font-semibold text-slate-700">{t("jobImport.recentImports")}</h4></div>
        {(history.data?.data || []).length === 0 ? (
          <p className="text-xs text-slate-400">{t("jobImport.noImports")}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {(history.data?.data || []).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between py-2 text-xs">
                <span className="text-slate-600 truncate max-w-[240px]">{h.fileName || t("jobImport.untitled")}</span>
                <span className="text-slate-400">{t("jobImport.createdN", { n: h.createdCount })} · {t("jobImport.skippedN", { n: h.skippedCount })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
