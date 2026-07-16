/**
 * Candidate-facing "Recruitment Drives" — lists approved drives the candidate
 * can register for (FRS: candidates can join drives). The owning agency then
 * sees the registrant list and invites/schedules interviews.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, CheckCircle, Loader2, CalendarDays } from "lucide-react";

async function getJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) return { data: [] };
  return r.json();
}

export function DrivesView() {
  const { toast } = useToast();
  const { data: res, isLoading } = useQuery({
    queryKey: ["/api/v1/drives/upcoming"],
    queryFn: () => getJson("/api/v1/drives/upcoming"),
  });
  const drives: any[] = res?.data ?? [];

  const action = useMutation({
    mutationFn: async ({ id, verb }: { id: string; verb: "register" | "unregister" }) => {
      const r = await fetch(`/api/v1/drives/${id}/${verb}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || "Action failed"); }
      return r.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/drives/upcoming"] });
      toast({ title: vars.verb === "register" ? "Registered for the drive" : "Registration cancelled" });
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-white" />
        </span>
        <h3 className="text-xl font-bold text-slate-900">Recruitment Drives ({drives.length})</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">HPSEDC-approved walk-in drives by licensed agencies. Register and the agency will invite you for an interview.</p>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading drives…</p>
      ) : drives.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">No upcoming drives right now</p>
          <p className="text-xs text-slate-400 mt-1">Approved recruitment drives will appear here — check back soon.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drives.map((d) => {
            const when = d.date ? new Date(d.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "";
            return (
              <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900">{d.title}</h4>
                    <p className="text-sm text-slate-500">{d.agencyName}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-indigo-500" /> {when}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-rose-500" /> {d.location}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-emerald-500" /> {d.registeredCount} registered</span>
                    </div>
                    {Array.isArray(d.targetRoles) && d.targetRoles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {d.targetRoles.map((r: string) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                      </div>
                    )}
                    {d.description && <p className="text-xs text-slate-500 mt-2">{d.description}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {d.myStatus === "invited" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-300 rounded-full px-3 py-1.5">
                        🎉 You're invited — please attend
                      </span>
                    ) : d.myStatus === "attended" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Attended
                      </span>
                    ) : d.myStatus === "registered" ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Registered
                        </span>
                        <button onClick={() => action.mutate({ id: d.id, verb: "unregister" })} disabled={action.isPending}
                          className="text-[11px] text-slate-400 hover:text-rose-600">Cancel registration</button>
                      </div>
                    ) : (
                      <Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ id: d.id, verb: "register" })}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {action.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Register"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
