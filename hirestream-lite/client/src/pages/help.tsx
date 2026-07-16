// HP-6: "Ask HPSEDC" Help hub. One clear place for informal help — distinct
// from the formal Grievance channel. FAQ (self-serve) + a message thread to
// HPSEDC + call + a link to file a formal grievance.
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useHelpline } from "@/hooks/use-capabilities";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Landmark, ArrowLeft, HelpCircle, Phone, MessageSquare, ShieldAlert, Send, Loader2, ExternalLink,
} from "lucide-react";

// audit 2026-07-06 (C7): throw on non-OK so React Query enters its error state
// instead of rendering a failed load as a silently empty thread.
async function fetchJson(url: string) { const r = await fetch(url, { credentials: "include" }); if (!r.ok) throw new Error(`Request failed (${r.status})`); return r.json(); }

export default function HelpPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const helpline = useHelpline();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const { data: msgRes, isError: msgError, refetch: refetchMsgs } = useQuery<any>({ queryKey: ["/api/v1/support/messages/my"], queryFn: () => fetchJson("/api/v1/support/messages/my"), refetchInterval: 15000 });
  const messages: any[] = msgRes?.data || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch("/api/v1/support/messages", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ body }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["/api/v1/support/messages/my"] }); },
    onError: (e: any) => toast({ title: e.message || t("help.couldNotSend"), variant: "destructive" }),
  });

  const submit = () => { const b = text.trim(); if (b) send.mutate(b); };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">{t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span></p>
      </div>
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <div>
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-3"><ArrowLeft className="w-4 h-4" /> {t("shell.back")}</button>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><HelpCircle className="w-6 h-6 text-blue-700" /> {t("help.title")}</h1>
          <p className="text-base text-slate-500 mt-1">{t("help.subtitle")}</p>
        </div>

        {/* Quick options */}
        <div className="grid grid-cols-1 gap-2.5">
          <a href="/faq" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/40 transition-all">
            <span className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><HelpCircle className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900">{t("help.faqTitle")}</span><span className="block text-xs text-slate-500">{t("help.faqSub")}</span></span>
            <ExternalLink className="w-4 h-4 text-slate-300" />
          </a>
          {helpline.helplinePhone && (
            <a href={`tel:${helpline.helplinePhone.replace(/\s/g, "")}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all">
              <span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Phone className="w-6 h-6" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900">{t("help.callTitle")}</span><span className="block text-xs text-slate-500">{helpline.helplinePhone}{helpline.helplineHours ? ` · ${helpline.helplineHours}` : ""}</span></span>
            </a>
          )}
        </div>

        {/* Message HPSEDC — async thread */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1"><MessageSquare className="w-5 h-5 text-blue-600" /> {t("help.messageTitle")}</h2>
          <p className="text-sm text-slate-500 mb-4">{t("help.messageSub")}</p>

          <div className="space-y-2.5 max-h-72 overflow-y-auto mb-4 pr-1">
            {/* audit 2026-07-06 (C7): distinguish a failed load from an empty thread */}
            {msgError && messages.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400 mb-2">{t("help.couldNotLoad", { defaultValue: "Couldn't load messages." })}</p>
                <Button size="sm" variant="outline" onClick={() => refetchMsgs()}>{t("help.retry", { defaultValue: "Retry" })}</Button>
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t("help.noMessages")}</p>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderRole === "candidate" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderRole === "candidate" ? "bg-blue-600 text-white rounded-br-md" : "bg-slate-100 text-slate-800 rounded-bl-md"}`}>
                  {m.senderRole !== "candidate" && <p className="text-[11px] font-semibold text-blue-700 mb-0.5">HPSEDC</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={t("help.messagePh")} rows={2}
              className="flex-1 p-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            <Button onClick={submit} disabled={!text.trim() || send.isPending} className="h-auto px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white">
              {send.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{t("help.messageNote")}</p>
        </section>

        {/* Formal grievance — the separate, regulated channel */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><ShieldAlert className="w-6 h-6" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-900">{t("help.grievanceTitle")}</h2>
              <p className="text-sm text-slate-500">{t("help.grievanceSub")}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation("/grievances")} className="w-full h-12 mt-3 rounded-xl border-2 border-amber-200 text-amber-800 hover:bg-amber-50 font-semibold">
            {t("help.grievanceCta")}
          </Button>
        </section>
      </div>
    </div>
  );
}
