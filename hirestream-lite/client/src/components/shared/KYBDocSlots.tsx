/**
 * Reusable doc-slot grid for KYB verification flows (employer + agency).
 *
 * v0.4.32 (HPSEDC Items 1 & 3): both employer and agency verification
 * forms upload the same shape of docs — a fixed slot per HPSEDC-required
 * class plus a free "other" slot. This component renders the slot cards,
 * fires upload/delete via the supplied endpoint, and surfaces per-doc
 * admin review status (pending / approved / rejected with notes).
 *
 * Each slot card shows: icon, label, description, persistent ✓ when a
 * doc is uploaded, the filename + size + per-admin status badge + remove
 * button. Modelled on the v0.4.31 candidate document slots in
 * profile-wizard.tsx so the visual language is consistent across flows.
 */
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Check, Trash2, FileText, AlertTriangle, Eye, Download } from "lucide-react";

export interface KYBSlotDef {
  /** key written to documents.type — must match server allow-list */
  value: string;
  /** human label rendered on the card */
  label: string;
  /** short hint shown below the label */
  description: string;
  icon: any;
  color: string;
  required?: boolean;
}

interface Props {
  /** label shown above the grid */
  title?: string;
  /** description / hint */
  subtitle?: string;
  /** typed slot list. Order = render order. */
  slots: KYBSlotDef[];
  /** Endpoint prefix — POST <endpoint> with multipart, GET <endpoint> to list,
   *  DELETE <endpoint>/:id. e.g. "/api/v1/employer/documents". */
  endpoint: string;
  /** React-Query key to invalidate after upload/delete. */
  queryKey: string[];
}

export function KYBDocSlots({ title, subtitle, slots, endpoint, queryKey }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const { data: docsRes, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await fetch(endpoint);
      if (!r.ok) return { data: [] };
      return r.json();
    },
  });
  const docs: any[] = docsRes?.data ?? [];

  const docsBySlot: Record<string, any[]> = {};
  const otherDocs: any[] = [];
  const validKeys = new Set(slots.map((s) => s.value));
  for (const d of docs) {
    if (validKeys.has(d.type)) (docsBySlot[d.type] = docsBySlot[d.type] || []).push(d);
    else otherDocs.push(d);
  }

  async function handleUpload(file: File, slotType: string) {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploadingSlot(slotType);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", slotType);
    try {
      const r = await fetch(endpoint, { method: "POST", body: fd });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Upload failed");
      }
      qc.invalidateQueries({ queryKey });
      toast({ title: "Document uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingSlot(null);
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error?.message || "Delete failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Document removed" });
    },
    onError: (e: any) => toast({ title: "Could not remove", description: e.message, variant: "destructive" }),
  });

  function renderDocRow(doc: any) {
    const statusBadge =
      doc.status === "approved" ? <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">Approved</Badge>
      : doc.status === "rejected" ? <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200">Rejected</Badge>
      : <Badge variant="outline" className="text-[9px]">Pending</Badge>;
    return (
      <div key={doc.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-700 truncate">{doc.fileName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {statusBadge}
            {doc.fileSize && <span className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(0)} KB</span>}
          </div>
          {doc.status === "rejected" && doc.reviewNotes && (
            <p className="text-[10px] text-red-600 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
              {doc.reviewNotes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => window.open(`${endpoint}/${doc.id}/download?inline=1`, "_blank")}
            className="h-7 px-2 text-[10px] rounded-md text-slate-600 hover:text-blue-600" title="Preview in browser">
            <Eye className="w-3 h-3 mr-1" /> Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.open(`${endpoint}/${doc.id}/download`, "_blank")}
            aria-label="Download document"
            className="h-7 w-7 p-0 rounded-md text-slate-500 hover:text-blue-600" title="Download">
            <Download className="w-3 h-3" />
          </Button>
          {doc.status !== "approved" && (
            /* audit 2026-07-06 (Batch 3): icon-only delete needed an aria-label */
            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(doc.id)}
              aria-label="Delete document" title="Delete document"
              className="h-7 w-7 p-0 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>}
      {subtitle && <p className="text-xs text-slate-500 mb-4">{subtitle}</p>}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {slots.map((slot) => {
            const slotDocs = docsBySlot[slot.value] || [];
            const hasDoc = slotDocs.length > 0;
            const Icon = slot.icon;
            const isUploading = uploadingSlot === slot.value;
            return (
              <div key={slot.value}
                className={`relative rounded-xl border p-3 transition-all ${
                  hasDoc
                    ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white"
                    : "border-slate-200 bg-gradient-to-br from-slate-50/60 to-white"
                }`}>
                <div className="flex items-start gap-2.5 mb-2">
                  <div className={`w-9 h-9 rounded-lg ${slot.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                      {slot.required && <Badge variant="outline" className="text-[9px] rounded-md border-rose-200 text-rose-600 bg-rose-50">Required</Badge>}
                      {hasDoc && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white flex-shrink-0" title="Uploaded">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{slot.description}</p>
                  </div>
                </div>
                {hasDoc && (
                  <div className="space-y-1 mb-2">
                    {slotDocs.map(renderDocRow)}
                  </div>
                )}
                <label className={`cursor-pointer w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isUploading
                    ? "bg-slate-200 text-slate-500"
                    : hasDoc
                      ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-sm"
                }`}>
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploading ? "Uploading…" : hasDoc ? "Replace / Add another" : "Upload file"}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, slot.value); e.target.value = ""; }}
                    className="hidden" disabled={isUploading} />
                </label>
              </div>
            );
          })}

          {/* "Other" — always available, plus surfaces any docs whose type
              isn't in the known slots. */}
          <div className="relative rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/60 to-white p-3 md:col-span-2">
            <div className="flex items-start gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-lg text-slate-600 bg-slate-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Other Documents</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Anything else admin might need (board resolution, references, additional proofs).</p>
              </div>
            </div>
            {otherDocs.length > 0 && (
              <div className="space-y-1 mb-2">{otherDocs.map(renderDocRow)}</div>
            )}
            <label className={`cursor-pointer w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              uploadingSlot === "other"
                ? "bg-slate-200 text-slate-500"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}>
              {uploadingSlot === "other" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploadingSlot === "other" ? "Uploading…" : "Upload other document"}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "other"); e.target.value = ""; }}
                className="hidden" disabled={uploadingSlot === "other"} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
