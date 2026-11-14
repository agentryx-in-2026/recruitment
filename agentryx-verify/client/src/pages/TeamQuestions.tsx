import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Search, Send, BookOpen, Film, FileText, ListChecks } from "lucide-react";
import { Shell, Page, useWorkspace } from "../components/Shell";

/**
 * Team questions — every question the testers have asked, as a full page
 * (MGC "Team questions"): filters, a list, and the selected question with its
 * answer and sources. A new question can be asked from here too.
 */
type Source = { n: number; type: string; title: string; heading: string; url: string | null };
type Q = { id: string; question: string; answer: string | null; status: string; sources: Source[]; answeredBy: string | null; createdAt: string; answeredAt: string | null; contextRef: string | null; askedBy: string | null; mine: boolean };

const ICON: Record<string, any> = { guide: BookOpen, video: Film, frs: FileText, plan: FileText, case: ListChecks };
const TYPE_LABEL: Record<string, string> = { guide: "User guide", video: "Video", frs: "FRS", plan: "Coverage plan", case: "Test case" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Badge({ status }: { status: string }) {
  const s = status === "answered" ? ["Answered", "bg-emerald-50 text-emerald-700 border-emerald-200", "bg-emerald-500"]
    : status === "open" ? ["Waiting", "bg-amber-50 text-amber-800 border-amber-200", "bg-amber-500"]
      : ["Closed", "bg-slate-100 text-slate-500 border-slate-200", "bg-slate-400"];
  return <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2 py-0.5 ${s[1]}`}><span className={`w-1.5 h-1.5 rounded-full ${s[2]}`} />{s[0]}</span>;
}

function Body() {
  const { data } = useWorkspace();
  const params = new URLSearchParams(useSearch());
  const [qs, setQs] = useState<Q[] | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "open" | "answered" | "closed">("all");
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => fetch("/api/ask/team", { credentials: "include" }).then((r) => r.json()).then((d) => setQs(Array.isArray(d) ? d : [])).catch(() => setQs([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get("new")) setTimeout(() => document.getElementById("tq-new")?.focus(), 100); }, []);

  const list = useMemo(() => (qs ?? []).filter((q) =>
    (filter === "all" || (filter === "mine" ? q.mine : q.status === filter)) &&
    (!term.trim() || `${q.question} ${q.answer ?? ""} ${q.contextRef ?? ""}`.toLowerCase().includes(term.toLowerCase()))), [qs, filter, term]);
  const current = (qs ?? []).find((q) => q.id === sel) ?? list[0] ?? null;
  const n = (f: string) => (qs ?? []).filter((q) => f === "all" || (f === "mine" ? q.mine : q.status === f)).length;

  const ask = async () => {
    if (text.trim().length < 3) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      setText(""); await load(); setFilter("all"); setSel(j.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const close = async (q: Q) => {
    await fetch(`/api/ask/${q.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) });
    load();
  };

  return (
    <Page title="Team questions" sub="Every question the testers have asked, with the answers. Ask your own below — Ask Agentryx answers from the guides, videos, FRS and test cases, and the rest go to the Agentryx team."
      actions={data!.me.isAdmin && <Link href="/questions" className="text-sm text-indigo-700 hover:underline">Answer in the Questions inbox</Link>}>
      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <label htmlFor="tq-new" className="block text-sm font-semibold text-slate-900">Ask a new question</label>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <textarea id="tq-new" rows={2} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder="e.g. Which account do I use to schedule an interview?" className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button onClick={ask} disabled={busy || text.trim().length < 3} className="self-start inline-flex items-center gap-2 rounded-md bg-[#14213D] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"><Send className="w-4 h-4" /> {busy ? "Sending…" : "Ask"}</button>
        </div>
        {err && <p className="text-sm text-rose-700 mt-2">{err}</p>}
        {!data!.ai && <p className="text-xs text-slate-500 mt-2">Written answers are switched off just now: you get the matching guide passages at once, and the team replies here.</p>}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {([["all", "All"], ["mine", "Mine"], ["open", "Waiting"], ["answered", "Answered"], ["closed", "Closed"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); setSel(null); }} className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "bg-[#14213D] text-white border-[#14213D]" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>{l} <span className="opacity-70">{n(k)}</span></button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input aria-label="Search questions" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search questions…" className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white" />
        </div>
      </div>

      {qs === null ? <p className="text-slate-400">Loading…</p> : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No questions here yet.</div>
      ) : (
        <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start">
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {list.map((q) => (
              <button key={q.id} onClick={() => setSel(q.id)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${current?.id === q.id ? "bg-[#F1F4FA] shadow-[inset_3px_0_0_#14213D]" : ""}`}>
                <div className="flex items-start justify-between gap-3"><span className="text-[15px] font-medium text-slate-900 line-clamp-2">{q.question}</span><Badge status={q.status} /></div>
                <div className="text-xs text-slate-500 mt-1">{q.mine ? "You" : q.askedBy ?? "Tester"} · {when(q.createdAt)}{q.contextRef ? ` · ${q.contextRef}` : ""}</div>
              </button>
            ))}
          </div>
          {current && (
            <div className="bg-white rounded-lg border border-slate-200 p-5 lg:sticky lg:top-32">
              <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{current.question}</h2><Badge status={current.status} /></div>
              <div className="text-xs text-slate-500 mt-1">Asked by {current.mine ? "you" : current.askedBy ?? "a tester"} · {when(current.createdAt)}{current.contextRef ? <> · about case <b>{current.contextRef}</b></> : null}</div>
              <div className="mt-4">
                {current.answer
                  ? <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4"><div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{current.answer}</div><div className="text-[11px] text-slate-500 mt-2">Answered by {current.answeredBy ?? "the team"}{current.answeredAt ? ` · ${when(current.answeredAt)}` : ""}</div></div>
                  : <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">Waiting for an answer from the Agentryx team.{current.sources?.length ? " Meanwhile, these passages look relevant:" : ""}</div>}
              </div>
              {current.sources?.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Sources</div>
                  {current.sources.slice(0, 6).map((s) => {
                    const I = ICON[s.type] ?? FileText;
                    const inner = <span className="flex items-start gap-2"><I className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" /><span><span className="block text-xs text-slate-500">[{s.n}] {TYPE_LABEL[s.type] ?? s.type} · {s.title}</span><span className="block text-sm text-slate-800">{s.heading}</span></span></span>;
                    return s.url ? <a key={s.n} href={s.url} target={s.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="block rounded-md border border-slate-200 px-3 py-2 hover:border-slate-400">{inner}</a> : <div key={s.n} className="rounded-md border border-slate-200 px-3 py-2">{inner}</div>;
                  })}
                </div>
              )}
              {current.mine && current.status === "answered" && <button onClick={() => close(current)} className="mt-4 text-sm font-medium text-emerald-700 hover:underline">This answered it — close</button>}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

export function TeamQuestions() {
  return <Shell title="Team questions"><Body /></Shell>;
}
