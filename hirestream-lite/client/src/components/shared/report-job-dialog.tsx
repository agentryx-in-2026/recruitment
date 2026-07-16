import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Flag, Loader2, ShieldAlert } from "lucide-react";

// Fraud-report categories chosen from what MEA + Bayt + GulfTalent actually see
// on overseas-placement portals. These end up in grievances.metadata.reason so
// HPSEDC's admin watchlist can filter by pattern.
const REASONS: { value: string; label: string; hint: string }[] = [
  { value: "fake_job",              label: "Looks like a fake job",            hint: "Details don't add up, the employer doesn't seem real" },
  { value: "asks_for_money",        label: "Someone is asking for money",      hint: "Visa fees, training fees, processing charges — HPSEDC jobs are ALWAYS free for the candidate" },
  { value: "agency_impersonation",  label: "Agency is impersonating someone",  hint: "Pretending to be a govt / well-known agency" },
  { value: "mismatched_description",label: "Description doesn't match reality",hint: "What they showed me differs from the posted role or salary" },
  { value: "contact_outside_portal",label: "Someone contacted me outside the portal", hint: "WhatsApp, Telegram, or direct call to circumvent HPSEDC rules" },
  { value: "other",                 label: "Something else",                   hint: "" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: { id: string; title: string; company?: string; agentId?: string };
}

export function ReportJobDialog({ open, onOpenChange, job }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState<string>("");

  const submit = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/v1/grievances", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: "fraud_report",
          subject: `Report: ${job.title?.slice(0, 120) ?? "Job listing"}`,
          description: details || REASONS.find(r => r.value === reason)?.label || "No additional detail",
          metadata: { jobId: job.id, reason, agencyId: job.agentId },
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || "Could not submit report");
      return j.data;
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description: "HPSEDC's oversight team will review your report. Thank you for keeping the platform safe.",
      });
      setReason(""); setDetails("");
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Couldn't send report", description: e.message, variant: "destructive" }),
  });

  const canSubmit = reason !== "" && (reason !== "other" || details.trim().length >= 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Report this job
          </DialogTitle>
          <DialogDescription>
            If something looks off about <span className="font-medium text-slate-800">{job.title}</span>, tell HPSEDC's oversight team. Reports are confidential.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
            <strong>Never pay anyone</strong> — visa fees, training fees, agency fees — to get placed through HireStream.
            Real HPSEDC-approved overseas jobs are free for candidates.
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">What's wrong?</label>
            <div className="mt-2 space-y-1.5">
              {REASONS.map((r) => (
                <label key={r.value}
                  className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer text-sm transition ${
                    reason === r.value ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  <input type="radio" name="reason" value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)} className="mt-0.5" />
                  <span>
                    <span className="font-medium text-slate-900">{r.label}</span>
                    {r.hint && <span className="block text-[11px] text-slate-500 mt-0.5">{r.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Additional details {reason === "other" && <span className="text-red-600">(required)</span>}
            </label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything specific you want the reviewer to know"
              className="mt-1 text-sm" rows={3} maxLength={2000} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}
            className="bg-red-600 hover:bg-red-700 text-white">
            {submit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Flag className="w-4 h-4 mr-2" />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
