import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, loginSchema } from "@shared/validators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  User, Briefcase, Building2, Shield, Globe, Lock, Mail, Eye, EyeOff,
  ArrowLeft, Loader2, CheckSquare, Square, Sparkles, ChevronDown
} from "lucide-react";
import { DemoCastTabs, useDemoLogin, DemoResetButton } from "@/components/demo/demo-cast-ui";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  // Demo panel is collapsed by default so the real Sign-in / Create-account
  // form is what visitors see first. "Demo Mode" pulls the cast panel down.
  const [demoOpen, setDemoOpen] = useState(false);

  if (user) {
    setTimeout(() => setLocation("/"), 0);
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col lg:flex-row">
      {/* Left panel — branding with animated gradient */}
      <div className="lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-900 text-white p-8 lg:p-16 flex flex-col justify-center">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-40" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />

        <div className="relative max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden">
              <img src="/hpsedc-logo.png" alt="HPSEDC" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">HireStream</h1>
              <p className="text-blue-200 text-xs">HPSEDC Overseas Placement Portal</p>
            </div>
          </div>

          {/* Indian tricolor accent */}
          <div className="flex gap-1 mb-6 w-20">
            <div className="flex-1 h-1 rounded-full bg-[#FF9933]" />
            <div className="flex-1 h-1 rounded-full bg-white" />
            <div className="flex-1 h-1 rounded-full bg-[#138808]" />
          </div>

          <h2 className="text-2xl md:text-3xl lg:text-[2.25rem] font-bold mb-4 leading-[1.35] pb-1 text-white">
            {t("landing.hero")}
          </h2>
          <p className="text-blue-100 text-base mb-8 leading-relaxed">
            {t("landing.heroDesc")}
          </p>

          {/* audit 2026-07-06 (Batch 3): wired to existing landing.* keys — was hardcoded English */}
          <div className="space-y-4">
            <FeatureItem icon={<User className="w-5 h-5" />} title={t("landing.jobSeekers")} desc={t("landing.jobSeekersDesc")} />
            <FeatureItem icon={<Briefcase className="w-5 h-5" />} title={t("landing.recruitmentAgencies")} desc={t("landing.recruitmentAgenciesDesc")} />
            <FeatureItem icon={<Building2 className="w-5 h-5" />} title={t("landing.employers")} desc={t("landing.employersDesc")} />
            <FeatureItem icon={<Shield className="w-5 h-5" />} title={t("landing.govOversight")} desc={t("landing.govOversightDesc")} />
          </div>

          {/* Footer note */}
          <div className="mt-10 pt-6 border-t border-white/10 flex items-center gap-2 text-xs text-blue-200/80">
            <img src="/hpsedc-logo.png" alt="HPSEDC" className="w-5 h-5 object-contain" />
            <span>{t("auth.verifiedInitiative")}</span>
          </div>
        </div>
      </div>

      {/* Right panel — auth forms */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-16 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <Card className="w-full max-w-md shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-2xl">
          <CardHeader className="text-center pb-4 pt-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <User className="w-7 h-7 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">{t("auth.welcome")}</CardTitle>
            <CardDescription className="text-slate-500">
              {t("auth.signInDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            {/* Demo Mode toggle — collapsed by default; pulls the cast panel down */}
            <button
              type="button"
              onClick={() => setDemoOpen((o) => !o)}
              aria-expanded={demoOpen}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold py-2.5 transition-colors ${demoOpen ? "border-amber-300 bg-amber-100 text-amber-900 mb-3" : "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 mb-5"}`}
            >
              <Sparkles className="w-4 h-4" />
              {demoOpen ? "Hide demo logins" : "Demo Mode — one-click logins"}
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${demoOpen ? "rotate-180" : ""}`} />
            </button>
            {/* Collapsible cast panel (grid-rows trick → smooth height animation) */}
            <div className={`grid transition-all duration-300 ease-out ${demoOpen ? "grid-rows-[1fr] opacity-100 mb-5" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <QuickLoginPanel />
              </div>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100/80 p-1 rounded-xl">
                <TabsTrigger value="login" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("auth.signInTab")}</TabsTrigger>
                <TabsTrigger value="register" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("auth.createTab")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <LoginForm />
              </TabsContent>

              <TabsContent value="register">
                <RegisterForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Demo Panel — curated cast, one-click login (testing mode) ──
function QuickLoginPanel() {
  const { login, loadingUser } = useDemoLogin();
  return (
    <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/50">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white uppercase tracking-wide">Demo</span>
        <p className="text-xs font-semibold text-amber-900">One-click demo login — pick a cast member</p>
      </div>
      <DemoCastTabs onLogin={login} loadingUser={loadingUser} />
      <div className="mt-3 pt-2.5 border-t border-amber-200/70 flex items-center justify-between gap-2">
        <span className="text-[10px] text-amber-700">Tested the flow? Restore the clean state →</span>
        <DemoResetButton />
      </div>
      <p className="text-[10px] text-amber-700/80 mt-2">
        Disable via Super Admin → Feature Flags → <code className="bg-white/60 px-1 rounded">feature.quick_login_enabled</code> before production launch.
      </p>
    </div>
  );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-white/20 transition-colors">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-blue-200/80 text-xs leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function LoginForm() {
  const { loginMutation } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [captchaChecked, setCaptchaChecked] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (data: any) => {
    loginMutation.mutate(data, {
      onError: (err: any) => {
        toast({ title: t("auth.loginFailed"), description: err.message, variant: "destructive" });
      },
    });
  };

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.email")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="name@example.com" className="pl-10" autoComplete="off" maxLength={120} {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>{t("auth.password")}</FormLabel>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {t("auth.forgotPassword")}
                </button>
              </div>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    autoComplete="off"
                    maxLength={128}
                    className="pl-10 pr-10"
                    {...field}
                  />
                  {/* audit 2026-07-06 (Batch 3): icon-only toggle needed an aria-label */}
                  <button
                    type="button"
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* CAPTCHA (HTIS T6 compliance) */}
        {/* audit 2026-07-06 (C13): was a div onClick — keyboard users couldn't
            check it and so couldn't sign in. Now a real, focusable checkbox button. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={captchaChecked}
          aria-label={t("auth.captchaAria")}
          className={`w-full flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${captchaChecked ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
          onClick={() => setCaptchaChecked(!captchaChecked)}
        >
          {captchaChecked ? (
            <CheckSquare className="w-5 h-5 text-emerald-600" />
          ) : (
            <Square className="w-5 h-5 text-gray-400" />
          )}
          <span className="text-sm text-gray-700">{t("auth.notARobot")}</span>
          <div className="ml-auto text-[10px] text-gray-400 text-right leading-tight">
            <div className="font-medium">{t("auth.captcha")}</div>
            <div>{t("auth.securityCheck")}</div>
          </div>
        </button>

        <Button type="submit"
          className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
          disabled={loginMutation.isPending || !captchaChecked}>
          {loginMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("auth.signingIn")}</>
          ) : (
            t("auth.signInTab")
          )}
        </Button>
      </form>
    </Form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm({
    resolver: zodResolver(z.object({ email: z.string().email() })),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSent(true);
        toast({ title: t("auth.emailSent"), description: t("auth.emailSentDesc") });
      } else {
        // audit 2026-07-06 (C15): a 429/500 used to end the spinner with no feedback
        const err = await res.json().catch(() => ({} as any));
        toast({
          title: t("auth.resetFailed"),
          description: err?.error?.message || err?.message || `Request failed (${res.status}). Please try again later.`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t("common.error"), description: t("auth.resetFailedDesc"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4 py-4">
        <Mail className="w-12 h-12 text-blue-600 mx-auto" />
        <h3 className="text-lg font-semibold">{t("auth.checkEmail")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("auth.checkEmailDesc")}
        </p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("auth.backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> {t("auth.backToSignIn")}
      </button>
      <h3 className="text-lg font-semibold">{t("auth.resetPassword")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("auth.resetDesc")}
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="name@example.com" className="pl-10" autoComplete="off" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("auth.sending")}</>
            ) : (
              t("auth.sendResetLink")
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}

function RegisterForm() {
  const { registerMutation } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  // HP-3: only offer the roles this deployment opens for self-registration.
  // Single-agency HP hides Employer + Agency; flip the server capability.*
  // flags to re-expand into a marketplace.
  const { capabilities } = useCapabilities();
  const [showPassword, setShowPassword] = useState(false);
  // v0.7.6.1 (FB-2026-0007) — confirm-password field. Catches typo lockouts
  // before account creation. Match is enforced client-side; the server still
  // only sees `password`.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", role: "candidate" },
  });

  const selectedRole = form.watch("role");
  const password = form.watch("password");
  const passwordsMatch = !confirmPassword || confirmPassword === password;

  const onSubmit = (data: any) => {
    if (data.password !== confirmPassword) {
      setConfirmTouched(true);
      toast({ title: t("auth.passwordsMismatchTitle"), description: t("auth.passwordsMismatchDesc"), variant: "destructive" });
      return;
    }
    registerMutation.mutate({ ...data, username: data.email }, {
      // security 2026-07-07 (A07-1): the register API no longer reveals
      // "user already exists" (enumeration). When it returns the neutral
      // success (no user object / no session), surface its guidance instead
      // of silently doing nothing.
      onSuccess: (res: any) => {
        if (!res?.data?.id && res?.data?.message) {
          toast({ title: t("auth.registerTitle", "Registration"), description: res.data.message });
        }
      },
      onError: (err: any) => {
        toast({ title: t("auth.registrationFailed"), description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.registerAs")}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t("auth.selectRole")} />
                  </SelectTrigger>
                </FormControl>
                {/* audit 2026-07-06 (Batch 3): role options + descriptions come from roles.* */}
                <SelectContent>
                  <SelectItem value="candidate">
                    <span className="flex items-center gap-2"><User className="h-4 w-4" /> {t("roles.candidate")}</span>
                  </SelectItem>
                  {capabilities.agencySelfRegistration && (
                    <SelectItem value="agent">
                      <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> {t("roles.agent")}</span>
                    </SelectItem>
                  )}
                  {capabilities.employerSelfRegistration && (
                    <SelectItem value="employer">
                      <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> {t("roles.employer")}</span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t(`roles.${selectedRole}Desc`)}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.fullName")}</FormLabel>
              <FormControl>
                <Input placeholder={t("auth.fullNamePlaceholder")} maxLength={100} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.email")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="name@example.com" maxLength={120} className="pl-10" autoComplete="off" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.password")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.minPassword")}
                    maxLength={128}
                    className="pl-10 pr-10"
                    {...field}
                  />
                  {/* audit 2026-07-06 (Batch 3): icon-only toggle needed an aria-label */}
                  <button
                    type="button"
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <p className="text-xs text-muted-foreground mt-1">
                {t("auth.passwordRule")}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* v0.7.6.1 — Confirm password (FB-2026-0007). Client-only validation;
            server still only receives `password`. */}
        <FormItem>
          <FormLabel htmlFor="confirmPassword">{t("auth.confirmPassword")}</FormLabel>
          <FormControl>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.confirmPlaceholder")}
                maxLength={128}
                className="pl-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                aria-invalid={confirmTouched && !passwordsMatch}
                autoComplete="new-password"
              />
            </div>
          </FormControl>
          {confirmTouched && !passwordsMatch && (
            <p className="text-xs text-red-600 mt-1">{t("auth.passwordsMismatch")}</p>
          )}
        </FormItem>

        <Button type="submit"
          className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
          disabled={registerMutation.isPending || !passwordsMatch || !confirmPassword}>
          {registerMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("auth.creatingAccount")}</>
          ) : (
            t("auth.createTab")
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground mt-2">
          {t("auth.terms")}
        </p>
      </form>
    </Form>
  );
}
