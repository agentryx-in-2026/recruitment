/**
 * Pages 5 and 6 — the post-selection half of the application.
 *
 * ── Why these appear late, and only for some people ────────────────────────
 * Pages 1–4 are what HPSEDC need to MATCH a candidate to a vacancy, and every
 * applicant fills them. Pages 5 and 6 are what they need to DEPLOY someone, and
 * only a selected candidate ever sees them. That is the 20,000:500 rule the
 * whole portal is built around: do not ask twenty thousand people for a police
 * clearance and a medical certificate — perishable documents, each costing
 * money and a day's travel — when five hundred will need them.
 *
 * So the stepper genuinely grows. A candidate who applies sees four pages; the
 * same candidate, once selected, signs in and finds six, with the last two
 * carrying exactly what this job in this country requires of this trade.
 *
 * ── Page 5 is driven by the obligation engine, not a fixed list ────────────
 * A nurse is asked for her Council registration, an electrician bound for Saudi
 * for a trade test, a cook for neither. The list comes from
 * /candidates/documents/obligations — the same source the staff screens read,
 * so the candidate and HPSEDC are never looking at different requirements.
 */
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "./RegisterShell";
import { Field, FormGrid, inputCls } from "./Field";
import { FileText, ShieldCheck, CheckCircle2, Circle, Upload, Loader2, Clock } from "lucide-react";

const Loader2Static = () => <Clock className="w-4 h-4 text-amber-600 shrink-0" />;

/* ── Page 5: documents ──────────────────────────────────────────────────── */

