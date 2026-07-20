import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Briefcase, MapPin, DollarSign, Clock, Shield,
  CheckCircle, Loader2, ArrowRight, Bookmark, BookmarkCheck, Share2, Tag, FileCheck2, Circle,
} from "lucide-react";
import { jobCategoryLabel, salaryBandFor } from "@/lib/reference-data";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: jobRes, isLoading } = useQuery({
    queryKey: [`/api/v1/jobs/${id}`],
    queryFn: () => fetchJson(`/api/v1/jobs/${id}`),
  });
  const { data: savedRes } = useQuery({
    queryKey: ["/api/v1/jobs/saved/my"],
    queryFn: () => fetchJson("/api/v1/jobs/saved/my"),
  });
  const { data: appsRes } = useQuery({
    queryKey: ["/api/v1/candidates/applications"],
    queryFn: () => fetchJson("/api/v1/candidates/applications"),
  });
  const { data: allJobsRes } = useQuery({
    queryKey: ["/api/v1/jobs"],
    queryFn: () => fetchJson("/api/v1/jobs"),
  });
  const { data: docsRes } = useQuery({
    queryKey: ["/api/v1/candidates/documents"],
    queryFn: () => fetchJson("/api/v1/candidates/documents"),
  });
  // UAT-05: the SERVER resolves what this job needs (base ∪ profession ∪ country
  // ∪ vacancy) and splits it by stage. This was a client-side table the server
  // never read — so the portal told candidates the UK needs IELTS while nothing
  // checked, and told everyone they needed a PCC before they had even applied.
  const { data: docPreview } = useQuery({
    queryKey: [`/api/v1/candidates/documents/preview?jobId=${id}`],
    queryFn: () => fetchJson(`/api/v1/candidates/documents/preview?jobId=${id}`),
    enabled: !!id,
  });

  const job = jobRes?.data;
  const savedIds = new Set<string>((savedRes?.data ?? []).map((s: any) => s.jobId || s.id));
  const appliedIds = new Set<string>((appsRes?.data ?? []).map((a: any) => a.jobId));
  const allJobs = allJobsRes?.data ?? [];

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/jobs/${id}/apply`, { method: "POST" });
      const body = await res.json().catch(() => ({} as any));
      // This threw a bare "Failed" and the mutation had NO onError, so every
      // rejection — including the email-verification block — surfaced as the
      // button doing nothing at all. Carry the server's message through.
      if (!res.ok) {
        const err: any = new Error(body?.error?.message || "Could not apply. Please try again.");
        err.reason = body?.error?.reason;
        throw err;
      }
      return body;
    },
    onSuccess: () => {
      toast({ title: "Applied successfully", description: "The recruiter will get in touch." });
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/applications"] });
    },
    onError: (e: any) => {
      const needsVerify = e?.reason === "EMAIL_NOT_VERIFIED";
      toast({
        title: needsVerify ? "Confirm your email first" : "Could not apply",
        description: needsVerify
          ? "Open your dashboard and enter the 6-digit code we emailed you — there is a Resend button if it has not arrived."
          : e?.message,
        variant: "destructive",
      });
    },
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/jobs/${id}/save`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/jobs/saved/my"] });
      toast({ title: d.saved ? "Saved for later" : "Removed from saved" });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }
  if (!job) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <Briefcase className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-900">Job not found</h1>
        <p className="text-slate-500 mt-2">This job may have been removed or the link is incorrect.</p>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const isSaved = savedIds.has(job.id);
  const isApplied = appliedIds.has(job.id);
  const similar = (allJobs as any[])
    .filter((j) => j.id !== job.id && j.country === job.country)
    .slice(0, 4);

  const shareLink = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); toast({ title: "Link copied" }); }
    catch { toast({ title: "Copy failed", description: url }); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium truncate">{job.title}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{job.title}</h1>
            <p className="text-base text-slate-600 font-medium mt-1">{job.company}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-3">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{job.location}, {job.country}</span>
              {job.category && (
                <span className="flex items-center gap-1.5"><Tag className="w-4 h-4 text-slate-400" />{jobCategoryLabel(job.category)}</span>
              )}
              {job.salary && <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-slate-400" />{job.salary}</span>}
              {job.experience > 0 && <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-slate-400" />{job.experience}+ years</span>}
              <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-emerald-500" /> Verified by HPSEDC</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={shareLink}><Share2 className="w-4 h-4 mr-1.5" /> Share</Button>
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()}>
              {isSaved ? <><BookmarkCheck className="w-4 h-4 mr-1.5 fill-blue-600 text-blue-600" /> Saved</> : <><Bookmark className="w-4 h-4 mr-1.5" /> Save</>}
            </Button>
          </div>
        </div>

        {job.description && (
          <section className="mt-7">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">About the role</h2>
            <p className="text-slate-700 leading-relaxed">{job.description}</p>
          </section>
        )}

        {job.skills?.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Required skills</h2>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((s: string) => <Badge key={s} variant="secondary" className="text-xs rounded-lg px-3 py-1">{s}</Badge>)}
            </div>
          </section>
        )}

        {/* UAT-03 #14: typical monthly pay for this category in this country,
            so the candidate can gauge whether the offer/their expectation aligns. */}
        {(() => {
          const band = salaryBandFor(job.category, job.country);
          if (!band) return null;
          const fmt = (n: number) => n.toLocaleString("en-IN");
          return (
            <section className="mt-6">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Typical monthly pay for this role — {job.country}</h2>
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="text-base font-bold text-emerald-800">{fmt(band.min)} – {fmt(band.max)} {band.currency}<span className="text-xs font-normal text-emerald-600">/month</span></span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Indicative market range for {jobCategoryLabel(job.category) || "this category"} — use it to judge whether an offer is fair.</p>
            </section>
          );
        })()}

        {/* UAT-03 #15 → UAT-05 item 9.
            This section used to render requiredDocsForCountry(), whose base set
            included medical_certificate and police_clearance — so it told EVERY
            candidate, before they had even applied, that they needed a PCC and a
            medical for this job. Both are perishable and cost the candidate
            Rs 2,000-3,500. That is exactly what item 9 objects to.
            Now it comes from the server's resolver, split by stage: what you'd
            be asked for IF shortlisted, and what only happens IF selected.
            Nothing here asks for an upload. Item 9 hides the PCC/medical upload
            SECTIONS until selection (they live on /documents, gated); it does not
            require hiding the FACT that the job eventually needs them — telling
            someone up front helps them plan and costs them nothing. */}
        {(() => {
          const prev = docPreview?.data;
          if (!prev) return null;
          const Line = ({ d }: { d: any }) => (
            <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${d.have ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
              {d.have ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
              <span className="text-sm text-slate-700 flex-1">{d.label}</span>
              {d.have && <span className="text-[11px] font-semibold text-emerald-600">Have it</span>}
            </div>
          );
          // The preview endpoint returns `ifShortlisted: null` when the active
          // pipeline has no shortlist stage (Direct). This mapped over it
          // unguarded and threw on render, breaking the job detail page for
          // every candidate — a null I introduced server-side on 2026-07-19
          // without checking the consumer. Null and empty mean different
          // things here: null is "this pipeline has no such stage".
          const shortlistStage: any[] | null = prev.ifShortlisted ?? null;
          const selectedDocs: any[] = prev.ifSelected ?? [];
          if (!shortlistStage?.length && !selectedDocs.length) return null;
          return (
            <section className="mt-6">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {shortlistStage?.length
                  ? `If you are shortlisted for this job — ${job.country}`
                  : `If you are selected for this job — ${job.country}`}
              </h2>
              {shortlistStage?.length ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {shortlistStage.map((d: any) => <Line key={d.key} d={d} />)}
                  </div>
                  {selectedDocs.length > 0 && (
                    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                      <p className="text-[11px] text-slate-600">
                        <strong>Only if you are selected:</strong>{" "}
                        {selectedDocs.map((d: any) => d.label).join(", ")}.{" "}
                        <span className="text-slate-500">
                          You do not need these to apply — they expire, so HPSEDC ask for them only once you have the job.
                        </span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Direct: nothing is asked until selection, so the whole set
                      is the honest answer to "what will I need?". */}
                  <div className="grid sm:grid-cols-2 gap-2">
                    {selectedDocs.map((d: any) => <Line key={d.key} d={d} />)}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">
                    You do not need any of these to apply. HPSEDC ask for them only once you have been selected.
                  </p>
                </>
              )}
            </section>
          );
        })()}

        <section className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-slate-500">Posted {job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-IN") : "recently"}</p>
          {isApplied ? (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-5 py-2 text-sm font-semibold rounded-xl">
              <CheckCircle className="w-4 h-4 mr-1.5" /> Applied
            </Badge>
          ) : (
            <Button className="px-6 h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg shadow-blue-500/25"
              onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Apply Now <ArrowRight className="w-4 h-4 ml-1.5" /></>}
            </Button>
          )}
        </section>
      </motion.div>

      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">More jobs in {job.country}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {similar.map((j: any) => (
              <Link key={j.id} href={`/jobs/${j.id}`}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition">
                <p className="font-semibold text-slate-900">{j.title}</p>
                <p className="text-sm text-slate-500">{j.company} · {j.location}</p>
                {j.salary && <p className="text-xs text-slate-600 mt-2 font-medium">{j.salary}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
