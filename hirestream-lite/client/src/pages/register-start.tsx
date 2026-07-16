// HP-4c: the 3-tier registration entry. A candidate chooses how to register:
//  • Assisted     — leave name + phone, HPSEDC calls back and completes it
//  • Standard     — the blue-collar /apply flow (quick, pictorial)
//  • Professional — the detailed flow for degree/professional applicants
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Landmark, PhoneCall, HardHat, GraduationCap, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ShieldCheck,
} from "lucide-react";

async function patchProfile(body: any) {
  const res = await fetch("/api/v1/candidates/profile", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || e?.message || "Save failed"); }
  return res.json();
}

function TrustBand() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
      <Landmark className="w-4 h-4 text-blue-700" />
      <p className="text-sm font-semibold text-slate-700">{t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span></p>
    </div>
  );
}

export default function RegisterStart() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { capabilities } = useCapabilities();
  const callbackEnabled = capabilities.assistedCallbackEnabled;
  const standardEnabled = capabilities.standardRegistrationEnabled;
  const professionalEnabled = capabilities.professionalRegistrationEnabled;
  const { data: profileRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const profile = profileRes?.data || {};

  // ?mode=assisted (from the dashboard's "We will call you" shortcut) opens the
  // callback form directly instead of the chooser.
  const initialMode = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "assisted") ? "assisted" : "choose";
  const [mode, setMode] = useState<"choose" | "assisted" | "done">(initialMode);
  // If HPSEDC has disabled the callback tier, never show the assisted form even
  // via a stale ?mode=assisted link — fall back to the chooser.
  const effectiveMode = mode === "assisted" && !callbackEnabled ? "choose" : mode;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [work, setWork] = useState("");

  // audit 2026-07-06 (C2): wait for auth to finish loading before redirecting,
  // otherwise a hard refresh mid-registration ejects logged-in users to /auth.
  useEffect(() => { if (!isLoading && !user) setLocation("/auth"); }, [user, isLoading, setLocation]);
  useEffect(() => {
    if (profile.fullName) setName(profile.fullName);
    if (profile.phone) setPhone(profile.phone);
  }, [profileRes]);

  const chooseTier = async (tier: "standard" | "professional") => {
    setSaving(true);
    try {
      await patchProfile({ registrationTier: tier });
      setLocation(tier === "standard" ? "/apply" : "/apply/pro");
    } catch (e: any) { toast({ title: e.message || t("start.couldNotContinue"), variant: "destructive" }); setSaving(false); }
  };

  const submitAssisted = async () => {
    setSaving(true);
    try {
      await patchProfile({ registrationTier: "assisted", wantsCallback: true, fullName: name, phone, ...(work.trim() ? { skills: [work.trim()] } : {}) });
      setMode("done");
    } catch (e: any) { toast({ title: e.message || t("start.couldNotSubmit"), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const BIG_BTN = "w-full h-14 text-lg font-semibold rounded-xl";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      <TrustBand />
      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-8">

        {effectiveMode === "choose" && (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{t("start.heading")}</h1>
            <p className="text-base text-slate-500 mb-6">{t("start.sub")}</p>
            <div className="space-y-3">
              {/* Standard — blue-collar (admin-toggleable) */}
              {standardEnabled && (
              <button type="button" disabled={saving} onClick={() => chooseTier("standard")}
                className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md transition-all active:scale-[0.99]">
                <span className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><HardHat className="w-7 h-7" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-slate-900">{t("start.standardTitle")}</span>
                  <span className="block text-sm text-slate-500 mt-0.5">{t("start.standardDesc")}</span>
                </span>
                <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
              )}

              {/* Professional (admin-toggleable) */}
              {professionalEnabled && (
              <button type="button" disabled={saving} onClick={() => chooseTier("professional")}
                className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-violet-300 hover:bg-violet-50/40 hover:shadow-md transition-all active:scale-[0.99]">
                <span className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><GraduationCap className="w-7 h-7" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-slate-900">{t("start.proTitle")}</span>
                  <span className="block text-sm text-slate-500 mt-0.5">{t("start.proDesc")}</span>
                </span>
                <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
              )}

              {/* Assisted — callback. Gated: HPSEDC can disable this tier, and
                  it's framed as the slower fallback (copy nudges self-fill). */}
              {callbackEnabled && (
                <button type="button" disabled={saving} onClick={() => setMode("assisted")}
                  className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md transition-all active:scale-[0.99]">
                  <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><PhoneCall className="w-7 h-7" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-slate-900">{t("start.assistedTitle")}</span>
                    <span className="block text-sm text-slate-500 mt-0.5">{t("start.assistedDesc")}</span>
                  </span>
                  <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              )}
            </div>
          </>
        )}

        {effectiveMode === "assisted" && (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{t("start.assistedHeading")}</h1>
            <p className="text-base text-slate-500 mb-6">{t("start.assistedSub")}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("start.nameLabel")}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("simpleApply.phName")} maxLength={100} className="h-14 rounded-xl text-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("simpleApply.labelPhone")}</label>
                <Input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder={t("simpleApply.phPhone")} maxLength={15} className="h-14 rounded-xl text-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("start.workLabel")} <span className="text-slate-400 font-normal">{t("start.optional")}</span></label>
                <Input value={work} onChange={(e) => setWork(e.target.value)} placeholder={t("start.phWork")} maxLength={60} className="h-14 rounded-xl text-lg" />
              </div>
              <Button onClick={submitAssisted} disabled={saving || !name.trim() || phone.replace(/\D/g, "").length < 10} className={`${BIG_BTN} bg-emerald-600 hover:bg-emerald-700 text-white mt-2`}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <PhoneCall className="w-5 h-5 mr-2" />} {t("start.requestCallback")}
              </Button>
              <button onClick={() => setMode("choose")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 py-3"><ArrowLeft className="w-4 h-4" /> {t("shell.back")}</button>
            </div>
          </>
        )}

        {effectiveMode === "done" && (
          <div className="text-center py-6">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5"><CheckCircle2 className="w-11 h-11 text-emerald-600" /></div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("start.thankYou", { name: name.split(" ")[0] })}</h1>
            <p className="text-lg text-slate-600 mb-6">{t("start.callYouOn", { phone })}</p>
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5 text-left mb-6">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800">{t("start.noFeeFraud")}</p>
            </div>
            <Button onClick={() => setLocation("/")} className={`${BIG_BTN} bg-blue-700 hover:bg-blue-800 text-white`}>{t("start.goDashboard")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
