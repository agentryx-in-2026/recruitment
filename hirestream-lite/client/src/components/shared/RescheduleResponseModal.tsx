/**
 * v0.4.37: Agent/employer response to a candidate's interview reschedule
 * request. The candidate→agent request shipped in v0.4.34 but was passive
 * on the agent side (badge + notification only, no action). This modal
 * closes the loop with three actions:
 *   - Accept proposed time  → move the interview to the candidate's slot
 *   - Set a different time   → pick a new datetime
 *   - Keep original time     → decline; original stands
 * Every action notifies the candidate and clears the pending request.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Clock, Calendar, CheckCircle, XCircle, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface InterviewLite {
  id: string;
  scheduledAt: string;
  candidateRescheduleReason?: string | null;
  candidateProposedAt?: string | null;
}

export function RescheduleResponseModal({
  open, onClose, interview, candidateName, onResponded,
}: {
  open: boolean;
  onClose: () => void;
  interview: InterviewLite | null;
  candidateName: string;
  onResponded?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newTime, setNewTime] = useState("");
  const [showSetTime, setShowSetTime] = useState(false);

  const respond = useMutation({
    mutationFn: async (vars: { action: "accept_proposed" | "set_time" | "keep_original"; newTime?: string }) => {
      const r = await fetch(`/api/v1/agent/interviews/${interview!.id}/respond-reschedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      // audit 2026-07-06 (C8): read the body once — the second r.json() threw "body already read"
      if (!r.ok) { const e = await r.json().catch(() => ({} as any)); throw new Error(e?.error?.message || e?.message || "Failed"); }
      return r.json();
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.action === "keep_original" ? "Original time kept" : "Interview rescheduled",
        description: `${candidateName} has been notified.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/v1/agent/applicants"] });
      qc.invalidateQueries();
      setShowSetTime(false); setNewTime("");
      onResponded?.();
      onClose();
    },
    onError: (e: any) => toast({ title: "Couldn't respond", description: e.message, variant: "destructive" }),
  });

  if (!interview) return null;
  const proposed = interview.candidateProposedAt ? new Date(interview.candidateProposedAt) : null;
  const original = new Date(interview.scheduledAt);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-600" /> Reschedule request
          </DialogTitle>
          <DialogDescription>
            from <span className="font-semibold text-slate-900">{candidateName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Context */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs space-y-1.5">
            <p className="flex items-center gap-1.5 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Current time: <span className="font-semibold">{original.toLocaleString("en-IN")}</span>
            </p>
            {interview.candidateRescheduleReason && (
              <p className="text-slate-700"><span className="text-slate-500">Reason:</span> {interview.candidateRescheduleReason}</p>
            )}
            {proposed && (
              <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Candidate proposed: {proposed.toLocaleString("en-IN")}
              </p>
            )}
          </div>

          {/* Actions */}
          {!showSetTime ? (
            <div className="space-y-2">
              {proposed && (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white justify-start"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ action: "accept_proposed" })}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Accept proposed time
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start border-blue-200 text-blue-700 hover:bg-blue-50"
                disabled={respond.isPending} onClick={() => setShowSetTime(true)}>
                <Calendar className="w-4 h-4 mr-2" /> Set a different time
              </Button>
              <Button variant="outline" className="w-full justify-start border-slate-200 text-slate-700 hover:bg-slate-50"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ action: "keep_original" })}>
                <XCircle className="w-4 h-4 mr-2" /> Keep original time (decline request)
              </Button>
              {respond.isPending && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</p>}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-blue-200 p-3">
              <Label className="text-xs font-semibold text-slate-700">New interview date &amp; time</Label>
              <Input type="datetime-local" value={newTime} min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setNewTime(e.target.value)} className="h-10 text-sm" />
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Candidate will be asked to confirm the new slot.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!newTime || respond.isPending}
                  onClick={() => respond.mutate({ action: "set_time", newTime })}>
                  {respond.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set new time & notify"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowSetTime(false); setNewTime(""); }}>Back</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
