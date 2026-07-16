import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

/**
 * Shared dialog for recording an interview outcome (v0.4.13.0).
 *
 * Replaces the per-page "Mark Selected" / "Select this candidate" buttons
 * with a deliberate pass/fail + notes + rating capture that lands in the
 * `interviews` table and transitions the application to `selected` or
 * `rejected`. The server (POST /api/v1/applications/:id/interview-outcome)
 * enforces the `interview.conducted_by` policy; this UI just shows the
 * action and surfaces a friendly 403 toast if policy forbids the caller.
 */
export function RecordOutcomeModal({
  open, onClose, applicationId, candidateName, onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  candidateName: string;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<string>("");

  useEffect(() => {
    if (open) { setResult("pass"); setNotes(""); setRating(""); }
  }, [open]);

  const record = useMutation({
    mutationFn: async () => {
      const body: any = { result, notes };
      if (rating) body.rating = Number(rating);
      const res = await fetch(`/api/v1/applications/${applicationId}/interview-outcome`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error?.message || "Failed to record outcome");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: result === "pass" ? "Candidate selected" : "Outcome recorded",
        description: result === "pass"
          ? `${candidateName} has been moved to Selected.`
          : `Interview marked as not successful.`,
      });
      onRecorded();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't record outcome", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" /> Record Interview Outcome
          </DialogTitle>
          <DialogDescription>
            for <span className="font-semibold text-slate-900">{candidateName}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Outcome</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setResult("pass")}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  result === "pass"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"
                }`}>
                <CheckCircle className="w-4 h-4 inline mr-1" /> Pass / Select
              </button>
              <button type="button" onClick={() => setResult("fail")}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  result === "fail"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-red-400"
                }`}>
                <XCircle className="w-4 h-4 inline mr-1" /> Fail / Reject
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Rating (1–5, optional)</label>
            <Select value={rating || "none"} onValueChange={(v) => setRating(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1 h-10 text-sm">
                <SelectValue placeholder="No rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No rating</SelectItem>
                <SelectItem value="1">1 — Poor</SelectItem>
                <SelectItem value="2">2 — Below average</SelectItem>
                <SelectItem value="3">3 — Average</SelectItem>
                <SelectItem value="4">4 — Good</SelectItem>
                <SelectItem value="5">5 — Excellent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              {result === "fail" ? "Reason / feedback (required for rejection)" : "Notes (optional)"}
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={result === "fail" ? "Why was the candidate not selected?" : "How did the interview go?"}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-emerald-400 focus:outline-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={record.isPending || (result === "fail" && !notes.trim())}
            onClick={() => record.mutate()}
            className={
              result === "pass"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }>
            {record.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              result === "pass" ? "Select Candidate" : "Reject Candidate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
