import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building, Shield, Star, Award, Users, Loader2, CheckCircle, Globe, Briefcase, MapPin,
} from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: null };
  return res.json();
}

export default function AgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: res, isLoading } = useQuery({
    queryKey: [`/api/v1/agencies/${id}`],
    queryFn: () => fetchJson(`/api/v1/agencies/${id}`),
  });

  const agency = res?.data;

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!agency) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <Building className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-900">Agency not found</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Back to dashboard</Button>
      </div>
    );
  }

  const initials = (agency.agencyName || "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => history.length > 1 ? history.back() : setLocation("/")}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="text-slate-500 hover:text-blue-600">Dashboard</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium truncate">{agency.agencyName}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-bold text-3xl flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{agency.agencyName}</h1>
              {agency.verified && (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <Shield className="w-3 h-3 mr-1" /> Verified by HPSEDC
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1">License {agency.licenseNumber}</p>
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 mt-3">
              <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-500" /> <span className="font-semibold">{agency.placements}</span> placements</span>
              <span className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="font-semibold">{agency.averageRating || "—"}</span>
                <span className="text-slate-400">({agency.reviewCount} review{agency.reviewCount !== 1 ? "s" : ""})</span>
              </span>
            </div>
          </div>
        </div>

        {agency.specializations?.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Specializations</h2>
            <div className="flex flex-wrap gap-2">
              {agency.specializations.map((s: string) => <Badge key={s} variant="secondary" className="text-xs rounded-lg px-3 py-1">{s}</Badge>)}
            </div>
          </section>
        )}

        {agency.countriesServed?.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Countries served
            </h2>
            <div className="flex flex-wrap gap-2">
              {agency.countriesServed.map((c: string) => (
                <Badge key={c} variant="outline" className="text-xs rounded-lg px-3 py-1 border-blue-200 text-blue-700 bg-blue-50">
                  {c}
                </Badge>
              ))}
            </div>
          </section>
        )}
      </motion.div>

      {agency.activeJobs?.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <Briefcase className="w-5 h-5 text-slate-500" /> Currently hiring ({agency.activeJobCount})
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {agency.activeJobs.map((j: any) => (
              <Link key={j.id} href={`/jobs/${j.id}`}>
                <a className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition">
                  <p className="text-sm font-bold text-slate-900 truncate">{j.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{j.company}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                    <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{j.location}, {j.country}</span>
                    {j.salary && <span>· {j.salary}</span>}
                    {j.experience > 0 && <span>· {j.experience}+ yrs</span>}
                  </div>
                </a>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-slate-500" /> Candidate Reviews
        </h2>
        {agency.reviews.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
            No reviews yet for this agency.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {agency.reviews.map((r: any) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`w-4 h-4 ${n <= r.rating ? "text-amber-500 fill-amber-500" : "text-slate-200"}`} />
                  ))}
                </div>
                {r.title && <p className="text-sm font-semibold text-slate-900">{r.title}</p>}
                {r.review && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{r.review}</p>}
                <p className="text-[11px] text-slate-400 mt-2">{new Date(r.createdAt).toLocaleDateString("en-IN")}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
