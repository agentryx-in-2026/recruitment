import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Calendar } from "lucide-react";
import { FIELD_LIMITS } from "@/lib/reference-data";

export function DriveCreationForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [expectedCandidates, setExpectedCandidates] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/drives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          date: new Date(date).toISOString(),
          location,
          targetRoles: targetRoles.split(",").map(s => s.trim()).filter(Boolean),
          expectedCandidates: parseInt(expectedCandidates) || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create drive");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/drives/my"] });
      toast({ title: "Drive Created", description: "Your recruitment drive has been submitted for admin approval." });
      setOpen(false);
      setTitle(""); setDescription(""); setDate(""); setLocation(""); setTargetRoles(""); setExpectedCandidates("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 text-white">
          <Plus className="w-4 h-4 mr-1" /> Create Drive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Create Recruitment Drive
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Drive Title *</Label>
            <Input value={title} maxLength={FIELD_LIMITS.driveTitle}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. IT Professionals — UAE Recruitment Drive" />
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              className="w-full min-h-[80px] p-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description} onChange={e => setDescription(e.target.value)}
              maxLength={3000}
              placeholder="Brief about the drive, target positions, requirements..."
            />
            <p className="text-[10px] text-slate-400 text-right mt-0.5">{description.length} / 3000</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date *</Label>
              <Input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Location *</Label>
              <Input value={location} maxLength={FIELD_LIMITS.location}
                onChange={e => setLocation(e.target.value)} placeholder="Delhi, Shimla..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Target Roles (comma separated)</Label>
              <Input value={targetRoles} maxLength={600}
                onChange={e => setTargetRoles(e.target.value)}
                placeholder="Developer, Nurse, Welder..." />
              <p className="text-[10px] text-slate-400">Up to 30 roles.</p>
            </div>
            <div>
              <Label>Expected Candidates</Label>
              <Input type="number" min={1} max={10000} value={expectedCandidates}
                onChange={e => setExpectedCandidates(e.target.value)} placeholder="50" />
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Drives require HPSEDC admin approval before they become visible to candidates.
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!title || !date || !location || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Submit Drive for Approval
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
