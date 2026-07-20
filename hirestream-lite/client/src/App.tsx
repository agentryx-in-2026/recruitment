import "./lib/i18n"; // Initialize i18n before anything else
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useCapabilities } from "@/hooks/use-capabilities";
import { Masthead } from "@/components/layout/masthead";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { DemoSwitcher } from "@/components/demo/DemoSwitcher";
import LandingPage from "@/pages/landing"; // critical (landing should load fast)
import { Loader2 } from "lucide-react";

// Code-split: dashboards + secondary pages load on demand to shrink initial bundle
const NotFound = lazy(() => import("@/pages/not-found"));
const CandidateDashboard = lazy(() => import("@/pages/candidate-dashboard"));
const AgentDashboard = lazy(() => import("@/pages/agent-dashboard"));
const EmployerDashboard = lazy(() => import("@/pages/employer-dashboard"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const SuperAdminDashboard = lazy(() => import("@/pages/superadmin-dashboard"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const FaqPage = lazy(() => import("@/pages/faq-page"));
const GrievancePage = lazy(() => import("@/pages/grievance-page"));
const RegisterPage = lazy(() => import("@/pages/register"));
const CallbackPage = lazy(() => import("@/pages/callback"));
const DocumentsPage = lazy(() => import("@/pages/documents"));
const SupportPage = lazy(() => import("@/pages/support"));
const HelpPage = lazy(() => import("@/pages/help"));
const JobDetailPage = lazy(() => import("@/pages/job-detail"));
const ApplicationDetailPage = lazy(() => import("@/pages/application-detail"));
const AgencyDetailPage = lazy(() => import("@/pages/agency-detail"));
const PublicStatusCheckPage = lazy(() => import("@/pages/public-status-check"));
const AgentCandidateDetailPage = lazy(() => import("@/pages/agent-candidate-detail"));
const AgentJobDetailPage = lazy(() => import("@/pages/agent-job-detail"));
const AgentApplicantsPage = lazy(() => import("@/pages/agent-applicants"));
const AgentDriveDetailPage = lazy(() => import("@/pages/agent-drive-detail"));
const EmployerReviewPage = lazy(() => import("@/pages/employer-review"));
const SystemControlsPage = lazy(() => import("@/pages/system-controls"));
const OperatorConsolePage = lazy(() => import("@/pages/admin/operator-console"));
const AccessibilityPage = lazy(() => import("@/pages/accessibility"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

// Layout wrapper for pages with header + footer
function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Masthead />
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

/**
 * Where a signed-in candidate lands.
 *
 * UAT-05 item 2: "the Candidate Dashboard opens directly on the Profile
 * Completion Form" until personal, educational and professional details are in.
 *
 * Two guards on that redirect, both learned the hard way:
 *  · It must not fire while the profile is still loading, or every candidate
 *    gets a flash of the form before being bounced back.
 *  · It must NOT trap a candidate who owes documents. Under Direct, `selected`
 *    is the moment six documents come due and the dashboard is the only place
 *    that lists them — sending that person back to a form they already
 *    submitted would hide the one thing they need to act on. An outstanding
 *    obligation therefore wins over an incomplete profile.
 *
 * It is a redirect, not a lock: the form's own navigation still reaches the
 * dashboard, so nobody is stuck.
 */
function CandidateEntry() {
  const { data: profileRes, isLoading: profileLoading } = useQuery<any>({ queryKey: ["/api/v1/candidates/profile"] });
  const { data: oblRes, isLoading: oblLoading } = useQuery<any>({ queryKey: ["/api/v1/candidates/documents/obligations"] });

  if (profileLoading || oblLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const profile = profileRes?.data;
  const owesDocuments = (oblRes?.data?.obligations || []).some((o: any) => !o.complete);
  const profileComplete = Boolean(profile?.profileComplete);

  if (!profileComplete && !owesDocuments) return <Redirect to="/register" />;


  return (
    <div>
      <div className="max-w-[1800px] mx-auto px-4 xl:px-8 2xl:px-12 pt-5">
        <AnnouncementBanner />
      </div>
      <CandidateDashboard />
    </div>
  );
}

function DashboardContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return <LandingPage />;

  // UAT-05 item 2 — a candidate whose profile is not yet complete lands on the
  // form, not the dashboard.
  if (user.role === "candidate") return <CandidateEntry />;

  return (
    <div>
      <div className="max-w-[1800px] mx-auto px-4 xl:px-8 2xl:px-12 pt-5">
        <AnnouncementBanner />
      </div>
      {/* HP-4c (v0.8): ONE dashboard for all candidates. Blue-collar/standard
          tiers default to its Minimal mode (few big buttons), professionals to
          Advanced; a per-user toggle switches. Navigation is state-driven, so
          the old ?full=1 fork (and its refresh-needed nav bug) is retired. */}
      {user.role === "agent" && <AgentDashboard />}
      {user.role === "employer" && <EmployerDashboard />}
      {user.role === "admin" && <AdminDashboard />}
      {user.role === "superadmin" && <SuperAdminDashboard />}
    </div>
  );
}

/**
 * /start used to be the tier chooser. UAT-05 deletes it, but it had ONE link
 * worth keeping: `?mode=assisted` deep-linked straight to the callback form,
 * and that link is in SMS messages and on printed material. Everything else
 * about /start — "choose how you want to register" — was a question the
 * candidate should never have been asked, so it just goes to the form.
 */
function LegacyStartRedirect() {
  const assisted = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("mode") === "assisted";
  return <Redirect to={assisted ? "/callback" : "/register"} />;
}

/**
 * registration.gate_browsing — UAT-05 item 2's stricter reading,
 * "before accessing other portal features".
 *
 * Audit 2026-07-19: the setting sat in the registry, visible and flippable in
 * admin, and read by NO code. A control that does nothing is worse than an
 * absent one — it teaches HPSEDC the switches are decorative.
 *
 * Enforced in ONE place, wrapping the router, so no individual screen can
 * forget it. Default OFF: a candidate who cannot see a single vacancy has no
 * reason to start the form, and browsing is what motivates registering.
 *
 * /register and /auth are always reachable, or the gate would trap the very
 * people it is redirecting.
 */
function BrowseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { capabilities } = useCapabilities();
  const [location] = useLocation();
  const enabled = capabilities.gateBrowsing && (user as any)?.role === "candidate";
  const { data: profileRes } = useQuery<any>({
    queryKey: ["/api/v1/candidates/profile"],
    enabled: Boolean(enabled),
  });

  const exempt = location.startsWith("/register") || location.startsWith("/auth")
    || location.startsWith("/callback") || location.startsWith("/help")
    || location.startsWith("/faq") || location.startsWith("/grievances");
  if (!enabled || exempt) return <>{children}</>;
  // Undefined while loading — do not redirect on a half-known answer.
  if (profileRes?.data && !profileRes.data.profileComplete) return <Redirect to="/register" />;
  return <>{children}</>;
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <BrowseGate>
      <Switch>
        <Route path="/">
          <PageLayout><DashboardContent /></PageLayout>
        </Route>
        <Route path="/home">
          <PageLayout><LandingPage /></PageLayout>
        </Route>
        <Route path="/auth">
          <div className="min-h-screen flex flex-col">
            <Masthead />
            <Header />
            <main className="flex-1"><AuthPage /></main>
          </div>
        </Route>
        <Route path="/faq">
          <PageLayout><FaqPage /></PageLayout>
        </Route>
        <Route path="/grievances">
          <PageLayout><GrievancePage /></PageLayout>
        </Route>
        {/* /profile was the old five-tab wizard (Personal · Education ·
            Experience · Skills & Prefs · Documents). Demoting it to "edit only"
            was not enough: every Edit button still landed there, so a candidate
            who registered on the new four-page form was thrown back into the old
            one to change anything — with a DIFFERENT set of fields.

            It had drifted into contradicting UAT-05 outright: no disability
            (item 12), no district/state on the permanent address (item 13), no
            Home Town (item 16), and it still showed the "where do you want to
            work" country picker that item 8 asked us to remove. It was also
            English-only, so a Hindi candidate lost their language by clicking
            Edit. Its document upload is not a loss — the dashboard and the
            compliance panel both upload, and per item 9 documents are asked for
            after shortlisting, not during profile editing.

            /register is now the single form for both first fill and edit. */}
        <Route path="/profile"><Redirect to="/register" /></Route>
        {/* UAT-05 item 3: ONE registration flow, four pages. Replaces the tier
            chooser (/start) plus the two parallel flows (/apply, /apply/pro). */}
        <Route path="/register">
          <PageLayout><RegisterPage /></PageLayout>
        </Route>
        <Route path="/callback">
          <PageLayout><CallbackPage /></PageLayout>
        </Route>
        {/* The old routes REDIRECT rather than 404. Candidates have these in
            their history, in SMS links and on printouts, and a dead link to a
            government portal reads as "the scheme is gone" — not as "the URL
            changed". They can be dropped once the logs go quiet.
            /start?mode=assisted was the callback deep-link, so it keeps its
            destination; the tier chooser it used to open no longer exists. */}
        <Route path="/apply"><Redirect to="/register" /></Route>
        <Route path="/apply/pro"><Redirect to="/register" /></Route>
        <Route path="/start"><LegacyStartRedirect /></Route>
        <Route path="/documents">
          <PageLayout><DocumentsPage /></PageLayout>
        </Route>
        <Route path="/support">
          <PageLayout><SupportPage /></PageLayout>
        </Route>
        <Route path="/help">
          <PageLayout><HelpPage /></PageLayout>
        </Route>
        <Route path="/jobs/:id">
          <PageLayout><JobDetailPage /></PageLayout>
        </Route>
        <Route path="/applications/:id">
          <PageLayout><ApplicationDetailPage /></PageLayout>
        </Route>
        <Route path="/agencies/:id">
          <PageLayout><AgencyDetailPage /></PageLayout>
        </Route>
        <Route path="/status-check">
          <PageLayout><PublicStatusCheckPage /></PageLayout>
        </Route>
        <Route path="/agent/candidates/:id">
          <PageLayout><AgentCandidateDetailPage /></PageLayout>
        </Route>
        <Route path="/agent/jobs/:id">
          <PageLayout><AgentJobDetailPage /></PageLayout>
        </Route>
        <Route path="/agent/applicants">
          <PageLayout><AgentApplicantsPage /></PageLayout>
        </Route>
        {/* v0.4.30: employer mirrors /agent/applicants — same component,
            endpoint is role-aware so it scopes to the employer's jobs. */}
        <Route path="/employer/applicants">
          <PageLayout><AgentApplicantsPage /></PageLayout>
        </Route>
        <Route path="/agent/drives/:id">
          <PageLayout><AgentDriveDetailPage /></PageLayout>
        </Route>
        <Route path="/employer/review/:id">
          <PageLayout><EmployerReviewPage /></PageLayout>
        </Route>
        <Route path="/admin/system-controls">
          <PageLayout><SystemControlsPage /></PageLayout>
        </Route>
        <Route path="/admin/operator-console">
          <PageLayout><OperatorConsolePage /></PageLayout>
        </Route>
        <Route path="/accessibility">
          <PageLayout><AccessibilityPage /></PageLayout>
        </Route>
        <Route>
          <PageLayout><NotFound /></PageLayout>
        </Route>
      </Switch>
      </BrowseGate>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <DemoSwitcher />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
