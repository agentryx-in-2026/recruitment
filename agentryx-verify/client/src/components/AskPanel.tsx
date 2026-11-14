import { useEffect, useState } from "react";
import { X, Send, Search, ArrowLeft, BookOpen, Film, FileText, ListChecks } from "lucide-react";

/**
 * Ask Agentryx — docked assistant, laid out like the MGC "Ask Darisham" panel:
 * a Questions list (the team's, newest first, with status), a New question
 * composer, and a detail view with the answer and its sources. "Find in guides"
 * searches the same knowledge directly.
 *
 * With AI switched on, Claude answers from the guides, video chapters, FRS and
 * test cases and cites them; otherwise the best-matching passages come back at
 * once and the question waits for the admin.
 */
type Source = { n: number; type: string; title: string; heading: string; url: string | null; excerpt: string };
type Q = {
  id: string; question: string; answer: string | null; status: string; sources: Source[];
  answeredBy: string | null; createdAt: string; contextRef?: string | null; askedBy?: string; mine?: boolean;
};

const ICON: Record<string, any> = { guide: BookOpen, video: Film, frs: FileText, plan: FileText, case: ListChecks };
const TYPE_LABEL: Record<string, string> = { guide: "User guide", video: "Video", frs: "FRS", plan: "Coverage plan", case: "Test case" };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function StatusBadge({ status }: { status: string }) {
  const s = status === "answered"
    ? { label: "Answered", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" }
    : status === "open"
      ? { label: "Waiting", cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" }
      : { label: "Closed", cls: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2 py-0.5 ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

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
        <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>") }} />
      ))}
    </div>
  );
}

