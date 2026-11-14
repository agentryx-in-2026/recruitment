import { useEffect, useMemo, useState } from "react";
import { Shell } from "../components/Shell";
import { PmStatus } from "../components/PmStatus";
import { useSearch, useLocation } from "wouter";
import { useRequireAuth } from "../lib/useRequireAuth";
import { docHref } from "../lib/docs";
import { FileText, FileVideo, FileImage, FileCode, File as FileIcon, ExternalLink, Upload, Trash2, Lock, Users, Globe } from "lucide-react";

/**
 * Product Management — the project's reference library (contract, FRS/SRS,
 * coverage, architecture, plans, training material). Admins upload documents
 * and choose who may open each one; testers see only what is shared with them.
 */
type Doc = { id: string; title: string; category: string; description: string | null; originalName: string; mimeType: string; sizeBytes: number; audience: "admin" | "internal" | "all"; updatedAt: string };

const AUDIENCE: Record<Doc["audience"], { label: string; hint: string; cls: string; Icon: any }> = {
  admin:    { label: "Admins only",      hint: "Admin and delivery",                 cls: "bg-slate-100 text-slate-700 border-slate-200",       Icon: Lock },
  internal: { label: "Internal testers", hint: "Adds Agentryx testers (e.g. Piyush)", cls: "bg-indigo-50 text-indigo-700 border-indigo-200",     Icon: Users },
  all:      { label: "All reviewers",    hint: "Adds HTIS and HPSEDC reviewers",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200",  Icon: Globe },
};

function kind(m: string) {
  if (m === "application/pdf") return { label: "PDF", Icon: FileText };
  if (m.startsWith("video/")) return { label: "Video", Icon: FileVideo };
  if (m.startsWith("image/")) return { label: "Image", Icon: FileImage };
  if (m === "text/html") return { label: "Web page", Icon: FileCode };
  if (m === "text/markdown") return { label: "Document", Icon: FileText };
  return { label: "File", Icon: FileIcon };
}
const size = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export function ProductManagement() {
  const { reviewer, loading } = useRequireAuth();
  const tabParam = new URLSearchParams(useSearch()).get("tab");
  const [, navigate] = useLocation();
  const [data, setData] = useState<{ isAdmin: boolean; categories: string[]; documents: Doc[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", audience: "admin", description: "" });
  const [file, setFile] = useState<File | null>(null);

  const load = () => call("/api/pm/documents").then(setData).catch((e) => setError(e.message));
  useEffect(() => { if (reviewer) load(); }, [reviewer]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return data.categories.map((c) => ({ category: c, docs: data.documents.filter((d) => d.category === c) })).filter((g) => g.docs.length);
  }, [data]);

  const setAudience = async (d: Doc, audience: Doc["audience"]) => {
    try { await call(`/api/pm/documents/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) }); load(); }
    catch (e: any) { setError(e.message); }
  };
  const remove = async (d: Doc, confirmed: boolean) => {
    if (!confirmed) return;
    try { await call(`/api/pm/documents/${d.id}`, { method: "DELETE" }); load(); } catch (e: any) { setError(e.message); }
  };
  const uploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Choose a file to upload."); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    Object.entries({ ...form, category: form.category || data?.categories[0] || "" }).forEach(([k, v]) => fd.append(k, v));
    try { await call("/api/pm/documents", { method: "POST", body: fd }); setFile(null); setForm({ title: "", category: "", audience: "admin", description: "" }); load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const tab = tabParam ?? (data?.isAdmin ? "status" : "documents");
  if (loading || !data) return <Shell title="Documents"><div className="p-10 text-slate-400">{error ?? "Loading…"}</div></Shell>;

  return (
    <Shell title={data.isAdmin ? "Product management" : "Documents"}>
      <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="font-serif text-[26px] font-bold text-slate-900">{data.isAdmin ? "Product management" : "Documents"}</h1>
            <p className="text-slate-600 mt-1">{data.isAdmin
              ? "Where the project stands — builds, UAT progress, defects and releases — and the library of contract, requirements, architecture, plans and training documents."
              : "Contract, requirements, design and training documents for HireStream Lite and the mobile app. Documents shared with you by the project admin."}</p>
          </div>
        </div>
        {data.isAdmin && (
          <div className="mt-5 flex gap-1 border-b border-slate-200">
            {([["status", "Status"], ["documents", "Documents"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => navigate(`/product?tab=${k}`)}
                className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? "border-[#14213D] text-slate-900 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
            ))}
          </div>
        )}
        {data.isAdmin && tab === "status" ? <div className="mt-6"><PmStatus onDocs={() => navigate("/product?tab=documents")} /></div> : (<>

        {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}

        {data.isAdmin && (
          <div className="mt-6 grid sm:grid-cols-3 gap-3 text-sm">
            {(Object.keys(AUDIENCE) as Doc["audience"][]).map((a) => {
              const m = AUDIENCE[a];
              return <div key={a} className={`rounded-lg border px-4 py-3 ${m.cls}`}><div className="flex items-center gap-2 font-semibold"><m.Icon className="w-4 h-4" />{m.label}</div><div className="text-xs mt-0.5 opacity-80">{m.hint}</div></div>;
            })}
          </div>
        )}

        {grouped.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No documents have been shared with you yet.</div>
        )}

        <div className="mt-8 space-y-8">
          {grouped.map((g) => (
            <section key={g.category} id={`cat-${g.category.replace(/[^a-z]+/gi, "-").toLowerCase()}`} className="scroll-mt-32">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{g.category}</h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {g.docs.map((d) => {
                  const k = kind(d.mimeType);
                  return (
                    <div key={d.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <k.Icon className="w-5 h-5 text-agentryx-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <a href={`/docs/${d.id}`} className="font-semibold text-slate-900 hover:text-agentryx-700 hover:underline">{d.title}</a>
                          {d.description && <p className="text-sm text-slate-600 mt-0.5">{d.description}</p>}
                          <p className="text-xs text-slate-400 mt-1">{k.label} · {size(d.sizeBytes)} · updated {new Date(d.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {data.isAdmin ? (
                          <>
                            <label className="sr-only" htmlFor={`aud-${d.id}`}>Who can open</label>
                            <select id={`aud-${d.id}`} value={d.audience} onChange={(e) => setAudience(d, e.target.value as Doc["audience"])}
                              className={`text-xs font-medium rounded-md border px-2 py-1.5 ${AUDIENCE[d.audience].cls}`}>
                              {(Object.keys(AUDIENCE) as Doc["audience"][]).map((a) => <option key={a} value={a}>{AUDIENCE[a].label}</option>)}
                            </select>
                            <DeleteButton onConfirm={(ok) => remove(d, ok)} />
                          </>
                        ) : null}
                        <a href={`/docs/${d.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-agentryx-700 border border-agentryx-100 hover:bg-agentryx-50 rounded-md px-3 py-1.5">
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {data.isAdmin && (
          <form onSubmit={uploadDoc} className="mt-10 bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4" /> Add a document</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm"><span className="block text-slate-600 mb-1">File (PDF, Word, PowerPoint, Excel, HTML, Markdown, image, MP4 — up to 20 MB)</span>
                <input id="pm-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
              </label>
              <label className="text-sm"><span className="block text-slate-600 mb-1">Title</span>
                <input id="pm-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to the file name" className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </label>
              <label className="text-sm"><span className="block text-slate-600 mb-1">Category</span>
                <select id="pm-category" value={form.category || data.categories[0]} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-md px-3 py-2">
                  {data.categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-sm"><span className="block text-slate-600 mb-1">Who can open it</span>
                <select id="pm-audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="w-full border border-slate-300 rounded-md px-3 py-2">
                  {(Object.keys(AUDIENCE) as Doc["audience"][]).map((a) => <option key={a} value={a}>{AUDIENCE[a].label} — {AUDIENCE[a].hint}</option>)}
                </select>
              </label>
              <label className="text-sm sm:col-span-2"><span className="block text-slate-600 mb-1">Description (optional)</span>
                <input id="pm-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </label>
            </div>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 bg-agentryx-600 hover:bg-agentryx-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2">
              <Upload className="w-4 h-4" /> {busy ? "Uploading…" : "Upload"}
            </button>
          </form>
        )}
        </>)}
      </div>
    </Shell>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: (ok: boolean) => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button type="button" onClick={() => setArmed(true)} title="Delete document" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button type="button" onClick={() => { onConfirm(true); setArmed(false); }} className="text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1">Delete</button>
      <button type="button" onClick={() => setArmed(false)} className="text-slate-500 px-1">Cancel</button>
    </span>
  );
}
