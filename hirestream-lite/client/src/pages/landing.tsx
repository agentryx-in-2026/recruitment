import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Handshake, Building, TrendingUp, Briefcase, CheckCircle, Shield, Globe, ArrowRight, Headphones, Crown, Info, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user, logoutMutation } = useAuth();

  // HTIS BUG-009 — "Choose Your Portal" was a dead card for signed-in users
  // (landing → /auth → authed redirect back to /). Now: if already signed in,
  // the click signs them out before routing to the login screen so they can
  // actually pick a different portal. Anon users route straight to /auth.
  const handlePortalClick = () => {
    if (!user) {
      setLocation("/auth");
      return;
    }
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/auth"),
      onError: () => setLocation("/auth"),
    });
  };

  const { data: jobsRes } = useQuery({
    queryKey: ["/api/v1/jobs/count"],
    queryFn: async () => {
      const res = await fetch("/api/v1/jobs?limit=1");
      if (!res.ok) return { pagination: { total: 0 } };
      return res.json();
    },
  });

  const totalJobs = jobsRes?.pagination?.total || 0;

  const [showBanner, setShowBanner] = useState(true);

  return (
    <div className="min-h-screen">


      {/* ── Hero Section ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-700">
        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div className="text-left">
              <Badge className="bg-white/15 text-white border-white/25 mb-5 text-xs font-medium px-3 py-1">
                <Shield className="w-3 h-3 mr-1.5" /> {t("app.government")} — {t("landing.officialPlatform")}
              </Badge>
              <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-white tracking-tight leading-[1.25] pb-1">
                {t("landing.hero")}
              </h1>
              <p className="mt-6 text-lg text-blue-100/90 max-w-lg leading-relaxed">
                {t("landing.heroDesc")}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button
                  size="lg"
                  onClick={handlePortalClick}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 h-12 text-base font-semibold shadow-lg shadow-orange-500/25"
                >
                  <User className="mr-2 h-5 w-5" />
                  {t("landing.getStarted")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handlePortalClick}
                  className="bg-white/10 backdrop-blur-sm border-white/40 text-white hover:bg-white/20 hover:border-white/60 hover:text-white px-8 h-12 text-base font-semibold"
                >
                  <Handshake className="mr-2 h-5 w-5" />
                  {t("landing.forAgencies")}
                </Button>
              </div>
            </div>

            {/* Right: Floating stat cards (frosted glass) */}
            <div className="hidden md:grid grid-cols-2 gap-4">
              {[
                { value: totalJobs > 0 ? `${totalJobs}+` : "Live", label: t("landing.activeJobs"), icon: Briefcase, color: "text-orange-300" },
                { value: "HPSEDC", label: t("landing.govVerified"), icon: Shield, color: "text-emerald-300" },
                { value: t("landing.smartMatch"), label: t("landing.matchScoring"), icon: TrendingUp, color: "text-cyan-300" },
                { value: "24/7", label: t("landing.portalAccess"), icon: Globe, color: "text-purple-300" },
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.08] backdrop-blur-sm border border-white/[0.15] rounded-xl p-5 hover:bg-white/[0.12] transition-colors">
                  <s.icon className={`w-6 h-6 ${s.color} mb-2`} />
                  <p className="text-2xl font-bold text-white tabular-nums">{s.value}</p>
                  <p className="text-sm text-blue-200/80">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 60L1440 60L1440 30C1440 30 1200 0 720 0C240 0 0 30 0 30L0 60Z" fill="#f8fafc"/>
          </svg>
        </div>
      </section>

      {/* ── Role Selection Cards ─────────────────────────────────── */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t("landing.choosePortal")}</h2>
            <p className="mt-3 text-slate-500 max-w-2xl mx-auto">{t("landing.fourStakeholders")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                title: t("landing.jobSeekers"),
                desc: t("landing.jobSeekersDesc"),
                icon: User,
                gradient: "from-blue-600 to-blue-700",
                tag: t("landing.tagCandidate"),
                tagColor: "bg-blue-50 text-blue-700",
                features: [t("landing.featSmartMatching"), t("landing.featProfileWizard"), t("landing.featVisualPipeline"), t("landing.featDocExport")],
              },
              {
                title: t("landing.recruitmentAgencies"),
                desc: t("landing.recruitmentAgenciesDesc"),
                icon: Handshake,
                gradient: "from-emerald-600 to-emerald-700",
                tag: t("landing.tagAgency"),
                tagColor: "bg-emerald-50 text-emerald-700",
                features: [t("landing.featPostJobs"), t("landing.featApplicantMgmt"), t("landing.featDriveSchedule"), t("landing.featCandidateSearch")],
              },
              {
                title: t("landing.employers"),
                desc: t("landing.employersDesc"),
                icon: Building,
                gradient: "from-purple-600 to-purple-700",
                tag: t("landing.tagEmployer"),
                tagColor: "bg-purple-50 text-purple-700",
                features: [t("landing.featDirectHiring"), t("landing.featMatchAnalytics"), t("landing.featAgencyCollab"), t("landing.featRealTimeNotif")],
              },
              {
                title: t("landing.govOfficers"),
                desc: t("landing.govOfficersDesc"),
                icon: Shield,
                gradient: "from-rose-600 to-red-700",
                tag: t("landing.tagAdmin"),
                tagColor: "bg-rose-50 text-rose-700",
                features: [t("landing.featAgencyVerify"), t("landing.featCrossDistrict"), t("landing.featGrievanceMgmt"), t("landing.featDriveApprovals")],
              },
            ].map((role) => (
              <div
                key={role.title}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer group"
                onClick={handlePortalClick}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 bg-gradient-to-br ${role.gradient} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-md`}>
                    <role.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${role.tagColor}`}>
                    {role.tag}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{role.title}</h3>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">{role.desc}</p>
                <ul className="space-y-2">
                  {role.features.map((f) => (
                    <li key={f} className="flex items-center text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  {t("landing.getStarted")} <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agency Leaderboard ────────────────────────────────────── */}
      <AgencyLeaderboard />

      {/* ── Trust Bar ────────────────────────────────────────────── */}
      <section className="py-12 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: Shield, label: t("landing.trustGovVerified"), color: "text-blue-600", bg: "bg-blue-50" },
              { icon: TrendingUp, label: t("landing.trustSmartMatch"), color: "text-emerald-600", bg: "bg-emerald-50" },
              { icon: Globe, label: t("landing.trustBilingual"), color: "text-purple-600", bg: "bg-purple-50" },
              { icon: Headphones, label: t("landing.trustGrievance"), color: "text-orange-600", bg: "bg-orange-50" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className={`w-12 h-12 ${item.bg} ${item.color} rounded-full flex items-center justify-center mb-3`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Agency Leaderboard Section ──
function AgencyLeaderboard() {
  const { t } = useTranslation();
  const { data: lbRes } = useQuery({
    queryKey: ["/api/v1/agencies/leaderboard/top"],
    queryFn: async () => {
      const res = await fetch("/api/v1/agencies/leaderboard/top");
      if (!res.ok) return { data: [] };
      return res.json();
    },
  });
  const top = (lbRes?.data || []).slice(0, 10);

  if (top.length === 0) return null;

  const medalColor = (rank: number) =>
    rank === 1 ? "bg-amber-100 text-amber-800 border-amber-300" :
    rank === 2 ? "bg-slate-100 text-slate-700 border-slate-300" :
    rank === 3 ? "bg-orange-100 text-orange-800 border-orange-300" :
    "bg-slate-50 text-slate-600 border-slate-200";

  const medalEmoji = (rank: number) =>
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <section className="py-16 bg-gradient-to-br from-slate-50 via-white to-amber-50/30 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t("landing.leaderboardTitle")}</h2>
          <p className="mt-3 text-slate-500 max-w-2xl mx-auto">{t("landing.leaderboardDesc")}</p>
        </div>

        <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {top.map((a: any) => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg flex-shrink-0 ${medalColor(a.rank)}`}>
                {medalEmoji(a.rank)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900 truncate">{a.agencyName}</p>
                  {a.badges?.includes("five_star") && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">{t("landing.badgeFiveStar")}</span>
                  )}
                  {a.badges?.includes("top_placer") && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{t("landing.badgeTopPlacer")}</span>
                  )}
                  {a.badges?.includes("well_reviewed") && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">{t("landing.badgeWellReviewed")}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">License: {a.licenseNumber}</p>
                {a.specializations?.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {a.specializations.slice(0, 3).join(" · ")}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-slate-900 tabular-nums">{a.placements}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{t("landing.placements")}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-amber-600 tabular-nums">
                  {a.averageRating > 0 ? `${a.averageRating.toFixed(1)} ★` : "—"}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{a.reviewCount} {t("landing.reviews")}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          {t("landing.leaderboardScoring")}
        </p>
      </div>
    </section>
  );
}
