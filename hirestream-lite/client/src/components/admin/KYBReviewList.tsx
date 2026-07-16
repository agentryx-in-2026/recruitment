/**
 * v0.4.32 (HPSEDC Items 1 & 3): Shared KYB admin review queue.
 *
 * Renders both the employer queue and the agency queue using the same UI —
 * just different endpoints and field labels. Caller passes the `subject`
 * config (list/detail/verify/doc endpoints + label + extra fields to show).
 *
 * Layout:
 *  - Two sections: "Awaiting review" (filtered by submittedForReviewAt !== null
 *    && !verified) and "Verified". Rejected entries stay in the first
 *    section with a red ribbon so admin can revisit.
 *  - Each row expands inline to show full KYB details + uploaded documents
 *    with per-doc approve/reject + a final "Verify company" / "Reject (with
 *    reason)" pair at the bottom of the panel.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Building, Loader2, CheckCircle, XCircle, ShieldCheck, ShieldAlert,
  FileText, ChevronDown, ChevronUp, AlertTriangle, MapPin, Mail, Phone, IdCard,
} from "lucide-react";

export interface KYBSubject {
  /** "employer" | "agency" — used in toast copy + IDs */
  kind: "employer" | "agency";
  /** human-readable label, e.g. "Company" or "Agency" */
  label: string;
  /** endpoint to list rows */
  listUrl: string;
  /** function that builds the verify URL for a row id */
  verifyUrl: (id: string) => string;
  /** function that builds the doc-list URL for a row id (admin scope) */
  docsListUrl: (id: string) => string;
  /** function that builds the doc-review URL for (rowId, docId) */
  docVerifyUrl: (rowId: string, docId: string) => string;
  /** function that builds the doc-download URL (admin) */
  docDownloadUrl: (rowId: string, docId: string) => string;
  /** primary display field */
  nameField: "companyName" | "agencyName";
  /** optional secondary identifier */
  secondaryLabel?: string;
  secondaryField?: string;
}

interface Row {
  id: string;
  verified: boolean | null;
  submittedForReviewAt: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  [key: string]: any;
}

interface DocRow {
  id: string;
  type: string;
  fileName: string;
  status: string;
  reviewNotes: string | null;
}

