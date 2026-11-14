import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Shell } from "@/components/Shell";
import { FeedbackDialog } from "@/components/FeedbackDialog";

const TYPE_LABEL: Record<string, string> = {
  new_feature: "New feature", enhancement: "Enhancement", bug: "Bug",
  ux: "UX", similar_sw: "Similar to…", other: "Other",
};
const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted", triaged: "Triaged", planned: "Planned",
  in_progress: "In progress", shipped: "Shipped", declined: "Declined", duplicate: "Duplicate",
};
const STATUS_TONE: Record<string, string> = {
  submitted:   "bg-amber-50 text-amber-800 border-amber-200",
  triaged:     "bg-sky-50 text-sky-800 border-sky-200",
  planned:     "bg-indigo-50 text-indigo-800 border-indigo-200",
  in_progress: "bg-blue-50 text-blue-800 border-blue-200",
  shipped:     "bg-emerald-50 text-emerald-800 border-emerald-200",
  declined:    "bg-slate-100 text-slate-600 border-slate-200",
  duplicate:   "bg-slate-100 text-slate-500 border-slate-200",
};

const TRIAGE_ROLES = new Set(["admin", "delivery", "agentryx"]);

export function FeedbackInbox() {
  const { slug } = useParams<{ slug: string }>();
  const { reviewer: me, loading } = useRequireAuth();
  const [project, setProject] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (me) api.getProject(slug).then((r: any) => setProject(r.project)); }, [slug, me]);
  const canTriage = me && TRIAGE_ROLES.has(me.role);

  const refresh = () => {
    if (!project) return;
    api.listFeedback({ projectId: project.id }).then(setItems).catch(() => setItems([]));
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [project?.id]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (s && !(`${i.referenceCode} ${i.title} ${i.description}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [items, statusFilter, typeFilter, search]);

  const byStatus = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const i of items) agg[i.status] = (agg[i.status] ?? 0) + 1;
    return agg;
  }, [items]);

  if (loading || !me || !project) return <Shell title="Feedback inbox"><div className="p-10 text-slate-400">Loading…</div></Shell>;

  return (
    <Shell title="Feedback inbox">
      <div className="w-full max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href="/projects" className="hover:underline hover:text-agentryx-600">Projects</Link>
            <span>›</span>
            <Link href={`/p/${slug}`} className="hover:underline hover:text-agentryx-600">{project.name}</Link>
            <span>›</span>
            <span className="text-slate-900 font-semibold">Ideas &amp; Feedback</span>
          </div>
          <button onClick={() => setDialogOpen(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 shadow">
            💡 Suggest an idea
          </button>
        </div>

        <div className="mt-4 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl p-5 shadow">
          <h1 className="text-xl font-bold flex items-center gap-2">💡 Ideas &amp; Feedback inbox</h1>
          <p className="text-xs text-white/90 mt-1">
            {items.length} ideas on this project · you're {canTriage ? "a triager" : "a submitter"}.
            {!canTriage && " You see only your own submissions; the delivery team sees the full inbox."}
          </p>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All statuses ({items.length})</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v} ({byStatus[k] ?? 0})</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-slate-200 px-2 bg-white">
            <option value="all">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref code, title, or body…"
            className="flex-1 min-w-[200px] h-9 text-xs rounded-md border border-slate-200 px-3" />
          <div className="text-xs text-slate-500 tabular-nums">{filtered.length} of {items.length}</div>
        </div>

        {/* List */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {items.length === 0 ? "No ideas yet. Click 'Suggest an idea' to add the first one." : "No ideas match the current filters."}
            </div>
          ) : filtered.map((i) => (
            <FeedbackRow key={i.id} item={i} expanded={expanded === i.id}
              onToggle={() => setExpanded(expanded === i.id ? null : i.id)}
              canTriage={!!canTriage}
              refresh={refresh} />
          ))}
        </div>
      </div>

      <FeedbackDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projectId={project.id}
        onSubmitted={() => refresh()}
      />
    </Shell>
  );
}

function FeedbackRow({ item, expanded, onToggle, canTriage, refresh }: {
  item: any; expanded: boolean; onToggle: () => void; canTriage: boolean; refresh: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (expanded && !detail) api.getFeedback(item.id).then(setDetail);
  }, [expanded, item.id, detail]);

  const updateStatus = async (status: string) => {
    setBusy(true);
    try { await api.updateFeedback(item.id, { status }); refresh(); setDetail(await api.getFeedback(item.id)); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setBusy(true);
    try {
      await api.postFeedbackComment(item.id, newComment.trim());
      setNewComment("");
      setDetail(await api.getFeedback(item.id));
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <div className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded whitespace-nowrap">
          {item.referenceCode}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{item.title}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_TONE[item.status] ?? ""}`}>
              {STATUS_LABEL[item.status]}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
              {TYPE_LABEL[item.type]}
            </span>
            {item.attachmentCount > 0 && (
              <span className="text-[10px] text-slate-400">📎 {item.attachmentCount}</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {item.submitter?.name ?? "—"} · {new Date(item.createdAt).toLocaleDateString()}
            {item.area && <> · area: {item.area}</>}
            {item.linkedToItemRef && <> · linked to <span className="font-mono">{item.linkedToItemRef}</span></>}
          </div>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && detail && (
        <div className="mt-3 pl-6 border-l-2 border-slate-100 space-y-3">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
          {detail.similarTo && <p className="text-xs text-slate-500"><strong>Similar to:</strong> {detail.similarTo}</p>}
          {detail.attachments?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {detail.attachments.map((a: any) => (
                <a key={a.id} href={`/api/projects/attachments/${a.id}`} target="_blank" rel="noreferrer"
                  className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded hover:bg-slate-200">
                  📎 {a.originalName}
                </a>
              ))}
            </div>
          )}

          {canTriage && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Admin / triage</div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] text-slate-500">Status</label>
                <select value={detail.status} onChange={(e) => updateStatus(e.target.value)}
                  disabled={busy}
                  className="h-8 text-xs rounded-md border border-slate-200 px-2 bg-white">
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input defaultValue={detail.linkedToItemRef ?? ""} placeholder="Link to item ref (e.g. C1.42)"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (detail.linkedToItemRef ?? "")) {
                      setBusy(true);
                      api.updateFeedback(item.id, { linkedToItemRef: v || null })
                        .then(() => api.getFeedback(item.id).then(setDetail))
                        .finally(() => setBusy(false));
                    }
                  }}
                  className="h-8 text-xs rounded-md border border-slate-200 px-2 bg-white w-[180px]" />
              </div>
            </div>
          )}

          {/* Comment thread */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Comments ({detail.comments?.length ?? 0})</div>
            <div className="space-y-2">
              {detail.comments?.map((c: any) => (
                <div key={c.id} className="bg-white border border-slate-100 rounded p-2 text-xs">
                  <div className="text-[10px] text-slate-500 mb-0.5">{c.reviewer?.name ?? "—"} · {new Date(c.createdAt).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap text-slate-700">{c.body}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 h-8 text-xs rounded-md border border-slate-200 px-2" />
              <button onClick={addComment} disabled={busy || !newComment.trim()}
                className="text-xs font-semibold px-3 rounded bg-agentryx-600 text-white hover:bg-agentryx-700 disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
