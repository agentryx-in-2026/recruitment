import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Film, FileText, ExternalLink, PlayCircle } from "lucide-react";
import { docHref } from "../lib/docs";
import { Shell } from "../components/Shell";

/** Guides & videos — the training material, with every video chapter one click away. */
type Doc = { id: string; title: string; category: string; description: string | null; mimeType: string; sizeBytes: number };

function Body() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [videos, setVideos] = useState<{ title: string; chapters: { heading: string; url: string | null }[] }[]>([]);
  useEffect(() => {
    fetch("/api/pm/documents", { credentials: "include" }).then((r) => r.json()).then((j) => setDocs(j.documents ?? [])).catch(() => {});
    fetch("/api/testing/videos", { credentials: "include" }).then((r) => r.json()).then(setVideos).catch(() => {});
  }, []);
  const guides = docs.filter((d) => d.category === "Training material" && d.mimeType === "application/pdf");
  const other = docs.filter((d) => d.category !== "Training material");

  return (
    <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6 space-y-10">
      <div>
        <h1 className="font-serif text-[26px] font-bold text-slate-900">Guides & videos</h1>
        <p className="text-slate-600 mt-2">Everything here is also searchable from Ask Agentryx.</p>
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> User guides</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {guides.map((g) => (
            <a key={g.id} href={`/docs/${g.id}`} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-400">
              <div className="font-semibold text-slate-900">{g.title}</div>
              {g.description && <p className="text-sm text-slate-600 mt-1">{g.description}</p>}
              <div className="text-xs text-indigo-700 mt-3 inline-flex items-center gap-1">Open PDF <ExternalLink className="w-3 h-3" /></div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2"><Film className="w-4 h-4" /> Walkthrough videos — jump to a chapter</h2>
        <div className="grid lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <div key={v.title} className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900">{v.title.replace("Walkthrough video — ", "")}</div>
              <ol className="divide-y divide-slate-100">
                {v.chapters.map((c) => (
                  <li key={c.heading}>
                    {c.url
                      ? <a href={docHref(c.url)} className="flex items-start gap-2 px-5 py-2 text-sm text-slate-700 hover:bg-slate-50"><PlayCircle className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />{c.heading.replace(/^Chapter \d+: /, "")}</a>
                      : <span className="block px-5 py-2 text-sm text-slate-500">{c.heading}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {other.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Reference documents</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {other.map((d) => (
              <a key={d.id} href={`/docs/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <span><span className="block text-sm font-medium text-slate-900">{d.title}</span><span className="block text-xs text-slate-500">{d.category}</span></span>
                <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
              </a>
            ))}
          </div>
          <Link href="/product" className="inline-block mt-2 text-sm text-indigo-700 hover:underline">All documents →</Link>
        </section>
      )}
    </div>
  );
}

export function Resources() {
  return <Shell title="Guides & videos"><Body /></Shell>;
}
