import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Eye, EyeOff, ArrowRight, Smartphone, Globe, Archive, Lightbulb } from "lucide-react";
import { Shell, Page, useWorkspace } from "../components/Shell";
import { api } from "../lib/api";

/**
 * Projects (admin) — every project in Verify, in the workspace layout.
 * Shows who sees each project (testers or admins only), its build and backlog,
 * and opens the full project view: sign-off matrix across HTIS / HPSEDC levels,
 * sprints and re-verify badges, the defect log, exports and the feedback inbox.
 */
const NOTE: Record<string, { tag: string; tone: string; tip: string; Icon: any }> = {
  "hirestream-lite": { tag: "Live UAT", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", tip: "The web portal HPSEDC will launch. Testers work it from the Dashboard.", Icon: Globe },
  "hirestream-mobile-v1.0": { tag: "Live UAT", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", tip: "Android app. Install Expo Go and scan the QR code on the project page.", Icon: Smartphone },
  "hirestream-v1.4": { tag: "Archive", tone: "bg-slate-100 text-slate-600 border-slate-200", tip: "Earlier multi-agency build, superseded by HireStream Lite.", Icon: Archive },
  "hirestream-htis-smoke": { tag: "Reference", tone: "bg-sky-50 text-sky-700 border-sky-200", tip: "HTIS generic QA smoke checklist; verdicts from the 22 Apr workbook pre-loaded.", Icon: Archive },
  "hirestream-hp": { tag: "Archive", tone: "bg-slate-100 text-slate-600 border-slate-200", tip: "Single-agency, blue-collar variant. Not in this UAT.", Icon: Archive },
  "hirestream-v1.5-extras": { tag: "Beyond FRS", tone: "bg-indigo-50 text-indigo-700 border-indigo-200", tip: "Enhancements delivered above the contracted scope.", Icon: Lightbulb },
};

function Body() {
  const { data, reload: reloadWs } = useWorkspace();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const load = () => api.listProjects().then(setProjects).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const isAdmin = data!.me.isAdmin;

  const toggle = async (slug: string, next: boolean) => {
    setBusy(slug); setErr(null);
    try { await api.setProjectVisibility(slug, next); await load(); reloadWs(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const visible = (projects ?? []).filter((p) => p.visibleToNonAdmin);
  const hidden = (projects ?? []).filter((p) => !p.visibleToNonAdmin);

  const Row = ({ p }: { p: any }) => {
    const n = NOTE[p.slug] ?? { tag: "Project", tone: "bg-slate-100 text-slate-600 border-slate-200", tip: "", Icon: Globe };
    return (
      <tr className="hover:bg-slate-50 align-top">
        <td className="px-5 py-4">
          <div className="flex items-start gap-3">
            <n.Icon className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <Link href={`/p/${p.slug}`} className="font-semibold text-slate-900 hover:underline">{p.name}</Link>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-2xl">{n.tip || p.description}</div>
            </div>
          </div>
        </td>
        <td className="px-5 py-4"><span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${n.tone}`}>{n.tag}</span></td>
        <td className="px-5 py-4 text-sm text-slate-600 break-words">{p.contractor ?? ""}{p.client ? ` → ${p.client}` : ""}<div className="font-mono text-xs text-slate-500">{p.buildRef ?? ""}</div></td>
        <td className="px-5 py-4 text-sm whitespace-nowrap">{p.needsFix ? <span className="text-rose-700 font-semibold">{p.needsFix} need fixing</span> : <span className="text-slate-500">—</span>}</td>
        <td className="px-5 py-4 whitespace-nowrap">
          {isAdmin ? (
            <button disabled={busy === p.slug} onClick={() => toggle(p.slug, !p.visibleToNonAdmin)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border px-2.5 py-1.5 disabled:opacity-50 ${p.visibleToNonAdmin ? "bg-white text-emerald-700 border-emerald-300" : "bg-slate-50 text-slate-500 border-slate-300"}`}
              title={p.visibleToNonAdmin ? "Testers can see this project — click to hide" : "Admins only — click to show testers"}>
              {p.visibleToNonAdmin ? <><Eye className="w-3.5 h-3.5" /> Testers see it</> : <><EyeOff className="w-3.5 h-3.5" /> Admins only</>}
            </button>
          ) : null}
        </td>
        <td className="px-5 py-4 text-right"><Link href={`/p/${p.slug}`} className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline whitespace-nowrap">Open <ArrowRight className="w-4 h-4" /></Link></td>
      </tr>
    );
  };

  const Table = ({ rows }: { rows: any[] }) => (
    <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table className="w-full table-fixed min-w-[900px]">
        <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <th className="px-5 py-2.5 font-semibold w-[44%] min-w-[340px]">Project</th><th className="px-5 py-2.5 font-semibold">Stage</th><th className="px-5 py-2.5 font-semibold">Vendor / build</th><th className="px-5 py-2.5 font-semibold">Backlog</th><th className="px-5 py-2.5 font-semibold">Who sees it</th><th />
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((p) => <Row key={p.id} p={p} />)}</tbody>
      </table>
    </div>
  );

  return (
    <Page title="Projects" sub="Every project in Verify. Open one for the full sign-off matrix across HTIS and HPSEDC levels, sprints and re-verify badges, the defect log, exports and feedback. Testers only see the projects marked “Testers see it”.">
      {err && <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2.5 text-sm">{err}</div>}
      {projects === null ? <p className="text-slate-400">Loading…</p> : (<>
        <section className="space-y-2.5">
          <div className="flex items-baseline gap-3"><h2 className="font-serif text-xl font-bold text-slate-900">In testing</h2><span className="text-sm text-slate-500">Visible to testers</span></div>
          {visible.length ? <Table rows={visible} /> : <p className="text-sm text-slate-500">No project is visible to testers.</p>}
        </section>
        {isAdmin && hidden.length > 0 && (
          <section className="space-y-2.5">
            <button onClick={() => setShowArchived((v) => !v)} className="flex items-baseline gap-3 text-left">
              <h2 className="font-serif text-xl font-bold text-slate-900"><span className="inline-block w-4 text-slate-400 text-sm">{showArchived ? "▼" : "▶"}</span>Archived</h2>
              <span className="text-sm text-slate-500">{hidden.length} earlier projects · admins only · kept for reference, not part of this UAT</span>
            </button>
            {showArchived && <Table rows={hidden} />}
          </section>
        )}
      </>)}
    </Page>
  );
}

export function Home() {
  return <Shell title="Projects"><Body /></Shell>;
}
