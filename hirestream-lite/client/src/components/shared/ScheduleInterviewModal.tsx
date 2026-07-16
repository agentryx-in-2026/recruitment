import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Loader2 } from "lucide-react";

/**
 * Shared modal for scheduling an interview against an application.
 * Extracted from agent-job-detail.tsx in v0.4.21 so the same dialog
 * can also be opened from the global All Applicants page — agents
 * shouldn't have to drill into each job just to schedule.
 *
 * Server endpoint: POST /api/v1/drives/:driveId/interviews
 * (driveId="none" is valid for standalone, non-drive interviews).
 */
async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

export function ScheduleInterviewModal({
  open, onClose, applicationId, candidateName, onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  candidateName: string;
  onScheduled: () => void;
}) {
  const { toast } = useToast();
  const [driveId, setDriveId] = useState("none");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("in_person");
  // v0.4.34.1 (Phase 4 follow-up): capture interviewer + meeting link
  // so the candidate panel shows "Sarah Mitchell — zoom.us/j/…" instead
  // of just a date pill.
  const [interviewerName, setInterviewerName] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  const { data: drivesRes } = useQuery({
    queryKey: ["/api/v1/drives/my"],
    queryFn: () => fetchJson("/api/v1/drives/my"),
    enabled: open,
  });
  const drives: any[] = (drivesRes?.data ?? []).filter((d: any) => d.status === "approved");

  const schedule = useMutation({
    mutationFn: async () => {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      const res = await fetch(`/api/v1/drives/${driveId || "none"}/interviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId, scheduledAt, location, mode,
          interviewerName: interviewerName.trim() || undefined,
          meetingLink: meetingLink.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error?.message || "Failed to schedule");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Interview scheduled", description: `${candidateName} has been notified.` });
      onScheduled();
      setDate(""); setLocation(""); setDriveId("none"); setInterviewerName(""); setMeetingLink("");
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-600" /> Schedule Interview
          </DialogTitle>
          <DialogDescription>
            with <span className="font-semibold text-slate-900">{candidateName}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]} className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Time</label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Mode</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in_person">In-person</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              {mode === "virtual" ? "Address / Notes" : "Location"}
            </label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder={mode === "virtual" ? "Optional notes (e.g. 'Use Chrome')" : "Hotel Clarkes, Shimla"}
              className="mt-1 h-10 text-sm" />
          </div>
          {mode === "virtual" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Meeting link <span className="text-red-500">*</span></label>
              <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                className="mt-1 h-10 text-sm" />
              <p className="text-[10px] text-slate-400 mt-1">Candidate sees this as a clickable link on their dashboard.</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-600">Interviewer name <span className="text-slate-400 font-normal">(optional but recommended)</span></label>
            <Input value={interviewerName} onChange={(e) => setInterviewerName(e.target.value)}
              placeholder="e.g. Sarah Mitchell, Senior Recruiter"
              className="mt-1 h-10 text-sm" />
            <p className="text-[10px] text-slate-400 mt-1">Shown to the candidate so they know who they'll meet.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Drive (optional)</label>
            <Select value={driveId} onValueChange={setDriveId}>
              <SelectTrigger className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standalone (no drive)</SelectItem>
                {drives.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {/* audit 2026-07-06 (C9): the virtual meeting link is marked required (*) — enforce it */}
          <Button disabled={!date || !time || (mode === "virtual" && !meetingLink.trim()) || schedule.isPending} onClick={() => schedule.mutate()}
            className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {schedule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Schedule & Notify Candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
