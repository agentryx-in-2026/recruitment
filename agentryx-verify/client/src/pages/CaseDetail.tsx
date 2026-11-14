import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, ChevronRight, ExternalLink, Bot, Copy, Check, X, Sparkles, MessageSquare, Paperclip, Loader2, MinusCircle } from "lucide-react";
import { Shell, useWorkspace, caseState, StatusChip, type Case } from "../components/Shell";
import { api } from "../lib/api";

/** One test case: steps, how to run it (yourself / automated / Claude in Chrome), record the result. */
const ROLE: Record<number, string> = { 1: "Applicant", 2: "HPSEDC Placement Cell", 3: "Employer", 4: "Admin" };
const PORTAL = "https://hirestream-lite.agentryx.dev";

function steps(text: string | null) {
  if (!text) return [];
  return text.split(/\s*(?:→|;\s+then\s+|;\s+)\s*/).map((s) => s.trim()).filter(Boolean);
}

function chromePrompt(c: Case) {
  const portal = c.projectSlug === "hirestream-lite" ? PORTAL : "the HireStream mobile app (as instructed)";
  return [
    `You are helping me test the HireStream Lite portal (HPSEDC overseas placement). Work in this browser and show me each step as you go.`,
    ``,
    `Portal: ${portal}`,
    `Test case ${c.item_ref}: ${c.description}`,
    `Steps: ${c.test_steps ?? "(none given)"}`,
    `Expected result: ${c.expected_result ?? "(none given)"}`,
    ``,
    `Test accounts (password test123): hpsedc_agency (Placement Cell), demo_admin (Admin), demo_candidate (Applicant). If the steps need a new applicant, use Create Account with a new address ending @demo.com.`,
    ``,
    `Rules: follow the steps exactly; do not change any setting or data the steps do not mention; never enter real personal data. Stop and ask me if something is unclear.`,
    `At the end, reply with PASS or FAIL, what you saw at each step, and anything unexpected.`,
  ].join("\n");
}

