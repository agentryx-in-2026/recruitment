import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Home, Briefcase, User as UserIcon, Search, Bell,
  Shield, FileText, HelpCircle, Globe, Menu, X, ChevronDown,
  Moon, Sun, CheckSquare, LayoutDashboard, KeyRound
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/shared/change-password-dialog";
import { useLocation } from "wouter";
import { NotificationsDrawer } from "@/components/layout/notifications-drawer";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [isDark, setIsDark] = useState(typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  const { t, i18n } = useTranslation();

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("hs-theme", next ? "dark" : "light");
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "en" ? "hi" : "en";
    i18n.changeLanguage(newLang);
    localStorage.setItem("hirestream-lang", newLang);
  };

  const roleLabel: Record<string, string> = {
    candidate: "Job Seeker",
    agent: "Recruitment Agency",
    employer: "Employer",
    admin: "Administrator",
    superadmin: "Super Admin",
  };

  const roleColor: Record<string, string> = {
    candidate: "bg-blue-100 text-blue-700",
    agent: "bg-emerald-100 text-emerald-700",
    employer: "bg-purple-100 text-purple-700",
    admin: "bg-red-100 text-red-700",
    superadmin: "bg-amber-100 text-amber-700",
  };

  // Navigation links based on auth state
  const publicLinks = [
    { label: t("nav.home"), href: "/", icon: <Home className="w-4 h-4" /> },
    { label: t("nav.faq"), href: "/faq", icon: <HelpCircle className="w-4 h-4" /> },
  ];

  const authedLinks = [
    { label: t("nav.home"),       href: "/home",       icon: <Home className="w-4 h-4" /> },
    { label: t("nav.dashboard"),  href: "/",           icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: t("nav.faq"),        href: "/faq",        icon: <HelpCircle className="w-4 h-4" /> },
    { label: t("nav.grievances"), href: "/grievances", icon: <FileText className="w-4 h-4" /> },
  ];

  // Hide the link for the page you're already on — no self-references in the nav.
  const navLinks = (!user ? publicLinks : authedLinks).filter((l) => l.href !== location);

  // Initials avatar
  const initials = (user?.username || "?").split(/[@.]/).map(s => s[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-orange-600", "bg-rose-600"];
  const avatarColor = avatarColors[(user?.username || "").length % avatarColors.length];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12">
        <div className="flex justify-between items-center h-16">
          {/* Logo + Brand */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => setLocation(user ? "/home" : "/")}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              title="Go to homepage"
            >
              <img src="/hpsedc-logo.png" alt="HPSEDC" className="w-[58px] h-[58px] rounded-lg object-contain" />
              <div className="hidden sm:block text-left">
                <h1 className="text-lg font-bold text-gray-900 leading-tight">HireStream</h1>
                <p className="text-[10px] text-gray-500 leading-tight">HPSEDC Overseas Placement</p>
              </div>
            </button>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => setLocation(link.href)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  {link.icon}
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Agentryx Verify — Scope Verification & UAT Portal (testing; hidden in production) */}
            <a
              href="https://verify-stg.agentryx.dev/p/hirestream-v1.4"
              target="_blank"
              rel="noopener noreferrer"
              title="Agentryx Verify — Scope Verification & UAT"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-xs font-semibold text-amber-700"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Verify</span>
            </a>

            {/* Font Size Toggle (GIGW accessibility) */}
            <div className="hidden sm:flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => { document.documentElement.style.fontSize = "16px"; localStorage.setItem("hs-font", "16"); }}
                className="px-2 py-1.5 text-xs hover:bg-gray-100 transition-colors" title="Standard">A</button>
              <button onClick={() => { document.documentElement.style.fontSize = "19px"; localStorage.setItem("hs-font", "19"); }}
                className="px-2 py-1.5 text-sm hover:bg-gray-100 border-x border-gray-200 transition-colors" title="Large">A</button>
              <button onClick={() => { document.documentElement.style.fontSize = "24px"; localStorage.setItem("hs-font", "24"); }}
                className="px-2 py-1.5 text-lg hover:bg-gray-100 transition-colors" title="Extra Large">A</button>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDark}
              className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors"
              title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="px-2.5 py-1.5 rounded-md text-xs font-bold border border-gray-200 hover:bg-gray-100 transition-colors"
              title={i18n.language === "en" ? "हिंदी में बदलें" : "Switch to English"}
            >
              {i18n.language === "en" ? "हिं" : "EN"}
            </button>

            {user ? (
              <>
                {/* Notifications */}
                <NotificationsDrawer />

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className={`w-8 h-8 ${avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                        {initials}
                      </div>
                      <div className="hidden sm:block text-left">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{user.username?.split('@')[0]}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${roleColor[user.role] || ''}`}>
                          {roleLabel[user.role] || user.role}
                        </Badge>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="text-xs text-gray-500">
                      {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation("/")}>
                      <Home className="w-4 h-4 mr-2" /> Dashboard
                    </DropdownMenuItem>
                    {user.role === "candidate" && (
                      <DropdownMenuItem onClick={() => setLocation("/profile")}>
                        <UserIcon className="w-4 h-4 mr-2" /> My Profile
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
                      <KeyRound className="w-4 h-4 mr-2" /> Change Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => logoutMutation.mutate()}
                      className="text-red-600"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
              </>
            ) : (
              <Button
                onClick={() => setLocation("/auth")}
                size="sm"
                className="bg-blue-700 text-white hover:bg-blue-800"
              >
                <UserIcon className="w-4 h-4 mr-1" /> Sign In
              </Button>
            )}

            {/* Mobile Menu Toggle */}
            {/* audit 2026-07-06 (Batch 3): icon-only hamburger needed an aria-label */}
            <button
              className="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              aria-label={mobileMenuOpen ? t("shell.menuClose") : t("shell.menuOpen")}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => { setLocation(link.href); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.icon}
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
