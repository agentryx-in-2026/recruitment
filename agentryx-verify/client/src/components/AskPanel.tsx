import { useEffect, useState } from "react";
import { X, Send, Sparkles, Search, ExternalLink, BookOpen, Film, FileText, ListChecks } from "lucide-react";

/**
 * Ask Agentryx — docked assistant. "Ask" sends a question: with AI switched on
 * Claude answers from the project's guides, video chapters, FRS and test cases
 * and cites them; otherwise the best-matching passages come back at once and
 * the question waits for the admin. "Find" searches the same knowledge.
 */
type Source = { n: number; type: string; title: string; heading: string; url: string | null; excerpt: string };
type Q = { id: string; question: string; answer: string | null; status: string; sources: Source[]; answeredBy: string | null; createdAt: string; contextRef?: string | null };

const ICON: Record<string, any> = { guide: BookOpen, video: Film, frs: FileText, plan: FileText, case: ListChecks };
const TYPE_LABEL: Record<string, string> = { guide: "User guide", video: "Video", frs: "FRS", plan: "Coverage plan", case: "Test case" };

function SourceLink({ s }: { s: Source }) {
  const I = ICON[s.type] ?? FileText;
  const inner = (
    <span className="flex items-start gap-2">
      <I className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
      <span className="min-w-0"><span className="block text-xs text-slate-500">[{s.n}] {TYPE_LABEL[s.type] ?? s.type} · {s.title}</span><span className="block text-sm text-slate-800">{s.heading}</span></span>
    </span>
  );
  return s.url
    ? <a href={s.url} target={s.url.startsWith("/cases/") ? undefined : "_blank"} rel="noreferrer" className="block rounded-md border border-slate-200 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40">{inner}</a>
    : <div className="rounded-md border border-slate-200 px-3 py-2">{inner}</div>;
}

function Answer({ text }: { text: string }) {
  // Light formatting: keep line breaks and numbered steps; bold **x**.
  return (
    <div className="text-sm text-slate-800 leading-relaxed space-y-1.5">
      {text.split(/\n+/).map((line, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }} />
      ))}
    </div>
  );
}

export function AskPanel({ ai, isAdmin, contextRef, onClose, clearContext }: { ai: boolean; isAdmin: boolean; contextRef: string | null; onClose: () => void; clearContext: () => void }) {
  const [tab, setTab] = useState<"ask" | "find">("ask");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Q[]>([]);
  const [current, setCurrent] = useState<Q | null>(null);
  const [hits, setHits] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMine = () => fetch("/api/ask/mine", { credentials: "include" }).then((r) => r.json()).then(setMine).catch(() => {});
  useEffect(() => { loadMine(); }, []);
  useEffect(() => { if (contextRef) { setTab("ask"); setCurrent(null); } }, [contextRef]);

  const ask = async () => {
    if (text.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, contextRef }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      setCurrent({ ...j, createdAt: new Date().toISOString() });
      setText(""); loadMine();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const find = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { setHits(await fetch(`/api/ask/search?q=${encodeURIComponent(text)}`, { credentials: "include" }).then((r) => r.json())); } finally { setBusy(false); }
  };
  const close = async (q: Q) => { await fetch(`/api/ask/${q.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) }); loadMine(); if (current?.id === q.id) setCurrent({ ...q, status: "closed" }); };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" />Ask Agentryx</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close Ask Agentryx"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500 mt-1">{ai ? "Answers from the user guides, videos, FRS and test cases, with sources." : "Finds the answer in the user guides, videos, FRS and test cases. Questions it can’t settle go to the admin."}</p>
        <div className="mt-3 grid grid-cols-2 bg-slate-100 rounded-lg p-1 text-sm">
          <button onClick={() => setTab("ask")} className={`rounded-md py-1.5 font-medium ${tab === "ask" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Ask a question</button>
          <button onClick={() => setTab("find")} className={`rounded-md py-1.5 font-medium ${tab === "find" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Find in guides</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {tab === "ask" && current && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
            <div className="text-sm font-semibold text-slate-900">{current.question}</div>
            {current.answer
              ? <><Answer text={current.answer} /><div className="text-[11px] text-slate-500">Answered by {current.answeredBy ?? "admin"}</div></>
              : <div className="text-sm text-slate-700">{current.sources.length ? "These passages look relevant. Your question has also been sent to the admin." : "Nothing in the guides matched. Your question has been sent to the admin."}</div>}
            {current.sources.length > 0 && <div className="space-y-1.5">{current.sources.slice(0, current.answer ? 5 : 6).map((s) => <SourceLink key={s.n} s={s} />)}</div>}
            {current.status !== "closed" && current.answer && <button onClick={() => close(current)} className="text-xs font-medium text-emerald-700 hover:underline">This answered it — close</button>}
          </div>
        )}
        {tab === "find" && hits && (
          <div className="space-y-2">
            {hits.length === 0 && <div className="text-sm text-slate-500">No matches. Try other words, or ask the question instead.</div>}
            {hits.map((h, i) => (
              <div key={h.id} className="space-y-1">
                <SourceLink s={{ n: i + 1, type: h.source_type, title: h.source_title, heading: h.heading, url: h.url, excerpt: "" }} />
                <p className="text-xs text-slate-600 px-1 line-clamp-3">{h.body}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "ask" && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">My questions</div>
            {mine.length === 0 && <div className="text-sm text-slate-500">No questions yet. Try “How do I schedule an interview?”</div>}
            <div className="space-y-2">
              {mine.map((q) => (
                <button key={q.id} onClick={() => setCurrent(q)} className="w-full text-left rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-slate-900">{q.question}</span>
                    <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${q.status === "answered" ? "bg-emerald-50 text-emerald-700" : q.status === "open" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{q.status === "answered" ? "Answered" : q.status === "open" ? "Waiting" : "Closed"}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{new Date(q.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{q.contextRef ? ` · ${q.contextRef}` : ""}</div>
                </button>
              ))}
            </div>
            {isAdmin && <a href="/questions" className="block mt-3 text-xs font-medium text-indigo-700 hover:underline">Open the questions inbox →</a>}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3">
        {contextRef && tab === "ask" && (
          <div className="mb-2 flex items-center justify-between text-xs bg-amber-50 text-amber-800 rounded-md px-2 py-1">
            <span>About case <b>{contextRef}</b></span><button onClick={clearContext} className="hover:underline">clear</button>
          </div>
        )}
        {error && <div className="mb-2 text-xs text-rose-700">{error}</div>}
        <div className="flex gap-2">
          <label htmlFor="ask-input" className="sr-only">{tab === "ask" ? "Your question" : "Search the guides"}</label>
          <textarea id="ask-input" value={text} onChange={(e) => setText(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); tab === "ask" ? ask() : find(); } }}
            placeholder={tab === "ask" ? "Ask how to test something…" : "Search guides, videos, test cases…"}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <button onClick={tab === "ask" ? ask : find} disabled={busy} aria-label={tab === "ask" ? "Send question" : "Search"}
            className="self-end h-10 w-10 inline-flex items-center justify-center rounded-lg bg-[#14213D] text-white disabled:opacity-50">
            {tab === "ask" ? <Send className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
