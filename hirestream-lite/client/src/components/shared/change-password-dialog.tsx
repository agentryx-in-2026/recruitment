import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One number", test: (v: string) => /\d/.test(v) },
  { label: "One special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);

  const passed = RULES.map((r) => r.test(next));
  const allRulesPass = passed.every(Boolean);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && allRulesPass && matches && next !== current && !busy;

  function reset() {
    setCurrent(""); setNext(""); setConfirm(""); setShowNext(false);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message || body?.message || "Could not change password");
      }
      toast({ title: "Password changed", description: "Other sessions have been signed out for security." });
      reset(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Change failed", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" /> Change Password
          </DialogTitle>
          <DialogDescription>
            Pick a strong password. Other devices where you're signed in will be signed out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Current password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                maxLength={128} className="pl-10" autoComplete="current-password" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">New password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input type={showNext ? "text" : "password"} value={next}
                onChange={(e) => setNext(e.target.value)} maxLength={128}
                className="pl-10 pr-10" autoComplete="new-password" />
              <button type="button" onClick={() => setShowNext(!showNext)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700">
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Confirm new password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input type={showNext ? "text" : "password"} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} maxLength={128}
                className="pl-10" autoComplete="new-password" />
            </div>
            {confirm.length > 0 && !matches && (
              <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Rules</p>
            <ul className="space-y-0.5 text-xs">
              {RULES.map((r, i) => (
                <li key={r.label} className={passed[i] ? "text-emerald-700" : "text-slate-500"}>
                  {passed[i] ? "✓" : "○"} {r.label}
                </li>
              ))}
              {current && next && current === next && (
                <li className="text-red-600">× New password must differ from current</li>
              )}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Change Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