function Body({ id }: { id: string }) {
  const { data, reload, askAbout } = useWorkspace();
  const [, navigate] = useLocation();
  const all = useMemo(() => data!.projects.flatMap((p) => p.cases), [data]);
  const idx = all.findIndex((c) => c.id === id);
  const c = all[idx];
  const sameProject = c ? all.filter((x) => x.project_id === c.project_id) : [];
  const pos = c ? sameProject.findIndex((x) => x.id === c.id) : -1;
  const prev = pos > 0 ? sameProject[pos - 1] : null;
  const next = pos >= 0 && pos < sameProject.length - 1 ? sameProject[pos + 1] : null;

  const [decision, setDecision] = useState<"accepted" | "rejected" | "waived" | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [runMsg, setRunMsg] = useState<string | null>(null);

  useEffect(() => { setDecision(null); setNote(""); setFiles([]); setError(null); setShowPrompt(false); setRunMsg(null); }, [id]);
  useEffect(() => { if (c) api.getComments(c.projectSlug, c.id).then(setComments).catch(() => setComments([])); }, [c?.id]);

  if (!c) return <div className="p-10 text-slate-500">Case not found. <Link href="/cases" className="text-indigo-700 hover:underline">Back to cases</Link></div>;
  const state = caseState(c);
  const level = data!.me.level;
  const canAuto = !!c.autoScope && (data!.me.isAdmin || data!.me.role === "agentryx");

  const save = async (goNext: boolean) => {
    if (!decision) { setError("Choose Passed, Failed or Waive first."); return; }
    if (decision === "rejected" && !note.trim()) { setError("Say what went wrong, so it can be fixed."); return; }
    setSaving(true); setError(null);
    try {
      await api.signoff(c.projectSlug, c.id, level, decision, note.trim() || undefined, files);
      await reload();
      if (goNext && next) navigate(`/cases/${next.id}`);
    } catch (e: any) { setError(e.message.replace(/^\d+:\s*/, "")); } finally { setSaving(false); }
  };
  const clear = async () => { try { await api.clearSignoff(c.projectSlug, c.id, level); await reload(); } catch (e: any) { setError(e.message); } };
  const copyPrompt = async () => {
    setShowPrompt(true);
    try { await navigator.clipboard.writeText(chromePrompt(c)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* selectable text shown instead */ }
  };
  const runAuto = async () => {
    setRunMsg("Starting…");
    const r = await fetch("/api/testing/auto/run", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: c.autoScope }) });
    const j = await r.json();
    setRunMsg(r.ok ? `Automated ${c.autoScope} run started. It takes a few minutes — the result appears here and on Automated runs.` : j.error);
    reload();
  };
  const postComment = async () => {
    if (!comment.trim()) return;
    await api.postComment(c.projectSlug, c.id, comment.trim());
    setComment(""); setComments(await api.getComments(c.projectSlug, c.id));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href={`/cases?project=${c.projectSlug}`} className="text-slate-500 hover:text-slate-800 truncate">{c.section_title}</Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-slate-400 tabular-nums">{pos + 1} / {sameProject.length}</span>
          <button disabled={!prev} onClick={() => prev && navigate(`/cases/${prev.id}`)} className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-white" aria-label="Previous case"><ChevronLeft className="w-4 h-4" /></button>
          <button disabled={!next} onClick={() => next && navigate(`/cases/${next.id}`)} className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-white" aria-label="Next case"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-500">{c.item_ref}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600">{ROLE[c.section] ?? "General"}</span>
          <StatusChip c={c} />
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1 text-balance">{c.description}</h1>
        {c.delivery_status === "not_delivered" && <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Not built yet — this case is expected to fail until the fix is released. Retest when told.</p>}
        {c.delivery_status === "partial" && <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Partly built — check what works and note what doesn’t.</p>}
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-3 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Steps</h2>
          <ol className="mt-3 space-y-2">
            {steps(c.test_steps).map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-slate-800"><span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
        </div>
        <div className="md:col-span-2 min-w-0 bg-emerald-50/60 rounded-xl border border-emerald-200 p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-800">Expected result</h2>
          <p className="mt-3 text-[15px] text-slate-800 break-words [overflow-wrap:anywhere]">{c.expected_result}</p>
          <button onClick={() => askAbout(c.item_ref)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"><Sparkles className="w-4 h-4" /> Ask about this case</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Run it</h2>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <a href={c.projectSlug === "hirestream-lite" ? `${PORTAL}/auth` : "#"} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-3 hover:border-slate-400">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-sm"><ExternalLink className="w-4 h-4" /> Do it myself</div>
            <div className="text-xs text-slate-500 mt-1">Open the portal in a new tab and follow the steps.</div>
          </a>
          <button onClick={runAuto} disabled={!canAuto || !!data!.running} className="text-left rounded-lg border border-slate-200 p-3 hover:border-slate-400 disabled:opacity-50 disabled:hover:border-slate-200">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-sm"><Bot className="w-4 h-4" /> Run automated check</div>
            <div className="text-xs text-slate-500 mt-1">{!c.autoScope ? "No automated check for this case yet." : data!.running ? "A run is already in progress." : `Runs the ${c.autoScope} checks on a safe copy of the portal (a few minutes).`}</div>
          </button>
          <button onClick={copyPrompt} className="text-left rounded-lg border border-slate-200 p-3 hover:border-slate-400">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-sm">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} Run with Claude in Chrome</div>
            <div className="text-xs text-slate-500 mt-1">{copied ? "Copied — paste it into the Claude in Chrome side panel and watch." : "Copies instructions for the Claude in Chrome extension."}</div>
          </button>
        </div>
        {runMsg && <p className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{runMsg}</p>}
        {showPrompt && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Open the portal tab, open the Claude in Chrome side panel, paste this, and supervise. Record the result below yourself.</div>
            <textarea readOnly value={chromePrompt(c)} rows={9} onFocus={(e) => e.currentTarget.select()} className="w-full font-mono text-xs rounded-lg border border-slate-300 bg-slate-50 p-3" />
          </div>
        )}
        {c.auto && (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${c.auto.status === "passed" ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
            <div className="font-semibold">{c.auto.status === "passed" ? "✓ Automated check passed" : "✗ Automated check failed"} <span className="font-normal text-slate-500">· {new Date(c.auto.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
            {c.auto.detail && <p className="text-slate-700 mt-1">{c.auto.detail}</p>}
            {c.auto.screenshot && <a href={`/api/testing/auto/shot/${c.auto.screenshot}`} target="_blank" rel="noreferrer"><img src={`/api/testing/auto/shot/${c.auto.screenshot}`} alt={`Screen at the end of the automated check for ${c.item_ref}`} className="mt-2 rounded border border-slate-200 max-h-56" /></a>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your result</h2>
        {state !== "notrun" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <StatusChip c={c} />
            {c.my_comment && <span className="text-slate-600">“{c.my_comment}”</span>}
            <button onClick={clear} className="text-xs text-slate-500 hover:text-slate-800 underline">Clear and retest</button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {([["accepted", "Passed", Check, "emerald"], ["rejected", "Failed", X, "rose"], ["waived", "Waive", MinusCircle, "slate"]] as const).map(([v, label, I, tone]) => (
            <button key={v} onClick={() => setDecision(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold ${decision === v
                ? tone === "emerald" ? "bg-emerald-600 border-emerald-600 text-white" : tone === "rose" ? "bg-rose-600 border-rose-600 text-white" : "bg-slate-600 border-slate-600 text-white"
                : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"}`}>
              <I className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <label htmlFor="result-note" className="block text-sm text-slate-600 mt-4 mb-1">{decision === "rejected" ? "What went wrong? (required)" : "Note (optional)"}</label>
        <textarea id="result-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={decision === "rejected" ? "What you did, what you expected, what you saw" : ""} />
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <Paperclip className="w-4 h-4" /> {files.length ? `${files.length} screenshot${files.length > 1 ? "s" : ""} attached` : "Attach screenshots"}
          <input id="result-files" type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
        </label>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => save(true)} disabled={saving} className="inline-flex items-center gap-2 bg-[#14213D] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{next ? "Save and go to next case" : "Save"}</button>
          {next && <button onClick={() => save(false)} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Save</button>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Comments</h2>
        <div className="mt-3 space-y-3">
          {comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
          {comments.map((m: any) => (
            <div key={m.id} className="text-sm"><span className="font-semibold text-slate-800">{m.reviewerName ?? m.reviewer_name ?? "Reviewer"}</span> <span className="text-xs text-slate-400">{m.createdAt ? new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span><p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{m.body}</p></div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <label htmlFor="new-comment" className="sr-only">Add a comment</label>
          <input id="new-comment" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postComment()} placeholder="Add a comment…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button onClick={postComment} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Post</button>
        </div>
      </div>
    </div>
  );
}

export function CaseDetail() {
  const [, params] = useRoute("/cases/:id");
  return <Shell title="Test case"><Body id={params!.id} /></Shell>;
}
