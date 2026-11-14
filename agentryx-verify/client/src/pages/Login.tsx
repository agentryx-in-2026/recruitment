import { useState } from "react";
import { Header } from "../components/Header";
import { api } from "../lib/api";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api.login(username.trim(), password);
      // Return to where the reader was going (same-site paths only).
      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (e: any) {
      setErr("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header />
      <div className="max-w-md mx-auto mt-16 bg-white border border-slate-200 rounded-lg p-8">
        <h1 className="text-2xl font-semibold">Reviewer sign-in</h1>
        <p className="text-sm text-slate-500 mt-1">Enter your reviewer credentials to record Pass / Partial / Fail decisions.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Username</label>
            <input
              type="text" placeholder="e.g. htis" required autoFocus autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password" placeholder="••••••••" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
            />
          </div>
          <button type="submit" disabled={busy || !username || !password}
            className="w-full bg-agentryx-600 hover:bg-agentryx-700 text-white rounded px-4 py-2 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </form>

        <div className="mt-6 text-xs text-slate-500 border-t border-slate-100 pt-4">
          <div className="font-medium text-slate-700 mb-1">Need credentials?</div>
          Contact your project admin or Agentryx delivery for sign-in details.
        </div>
      </div>
    </div>
  );
}
