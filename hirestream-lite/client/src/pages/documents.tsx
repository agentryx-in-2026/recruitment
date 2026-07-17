/**
 * Documents — UAT-05 pages 5 and 6.
 *
 * ── What changed, and why it is the whole point ─────────────────────────────
 * This page used to show FIVE hardcoded slots to EVERY candidate, from the
 * moment they signed up, and the profile sat at 78% until they filled them. It
 * was the last step to "100%".
 *
 * HPSEDC: "we get 20,000 applications and only 500 are selected. Why collect
 * 20,000 applicants' documents when they are not needed until the candidate is
 * selected?"
 *
 * So the slots are no longer a constant — they are the server's answer to "what
 * does this candidate owe RIGHT NOW", per application, resolved from
 * profession ∪ country ∪ vacancy (GET /candidates/documents/obligations):
 *
 *   nothing shortlisted  → NO upload slots at all. This is the 20,000 case, and
 *                          it is not an empty state to apologise for — it is the
 *                          feature. Say so plainly.
 *   shortlisted          → prove what you claimed at registration.
 *   selected             → PCC + medical (item 9).
 *
 * The upload machinery below (file/camera chooser, the coarse-pointer check,
 * the delete confirm) is carried over unchanged — it was fine. The only thing
 * that changed is WHERE the list of slots comes from.
 */
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Landmark, Camera, Upload, FileText, Trash2, CheckCircle2, Loader2, ShieldCheck, ArrowLeft,
  Files, X, Clock, BadgeCheck, Stethoscope, Search,
} from "lucide-react";

const isPdf = (name?: string) => !!name && /\.pdf$/i.test(name);

interface ObligationDoc { key: string; label: string; have: boolean; verified: boolean; reasons: string[] }
interface Obligation {
  applicationId: string; jobId: string; jobTitle: string; company: string; country: string;
  status: string; stage: "verify" | "deploy";
  required: ObligationDoc[]; optional: ObligationDoc[]; missing: string[]; complete: boolean;
}

export default function DocumentsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [chooserFor, setChooserFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pendingType = useRef<string | null>(null);

  // audit 2026-07-07 (UI): `capture` only opens a camera on touch devices —
  // desktop browsers ignore it and fall back to the file picker, which reads as
  // "camera not working". Only offer the camera path on coarse pointers.
  const [canUseCamera] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)")?.matches);

  const { data: docsRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/documents"] });
  const { data: oblRes, isLoading: oblLoading } = useQuery<any>({
    queryKey: [`/api/v1/candidates/documents/obligations?lang=${i18n.language || "en"}`],
  });
  const docs: any[] = docsRes?.data || [];
  const obligations: Obligation[] = oblRes?.data?.obligations || [];
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
      // The obligations list carries have/missing per document, so it is stale
      // the moment an upload lands.
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/v1/candidates/documents/obligations") });
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
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/v1/candidates/documents/obligations") });
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
  const trigger = (kind: "file" | "camera") => {
    pendingType.current = chooserFor;
    setChooserFor(null);
    const el = kind === "file" ? fileRef.current : cameraRef.current;
    if (el) { el.value = ""; el.click(); }
  };
  const openFor = (slotType: string) => {
    if (canUseCamera) { setChooserFor(slotType); return; }
    pendingType.current = slotType;
    const el = fileRef.current;
    if (el) { el.value = ""; el.click(); }
  };

  const labelFor = (key: string) =>
    obligations.flatMap((o) => [...o.required, ...o.optional]).find((d) => d.key === key)?.label || key;

  const verify = obligations.filter((o) => o.stage === "verify");
  const deploy = obligations.filter((o) => o.stage === "deploy");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">{t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span></p>
      </div>

      {/* Same responsive measure as the registration shell — this page used to be
          pinned at max-w-xl on every screen too. */}
      <div className="flex-1 w-full max-w-xl sm:max-w-3xl lg:max-w-[1100px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{t("documents.heading")}</h1>

        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        {oblLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-10"><Loader2 className="w-5 h-5 animate-spin" /> {t("common.loading", "Loading…")}</div>
        ) : obligations.length === 0 ? (
          /* THE 20,000 CASE. Not an empty state to apologise for — the reason the
             portal is not asking is worth telling them, because the old flow
             trained candidates to expect a nag here. */
          <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-6 lg:p-8">
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-1.5">{t("docs2.noneTitle")}</h2>
                <p className="text-sm text-slate-700 mb-3">{t("docs2.noneBody")}</p>
                <p className="text-sm text-slate-600">{t("docs2.noneWhen")}</p>
              </div>
            </div>
            <Button onClick={() => setLocation("/")} className="mt-6 h-12 rounded-xl font-semibold bg-slate-900 hover:bg-slate-800 text-white">
              {t("documents.backDashboard")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-base text-slate-500 mb-7">{t("docs2.sub")}</p>

            {/* Page 6 first: a selected candidate's PCC/medical is the most
                urgent thing on the page, and a placement can slip on it. */}
            {deploy.map((o) => (
              <ObligationCard key={o.applicationId} o={o} icon={Stethoscope} tone="amber"
                title={t("docs2.selectedTitle", { job: o.jobTitle })} body={t("docs2.selectedBody")}
                {...{ docFor, openFor, uploading, del, t }} />
            ))}

            {verify.map((o) => (
              <ObligationCard key={o.applicationId} o={o} icon={BadgeCheck} tone="blue"
                title={t("docs2.shortlistedTitle", { job: o.jobTitle })} body={t("docs2.shortlistedBody", { company: o.company, country: o.country })}
                {...{ docFor, openFor, uploading, del, t }} />
            ))}
          </>
        )}

        <div className="mt-6 rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800">{t("documents.privacyNote")}</p>
        </div>

        {obligations.length > 0 && (
          <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 py-3 mt-2 mx-auto"><ArrowLeft className="w-4 h-4" /> {t("documents.backDashboard")}</button>
        )}
      </div>

      {chooserFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setChooserFor(null)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">{t("documents.chooserTitle", { doc: labelFor(chooserFor) })}</h2>
              <button onClick={() => setChooserFor(null)} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => trigger("file")} className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99] transition-all">
                <span className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Upload className="w-6 h-6" /></span>
                <span className="min-w-0"><span className="block text-base font-bold text-slate-900">{t("documents.uploadFile")}</span><span className="block text-xs text-slate-500">{t("documents.uploadFileSub")}</span></span>
              </button>
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

