/**
 * v0.4.34 (Phase 4, HPSEDC interview UX): Candidate-side interview
 * details panel + Confirm / Reschedule / Decline actions.
 *
 * Renders when an interview exists for the application. Three states:
 *   - candidateConfirmedStatus = null → show Confirm / Reschedule / Decline
 *   - "confirmed"               → show confirmed-at + Reschedule / Decline (can change mind)
 *   - "reschedule_requested"    → show proposed time + reason + "Cancel request" (Confirm again)
 *   - "declined"                → show decline reason + (optional re-engage by confirming)
 *
 * Each action posts to /api/v1/me/interviews/:id/{confirm|reschedule|decline}
 * and refetches the parent application so the candidate sees their
 * choice reflected immediately.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Clock, MapPin, Link as LinkIcon, User, Download,
  CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw, Video,
} from "lucide-react";

interface Interview {
  id: string;
  scheduledAt: string;
  location?: string | null;
  mode?: "in_person" | "virtual" | string | null;
  interviewerName?: string | null;
  meetingLink?: string | null;
  candidateConfirmedStatus?: "confirmed" | "reschedule_requested" | "declined" | null;
  candidateConfirmedAt?: string | null;
  candidateRescheduleReason?: string | null;
  candidateProposedAt?: string | null;
  candidateDeclineReason?: string | null;
}

interface Props {
  interview: Interview;
  /** Invalidate this query after a mutation so the parent refetches. */
  invalidateKey?: string[];
}

