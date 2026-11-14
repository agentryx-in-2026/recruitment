import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ExternalLink, Download, Maximize2, Minimize2 } from "lucide-react";
import { Shell, Page } from "../components/Shell";

/**
 * Document viewer — opens a library document inside the portal (sidebar, title
 * bar and Ask panel stay). PDFs, web pages and Markdown show in a frame; videos
 * play inline; images show at full width. A #page=N or #t=SECONDS on the link
 * opens at that page or moment (Ask Agentryx sources use this).
 */
type Doc = { id: string; title: string; category: string; description: string | null; originalName: string; mimeType: string; sizeBytes: number; updatedAt: string };

const size = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const kind = (m: string) => m === "application/pdf" ? "PDF" : m.startsWith("video/") ? "Video" : m.startsWith("image/") ? "Image" : m === "text/html" ? "Web page" : m === "text/markdown" ? "Document" : "File";

function Body({ id }: { id: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [all, setAll] = useState<Doc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const hash = typeof window !== "undefined" ? window.location.hash : "";

  useEffect(() => {
    setDoc(null); setErr(null);
    fetch("/api/pm/documents", { credentials: "include" }).then((r) => r.json()).then((j) => {
      const docs: Doc[] = j.documents ?? [];
      setAll(docs);
      const d = docs.find((x) => x.id === id);
      d ? setDoc(d) : setErr("This document is not in the library, or it isn't shared with you.");
    }).catch(() => setErr("Could not load the document."));
  }, [id]);
  useEffect(() => { if (doc) document.title = `${doc.title} · Agentryx Verify`; }, [doc]);

  if (err) return <Page title="Document"><p className="text-slate-600">{err}</p><Link href="/product?tab=documents" className="text-indigo-700 hover:underline">Back to the library</Link></Page>;
  if (!doc) return <Page title="Document"><p className="text-slate-400">Loading…</p></Page>;

  const raw = `/api/pm/documents/${doc.id}/file?raw=1`;
  const sameCat = all.filter((x) => x.category === doc.category && x.id !== doc.id).slice(0, 8);
  const frameH = wide ? "h-[calc(100vh-170px)]" : "h-[calc(100vh-290px)]";

  return (
    <Page
      title={doc.title}
      sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-1"><Link href="/product?tab=documents" className="inline-flex items-center gap-1 text-indigo-700 hover:underline"><ArrowLeft className="w-3.5 h-3.5" /> Library</Link><span className="text-slate-300">·</span><span>{doc.category}</span><span className="text-slate-300">·</span><span>{kind(doc.mimeType)} · {size(doc.sizeBytes)} · updated {new Date(doc.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>{doc.description && <><span className="text-slate-300">·</span><span>{doc.description}</span></>}</span>}
      actions={<>
        {!doc.mimeType.startsWith("video/") && <button onClick={() => setWide(!wide)} className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50">{wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{wide ? "Normal view" : "Taller view"}</button>}
        <a href={`${raw}${hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"><ExternalLink className="w-4 h-4" /> Open in new tab</a>
        <a href={`${raw}&download=1`} className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"><Download className="w-4 h-4" /> Download</a>
      </>}>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {doc.mimeType.startsWith("video/") ? (
          <video key={doc.id} controls preload="metadata" src={`${raw}${hash}`} className="w-full max-h-[calc(100vh-260px)] bg-black" />
        ) : doc.mimeType.startsWith("image/") ? (
          <img src={raw} alt={doc.title} className="w-full h-auto" />
        ) : !["application/pdf", "text/html", "text/markdown", "text/plain"].includes(doc.mimeType) ? (
          <div className="p-10 text-center">
            <p className="text-slate-700">This file can't be shown in the browser.</p>
            <a href={`${raw}&download=1`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#14213D] rounded-md px-4 py-2"><Download className="w-4 h-4" /> Download {doc.originalName}</a>
          </div>
        ) : (
          <iframe key={doc.id + hash} title={doc.title} src={`${raw}${hash}`} className={`w-full ${frameH} min-h-[520px] bg-white`} />
        )}
      </div>
      {sameCat.length > 0 && (
        <section>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">More in {doc.category}</div>
          <div className="flex flex-wrap gap-2">
            {sameCat.map((x) => <Link key={x.id} href={`/docs/${x.id}`} className="text-sm bg-white border border-slate-200 rounded-md px-3 py-1.5 text-slate-700 hover:border-slate-400">{x.title}</Link>)}
          </div>
        </section>
      )}
    </Page>
  );
}

export function DocViewer() {
  const [, p] = useRoute("/docs/:id");
  return <Shell title="Document"><Body id={p!.id} /></Shell>;
}
