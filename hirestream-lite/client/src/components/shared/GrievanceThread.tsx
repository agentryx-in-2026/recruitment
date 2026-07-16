/**
 * Two-way conversation between a grievance's complainant and HPSEDC (the
 * assigned owner / admin). Shared by the candidate-facing Grievances page and
 * the Admin Console grievances tab so both parties talk in the same thread.
 * Collapsible to keep long grievance lists scannable.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return res.json();
}

export function GrievanceThread({
  grievanceId,
  isStaff,
  defaultOpen = false,
}: {
  grievanceId: string;
  isStaff: boolean;
  defaultOpen?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const { data: res } = useQuery({
    queryKey: ["/api/v1/grievances", grievanceId, "comments"],
    queryFn: () => getJson(`/api/v1/grievances/${grievanceId}/comments`),
    enabled: open,
  });
  const comments: any[] = res?.data ?? [];
  const send = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(`/api/v1/grievances/${grievanceId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || "Couldn't send message"); }
      return r.json();
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances", grievanceId, "comments"] });
    },
    onError: (e: any) => toast({ title: "Message not sent", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mt-3 border-t pt-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Conversation{comments.length ? ` (${comments.length})` : ""}
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {comments.length === 0 && <p className="text-xs text-slate-400 italic">No messages yet — start the conversation below.</p>}
            {comments.map((c) => {
              const staffMsg = ["admin", "superadmin", "agent", "employer"].includes(c.authorRole);
              const who = (c.authorRole === "admin" || c.authorRole === "superadmin") ? "HPSEDC Officer" : c.authorName;
              return (
                <div key={c.id} className={`flex ${staffMsg ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${staffMsg ? "bg-indigo-50 border border-indigo-100" : "bg-slate-100"} text-slate-800`}>
                    <div className="text-[10px] font-semibold mb-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className={staffMsg ? "text-indigo-700" : "text-slate-600"}>{who}</span>
                      {c.internal && <span className="text-[9px] bg-amber-200 text-amber-800 px-1 rounded">internal</span>}
                      <span className="text-slate-400 font-normal">{c.createdAt ? new Date(c.createdAt).toLocaleString("en-IN") : ""}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 items-end">
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} rows={2}
              placeholder={isStaff ? "Reply to the complainant…" : "Write a message to HPSEDC…"}
              className="flex-1 text-sm border rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <Button size="sm" disabled={send.isPending || !text.trim()} onClick={() => send.mutate(text.trim())}>
              {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
