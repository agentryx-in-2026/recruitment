/**
 * HL-002: the password-reset email links to /reset-password?token=…, but no
 * page existed there, so the link opened a blank 404. This page takes the
 * token from the link, asks for the new password twice and calls
 * POST /api/v1/auth/reset-password (same rules as Create Account).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, KeyRound, Loader2, AlertTriangle } from "lucide-react";

const RULES = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strong = RULES.every((r) => r.test(pw));
  const match = pw === pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!strong) return setError(t("auth.passwordRule"));
    if (!match) return setError(t("auth.passwordsMismatch"));
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      if (res.ok) setDone(true);
      else {
        const j = await res.json().catch(() => ({} as any));
        setError(j?.error?.message || t("auth.resetLinkInvalid"));
      }
    } catch {
      setError(t("auth.resetLinkInvalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-blue-700" /> {t("auth.resetPassword")}</CardTitle>
          {!done && token && <CardDescription>{t("auth.chooseNewPassword")}</CardDescription>}
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {t("auth.resetLinkInvalid")}</p>
              <Button className="w-full" onClick={() => setLocation("/auth")}>{t("auth.backToSignIn")}</Button>
            </div>
          ) : done ? (
            <div className="text-center space-y-4 py-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <p className="text-base font-medium">{t("auth.passwordChanged")}</p>
              <Button className="w-full" onClick={() => setLocation("/auth")}>{t("auth.backToSignIn")}</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="np">{t("auth.newPassword")}</label>
                <Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("auth.minPassword")} />
                <p className={`mt-1 text-xs ${pw && !strong ? "text-red-600" : "text-muted-foreground"}`}>{t("auth.passwordRule")}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="np2">{t("auth.confirmPassword")}</label>
                <Input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                {pw2 && !match && <p className="mt-1 text-xs text-red-600">{t("auth.passwordsMismatch")}</p>}
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !pw || !pw2}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {t("auth.setNewPassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
