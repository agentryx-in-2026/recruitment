/**
 * Public application status-check page — no login required.
 * Rural users and families can check where an application is.
 * audit 2026-07-06 (Batch 3): page had ZERO i18n — wired the whole page to
 * the new statusCheck.* namespace (bilingual mandate; citizen-facing).
 */
import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, Phone, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PublicStatusCheckPage() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<"phone" | "otp" | "result">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const dateLocale = i18n.language === "hi" ? "hi-IN" : "en-IN";

  async function requestOtp() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v1/public/status/request-otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || t("statusCheck.couldNotSendOtp"));
      setStep("otp");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function check() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v1/public/status/check", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, otp, reference: reference.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || t("statusCheck.checkFailed"));
      setResult(j.data); setStep("result");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  // Status explanations for families — translated via statusCheck.status.*
  const statusLabel = (status: string) =>
    t(`statusCheck.status.${status}`, { defaultValue: status });

  return (
    <div className="max-w-xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/">
          <a className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> {t("statusCheck.back")}
          </a>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("statusCheck.title")}</h1>
            <p className="text-xs text-slate-500">{t("statusCheck.subtitle")}</p>
          </div>
        </div>

        {step === "phone" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {t("statusCheck.phoneLabel")}
              </span>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210" className="mt-1" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={requestOtp} disabled={busy || !phone} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("statusCheck.sendOtp")}
            </Button>
            <p className="text-[11px] text-slate-400 text-center">
              {t("statusCheck.rateNote")}
            </p>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              {t("statusCheck.otpSent", { phone })}
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{t("statusCheck.otpLabel")}</span>
              <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" maxLength={6} className="mt-1 font-mono tracking-widest text-center" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{t("statusCheck.refLabel")}</span>
              <Input value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder={t("statusCheck.refPlaceholder")} className="mt-1 font-mono" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={check} disabled={busy || !otp || !reference} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("statusCheck.checkStatus")}
            </Button>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">{statusLabel(result.status)}</p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  <span className="font-medium">{result.jobTitle}</span> — {result.jobCountry}
                </p>
              </div>
            </div>
            <dl className="text-xs grid grid-cols-2 gap-2 text-slate-600">
              <dt className="text-slate-400">{t("statusCheck.reference")}</dt><dd className="font-mono">{result.reference}</dd>
              <dt className="text-slate-400">{t("statusCheck.applied")}</dt><dd>{result.appliedAt ? new Date(result.appliedAt).toLocaleDateString(dateLocale) : "—"}</dd>
              {result.placement && <>
                <dt className="text-slate-400">{t("statusCheck.placement")}</dt><dd className="capitalize">{result.placement.status}</dd>
                <dt className="text-slate-400">{t("statusCheck.country")}</dt><dd>{result.placement.country}</dd>
                {result.placement.startDate && <>
                  <dt className="text-slate-400">{t("statusCheck.startDate")}</dt><dd>{new Date(result.placement.startDate).toLocaleDateString(dateLocale)}</dd>
                </>}
              </>}
            </dl>
            <Button variant="outline" onClick={() => { setStep("phone"); setOtp(""); setReference(""); setResult(null); setError(null); }} className="w-full">
              {t("statusCheck.checkAnother")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
