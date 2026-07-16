// UAT-03 #16 + #19: post-placement support page. A placed candidate raises a
// support issue (3-month window) or files a monthly check-in, sees the status
// of past submissions, and gets the official Govt-of-India help channels.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OVERSEAS_HELP_LINKS } from "@/lib/reference-data";
import {
  Landmark, LifeBuoy, ShieldCheck, Heart, AlertTriangle, CheckCircle2, Clock, Loader2, ArrowLeft, ExternalLink, Send,
} from "lucide-react";

async function fetchJson(url: string) { const r = await fetch(url, { credentials: "include" }); if (!r.ok) return { data: [] }; return r.json(); }

const ISSUE_CATEGORIES = [
  { value: "salary_unpaid", label: "Salary not paid / underpaid" },
  { value: "contract", label: "Contract / working conditions differ" },
  { value: "safety", label: "Safety or harassment" },
  { value: "health", label: "Health / medical" },
  { value: "documents", label: "Passport / documents held" },
  { value: "other", label: "Other problem" },
];

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: profRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"], queryFn: () => fetchJson("/api/v1/candidates/profile") });
  const { data: listRes } = useQuery<any>({ queryKey: ["/api/v1/post-placement/my"], queryFn: () => fetchJson("/api/v1/post-placement/my") });
  const profile = profRes?.data || {};
  const country = (profile.preferredCountries && profile.preferredCountries[0]) || "";
  const items: any[] = listRes?.data || [];

  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");

  const submit = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch("/api/v1/post-placement", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "Failed");
      return r.json();
    },
    onSuccess: () => { setCategory(""); setMessage(""); qc.invalidateQueries({ queryKey: ["/api/v1/post-placement/my"] }); toast({ title: "Sent to HPSEDC", description: "The team will follow up with you." }); },
    onError: (e: any) => toast({ title: e.message || "Couldn't send", variant: "destructive" }),
  });

  const BIG = "w-full h-14 text-lg font-semibold rounded-xl";
  const statusChip = (s: string) => {
    const map: Record<string, { label: string; cls: string; icon: any }> = {
      open: { label: "Open", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
      in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
      resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
      ok: { label: "All well", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
      needs_help: { label: "Needs help", cls: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
    };
    const m = map[s] || map.open; const I = m.icon;
    return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${m.cls}`}><I className="w-3 h-3" /> {m.label}</span>;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="flex items-center justify-center gap-2 py-3 px-4 border-b border-slate-100 bg-white/80">
        <Landmark className="w-4 h-4 text-blue-700" />
        <p className="text-sm font-semibold text-slate-700">{t("shell.govBrand")} <span className="text-slate-400 font-normal">· {t("shell.govSubtitle")}</span></p>
      </div>
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        <div>
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-3"><ArrowLeft className="w-4 h-4" /> Back</button>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><LifeBuoy className="w-6 h-6 text-blue-700" /> Support after placement</h1>
          <p className="text-base text-slate-500 mt-1">If you are working overseas and something is wrong, tell HPSEDC. You can also send a monthly “I’m fine” update.</p>
        </div>

        {/* Monthly check-in */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Monthly check-in</h2>
          <p className="text-sm text-slate-500 mb-4">Let HPSEDC know how you are, once a month.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button disabled={submit.isPending} onClick={() => submit.mutate({ kind: "checkin", category: "ok", country })} className={`${BIG} bg-emerald-600 hover:bg-emerald-700 text-white`}><Heart className="w-5 h-5 mr-2" /> I’m fine</Button>
            <Button disabled={submit.isPending} onClick={() => submit.mutate({ kind: "checkin", category: "needs_help", country })} className={`${BIG} bg-red-600 hover:bg-red-700 text-white`}><AlertTriangle className="w-5 h-5 mr-2" /> I need help</Button>
          </div>
        </section>

        {/* Raise an issue */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Report a problem</h2>
          <label className="block text-sm font-semibold text-slate-600 mb-1.5">What is the problem?</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-12"><SelectValue placeholder="Choose a problem" /></SelectTrigger>
            <SelectContent>{ISSUE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <label className="block text-sm font-semibold text-slate-600 mt-4 mb-1.5">Tell us more</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Describe what happened…"
            className="w-full min-h-[100px] p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          <Button disabled={submit.isPending || !category} onClick={() => submit.mutate({ kind: "issue", category, message, country })} className={`${BIG} mt-4 bg-blue-700 hover:bg-blue-800 text-white`}>
            {submit.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5 mr-2" /> Send to HPSEDC</>}
          </Button>
        </section>

        {/* Official help */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Official Government of India help</h2>
          <p className="text-sm text-slate-500 mb-3">For urgent problems abroad, use the official channels too.</p>
          <div className="space-y-2">
            {OVERSEAS_HELP_LINKS.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50/40 transition-all">
                <ExternalLink className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{l.label}</span><span className="block text-xs text-slate-500">{l.note}</span></span>
              </a>
            ))}
          </div>
        </section>

        {/* History */}
        {items.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Your submissions</h2>
            <div className="space-y-2.5">
              {items.map((it) => (
                <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{it.kind === "checkin" ? "Monthly check-in" : (ISSUE_CATEGORIES.find((c) => c.value === it.category)?.label || "Problem reported")}</p>
                    {it.message && <p className="text-xs text-slate-500 truncate">{it.message}</p>}
                    <p className="text-[11px] text-slate-400 mt-0.5">{it.createdAt ? new Date(it.createdAt).toLocaleDateString("en-IN") : ""}</p>
                  </div>
                  {statusChip(it.status)}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
