/**
 * "Before you start" — the pre-flight checklist.
 *
 * Borrowed from the HP Tourism eServices homestay form, which opens a Documents
 * Checklist before a new application: *keep these ready before you start*. It
 * works because the worst version of a government form is the one that asks for
 * something on page 3 that you keep in a drawer at home — you abandon it, and
 * you come back never.
 *
 * ── Why ours lists INFORMATION, not documents ──────────────────────────────
 * The homestay form asks for uploads, so its checklist is a document list. Stage
 * 1 here is deliberately upload-free (the 20,000:500 rule — HPSEDC asked why
 * 20,000 applicants should produce documents only 500 will need), so the honest
 * checklist is "have these two cards in front of you and know these dates".
 * Promising a document list and then not asking for documents would be worse
 * than no checklist at all.
 *
 * It also states the deal up front: nothing to upload now, certificates only if
 * you are shortlisted. That is the single most reassuring thing we can tell a
 * candidate who has been asked for paperwork by every other agency they've met.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, BookUser, IdCard, GraduationCap, Briefcase, Zap, ShieldCheck, X } from "lucide-react";

const ITEMS = [
  { icon: BookUser, key: "passport" },
  { icon: IdCard, key: "aadhaar" },
  { icon: GraduationCap, key: "education" },
  { icon: Briefcase, key: "work" },
] as const;

export function ReadyChecklist({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true"
      aria-labelledby="ready-title">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onDismiss} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl">
        {/* Header band — same visual language as the numbered section bands. */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-700 to-blue-800 px-6 py-5 rounded-t-3xl sm:rounded-t-2xl">
          <button onClick={onDismiss} aria-label={t("common.close", "Close")}
            className="absolute right-4 top-4 w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-3.5 pr-10">
            <span className="shrink-0 w-11 h-11 rounded-xl bg-white/15 text-white flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6" />
            </span>
            <div>
              <h2 id="ready-title" className="text-xl font-bold text-white leading-tight">{t("reg.ready.title")}</h2>
              <p className="text-[15px] text-blue-100 mt-1 leading-snug">{t("reg.ready.sub")}</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {/* The reassurance, first — it is the reason this form is short. */}
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3.5">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-[15px] font-bold text-emerald-900 leading-snug">{t("reg.ready.noUploadTitle")}</p>
              <p className="text-[14px] text-emerald-800 mt-0.5 leading-snug">{t("reg.ready.noUploadBody")}</p>
            </div>
          </div>

          <div>
            <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wide mb-2.5">{t("reg.ready.haveReady")}</p>
            <div className="space-y-2.5">
              {ITEMS.map(({ icon: Icon, key }) => (
                <div key={key} className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 leading-snug">{t(`reg.ready.${key}Title`)}</p>
                    <p className="text-[14px] text-slate-600 leading-snug">{t(`reg.ready.${key}Body`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3.5">
            <Zap className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-[14px] text-blue-900 leading-snug">{t("reg.ready.tip")}</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button onClick={onDismiss} className="text-[15px] text-slate-500 hover:text-slate-700 py-2 px-1 text-left">
            {t("reg.ready.later")}
          </button>
          <Button onClick={onStart} className="h-12 px-7 rounded-xl text-[16px] font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
            {t("reg.ready.start")}
          </Button>
        </div>
      </div>
    </div>
  );
}