export function DocumentsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string | null>(null);

  const { data: oblRes } = useQuery<any>({ queryKey: ["/api/v1/candidates/documents/obligations"] });
  const obligations: any[] = oblRes?.data?.obligations || [];

  const upload = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/v1/candidates/documents", { method: "POST", body: fd, credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || t("reg.p5.uploadFailed"));
      return body;
    },
    onSuccess: () => {
      toast({ title: t("reg.p5.uploaded") });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/documents/obligations"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/documents"] });
    },
    onError: (e: any) => toast({ title: t("reg.p5.uploadFailed"), description: e.message, variant: "destructive" }),
  });

  if (obligations.length === 0) {
    return (
      <Section n={1} icon={FileText} title={t("reg.p5.title")} hint={t("reg.p5.none")}>
        <p className="text-sm text-slate-500 py-2">{t("reg.p5.noneBody")}</p>
      </Section>
    );
  }

  return (
    <>
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && pendingType) upload.mutate({ file: f, type: pendingType });
          e.target.value = "";
        }} />
      {obligations.map((ob: any, i: number) => (
        <Section key={ob.applicationId} n={i + 1} icon={FileText}
          title={`${ob.jobTitle}${ob.country ? ` — ${ob.country}` : ""}`}
          hint={t("reg.p5.hint")}>
          <div className="space-y-2 pb-3">
            {ob.required.map((d: any) => {
              const busy = upload.isPending && pendingType === d.key;
              return (
              <div key={d.key}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  d.verified ? "border-emerald-200 bg-emerald-50/50"
                    : d.have ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                {d.verified
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  : d.have ? <Loader2Static /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-800">{d.label}</span>
                  {/* Every non-accepted row must say what to do next, not just
                      sit on a passive status word. "Checking" alone left the
                      candidate with no action and no idea where to upload. */}
                  {d.verified && <span className="block text-[11px] text-emerald-700 font-medium">{t("reg.p5.acceptedNote")}</span>}
                  {d.have && !d.verified && <span className="block text-[11px] text-amber-700">{t("reg.p5.checkingNote")}</span>}
                  {!d.have && <span className="block text-[11px] text-slate-500">{t("reg.p5.neededNote")}</span>}
                </div>
                {/* Every row is actionable. Missing -> Upload. Uploaded, not
                    yet checked -> Replace. ACCEPTED -> still replaceable, but
                    behind a confirm, because replacing it sends it back for
                    re-checking and releases anything locked to it (a visa is
                    issued against this document). Locking it away entirely was
                    a dead end: getting a new passport is exactly why a selected
                    candidate needs to replace an accepted one. */}
                <Button size="sm" variant={d.have ? "outline" : "default"} className="h-9 shrink-0"
                  disabled={upload.isPending}
                  onClick={() => {
                    if (d.verified && !window.confirm(t("reg.p5.replaceAcceptedConfirm", { label: d.label }))) return;
                    setPendingType(d.key); fileRef.current?.click();
                  }}>
                  {busy
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><Upload className="w-3.5 h-3.5 mr-1" /> {d.have ? t("reg.p5.replace") : t("reg.p5.upload")}</>}
                </Button>
              </div>
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

/* ── Page 6: pre-departure compliance ───────────────────────────────────── */

/**
 * What the candidate may REPORT, versus what HPSEDC CONFIRM.
 *
 * A candidate saying "my medical is fit" is not a medical clearance, and PDO
 * attendance is recorded by whoever ran the session. Those are staff findings;
 * offering them here would be inviting an answer the server rejects. The
 * candidate reports progress — "booked", "submitted" — and sees the confirmed
 * value read-only once staff record it.
 */
export function CompliancePage({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({
    pccStatus: profile?.pccStatus ?? "",
    medicalStatus: profile?.medicalStatus ?? "",
    pbbyInsuranceStatus: profile?.pbbyInsuranceStatus ?? "",
    pbbyPolicyNumber: profile?.pbbyPolicyNumber ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {};
      // Only send what a candidate is allowed to report; the server refuses the
      // rest, and a rejected save on a field they never touched would read as
      // the page being broken.
      for (const k of ["pccStatus", "medicalStatus", "pbbyInsuranceStatus", "pbbyPolicyNumber"]) {
        if (form[k] === "" || form[k] == null) continue;
        if (k !== "pbbyPolicyNumber" && !["pending", "submitted"].includes(form[k])) continue;
        body[k] = form[k];
      }
      const res = await fetch("/api/v1/me/compliance", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || t("reg.saveFailed"));
      return j;
    },
    onSuccess: () => {
      toast({ title: t("reg.p6.saved") });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
    },
    onError: (e: any) => toast({ title: t("reg.saveFailed"), description: e.message, variant: "destructive" }),
  });

  const confirmed = (v: string, staffValues: string[]) => staffValues.includes(v);

  const ReadOnly = ({ label, value }: { label: string; value: string }) => (
    <Field label={label} span={4}>
      <div className="h-12 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span className="text-[15px] font-semibold capitalize">{value.replace("_", " ")}</span>
        <span className="text-xs text-slate-500">· {t("reg.p6.byHpsedc")}</span>
      </div>
    </Field>
  );

  return (
    <Section n={1} icon={ShieldCheck} title={t("reg.p6.title")} hint={t("reg.p6.hint")}>
      <FormGrid>
        {confirmed(form.pccStatus, ["not_required"])
          ? <ReadOnly label={t("reg.p6.pcc")} value={form.pccStatus} />
          : (
            <Field label={t("reg.p6.pcc")} span={4} hint={t("reg.p6.pccHint")}>
              <Select value={form.pccStatus} onValueChange={(v) => setForm({ ...form, pccStatus: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("reg.p6.applied")}</SelectItem>
                  <SelectItem value="submitted">{t("reg.p6.submitted")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

        {confirmed(form.medicalStatus, ["fit", "unfit", "not_required"])
          ? <ReadOnly label={t("reg.p6.medical")} value={form.medicalStatus} />
          : (
            <Field label={t("reg.p6.medical")} span={4} hint={t("reg.p6.medicalHint")}>
              <Select value={form.medicalStatus} onValueChange={(v) => setForm({ ...form, medicalStatus: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("reg.p6.booked")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

        {confirmed(form.pbbyInsuranceStatus, ["enrolled", "not_required"])
          ? <ReadOnly label={t("reg.p6.pbby")} value={form.pbbyInsuranceStatus} />
          : (
            <Field label={t("reg.p6.pbby")} span={4} hint={t("reg.p6.pbbyHint")}>
              <Select value={form.pbbyInsuranceStatus} onValueChange={(v) => setForm({ ...form, pbbyInsuranceStatus: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("reg.p6.applied")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

        <Field label={t("reg.p6.policyNo")} span={4}>
          <Input className={inputCls} maxLength={60} value={form.pbbyPolicyNumber}
            onChange={(e) => setForm({ ...form, pbbyPolicyNumber: e.target.value })} />
        </Field>

        <Field label={t("reg.p6.pdo")} span={4}>
          <div className="h-12 flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
            {profile?.pdoCompleted
              ? <span className="font-semibold text-emerald-700">{t("reg.p6.pdoDone")}</span>
              : t("reg.p6.pdoPending")}
          </div>
        </Field>
      </FormGrid>

      <div className="pb-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="h-11">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t("reg.p6.save")}
        </Button>
      </div>
    </Section>
  );
}
