/**
 * "HPSEDC will call me" — extracted from register-start.tsx (the tier chooser),
 * which UAT-05 deletes.
 *
 * This used to be a TIER: one of three tiles a candidate had to choose between
 * at /start, before they had seen a single question. That framing was wrong.
 * Asking for a callback is not a *kind* of registration — it is what you do
 * when the form has defeated you, which you cannot know at page zero. So it
 * stops being a fork in the road and becomes a way out that is present on every
 * page of the form (see RegisterShell's footer).
 *
 * It stays because it is a genuine lifeline: some applicants cannot fill a form
 * at all — no smartphone, limited literacy, no help at hand — and for a
 * government programme that must not mean "no overseas job for you".
 * `capability.assisted_callback_enabled` still hides it entirely if HPSEDC
 * decide not to staff the queue.
 */

import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Landmark, PhoneCall, Loader2, CheckCircle2, ShieldCheck, ArrowLeft } from "lucide-react";

const BIG_BTN = "w-full h-14 rounded-xl text-lg font-semibold";

export default function CallbackPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [work, setWork] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: profileRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const { data: capRes } = useQuery<any>({ queryKey: ["/api/v1/config/public"] });
  const enabled = capRes?.data?.assistedCallbackEnabled !== false;

  useEffect(() => { if (!authLoading && !user) setLocation("/auth"); }, [user, authLoading, setLocation]);

  useEffect(() => {
    const p = profileRes?.data;
    if (!p) return;
    setName((n) => n || (p.fullName && p.fullName !== "Unknown" ? p.fullName : ""));
    setPhone((x) => x || p.phone || "");
  }, [profileRes]);

  // If HPSEDC turn the callback queue off, there is nothing to offer here —
  // send them to the form rather than showing a dead button.
  useEffect(() => { if (capRes && !enabled) setLocation("/register"); }, [capRes, enabled, setLocation]);

  async function submit() {
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/v1/candidates/profile", {
        registrationTier: "assisted", wantsCallback: true,
        fullName: name.trim(), phone: phone.trim(),
        ...(work.trim() ? { skills: [work.trim()] } : {}),
      });
      setDone(true);
    } catch (e: any) {
      toast({ title: t("reg.saveFailed"), description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">
          {t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span>
        </p>
      </div>

      <div className="flex-1 w-full max-w-xl mx-auto px-4 py-8">
        {!done ? (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">{t("start.assistedHeading")}</h1>
            <p className="text-base text-slate-500 mb-6">{t("start.assistedSub")}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("start.nameLabel")}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-14 rounded-xl text-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">{t("reg.p1.mobile")}</label>
                <Input type="tel" inputMode="numeric" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} maxLength={15} className="h-14 rounded-xl text-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  {t("start.workLabel")} <span className="text-slate-400 font-normal">{t("start.optional")}</span>
                </label>
                <Input value={work} onChange={(e) => setWork(e.target.value)} maxLength={60} className="h-14 rounded-xl text-lg" />
              </div>
              <Button onClick={submit} disabled={saving || !name.trim() || phone.replace(/\D/g, "").length < 10}
                className={`${BIG_BTN} bg-emerald-600 hover:bg-emerald-700 text-white mt-2`}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <PhoneCall className="w-5 h-5 mr-2" />}
                {t("start.requestCallback")}
              </Button>
              <button onClick={() => setLocation("/register")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 py-3">
                <ArrowLeft className="w-4 h-4" /> {t("reg.backToForm")}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-11 h-11 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("start.thankYou", { name: name.split(" ")[0] })}</h1>
            <p className="text-lg text-slate-600 mb-6">{t("start.callYouOn", { phone })}</p>
            {/* The fraud advisory belongs on the CALLBACK page specifically: this
                is the cohort a fraudster would target — someone expecting an
                unsolicited phone call about an overseas job. */}
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-start gap-2.5 text-left mb-6">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800">{t("start.noFeeFraud")}</p>
            </div>
            <Button onClick={() => setLocation("/")} className={`${BIG_BTN} bg-blue-700 hover:bg-blue-800 text-white`}>
              {t("start.goDashboard")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
