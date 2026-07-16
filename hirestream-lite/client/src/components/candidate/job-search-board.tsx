import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Briefcase, Loader2, AlertCircle, MapPin, DollarSign,
  CheckCircle, ChevronDown, ChevronUp, ArrowUpDown, Star, Clock, Shield
} from "lucide-react";
import { Job } from "@shared/schema";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return res.json();
}

export function JobSearchBoard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("match"); // match, date
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobsResponse, isLoading, error } = useQuery({
    queryKey: ["/api/v1/jobs"],
    queryFn: () => fetchJson("/api/v1/jobs"),
  });

  const { data: appsResponse } = useQuery({
    queryKey: ["/api/v1/candidates/applications"],
    queryFn: () => fetchJson("/api/v1/candidates/applications"),
  });

  const { data: recsResponse } = useQuery({
    queryKey: ["/api/v1/applications/recommendations/for-me"],
    queryFn: () => fetchJson("/api/v1/applications/recommendations/for-me"),
  });

  const allJobs: Job[] = (jobsResponse as any)?.data || [];
  const myApps = (appsResponse as any)?.data || [];
  const recommendations = recsResponse?.data || [];
  const appliedJobIds = new Set(myApps.map((a: any) => a.jobId));

  // Build match score map from recommendations
  const matchScoreMap: Record<string, { score: number; breakdown: any }> = {};
  recommendations.forEach((r: any) => {
    matchScoreMap[r.id] = { score: r.matchScore, breakdown: r.scoreBreakdown };
  });

  // Client-side filtering
  let filteredJobs = allJobs.filter((job) => {
    const matchesSearch = !searchTerm ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.skills?.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCountry = countryFilter === "all" || job.country?.toLowerCase() === countryFilter.toLowerCase();
    return matchesSearch && matchesCountry;
  });

  // Sort
  filteredJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === "match") {
      return (matchScoreMap[b.id]?.score || 0) - (matchScoreMap[a.id]?.score || 0);
    }
    if (sortBy === "date") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return 0;
  });

  const countries = Array.from(new Set(allJobs.map((j) => j.country).filter(Boolean)));

  const applyMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/v1/jobs/${jobId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/candidates/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/applications/recommendations/for-me"] });
      toast({ title: "Applied!", description: `Match score: ${data.data?.matchScore}%` });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center tracking-tight">
          <Briefcase className="text-blue-600 mr-2 w-5 h-5" />
          Job Discovery Board
        </h3>
        <span className="text-sm text-slate-500 tabular-nums">{filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Search + Filter + Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by title, company, or skill..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-10" />
        </div>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-[150px] h-10"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countries.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px] h-10"><ArrowUpDown className="w-3.5 h-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
          {/* audit 2026-07-06 (Batch 3): removed the "Salary" sort option — its
              comparator was a no-op (returned 0), silently doing nothing. */}
          <SelectContent>
            <SelectItem value="match">Best Match</SelectItem>
            <SelectItem value="date">Newest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : error ? (
        <div className="flex items-center justify-center h-32 text-red-500"><AlertCircle className="w-5 h-5 mr-2" /> Failed to load jobs</div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No jobs match your criteria</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const isApplied = appliedJobIds.has(job.id);
            const matchInfo = matchScoreMap[job.id];
            const isExpanded = expandedJob === job.id;

            return (
              <div key={job.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                {/* Job Card (always visible) */}
                <div className="p-4 cursor-pointer" onClick={() => setExpandedJob(isExpanded ? null : job.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 text-sm">{job.title}</h4>
                        {isApplied && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" variant="outline"><CheckCircle className="w-3 h-3 mr-0.5" /> Applied</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="font-medium text-slate-700">{job.company}</span>
                        <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{job.location}, {job.country}</span>
                        {job.salary && <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" />{job.salary}</span>}
                      </div>
                      {job.skills && job.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {job.skills.slice(0, 5).map(s => <Badge key={s} variant="outline" className="text-[10px] bg-slate-50 border-slate-200">{s}</Badge>)}
                          {job.experience && job.experience > 0 && <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">{job.experience}+ yrs</Badge>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {matchInfo && (
                        <Badge className={`${matchInfo.score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : matchInfo.score >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'} text-xs font-bold px-2.5`} variant="outline">
                          <Star className="w-3 h-3 mr-0.5" />{matchInfo.score}%
                        </Badge>
                      )}
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />{job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-IN") : "Recent"}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                    <div className="pt-4 space-y-4">
                      {/* Description */}
                      {job.description && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</h5>
                          <p className="text-sm text-slate-700 leading-relaxed">{job.description}</p>
                        </div>
                      )}

                      {/* Match Score Breakdown */}
                      {matchInfo?.breakdown && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Your Match Breakdown</h5>
                          <div className="grid grid-cols-3 gap-3">
                            <ScoreBar label="Skills" score={matchInfo.breakdown.skill.score} max={matchInfo.breakdown.skill.max} detail={matchInfo.breakdown.skill.detail} color="bg-blue-500" />
                            <ScoreBar label="Experience" score={matchInfo.breakdown.experience.score} max={matchInfo.breakdown.experience.max} detail={matchInfo.breakdown.experience.detail} color="bg-emerald-500" />
                            <ScoreBar label="Country" score={matchInfo.breakdown.country.score} max={matchInfo.breakdown.country.max} detail={matchInfo.breakdown.country.detail} color="bg-purple-500" />
                          </div>
                        </div>
                      )}

                      {/* Requirements */}
                      {job.skills && job.skills.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Required Skills</h5>
                          <div className="flex flex-wrap gap-1.5">
                            {job.skills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                          </div>
                        </div>
                      )}

                      {/* Apply Button */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Shield className="w-3.5 h-3.5" />
                          <span>Verified by HPSEDC</span>
                        </div>
                        {isApplied ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 px-4 py-1.5" variant="outline">
                            <CheckCircle className="w-4 h-4 mr-1" /> Already Applied
                          </Badge>
                        ) : (
                          <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 px-6"
                            onClick={(e) => { e.stopPropagation(); applyMutation.mutate(job.id); }}
                            disabled={applyMutation.isPending}>
                            {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Now"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, score, max, detail, color }: { label: string; score: number; max: number; detail: string; color: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="text-xs font-bold text-slate-900 tabular-nums">{score}/{max}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-400 leading-tight">{detail}</p>
    </div>
  );
}
