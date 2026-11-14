import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Shell, useWorkspace } from "../components/Shell";

/** Admin inbox for Ask Agentryx: answer waiting questions, review AI answers, rebuild knowledge. */
type Q = { id: string; question: string; answer: string | null; status: string; answeredBy: string | null; askedBy: string; createdAt: string; contextRef: string | null; sources: { n: number; heading: string; title: string }[] };

function Body() {
  const { data } = useWorkspace();
  const [qs, setQs] = useState<Q[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => fetch("/api/ask/all", { credentials: "include" }).then((r) => r.json()).then((d) => setQs(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!data!.me.isAdmin) return <div className="p-10 text-slate-500">Admins only.</div>;

  const answer = async (q: Q) => {
    const text = drafts[q.id]?.trim();
    if (!text) return;
    await fetch(`/api/ask/${q.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text }) });
    setDrafts({ ...drafts, [q.id]: "" }); load();
  };
  const reindex = async () => {
    setMsg("Rebuilding…");
    const r = await fetch("/api/ask/reindex", { method: "POST", credentials: "include" });
    const j = await r.json();
    setMsg(r.ok ? `Knowledge rebuilt: ${Object.entries(j).map(([k, v]) => `${v} ${k}`).join(", ")}.` : j.error);
  };
  const shown = qs.filter((q) => filter === "all" || q.status === "open");

  return (
    <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[26px] font-bold text-slate-900">Questions inbox</h1>
          <p className="text-sm text-slate-600 mt-1">{data!.ai ? "AI answers most questions; check them and answer the rest." : "AI answering is off (no Anthropic key on the server). Testers get matching passages; answer here."}</p>
        </div>
        <button onClick={reindex} className="inline-flex items-center gap-1.5 text-sm border border-slate-300 rounded-md px-3 py-1.5 hover:bg-white"><RefreshCw className="w-4 h-4" /> Rebuild knowledge</button>
      </div>
      {msg && <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">{msg}</p>}
      <div className="flex gap-2 text-sm">
        {(["open", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 ${filter === f ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white border-slate-300 text-slate-600"}`}>{f === "open" ? `Waiting (${qs.filter((q) => q.status === "open").length})` : `All (${qs.length})`}</button>)}
      </div>
      <div className="space-y-3">
        {shown.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">Nothing waiting.</div>}
        {shown.map((q) => (
          <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-slate-900">{q.question}</div>
              <span className="text-xs text-slate-400 shrink-0">{q.askedBy} · {new Date(q.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {q.contextRef && <div className="text-xs text-amber-700 mt-1">About case {q.contextRef}</div>}
            {q.answer && <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap border-l-2 border-emerald-300 pl-3">{q.answer}<div className="text-[11px] text-slate-400 mt-1">— {q.answeredBy ?? "admin"}</div></div>}
            {q.status === "open" && (
              <div className="mt-3 flex gap-2">
                <label htmlFor={`ans-${q.id}`} className="sr-only">Answer</label>
                <textarea id={`ans-${q.id}`} value={drafts[q.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} rows={2} placeholder="Write the answer…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button onClick={() => answer(q)} className="self-end rounded-lg bg-[#14213D] text-white px-4 py-2 text-sm font-semibold">Answer</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Questions() {
  return <Shell title="Questions inbox"><Body /></Shell>;
}