export function AskPanel({ ai, isAdmin, contextRef, command, onClose, clearContext }: { ai: boolean; isAdmin: boolean; contextRef: string | null; command?: { view: "new" | "list"; n: number } | null; onClose: () => void; clearContext: () => void }) {
  const [tab, setTab] = useState<"ask" | "find">("ask");
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState<Q[]>([]);
  const [current, setCurrent] = useState<Q | null>(null);
  const [hits, setHits] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch("/api/ask/team", { credentials: "include" }).then((r) => r.json()).then((d) => setTeam(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);
  // "Ask about this case" on a case page opens the composer with the case attached.
  useEffect(() => { if (contextRef) { setTab("ask"); setView("new"); } }, [contextRef]);
  // Sidebar "Ask Agentryx" / edge tab: switch view even when the panel is already open, and show it happened.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!command) return;
    setTab("ask"); setView(command.view); setError(null); load();
    setFlash(true); const t = setTimeout(() => setFlash(false), 900);
    if (command.view === "new") setTimeout(() => document.getElementById("ask-input")?.focus(), 50);
    return () => clearTimeout(t);
  }, [command?.n]);

  const ask = async () => {
    if (text.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/ask", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, contextRef }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      setCurrent({ ...j, contextRef, createdAt: new Date().toISOString(), mine: true });
      setView("detail"); setText(""); load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const find = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { setHits(await fetch(`/api/ask/search?q=${encodeURIComponent(text)}`, { credentials: "include" }).then((r) => r.json())); } finally { setBusy(false); }
  };
  const close = async (q: Q) => {
    await fetch(`/api/ask/${q.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) });
    load(); setCurrent({ ...q, status: "closed" });
  };

  return (
    <div className={`flex flex-col h-full transition-shadow ${flash ? "shadow-[inset_0_0_0_3px_#FBBF24]" : ""}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="font-serif text-2xl font-bold text-slate-900">Ask Agentryx</div>
          <button onClick={onClose} className="mt-1 text-slate-400 hover:text-slate-700" aria-label="Close Ask Agentryx"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {ai ? "Answers from the user guides, videos, FRS and test cases, with sources." : "Questions from testers, and your own. Answers come from the guides, videos, FRS and test cases."}
          <> <a href="/team-questions" className="text-indigo-700 font-medium hover:underline">Open the full list</a></>
        </p>
        <div className="mt-4 grid grid-cols-2 bg-slate-100 rounded-lg p-1 text-sm">
          <button onClick={() => setTab("ask")} className={`rounded-md py-2 font-semibold ${tab === "ask" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Ask a question</button>
          <button onClick={() => setTab("find")} className={`rounded-md py-2 font-medium ${tab === "find" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Find in guides</button>
        </div>
      </div>

      {tab === "ask" && view === "list" && (
        <>
          <div className="px-5 py-2.5 border-y border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">Questions</span>
            <button onClick={() => { setView("new"); setError(null); }} className="rounded-md bg-[#14213D] text-white text-sm font-semibold px-3.5 py-2 hover:bg-[#1d2d52]">New question</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {team.length === 0
              ? <div className="text-sm text-slate-500 px-1">No questions yet. Try “How do I schedule an interview?”</div>
              : (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-200 bg-white">
                  {team.map((q) => (
                    <button key={q.id} onClick={() => { setCurrent(q); setView("detail"); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[15px] font-medium text-slate-900 line-clamp-3">{q.question}</span>
                        <StatusBadge status={q.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {q.mine ? "You" : q.askedBy ?? "Tester"} · {when(q.createdAt)}{q.contextRef ? ` · ${q.contextRef}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </>
      )}

      {tab === "ask" && view === "detail" && current && (
        <div className="flex-1 overflow-y-auto px-5 py-4 border-t border-slate-200">
          <button onClick={() => setView("list")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-3"><ArrowLeft className="w-4 h-4" /> Questions</button>
          <div className="flex items-start justify-between gap-3">
            <div className="text-base font-semibold text-slate-900">{current.question}</div>
            <StatusBadge status={current.status} />
          </div>
          <div className="text-xs text-slate-500 mt-1">{current.mine ? "You" : current.askedBy ?? "Tester"} · {when(current.createdAt)}{current.contextRef ? ` · ${current.contextRef}` : ""}</div>
          <div className="mt-4 space-y-3">
            {current.answer
              ? <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"><Answer text={current.answer} /><div className="text-[11px] text-slate-500 mt-2">Answered by {current.answeredBy ?? "admin"}</div></div>
              : <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm text-slate-700">{current.sources?.length ? "These passages look relevant. The question is also with the admin." : "Nothing in the guides matched. The question is with the admin."}</div>}
            {current.sources?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Sources</div>
                <div className="space-y-1.5">{current.sources.slice(0, current.answer ? 5 : 6).map((s) => <SourceLink key={s.n} s={s} />)}</div>
              </div>
            )}
            {current.mine && current.status !== "closed" && current.answer && <button onClick={() => close(current)} className="text-sm font-medium text-emerald-700 hover:underline">This answered it — close</button>}
            {ai && current.status === "open" && (current.mine || isAdmin) && (
              <button disabled={busy} onClick={async () => {
                setBusy(true); setError(null);
                try { const r = await fetch(`/api/ask/${current.id}/retry`, { method: "POST", credentials: "include" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setCurrent({ ...current, ...j }); load(); }
                catch (e: any) { setError(e.message); } finally { setBusy(false); }
              }} className="block text-sm font-medium text-indigo-700 hover:underline disabled:opacity-50">{busy ? "Looking it up…" : "Try again with Ask Agentryx"}</button>
            )}
            {error && <div className="text-xs text-rose-700">{error}</div>}
          </div>
        </div>
      )}

      {tab === "ask" && view === "new" && (
        <div className="flex-1 overflow-y-auto px-5 py-4 border-t border-slate-200">
          <button onClick={() => setView("list")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-3"><ArrowLeft className="w-4 h-4" /> Questions</button>
          <label htmlFor="ask-input" className="block text-sm font-semibold text-slate-900 mb-1.5">Your question</label>
          {contextRef && (
            <div className="mb-2 flex items-center justify-between text-xs bg-amber-50 text-amber-800 rounded-md px-2 py-1">
              <span>About case <b>{contextRef}</b></span><button onClick={clearContext} className="hover:underline">clear</button>
            </div>
          )}
          <textarea id="ask-input" value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder="e.g. How does HPSEDC record an interview outcome?"
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          {error && <div className="mt-2 text-xs text-rose-700">{error}</div>}
          <div className="mt-3 flex justify-end">
            <button onClick={ask} disabled={busy || text.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-md bg-[#14213D] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50">
              <Send className="w-4 h-4" /> {busy ? "Looking it up…" : "Ask"}
            </button>
          </div>
        </div>
      )}

      {tab === "find" && (
        <>
          <div className="px-5 py-3 border-y border-slate-200 bg-slate-50/70">
            <div className="flex gap-2">
              <label htmlFor="find-input" className="sr-only">Search the guides</label>
              <input id="find-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") find(); }}
                placeholder="Search guides, videos, test cases…"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              <button onClick={find} disabled={busy} aria-label="Search" className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-[#14213D] text-white disabled:opacity-50"><Search className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {!hits && <div className="text-sm text-slate-500">Search every user guide section, video chapter, FRS clause and test case.</div>}
            {hits && hits.length === 0 && <div className="text-sm text-slate-500">No matches. Try other words, or ask the question instead.</div>}
            {hits?.map((h, i) => (
              <div key={h.id} className="space-y-1">
                <SourceLink s={{ n: i + 1, type: h.source_type, title: h.source_title, heading: h.heading, url: h.url, excerpt: "" }} />
                <p className="text-xs text-slate-600 px-1 line-clamp-3">{h.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
