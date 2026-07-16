/**
 * v0.4.35 (Phase 4): Agency scorecard for employer.
 *
 * Shows per-agency conversion stats across the employer's requisitions —
 * who's submitting candidates, how many advance to interview/selected/
 * placed, and the resulting conversion / placement rates. Helps the
 * employer decide which agencies to keep prioritising.
 *
 * Variants:
 *   - Global (default): aggregated across ALL the employer's requisitions
 *   - Scoped: pass requisitionId to filter to one
 */
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Building, Loader2, TrendingUp, ShieldCheck, ShieldAlert } from "lucide-react";

interface ScorecardRow {
  agencyKey: string;
  agencyName: string;
  verified: boolean | null;
  submitted: number;
  shortlisted: number;
  interview: number;
  selected: number;
  placed: number;
  rejected: number;
  conversionPct: number;
  placementRatePct: number;
}

export function AgencyScorecardPanel({ requisitionId, title = "Agency Scorecard", subtitle }: {
  requisitionId?: string;
  title?: string;
  subtitle?: string;
}) {
  const url = requisitionId
    ? `/api/v1/employer/agency-scorecard?requisitionId=${encodeURIComponent(requisitionId)}`
    : "/api/v1/employer/agency-scorecard";
  const { data: res, isLoading } = useQuery({
    queryKey: [url],
    queryFn: async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
  const rows: ScorecardRow[] = res?.data || [];

  if (isLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  }

  const totalSubmitted = rows.reduce((acc, r) => acc + r.submitted, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle || `${rows.length} agencies · ${totalSubmitted} candidates submitted`}</p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-400">
          No candidates have been submitted yet. The first time an agency picks up a requisition and submits a candidate, they'll show up here.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <ScorecardRowItem key={r.agencyKey} r={r} totalSubmitted={totalSubmitted} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScorecardRowItem({ r, totalSubmitted }: { r: ScorecardRow; totalSubmitted: number }) {
  const sharePct = totalSubmitted > 0 ? Math.round((r.submitted / totalSubmitted) * 100) : 0;
  return (
    <div className="p-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Building className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 truncate">{r.agencyName}</p>
              {r.verified === true && (
                <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">
                  <ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Verified
                </Badge>
              )}
              {r.verified === false && (
                <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200">
                  <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> Unverified
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {r.submitted} candidates · {sharePct}% of pipeline volume
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-xl font-bold tabular-nums text-purple-700">{r.conversionPct}%</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">conversion</p>
        </div>
      </div>

      {/* Stage breakdown bar */}
      <div className="space-y-2">
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
          <Segment count={r.placed}      total={r.submitted} color="bg-emerald-500" />
          <Segment count={r.selected}    total={r.submitted} color="bg-green-400" />
          <Segment count={r.interview}   total={r.submitted} color="bg-cyan-500" />
          <Segment count={r.shortlisted} total={r.submitted} color="bg-purple-500" />
          <Segment count={r.rejected}    total={r.submitted} color="bg-red-300" />
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
          <LegendDot color="bg-emerald-500" label="Placed" value={r.placed} />
          <LegendDot color="bg-green-400"   label="Selected" value={r.selected} />
          <LegendDot color="bg-cyan-500"    label="Interview" value={r.interview} />
          <LegendDot color="bg-purple-500"  label="Shortlisted" value={r.shortlisted} />
          <LegendDot color="bg-red-300"     label="Rejected" value={r.rejected} />
          <LegendDot color="bg-slate-300"   label="In-flight" value={Math.max(0, r.submitted - (r.placed + r.selected + r.interview + r.shortlisted + r.rejected))} />
        </div>
      </div>

      {/* Side metrics */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
        <div className="text-[10px]">
          <p className="text-slate-500 uppercase tracking-wider">Submitted</p>
          <p className="text-sm font-bold text-slate-700">{r.submitted}</p>
        </div>
        <div className="text-[10px]">
          <p className="text-slate-500 uppercase tracking-wider">Placement rate</p>
          <p className="text-sm font-bold text-emerald-600">{r.placementRatePct}%</p>
        </div>
        <div className="text-[10px]">
          <p className="text-slate-500 uppercase tracking-wider">Rejected</p>
          <p className="text-sm font-bold text-red-600">{r.rejected}</p>
        </div>
      </div>
    </div>
  );
}

function Segment({ count, total, color }: { count: number; total: number; color: string }) {
  if (!count || !total) return null;
  return <div className={color} style={{ width: `${(count / total) * 100}%` }} />;
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span>{label}: <span className="font-semibold tabular-nums text-slate-700">{value}</span></span>
    </span>
  );
}