/** One application's document obligation — the slots the server says are owed. */
function ObligationCard({
  o, icon: Icon, tone, title, body, docFor, openFor, uploading, del, t,
}: any) {
  const toneCls = tone === "amber"
    ? { border: "border-amber-200", bg: "bg-amber-50/50", chip: "bg-amber-100 text-amber-700" }
    : { border: "border-blue-200", bg: "bg-blue-50/40", chip: "bg-blue-100 text-blue-700" };

  const slots = [...o.required.map((d: ObligationDoc) => ({ ...d, required: true })),
                 ...o.optional.map((d: ObligationDoc) => ({ ...d, required: false }))];

  return (
    <div className={`mb-6 rounded-2xl border-2 ${toneCls.border} ${toneCls.bg} p-5 lg:p-6`}>
      <div className="flex items-start gap-3.5 mb-4">
        <span className={`w-11 h-11 rounded-xl ${toneCls.chip} flex items-center justify-center shrink-0`}><Icon className="w-6 h-6" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">{title}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{body}</p>
        </div>
        {o.complete && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t("docs2.allIn")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {slots.map((slot: any) => {
          const existing = docFor(slot.key);
          const busy = uploading === slot.key;
          const pdf = existing && isPdf(existing.fileName);
          return (
            <div key={slot.key} className={`flex items-center gap-3.5 rounded-xl border p-3.5 bg-white ${existing ? "border-emerald-200" : "border-slate-200"}`}>
              <span className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${existing ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                {existing ? (pdf ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />) : <Files className="w-5 h-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {slot.label}
                  {!slot.required && <span className="ml-1.5 text-xs font-normal text-slate-400">{t("docs2.optional")}</span>}
                </p>
                {existing ? (
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                    {/* "Uploaded" and "accepted by HPSEDC" are different things.
                        The old page showed only the first, so a candidate whose
                        document was sitting unverified had no way to tell. */}
                    {existing.fileName || t("documents.uploaded")}
                    {slot.verified
                      ? <span className="text-emerald-600 font-semibold">· {t("docs2.verified")}</span>
                      : <span className="text-amber-600 font-semibold inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {t("docs2.pendingCheck")}</span>}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">{whyLabel(slot.reasons, t)}</p>
                )}
              </div>
              {existing ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={busy} onClick={() => openFor(slot.key)} className="h-9 px-2.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("documents.replace")}
                  </button>
                  <button aria-label={t("documents.deleteAria", { doc: slot.label })}
                    onClick={() => { if (window.confirm(t("documents.deleteConfirm"))) del.mutate(existing.id); }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => openFor(slot.key)}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shrink-0 h-9">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t("documents.add")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Say WHY a document is being asked for. The resolver returns the source of each
 * requirement, and surfacing it turns "upload an IELTS report" into "the UK
 * requires it" — which is the difference between a demand and an explanation.
 */
function whyLabel(reasons: string[], t: any): string {
  if (!reasons?.length) return "";
  const r = reasons.find((x) => x !== "base") || reasons[0];
  if (r === "base") return t("docs2.whyBase");
  if (r === "vacancy") return t("docs2.whyVacancy");
  if (r === "selected") return t("docs2.whySelected");
  if (r.startsWith("country:")) return t("docs2.whyCountry", { country: r.slice(8) });
  if (r.startsWith("profession:")) return t("docs2.whyProfession");
  return "";
}