export function KYBReviewList({ subject }: { subject: KYBSubject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectionDraft, setRejectionDraft] = useState<Record<string, string>>({});

  const { data: rowsRes, isLoading } = useQuery({
    queryKey: [subject.listUrl],
    queryFn: async () => {
      const r = await fetch(subject.listUrl);
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });
  const rows: Row[] = rowsRes?.data || [];
  const awaiting = rows.filter((r) => !r.verified);
  const verified = rows.filter((r) => r.verified);

  const verifyMutation = useMutation({
    mutationFn: async ({ id, verified: v, rejectionReason }: { id: string; verified: boolean; rejectionReason?: string }) => {
      const r = await fetch(subject.verifyUrl(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: v, rejectionReason }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || err.error?.message || "Failed");
      }
      return r.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [subject.listUrl] });
      toast({
        title: vars.verified ? `${subject.label} approved` : `${subject.label} rejected`,
        description: vars.verified ? "User has been notified." : "Rejection reason sent to user.",
      });
    },
    onError: (e: any) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-8">
      <Section
        title={`Awaiting review`}
        icon={<ShieldAlert className="text-amber-600 mr-2 w-5 h-5" />}
        countTone="amber"
        count={awaiting.length}
        empty="No pending reviews."
      >
        {awaiting.map((row) => (
          <RowCard
            key={row.id}
            row={row}
            subject={subject}
            open={openId === row.id}
            onToggle={() => setOpenId(openId === row.id ? null : row.id)}
            rejectionDraft={rejectionDraft[row.id] ?? ""}
            setRejectionDraft={(v) => setRejectionDraft({ ...rejectionDraft, [row.id]: v })}
            onApprove={() => verifyMutation.mutate({ id: row.id, verified: true })}
            onReject={() => {
              const reason = rejectionDraft[row.id]?.trim();
              if (!reason) {
                toast({ title: "Reason required", description: "Enter why this submission is being rejected.", variant: "destructive" });
                return;
              }
              verifyMutation.mutate({ id: row.id, verified: false, rejectionReason: reason });
            }}
            isMutating={verifyMutation.isPending}
          />
        ))}
      </Section>

      <Section
        title={`Verified ${subject.label.toLowerCase()}s`}
        icon={<ShieldCheck className="text-emerald-600 mr-2 w-5 h-5" />}
        countTone="emerald"
        count={verified.length}
        empty={`No verified ${subject.label.toLowerCase()}s yet.`}
      >
        {verified.map((row) => (
          <div key={row.id} className="flex items-center justify-between p-4 border border-emerald-200 bg-emerald-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 text-white p-2 rounded-lg"><Building className="w-5 h-5" /></div>
              <div>
                <h4 className="font-semibold text-gray-900">{row[subject.nameField]}</h4>
                <p className="text-xs text-gray-500">
                  {subject.secondaryLabel && subject.secondaryField && (
                    <>{subject.secondaryLabel}: <span className="font-mono">{row[subject.secondaryField]}</span>{" • "}</>
                  )}
                  Verified {row.verifiedAt ? new Date(row.verifiedAt).toLocaleDateString("en-IN") : "—"}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={() => verifyMutation.mutate({ id: row.id, verified: false, rejectionReason: "Verification revoked by admin" })}
              disabled={verifyMutation.isPending}>
              <XCircle className="w-4 h-4 mr-1" /> Revoke
            </Button>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, icon, count, countTone, empty, children }: any) {
  const tone = countTone === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
        {icon}
        {title}
        {count > 0 && <Badge className={`ml-2 text-white ${tone}`}>{count}</Badge>}
      </h3>
      {count === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>{empty}</p>
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </div>
  );
}

function RowCard({ row, subject, open, onToggle, rejectionDraft, setRejectionDraft, onApprove, onReject, isMutating }: {
  row: Row; subject: KYBSubject; open: boolean; onToggle: () => void;
  rejectionDraft: string; setRejectionDraft: (v: string) => void;
  onApprove: () => void; onReject: () => void; isMutating: boolean;
}) {
  const wasRejected = !row.verified && !!row.rejectionReason && !row.submittedForReviewAt;
  const isPending = !row.verified && !!row.submittedForReviewAt;
  const isUntouched = !row.verified && !row.submittedForReviewAt && !row.rejectionReason;

  return (
    <div className={`rounded-lg border transition-all ${
      wasRejected ? "border-red-200 bg-red-50/50"
      : isPending ? "border-amber-200 bg-amber-50/50"
      : "border-slate-200 bg-slate-50/40"
    }`}>
      <button onClick={onToggle} className="w-full p-4 flex items-center justify-between text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg text-white flex-shrink-0 ${
            wasRejected ? "bg-red-500"
            : isPending ? "bg-amber-500"
            : "bg-slate-400"
          }`}>
            <Building className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-gray-900">{row[subject.nameField]}</h4>
              {wasRejected && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">Previously rejected</Badge>}
              {isPending && <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Submitted</Badge>}
              {isUntouched && <Badge variant="outline" className="text-[10px]">Not yet submitted</Badge>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {subject.secondaryLabel && subject.secondaryField && (
                <>{subject.secondaryLabel}: <span className="font-mono">{row[subject.secondaryField]}</span></>
              )}
              {row.submittedForReviewAt && <> · Submitted {new Date(row.submittedForReviewAt).toLocaleDateString("en-IN")}</>}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t bg-white p-4 space-y-4">
          <RowDetails row={row} subject={subject} />
          <DocsTable subject={subject} rowId={row.id} />

          {wasRejected && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Previous rejection reason: <span className="font-medium">{row.rejectionReason}</span>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3 pt-3 border-t">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Rejection reason (required for reject)</Label>
              <Textarea value={rejectionDraft} onChange={(e) => setRejectionDraft(e.target.value)}
                placeholder="e.g. PAN card image is illegible; please re-upload."
                rows={2} maxLength={1000} className="text-sm" />
              <p className="text-[10px] text-slate-400 mt-1">User will receive this message in their notification.</p>
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <Button onClick={onApprove} disabled={isMutating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isMutating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Approve {subject.label.toLowerCase()}
              </Button>
              <Button onClick={onReject} disabled={isMutating} variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
                <XCircle className="w-4 h-4 mr-2" /> Reject with reason
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowDetails({ row, subject }: { row: Row; subject: KYBSubject }) {
  // Compose a label/value grid from the KYB fields present on the row.
  const items: { label: string; value: any; icon?: any }[] = [];
  if (subject.kind === "employer") {
    items.push(
      { label: "Industry", value: row.industry },
      { label: "CIN", value: row.cin },
      { label: "GSTIN", value: row.gst },
      { label: "PAN", value: row.pan },
      { label: "Contact email", value: row.contactEmail, icon: Mail },
      { label: "Contact phone", value: row.contactPhone, icon: Phone },
      { label: "Authorised signatory", value: row.authorisedSignatoryName },
      { label: "Designation", value: row.authorisedSignatoryDesignation },
      { label: "Signatory ID", value: row.authorisedSignatoryIdType ? `${row.authorisedSignatoryIdType.toUpperCase()} · ${row.authorisedSignatoryIdNumber || "—"}` : null, icon: IdCard },
    );
  } else {
    items.push(
      { label: "Licence number", value: row.licenseNumber },
      { label: "Licence expiry", value: row.meaLicenseExpiry ? new Date(row.meaLicenseExpiry).toLocaleDateString("en-IN") : null },
      { label: "Contact email", value: row.contactEmail, icon: Mail },
      { label: "Contact phone", value: row.contactPhone, icon: Phone },
      { label: "Authorised signatory", value: row.authorisedSignatoryName },
      { label: "Designation", value: row.authorisedSignatoryDesignation },
      { label: "Specializations", value: Array.isArray(row.specializations) ? row.specializations.join(", ") : null },
    );
  }
  const address = [
    row.registeredAddressLine1, row.registeredAddressLine2,
    row.registeredCity, row.registeredState, row.registeredPinCode,
  ].filter(Boolean).join(", ");
  if (address) items.push({ label: "Registered address", value: address, icon: MapPin });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
      {items.filter((i) => i.value).map((i) => (
        <div key={i.label} className="flex items-start gap-2">
          {i.icon && <i.icon className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />}
          <div>
            <p className="text-slate-500">{i.label}</p>
            <p className="font-medium text-slate-800">{i.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DocsTable({ subject, rowId }: { subject: KYBSubject; rowId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});

  const { data: docsRes, isLoading } = useQuery({
    queryKey: [subject.docsListUrl(rowId)],
    queryFn: async () => {
      const r = await fetch(subject.docsListUrl(rowId));
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
  const docs: DocRow[] = docsRes?.data || [];

  const docMutation = useMutation({
    mutationFn: async ({ docId, status, reviewNotes }: { docId: string; status: string; reviewNotes?: string }) => {
      const r = await fetch(subject.docVerifyUrl(rowId, docId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [subject.docsListUrl(rowId)] });
      toast({ title: "Document updated" });
    },
    onError: () => toast({ title: "Could not update document", variant: "destructive" }),
  });

  if (isLoading) return <div className="text-xs text-slate-400">Loading documents…</div>;
  if (docs.length === 0) {
    return <div className="text-xs text-slate-400 italic">No documents uploaded yet.</div>;
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5" /> Uploaded documents ({docs.length})
      </p>
      <div className="space-y-2">
        {docs.map((d) => {
          const draft = reviewDraft[d.id] ?? d.reviewNotes ?? "";
          return (
            <div key={d.id} className="rounded-md border border-slate-200 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">{d.fileName}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{d.type.replace(/_/g, " ")}</p>
                </div>
                <Badge className={`text-[9px] ${
                  d.status === "approved" ? "bg-emerald-100 text-emerald-700"
                  : d.status === "rejected" ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
                }`}>{d.status}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px]"
                  onClick={() => window.open(subject.docDownloadUrl(rowId, d.id), "_blank")}>
                  View
                </Button>
                <Input value={draft} onChange={(e) => setReviewDraft({ ...reviewDraft, [d.id]: e.target.value })}
                  placeholder="Review note (optional)" className="h-7 text-[10px] flex-1" maxLength={1000} />
                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-emerald-700 hover:bg-emerald-50"
                  onClick={() => docMutation.mutate({ docId: d.id, status: "approved", reviewNotes: draft })}
                  disabled={docMutation.isPending}>
                  Approve
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-red-600 hover:bg-red-50"
                  onClick={() => docMutation.mutate({ docId: d.id, status: "rejected", reviewNotes: draft })}
                  disabled={docMutation.isPending}>
                  Reject
                </Button>
              </div>
              {d.reviewNotes && d.status === "rejected" && (
                <p className="text-[10px] text-red-600 mt-1">Note: {d.reviewNotes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
