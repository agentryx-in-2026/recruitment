import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Same shape as the page-local helpers in admin/agent dashboards: a failed read
// degrades to an empty panel rather than throwing into the error boundary.
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

// ── "Ask HPSEDC" staff inbox ──────────────────────────────────────────
// support 2026-07-16: shared by BOTH staff seats. The backend
// (server/routes/support.routes.ts) has always allowed admin | superadmin |
// agent to read /support/threads, but this panel was only ever mounted on the
// admin dashboard — so in single-agency mode, where HPSEDC staff work from the
// AGENT dashboard, candidate messages arrived and nobody could see them.
// Mounted here once, rendered in both, so the loop can't silently break again.

export function SupportInboxPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: threadsRes } = useQuery({
    queryKey: ["/api/v1/support/threads"],
    queryFn: () => fetchJson("/api/v1/support/threads"),
    refetchInterval: 20000,
  });
  const threads: any[] = threadsRes?.data || [];

  const { data: threadRes } = useQuery({
    queryKey: ["/api/v1/support/threads", selected],
    queryFn: () => fetchJson(`/api/v1/support/threads/${selected}`),
    enabled: !!selected,
    refetchInterval: selected ? 15000 : false,
  });
  const messages: any[] = threadRes?.data || [];

  const send = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(`/api/v1/support/threads/${selected}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ body }) });
      if (!r.ok) throw new Error("Failed to send");
      return r.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/threads", selected] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/support/threads"] });
    },
    onError: (e: any) => toast({ title: e.message || "Failed to send", variant: "destructive" }),
  });
  const submit = () => { const b = reply.trim(); if (b) send.mutate(b); };
  const fmt = (d: string) => { try { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 p-5 border-b border-slate-100">
        <MessagesSquare className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-slate-900">Messages — Ask HPSEDC</h3>
        <span className="text-xs text-slate-400 font-normal ml-1">Informal help thread (grievances are separate)</span>
      </div>
      <div className="grid md:grid-cols-[300px_1fr] min-h-[26rem]">
        {/* Thread list */}
        <div className="border-r border-slate-100 max-h-[32rem] overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-slate-400 text-sm py-10 text-center">No messages yet.</p>
          ) : threads.map((t) => (
            <button key={t.candidate_id} onClick={() => setSelected(t.candidate_id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selected === t.candidate_id ? "bg-blue-50/60" : ""}`}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold shrink-0">{(t.candidate_name || "?")[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate flex-1">{t.candidate_name || "Candidate"}</p>
                    {Number(t.unread) > 0 && <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 tabular-nums">{t.unread}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{t.last_message}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        {/* Detail */}
        <div className="flex flex-col min-h-[26rem]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a thread to view the conversation.</div>
          ) : (
            <>
              <div className="flex-1 max-h-[26rem] overflow-y-auto p-4 space-y-2.5">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.senderRole === "hpsedc" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderRole === "hpsedc" ? "bg-blue-600 text-white rounded-br-md" : "bg-slate-100 text-slate-800 rounded-bl-md"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${m.senderRole === "hpsedc" ? "text-blue-100" : "text-slate-400"}`}>{fmt(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-100 flex gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={2000}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder="Type your reply…"
                  className="flex-1 p-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                <Button onClick={submit} disabled={!reply.trim() || send.isPending} className="h-auto px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white">
                  {send.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