export function InterviewActionsPanel({ interview, invalidateKey }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<"idle" | "reschedule" | "decline">("idle");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [proposedAt, setProposedAt] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  function refresh() {
    if (invalidateKey) qc.invalidateQueries({ queryKey: invalidateKey });
    qc.invalidateQueries({ queryKey: ["/api/v1/candidates/applications"] });
  }

  const confirmM = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/me/interviews/${interview.id}/confirm`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error?.message || "Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Attendance confirmed", description: "The agency has been notified." }); refresh(); },
    onError: (e: any) => toast({ title: "Couldn't confirm", description: e.message, variant: "destructive" }),
  });
  const rescheduleM = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/me/interviews/${interview.id}/reschedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rescheduleReason, proposedAt: proposedAt || undefined }),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Reschedule requested", description: "The agency will get back to you with a new slot." });
      setMode("idle"); setRescheduleReason(""); setProposedAt(""); refresh();
    },
    onError: (e: any) => toast({ title: "Couldn't request reschedule", description: e.message, variant: "destructive" }),
  });
  const declineM = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/v1/me/interviews/${interview.id}/decline`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason }),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message || "Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Interview declined", description: "The agency has been notified." });
      setMode("idle"); setDeclineReason(""); refresh();
    },
    onError: (e: any) => toast({ title: "Couldn't decline", description: e.message, variant: "destructive" }),
  });

  const isVirtual = interview.mode === "virtual";
  const status = interview.candidateConfirmedStatus;
  const start = new Date(interview.scheduledAt);
  const dateLine = start.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLine = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div className="mt-5 rounded-xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50 to-blue-50/40 p-5">
      {/* Header — interview essentials */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <Calendar className="w-5 h-5 text-cyan-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900">Interview scheduled</p>
            {status === "confirmed" && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">✓ You confirmed</Badge>}
            {status === "reschedule_requested" && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">⏰ Reschedule requested</Badge>}
            {status === "declined" && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">✗ Declined</Badge>}
            {!status && <Badge variant="outline" className="text-[10px]">Awaiting your confirmation</Badge>}
            <Badge variant="outline" className="text-[10px] capitalize">
              {isVirtual ? <><Video className="w-2.5 h-2.5 mr-1 inline" /> Virtual</> : <><MapPin className="w-2.5 h-2.5 mr-1 inline" /> In-person</>}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateLine}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{timeLine}</span>
            </div>
            {interview.interviewerName && (
              <div className="flex items-center gap-2 text-slate-700">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{interview.interviewerName}</span>
              </div>
            )}
            {isVirtual && interview.meetingLink && (
              <div className="flex items-center gap-2 text-slate-700 min-w-0">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <a href={interview.meetingLink} target="_blank" rel="noreferrer"
                  className="text-blue-700 hover:underline truncate">{interview.meetingLink}</a>
              </div>
            )}
            {!isVirtual && interview.location && (
              <div className="flex items-center gap-2 text-slate-700 md:col-span-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{interview.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Existing decision context */}
      {status === "reschedule_requested" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-semibold text-amber-900">Your reschedule request:</p>
          <p className="text-amber-800 mt-1">{interview.candidateRescheduleReason || "—"}</p>
          {interview.candidateProposedAt && (
            <p className="text-amber-800 mt-1">
              Proposed: {new Date(interview.candidateProposedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      )}
      {status === "declined" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
          <p className="font-semibold text-red-900">You declined:</p>
          <p className="text-red-800 mt-1">{interview.candidateDeclineReason || "—"}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {/* .ics download — always available */}
        <a href={`/api/v1/me/interviews/${interview.id}.ics`} download
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-slate-200 bg-white hover:border-cyan-400 hover:text-cyan-700 transition">
          <Download className="w-3.5 h-3.5" /> Add to calendar (.ics)
        </a>

        {/* Confirm — visible unless already confirmed (so user can flip back from reschedule/decline) */}
        {status !== "confirmed" && (
          <Button size="sm" onClick={() => confirmM.mutate()} disabled={confirmM.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {confirmM.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
            {status === "reschedule_requested" || status === "declined" ? "Confirm original time instead" : "Confirm attendance"}
          </Button>
        )}

        {status !== "reschedule_requested" && status !== "declined" && (
          <Button size="sm" variant="outline" onClick={() => setMode("reschedule")}
            className="border-amber-200 text-amber-700 hover:bg-amber-50">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Request reschedule
          </Button>
        )}
        {status !== "declined" && (
          <Button size="sm" variant="outline" onClick={() => setMode("decline")}
            className="border-red-200 text-red-700 hover:bg-red-50">
            <XCircle className="w-3.5 h-3.5 mr-1" /> Decline
          </Button>
        )}
      </div>

      {/* Reschedule form */}
      {mode === "reschedule" && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Request reschedule
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-[11px] font-semibold text-slate-700 mb-1 block">Reason <span className="text-red-500">*</span></Label>
              <textarea value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Visa appointment that day; medical procedure; family emergency"
                className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-200 min-h-[60px]" maxLength={1000} />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-700 mb-1 block">Preferred alternate time <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input type="datetime-local" value={proposedAt} onChange={(e) => setProposedAt(e.target.value)} className="h-9" />
              <p className="text-[10px] text-slate-400 mt-1">The agency will confirm the new slot or propose another.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => rescheduleM.mutate()}
                disabled={rescheduleM.isPending || rescheduleReason.trim().length < 5}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                {rescheduleM.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                Send request
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setRescheduleReason(""); setProposedAt(""); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Decline form */}
      {mode === "decline" && (
        <div className="mt-4 rounded-lg border border-red-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-600" /> Decline interview
          </p>
          <p className="text-[10px] text-slate-500 mb-2">
            Declining will withdraw you from this interview round. The agency may still consider you for other roles.
          </p>
          <Label className="text-[11px] font-semibold text-slate-700 mb-1 block">Reason <span className="text-red-500">*</span></Label>
          <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="e.g. Found a better-fit role; family circumstances; visa issues"
            className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 min-h-[60px]" maxLength={1000} />
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => declineM.mutate()}
              disabled={declineM.isPending || declineReason.trim().length < 5}
              className="bg-red-600 hover:bg-red-700 text-white">
              {declineM.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              Confirm decline
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setDeclineReason(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
