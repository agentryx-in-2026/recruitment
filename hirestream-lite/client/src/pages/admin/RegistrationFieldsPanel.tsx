/**
 * Registration form — field configuration.
 *
 * "Can we have an input configuration panel for the application, per page, where
 *  we can enable or disable fields — as they keep changing their mind?"
 *
 * Same contract as the professions panel: HPSEDC own the policy, we own the
 * shape. Turning a field off here hides it AND stops it being required, live,
 * with no release.
 *
 * ── Why some rows are locked ───────────────────────────────────────────────
 * Full name, date of birth, gender, mobile, email and the permanent address are
 * not on this screen at all — a portal that cannot identify or contact an
 * applicant does not work, and a config panel that lets an admin break the
 * product is a worse product. A few rows that ARE shown carry a padlock for the
 * same reason; the server enforces it too, so a hand-crafted request cannot get
 * round the UI.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, SlidersHorizontal, Lock, Info, Eye, EyeOff, Asterisk } from "lucide-react";

interface FieldRow {
  fieldKey: string; page: number; sectionKey: string;
  labelEn: string; labelHi?: string | null; description?: string | null;
  enabled: boolean; required: boolean;
  lockedEnabled: boolean; lockedRequired: boolean; displayOrder: number;
}

const PAGE_NAMES: Record<number, string> = { 1: "Page 1 · About you", 2: "Page 2 · Your skills", 3: "Page 3 · Qualifications", 4: "Page 4 · Review" };
const SECTION_NAMES: Record<string, string> = {
  identity: "Identity documents", personal: "Personal details",
  contact: "Contact", address: "Address", education: "Education",
};

export default function RegistrationFieldsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/v1/admin/registration-fields"] });
  const fields: FieldRow[] = data?.data?.fields || [];

  const update = useMutation({
    mutationFn: async ({ key, patch }: { key: string; patch: Partial<FieldRow> }) => {
      const res = await fetch(`/api/v1/admin/registration-fields/${key}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Could not save");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/admin/registration-fields"] });
      // The candidate-facing form reads the same config — it must not keep
      // serving the old shape after HPSEDC change it.
      qc.invalidateQueries({ queryKey: ["/api/v1/registration-fields"] });
      setSaving(null);
      toast({ title: "Saved", description: "Candidates see this immediately." });
    },
    onError: (e: any) => { setSaving(null); toast({ title: e.message, variant: "destructive" }); },
  });

  const set = (row: FieldRow, patch: Partial<FieldRow>) => {
    setSaving(row.fieldKey);
    update.mutate({ key: row.fieldKey, patch });
  };

  if (isLoading) return <div className="flex items-center gap-2 text-slate-400 py-10"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>;

  const pages = [...new Set(fields.map((f) => f.page))].sort();

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-blue-600" /> Registration form fields
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Choose what the application form asks for. Changes are live for candidates immediately — no release needed.
        </p>
      </div>

      <div className="mb-5 rounded-xl bg-blue-50 border border-blue-100 p-3.5 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900">
          <strong>Show</strong> puts the field on the form. <strong>Must fill</strong> stops the candidate moving to
          the next page without it. A field that is hidden can never be required.
          Name, date of birth, gender, mobile, email and the permanent address are always asked — the portal cannot
          match or contact a candidate without them, so they are not listed here.
        </p>
      </div>

      {pages.map((page) => {
        const inPage = fields.filter((f) => f.page === page);
        const sections = [...new Set(inPage.map((f) => f.sectionKey))];
        return (
          <div key={page} className="mb-7">
            <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">{PAGE_NAMES[page] || `Page ${page}`}</h3>
            {sections.map((sec) => (
              <div key={sec} className="mb-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="text-[13px] font-bold text-slate-700">{SECTION_NAMES[sec] || sec}</p>
                </div>
                {inPage.filter((f) => f.sectionKey === sec).map((f) => (
                  <div key={f.fieldKey} className="flex items-start gap-4 px-4 py-3 border-b border-slate-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-slate-900 flex items-center gap-1.5">
                        {f.labelEn}
                        {f.lockedEnabled && <Lock className="w-3.5 h-3.5 text-slate-400" aria-label="Always asked" />}
                      </p>
                      {f.description && <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{f.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" disabled={f.lockedEnabled || saving === f.fieldKey}
                        onClick={() => set(f, { enabled: !f.enabled })}
                        title={f.lockedEnabled ? "The portal depends on this field" : f.enabled ? "Hide from the form" : "Show on the form"}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold transition-colors ${
                          f.enabled ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500"
                        } ${f.lockedEnabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"}`}>
                        {f.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {f.enabled ? "Shown" : "Hidden"}
                      </button>
                      <button type="button" disabled={!f.enabled || f.lockedRequired || saving === f.fieldKey}
                        onClick={() => set(f, { required: !f.required })}
                        title={!f.enabled ? "Hidden fields cannot be required" : f.required ? "Make optional" : "Make compulsory"}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold transition-colors ${
                          f.required ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-slate-100 text-slate-500"
                        } ${(!f.enabled || f.lockedRequired) ? "opacity-50 cursor-not-allowed" : "hover:brightness-95"}`}>
                        <Asterisk className="w-3.5 h-3.5" />
                        {f.required ? "Must fill" : "Optional"}
                      </button>
                      {saving === f.fieldKey && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
