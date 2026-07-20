/**
 * UAT-05 item 1 — the candidate-facing half of email verification.
 *
 * The server side shipped first: registration mails a code, and applying is
 * blocked with 403 EMAIL_NOT_VERIFIED until it is confirmed. Nothing was ever
 * built to ENTER that code. The block message even told candidates to "request
 * a new one from your dashboard", where no such control existed — and on the
 * job page the apply mutation had no onError, so the button simply did nothing.
 * A rule the user cannot satisfy is worse than no rule: it reads as a broken
 * portal, and HPSEDC's applicants have no support channel to ask why.
 *
 * Shown only while unverified, and only to candidates. Six digits, resend with
 * a cooldown so a slow inbox is recoverable, and a clear statement of what is
 * actually blocked — browsing is not.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailWarning, Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const email = (user as any)?.email as string | undefined;
  const verified = (user as any)?.emailVerified as boolean | undefined;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const verify = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp: code.trim(), purpose: "register" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || "That code did not match. Check it and try again.");
      return body;
    },
    onSuccess: () => {
      toast({ title: "Email confirmed", description: "You can apply for jobs now." });
      // The gate reads off the session user, so both have to be refetched.
      qc.invalidateQueries({ queryKey: ["/api/v1/candidates/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
      setCode("");
    },
    onError: (e: any) => toast({ title: "Could not confirm", description: e.message, variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, purpose: "register" }),
      });
      if (!res.ok) throw new Error("Could not send a new code. Please try again shortly.");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "New code sent", description: `Check ${email}. It can take a minute to arrive.` });
      setCooldown(30);
      const t = setInterval(() => setCooldown((c) => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
    },
    onError: (e: any) => toast({ title: "Could not resend", description: e.message, variant: "destructive" }),
  });

  // MUST come after every hook above — an early return before useMutation
  // changes the hook count between renders and throws React #300 the moment a
  // candidate verifies and the component switches to hidden. Same class of bug
  // as the #310 in candidate-dashboard earlier; hooks first, branching after.
  //
  // `verified` is undefined while auth is in flight, so only an explicit false
  // shows the banner — otherwise already-verified candidates get a flash of a
  // scary message on every load.
  if (verified !== false || !email) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-4">
      <div className="flex items-start gap-3">
        <MailWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Confirm your email address</p>
          <p className="text-xs text-amber-800 mt-0.5">
            We sent a 6-digit code to <span className="font-semibold">{email}</span>. You can browse jobs without it,
            but you will need to confirm before you can apply — it is how HPSEDC reach you about an interview or an offer.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              aria-label="6-digit verification code"
              className="h-10 w-36 text-sm bg-white"
            />
            <Button
              size="sm"
              className="h-10"
              disabled={code.trim().length !== 6 || verify.isPending}
              onClick={() => verify.mutate()}
            >
              {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1" /> Confirm</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 bg-white"
              disabled={resend.isPending || cooldown > 0}
              onClick={() => resend.mutate()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : resend.isPending ? "Sending…" : "Send a new code"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
