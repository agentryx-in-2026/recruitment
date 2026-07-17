/**
 * Professions & eligibility — UAT-05 item 21's headline requirement.
 *
 * HPSEDC: "The list of mandatory qualifications and documents should be
 * configurable by the administrator, enabling HPSEDC to add, modify, or update
 * profession-specific eligibility criteria WITHOUT requiring changes to the
 * application."
 *
 * Until this screen existed, item 21 was BUILT but not MET — the engine read the
 * table, but changing a row meant asking us to run SQL, which IS "a change to
 * the application" in every sense that matters to the people waiting for it.
 *
 * ── Deliberately not a form builder ────────────────────────────────────────
 * This edits DATA: which qualifications count, which documents are required,
 * which skills are offered, what the candidate is told. It does NOT edit field
 * SHAPES — that would be a form builder, i.e. the rule engine this design
 * exists to avoid. A nurse's "Council registration number" field is code
 * (register/profession-blocks.tsx); whether a Council REGISTRATION CERTIFICATE
 * is a required document is HPSEDC's call, and it is here.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Plus, X, Loader2, Save, Users, AlertTriangle, Info, EyeOff, Eye, Lock,
} from "lucide-react";

interface Prof {
  professionKey: string; label: string; labelHi?: string | null; jobCategoryKey?: string | null;
  displayOrder?: number | null; hasAddonBlock?: boolean | null;
  qualifications?: string[] | null; skillsEnabled?: boolean | null; skillsOptions?: string[] | null;
  requiredDocs?: string[] | null; optionalDocs?: string[] | null;
  candidateNote?: string | null; candidateNoteHi?: string | null;
  active: boolean; candidateCount?: number;
}
interface DocType { key: string; label: string; stage: string }

/** Editable string list — qualifications and skills are free lists HPSEDC own. */
function ListEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v && !value.includes(v)) onChange([...value, v]); setDraft(""); };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {v}
            <button onClick={() => onChange(value.filter((x) => x !== v))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-slate-400">None</span>}
      </div>
      <div className="flex gap-2">
        <Input className="h-9 text-sm" value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={add} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/** Documents are NOT free text — they must come from the enforced vocabulary. */
function DocPicker({ all, value, onChange, exclude }: { all: DocType[]; value: string[]; onChange: (v: string[]) => void; exclude: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.filter((d) => d.key !== "certificate").map((d) => {
        const on = value.includes(d.key);
        const blocked = !on && exclude.includes(d.key);
        return (
          <button key={d.key} type="button" disabled={blocked}
            onClick={() => onChange(on ? value.filter((x) => x !== d.key) : [...value, d.key])}
            title={blocked ? "Already in the other list" : d.stage === "deploy" ? "Only asked after selection" : undefined}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              on ? "border-blue-600 bg-blue-50 text-blue-800"
                : blocked ? "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
            {d.label}
            {d.stage === "deploy" && <span className="ml-1 text-[10px] text-amber-600">·after selection</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ProfessionsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Prof | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/v1/admin/professions"] });
  const professions: Prof[] = data?.data?.professions || [];
  const docTypes: DocType[] = data?.data?.docTypes || [];

  const save = useMutation({
    mutationFn: async (p: Prof) => {
      const isNew = creating;
      const res = await fetch(isNew ? "/api/v1/admin/professions" : `/api/v1/admin/professions/${p.professionKey}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(p),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Save failed");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/professions"] });
      // The candidate-facing catalogue is the same data — it must not keep
      // serving the old policy after HPSEDC change it.
      qc.invalidateQueries({ queryKey: ["/api/v1/professions"] });
      setEditing(null); setDraft(null); setCreating(false);
      toast({ title: "Saved", description: "Candidates see this immediately." });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deactivate = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`/api/v1/admin/professions/${key}`, { method: "DELETE", credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Failed");
      return body;
    },
    onSuccess: (b: any) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/professions"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/professions"] });
      toast({ title: "Hidden from candidates", description: `${b.data.candidateCount} candidate(s) keep it on their profile.` });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const startEdit = (p: Prof) => { setCreating(false); setEditing(p.professionKey); setDraft({ ...p }); };
  const startCreate = () => {
    setCreating(true); setEditing("__new__");
    setDraft({ professionKey: "", label: "", labelHi: "", jobCategoryKey: "other", displayOrder: 500,
      qualifications: [], skillsEnabled: true, skillsOptions: [], requiredDocs: [], optionalDocs: [],
      candidateNote: "", candidateNoteHi: "", active: true });
  };

  if (isLoading) return <div className="flex items-center gap-2 text-slate-400 py-10"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600" /> Professions & eligibility</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            What each trade must hold. Changes are live for candidates immediately — no release needed.
          </p>
        </div>
        <Button onClick={startCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Add a profession</Button>
      </div>

      <div className="mb-5 rounded-xl bg-blue-50 border border-blue-100 p-3.5 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900">
          Required documents are asked for <strong>only once a candidate is shortlisted</strong> for a job in this trade —
          never at registration. Documents marked <em>after selection</em> (PCC, medical) are asked for later still, once
          the candidate has the job.
        </p>
      </div>

      {creating && draft && (
        <ProfEditor draft={draft} setDraft={setDraft} docTypes={docTypes} isNew
          onCancel={() => { setCreating(false); setEditing(null); setDraft(null); }}
          onSave={() => save.mutate(draft)} saving={save.isPending} />
      )}

      <div className="space-y-2.5">
        {professions.map((p) => (
          <div key={p.professionKey} className={`rounded-xl border bg-white ${p.active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
            <div className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{p.label}</span>
                  <code className="text-[11px] text-slate-400">{p.professionKey}</code>
                  {p.hasAddonBlock && <Badge variant="secondary" className="text-[10px]">extra questions</Badge>}
                  {!p.active && <Badge variant="outline" className="text-[10px] text-slate-500">hidden</Badge>}
                  {(p.candidateCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Users className="w-3 h-3" /> {p.candidateCount}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {(p.requiredDocs?.length ?? 0) > 0 ? `Needs: ${p.requiredDocs!.join(", ")}` : "No mandatory documents"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => startEdit(p)}>Edit</Button>
                {p.active ? (
                  <Button size="sm" variant="ghost" className="text-slate-400 hover:text-amber-600"
                    title="Hide from candidates"
                    onClick={() => { if (window.confirm(`Hide "${p.label}" from the list candidates choose from?\n\nCandidates who already picked it keep it — nothing is deleted.`)) deactivate.mutate(p.professionKey); }}>
                    <EyeOff className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-slate-400 hover:text-emerald-600" title="Show to candidates"
                    onClick={() => save.mutate({ ...p, active: true })}>
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            {editing === p.professionKey && draft && (
              <div className="border-t border-slate-200 p-4 bg-slate-50/60">
                <ProfEditor draft={draft} setDraft={setDraft} docTypes={docTypes}
                  onCancel={() => { setEditing(null); setDraft(null); }}
                  onSave={() => save.mutate(draft)} saving={save.isPending} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfEditor({ draft, setDraft, docTypes, onCancel, onSave, saving, isNew }: any) {
  const set = (p: Partial<Prof>) => setDraft({ ...draft, ...p });
  return (
    <div className={isNew ? "rounded-xl border-2 border-blue-300 bg-blue-50/40 p-4 mb-4" : ""}>
      {isNew && <h3 className="font-bold text-slate-900 mb-3">New profession</h3>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isNew && (
          <div>
            <Label className="text-xs font-semibold text-slate-600">Key (permanent)</Label>
            <Input className="h-9 mt-1 font-mono text-sm" placeholder="scaffolder" value={draft.professionKey}
              onChange={(e) => set({ professionKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            <p className="text-[11px] text-slate-400 mt-1">Lowercase, no spaces. Cannot be changed later — candidates' saved trades point at it.</p>
          </div>
        )}
        <div>
          <Label className="text-xs font-semibold text-slate-600">Name (English)</Label>
          <Input className="h-9 mt-1" value={draft.label || ""} onChange={(e) => set({ label: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600">Name (Hindi)</Label>
          <Input className="h-9 mt-1" value={draft.labelHi || ""} onChange={(e) => set({ labelHi: e.target.value })} />
          <p className="text-[11px] text-slate-400 mt-1">Shown to candidates using the portal in Hindi.</p>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600">Job category</Label>
          <Input className="h-9 mt-1 font-mono text-sm" value={draft.jobCategoryKey || ""} onChange={(e) => set({ jobCategoryKey: e.target.value })} />
          {/* This is the load-bearing field most likely to be set wrong: it is
              what stops a mason vacancy asking a nurse-and-mason candidate for a
              Nursing Council registration. */}
          <p className="text-[11px] text-slate-400 mt-1">Which job category this trade answers. Only jobs in this category ask for the documents below.</p>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600">Order in the list</Label>
          <Input className="h-9 mt-1" type="number" value={draft.displayOrder ?? 500} onChange={(e) => set({ displayOrder: Number(e.target.value) })} />
        </div>

        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold text-slate-600">Accepted qualifications <span className="font-normal text-slate-400">— any ONE of these satisfies the trade</span></Label>
          <div className="mt-1.5"><ListEditor value={draft.qualifications || []} onChange={(v) => set({ qualifications: v })} placeholder="e.g. B.Sc. Nursing" /></div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Checkbox checked={draft.skillsEnabled !== false} onCheckedChange={(v) => set({ skillsEnabled: !!v })} />
            <Label className="text-xs font-semibold text-slate-600">Ask "what specifically can you do?"</Label>
          </div>
          {draft.skillsEnabled !== false && (
            <ListEditor value={draft.skillsOptions || []} onChange={(v) => set({ skillsOptions: v })} placeholder="e.g. ICU" />
          )}
        </div>

        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold text-slate-600">Required documents <span className="font-normal text-slate-400">— asked once shortlisted</span></Label>
          <div className="mt-1.5">
            <DocPicker all={docTypes} value={draft.requiredDocs || []} onChange={(v: string[]) => set({ requiredDocs: v })} exclude={draft.optionalDocs || []} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold text-slate-600">Optional documents</Label>
          <div className="mt-1.5">
            <DocPicker all={docTypes} value={draft.optionalDocs || []} onChange={(v: string[]) => set({ optionalDocs: v })} exclude={draft.requiredDocs || []} />
          </div>
        </div>

        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold text-slate-600">What the candidate is told (English)</Label>
          <Textarea className="mt-1 text-sm" rows={2} value={draft.candidateNote || ""} onChange={(e) => set({ candidateNote: e.target.value })} />
          {/* This note is the single highest-leverage field on the screen. */}
          <p className="text-[11px] text-slate-400 mt-1">
            Shown the moment they pick this trade — before they apply. A candidate who cannot meet it stops here,
            instead of being shortlisted and rejected by hand later.
          </p>
        </div>
        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold text-slate-600">What the candidate is told (Hindi)</Label>
          <Textarea className="mt-1 text-sm" rows={2} value={draft.candidateNoteHi || ""} onChange={(e) => set({ candidateNoteHi: e.target.value })} />
        </div>

        {draft.hasAddonBlock && (
          <div className="lg:col-span-2 rounded-lg bg-slate-100 border border-slate-200 p-3 flex items-start gap-2">
            <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-600">
              This trade also asks its own extra questions (e.g. a licence number, a registration number).
              Those questions are part of the portal itself and cannot be changed here — contact the development team.
              Everything else on this screen is yours.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={onSave} disabled={saving || !draft.label?.trim() || (isNew && !draft.professionKey?.trim())} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {(draft.candidateCount ?? 0) > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> {draft.candidateCount} candidate(s) already hold this trade
          </span>
        )}
      </div>
    </div>
  );
}
