import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Building, ShieldCheck } from "lucide-react";
import { FIELD_LIMITS } from "@/lib/reference-data";

const agencySchema = z.object({
  agencyName: z.string().trim().min(2, "Agency name must be at least 2 characters").max(FIELD_LIMITS.agencyName, `Max ${FIELD_LIMITS.agencyName} characters`),
  licenseNumber: z.string().trim().min(5, "Valid HPSEDC License number is required").max(FIELD_LIMITS.licenseNumber, `Max ${FIELD_LIMITS.licenseNumber} characters`),
  specializations: z.string().max(600).transform(str =>
    str.split(",").map(s => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20)
  ),
});

type AgencyFormValues = z.infer<typeof agencySchema>;

export function AgencyRegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<AgencyFormValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      agencyName: "",
      licenseNumber: "",
      specializations: "" as any,
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: AgencyFormValues) => {
      const res = await fetch("/api/v1/agencies/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to register agency");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/agencies/me"] });
      toast({ title: "Registration Submitted", description: "Your agency registration is pending HPSEDC approval." });
      setOpen(false);
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gov-blue text-white hover:bg-gov-dark-blue w-full mt-4">
          <Building className="mr-2 h-4 w-4" />
          Register Agency
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>HPSEDC Agency Registration</DialogTitle>
          <DialogDescription>
            Register your agency to start posting verified jobs. Registration requires a valid HPSEDC license.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agencyName">Agency Name</Label>
            <Input id="agencyName" maxLength={FIELD_LIMITS.agencyName} placeholder="e.g. Global Recruiting Solutions" {...form.register("agencyName")} />
            {form.formState.errors.agencyName && <p className="text-xs text-red-500">{form.formState.errors.agencyName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="licenseNumber">Gov License Number</Label>
            <Input id="licenseNumber" maxLength={FIELD_LIMITS.licenseNumber} placeholder="e.g. HPSEDC-XXX-YYY" {...form.register("licenseNumber")} />
            {form.formState.errors.licenseNumber && <p className="text-xs text-red-500">{form.formState.errors.licenseNumber.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="specializations">Specializations (Comma separated)</Label>
            <Input id="specializations" maxLength={600} placeholder="IT, Healthcare, Construction..." {...form.register("specializations")} />
            <p className="text-[10px] text-slate-400">Max 20 items, 60 characters each.</p>
          </div>
          <div className="bg-amber-50 p-3 rounded text-amber-800 text-xs border border-amber-200 mt-4 flex items-center">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Verification can take up to 48 hours globally.
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Submit Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
