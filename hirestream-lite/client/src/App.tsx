import "./lib/i18n"; // Initialize i18n before anything else
import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
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
const ProfileWizard = lazy(() => import("@/pages/profile-wizard"));
const SimpleApply = lazy(() => import("@/pages/simple-apply"));
const RegisterStart = lazy(() => import("@/pages/register-start"));
const SimpleApplyPro = lazy(() => import("@/pages/simple-apply-pro"));
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

  return (
    <div>
      <div className="max-w-[1800px] mx-auto px-4 xl:px-8 2xl:px-12 pt-5">
        <AnnouncementBanner />
      </div>
      {/* HP-4c (v0.8): ONE dashboard for all candidates. Blue-collar/standard
          tiers default to its Minimal mode (few big buttons), professionals to
          Advanced; a per-user toggle switches. Navigation is state-driven, so
          the old ?full=1 fork (and its refresh-needed nav bug) is retired. */}
      {user.role === "candidate" && <CandidateDashboard />}
      {user.role === "agent" && <AgentDashboard />}
      {user.role === "employer" && <EmployerDashboard />}
      {user.role === "admin" && <AdminDashboard />}
      {user.role === "superadmin" && <SuperAdminDashboard />}
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/profile">
          <PageLayout><ProfileWizard /></PageLayout>
        </Route>
        <Route path="/apply">
          <PageLayout><SimpleApply /></PageLayout>
        </Route>
        <Route path="/start">
          <PageLayout><RegisterStart /></PageLayout>
        </Route>
        <Route path="/apply/pro">
          <PageLayout><SimpleApplyPro /></PageLayout>
        </Route>
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
