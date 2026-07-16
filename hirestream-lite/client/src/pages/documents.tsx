// HP-4c: document upload page (the last profile step → 100%). Blue-collar
// principle 5: simple, big targets. Per Fable review (v0.7.0) each document can
// be added EITHER by uploading a file (PDF or photo — desktop + digital copies)
// OR by taking a photo with the phone camera; a tap opens a chooser sheet with
// both, file-upload first. Reuses POST /api/v1/candidates/documents (multipart).
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Landmark, Camera, Upload, FileText, Trash2, CheckCircle2, Loader2, ShieldCheck, ArrowLeft, IdCard, BookUser, GraduationCap, Briefcase, Files, X,
} from "lucide-react";

const DOC_SLOTS: { type: string; label: string; sub: string; icon: React.ElementType }[] = [
  { type: "identity_proof",         label: "Aadhaar / ID card",       sub: "Front side is enough",        icon: IdCard },
  { type: "passport",               label: "Passport",                sub: "The photo page",             icon: BookUser },
  { type: "educational_certificate",label: "Education certificate",   sub: "10th / 12th / degree",       icon: GraduationCap },
  { type: "experience_certificate", label: "Work experience letter",  sub: "If you have one",            icon: Briefcase },
  { type: "other",                  label: "Other document",          sub: "Anything else useful",       icon: Files },
];

const isPdf = (name?: string) => !!name && /\.pdf$/i.test(name);

export default function DocumentsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  // Which slot's chooser sheet is open (slot type), or null.
  const [chooserFor, setChooserFor] = useState<string | null>(null);
  // Page-level shared inputs: one plain file picker (PDF or image, no capture)
  // and one camera picker (capture forces the rear camera on mobile). A single
  // pending type routes the resulting file to the right slot.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pendingType = useRef<string | null>(null);
  // audit 2026-07-07 (UI): the "Take a photo" (capture) input only opens a
  // camera on touch/mobile devices — desktop browsers ignore `capture` and fall
  // back to the file picker, which reads as "camera not working". So we only
  // offer the camera path on coarse-pointer (touch) devices; on desktop the
  // "Add" button goes straight to the file picker (no misleading chooser).
  const [canUseCamera] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)")?.matches);

  const { data: docsRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/documents"] });
  const docs: any[] = docsRes?.data || [];
  const docFor = (type: string) => docs.find((d) => d.type === type || (type === "other" && d.type === "certificate"));

  const upload = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const fd = new FormData(); fd.append("file", file); fd.append("type", type);
      const res = await fetch("/api/v1/candidates/documents", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || "Upload failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
      setUploading(null);
      toast({ title: t("documents.toastAdded") });
    },
    onError: (e: any) => { setUploading(null); toast({ title: e.message || t("documents.toastCouldNotUpload"), variant: "destructive" }); },
  });
  const del = useMutation({
    // audit 2026-07-06 (C6): check res.ok — a failed delete used to report nothing.
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/candidates/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || t("documents.toastCouldNotDelete")); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/profile/completion"] });
    },
    onError: (e: any) => toast({ title: e.message || t("documents.toastCouldNotDelete"), variant: "destructive" }),
  });

  const pick = (file?: File | null) => {
    const type = pendingType.current;
    pendingType.current = null;
    if (!file || !type) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: t("documents.toastTooLarge"), variant: "destructive" }); return; }
    setUploading(type);
    upload.mutate({ file, type });
  };

  // Open the shared input of the requested kind for the slot the sheet was
  // opened for. Reset value first so re-picking the same file still fires change.
  const trigger = (kind: "file" | "camera") => {
    pendingType.current = chooserFor;
    setChooserFor(null);
    const el = kind === "file" ? fileRef.current : cameraRef.current;
    if (el) { el.value = ""; el.click(); }
  };

  // Entry point for an "Add"/"Replace" tap: on touch devices show the chooser
  // (Upload a file / Take a photo); on desktop skip straight to the file picker.
  const openFor = (slotType: string) => {
    if (canUseCamera) { setChooserFor(slotType); return; }
    pendingType.current = slotType;
    const el = fileRef.current;
    if (el) { el.value = ""; el.click(); }
  };

  const chooserSlot = DOC_SLOTS.find((s) => s.type === chooserFor);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">{t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span></p>
      </div>
      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{t("documents.heading")}</h1>
        <p className="text-base text-slate-500 mb-2">{t("documents.sub")}</p>
        <p className="text-xs text-slate-400 mb-6">{t("documents.helper")}</p>

        {/* Shared, page-level inputs (one plain, one camera) */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        <div className="space-y-3">
          {DOC_SLOTS.map((slot) => {
            const existing = docFor(slot.type);
            const Icon = slot.icon;
            const busy = uploading === slot.type;
            const pdf = existing && isPdf(existing.fileName);
            return (
              <div key={slot.type} className={`flex items-center gap-4 rounded-2xl border p-4 ${existing ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${existing ? "bg-emerald-100 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                  {existing ? (pdf ? <FileText className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />) : <Icon className="w-6 h-6" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-900 leading-tight">{t(`documents.slots.${slot.type}.label`)}</p>
                  <p className="text-xs text-slate-500 truncate">{existing ? existing.fileName || t("documents.uploaded") : t(`documents.slots.${slot.type}.sub`)}</p>
                </div>
                {existing ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button disabled={busy} onClick={() => openFor(slot.type)} className="h-9 px-3 rounded-lg text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("documents.replace")}
                    </button>
                    {/* audit 2026-07-06 (C6): confirm before delete + aria-label on the icon-only button */}
                    <button
                      aria-label={t("documents.deleteAria", { doc: t(`documents.slots.${slot.type}.label`) })}
                      onClick={() => { if (window.confirm(t("documents.deleteConfirm"))) del.mutate(existing.id); }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => openFor(slot.type)}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shrink-0">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t("documents.add")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800">{t("documents.privacyNote")}</p>
        </div>

        <Button onClick={() => setLocation("/")} className="w-full h-14 mt-6 rounded-xl text-lg font-semibold bg-slate-900 hover:bg-slate-800 text-white">
          {docs.length > 0 ? t("documents.done") : t("shell.skip")}
        </Button>
        <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 py-3 mt-1 mx-auto"><ArrowLeft className="w-4 h-4" /> {t("documents.backDashboard")}</button>
      </div>

      {/* Chooser sheet — bottom sheet on mobile, centered card on desktop. */}
      {chooserSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setChooserFor(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">{t("documents.chooserTitle", { doc: t(`documents.slots.${chooserSlot.type}.label`) })}</h2>
              <button onClick={() => setChooserFor(null)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {/* Upload a file first (default) */}
              <button onClick={() => trigger("file")} className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99] transition-all">
                <span className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Upload className="w-6 h-6" /></span>
                <span className="min-w-0"><span className="block text-base font-bold text-slate-900">{t("documents.uploadFile")}</span><span className="block text-xs text-slate-500">{t("documents.uploadFileSub")}</span></span>
              </button>
              {/* Take a photo */}
              <button onClick={() => trigger("camera")} className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300 hover:bg-emerald-50/40 active:scale-[0.99] transition-all">
                <span className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Camera className="w-6 h-6" /></span>
                <span className="min-w-0"><span className="block text-base font-bold text-slate-900">{t("documents.takePhoto")}</span><span className="block text-xs text-slate-500">{t("documents.takePhotoSub")}</span></span>
              </button>
            </div>
            <button onClick={() => setChooserFor(null)} className="w-full mt-4 h-12 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50">{t("documents.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
