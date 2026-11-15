import { useEffect, useState, type ReactNode } from "react";
import { useSearch, Link } from "wouter";
import { Loader2, Check, Plus, Trash2 } from "lucide-react";
import { Shell, Page, useWorkspace } from "../components/Shell";

/**
 * Settings (admins) — MGC layout: a section list on the left, cards on the right.
 * Models and keys: the Anthropic key, the model and effort Ask Agentryx uses.
 * Testing: portal address, test accounts, automated-run and sign-off rules.
 * Every value is saved in Verify's database; a value in the server .env wins.
 */
type Snap = {
  values: Record<string, any>;
  models: { id: string; name: string; note: string }[];
  anthropic: { configured: boolean; source: "env" | "settings" | null; hint: string | null };
};

const SECTIONS = [
  { group: "Ask Agentryx", items: [["models", "Models and keys"]] },
  { group: "Testing", items: [["testing", "Portal and accounts"], ["runs", "Runs and sign-off"]] },
] as const;

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function Card({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700">{label}</span>
    {hint && <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
);
const field = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white";
const input = `${field} max-w-xl`;
const btn = "inline-flex items-center gap-1.5 rounded-md bg-[#14213D] text-white text-sm font-semibold px-3.5 py-2 hover:bg-[#1d2d52] disabled:opacity-50";
const btn2 = "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white text-sm text-slate-700 px-3 py-2 hover:bg-slate-50 disabled:opacity-50";

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 w-4 h-4 accent-[#14213D]" />
      <span><span className="block text-sm font-medium text-slate-800">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

function Body() {
  const { data, reload } = useWorkspace();
  const tab = new URLSearchParams(useSearch()).get("tab") ?? "models";
  const [snap, setSnap] = useState<Snap | null>(null);
  const [v, setV] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [test, setTest] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const apply = (s: Snap) => { setSnap(s); setV(s.values); };
  useEffect(() => { call("/api/settings").then(apply).catch((e) => setMsg({ ok: false, text: e.message })); }, []);

  if (!data!.me.isAdmin) return <Page title="Settings"><p className="text-slate-600">Settings are for admins.</p></Page>;
  if (!snap) return <Page title="Settings"><p className="text-slate-400">{msg?.text ?? "Loading…"}</p></Page>;

  const save = async (keys: string[], extra?: Record<string, any>) => {
    setBusy(true); setMsg(null);
    try {
      const body = { ...Object.fromEntries(keys.map((k) => [k, v[k]])), ...extra };
      apply(await call("/api/settings", { method: "PUT", body: JSON.stringify(body) }));
      setMsg({ ok: true, text: "Saved." }); reload();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const runTest = async (model?: string) => {
    setTesting(true); setTest(null);
    try { setTest(await call("/api/settings/ai/test", { method: "POST", body: JSON.stringify({ model }) })); }
    catch (e: any) { setTest({ ok: false, error: e.message }); } finally { setTesting(false); }
  };
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const a = snap.anthropic;
  const accounts: { role: string; username: string }[] = v["testing.accounts"] ?? [];

  return (
    <Page title="Settings" sub="Configuration for Ask Agentryx and testing. Changes take effect at once; each one is recorded in the audit trail.">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] items-start">
        <nav className="lg:sticky lg:top-32 space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.group}>
              <div className="px-3 text-[11px] font-bold tracking-[0.14em] uppercase text-slate-500">{s.group}</div>
              <div className="mt-1 space-y-0.5">
                {s.items.map(([id, label]) => (
                  <Link key={id} href={`/settings?tab=${id}`} onClick={() => { setMsg(null); setTest(null); }}
                    className={`block px-3 py-2 rounded-md text-sm ${tab === id ? "bg-[#E2E7F3] text-[#14213D] font-semibold shadow-[inset_3px_0_0_#14213D]" : "text-slate-700 hover:bg-slate-100"}`}>{label}</Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-6 min-w-0 max-w-4xl">
          {msg && <div className={`rounded-md border px-4 py-2.5 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg.text}</div>}

          {tab === "models" && (<>
            <Card title="Status" sub="Whether Ask Agentryx writes answers itself, or only shows matching passages and waits for an admin.">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={`font-semibold rounded-full px-2.5 py-0.5 border ${data!.ai ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>{data!.ai ? "AI answers on" : "AI answers off"}</span>
                <span className="text-slate-600">{!a.configured ? "No Anthropic key yet — add one below." : !v["ai.enabled"] ? "A key is set, but AI answers are switched off." : `Using ${snap.models.find((m) => m.id === v["ai.model"])?.name ?? v["ai.model"]}.`}</span>
              </div>
              <div className="mt-4"><Toggle on={!!v["ai.enabled"]} onChange={(x) => { set("ai.enabled", x); save([], { "ai.enabled": x }); }} label="Let Ask Agentryx write answers" hint="When off, testers see the matching guide passages and their question goes to the admin inbox." /></div>
            </Card>

            <Card title="Provider" sub="Anthropic. Use a paid plan, under which our data is not used for training.">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 border-b border-slate-100"><th className="py-2 pr-4 font-medium">Name</th><th className="py-2 pr-4 font-medium">Key</th><th className="py-2 pr-4 font-medium">Source</th><th /></tr></thead>
                <tbody><tr>
                  <td className="py-3 pr-4 font-semibold text-slate-900">Anthropic</td>
                  <td className="py-3 pr-4 font-mono text-slate-700">{a.hint ?? <span className="font-sans text-slate-400">not set</span>}</td>
                  <td className="py-3 pr-4 text-slate-600">{a.source === "env" ? "Server .env (wins over this page)" : a.source === "settings" ? "Saved here" : "—"}</td>
                  <td className="py-3 text-right whitespace-nowrap space-x-2">
                    <button className={btn2} disabled={!a.configured || testing} onClick={() => runTest()}>{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Test connection</button>
                    {a.source === "settings" && <button className={btn2} disabled={busy} onClick={() => save([], { "ai.anthropic_key": "" })}>Remove</button>}
                  </td>
                </tr></tbody>
              </table>
              {test && (
                <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${test.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {test.ok ? <><Check className="w-4 h-4 inline -mt-0.5" /> Connected to {test.model} — replied “{test.reply}” in {(test.ms / 1000).toFixed(1)} s.</> : <>Failed{test.model ? ` on ${test.model}` : ""}: {test.error}</>}
                </div>
              )}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Field label={a.hint ? "Replace the key" : "Add the key"} hint="From console.anthropic.com → API keys. It is stored on the Verify server and only its last four characters are ever shown.">
                  <div className="flex flex-wrap gap-2">
                    <input type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="sk-ant-…" className={`${input} font-mono`} aria-label="Anthropic API key" />
                    <button className={btn} disabled={busy || newKey.trim().length < 20} onClick={async () => { await save([], { "ai.anthropic_key": newKey.trim() }); setNewKey(""); }}>Save key</button>
                  </div>
                </Field>
                {a.source === "env" && <p className="text-xs text-amber-800 mt-2">The server .env has a key, so it is used instead of one saved here.</p>}
              </div>
            </Card>

            <Card title="Model" sub="Which Claude model writes the answers, and how hard it thinks.">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {snap.models.map((m) => (
                    <label key={m.id} className={`rounded-md border p-3 cursor-pointer ${v["ai.model"] === m.id ? "border-[#14213D] bg-[#F1F4FA]" : "border-slate-200 hover:border-slate-400"}`}>
                      <input type="radio" name="model" className="sr-only" checked={v["ai.model"] === m.id} onChange={() => set("ai.model", m.id)} />
                      <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">{m.id}</div>
                      <div className="text-xs text-slate-600 mt-1">{m.note}</div>
                    </label>
                  ))}
                </div>
                <Field label="Effort" hint="Low is quick and cheap and enough for how-to questions; high reasons longer.">
                  <select value={v["ai.effort"]} onChange={(e) => set("ai.effort", e.target.value)} className={`${field} max-w-[200px]`}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} disabled={busy} onClick={() => save(["ai.model", "ai.effort"])}>Save model</button>
                  <button className={btn2} disabled={!a.configured || testing} onClick={() => runTest(v["ai.model"])}>Test this model</button>
                </div>
              </div>
            </Card>
          </>)}

          {tab === "testing" && (<>
            <Card title="Portal" sub="Where testers do the cases. Used by the Lite portal button, the case pages and the Claude in Chrome instructions.">
              <Field label="Portal address"><input value={v["testing.portal_url"]} onChange={(e) => set("testing.portal_url", e.target.value)} className={input} /></Field>
              <div className="mt-4"><button className={btn} disabled={busy} onClick={() => save(["testing.portal_url"])}>Save</button></div>
            </Card>
            <Card title="Test accounts" sub="Shown under Test accounts (top right) for every tester.">
              <div className="space-y-2">
                {accounts.map((ac, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-center">
                    <input aria-label="Role" value={ac.role} onChange={(e) => set("testing.accounts", accounts.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} className={`${field} max-w-[220px]`} placeholder="Role" />
                    <input aria-label="Username" value={ac.username} onChange={(e) => set("testing.accounts", accounts.map((x, j) => j === i ? { ...x, username: e.target.value } : x))} className={`${field} max-w-[240px] font-mono`} placeholder="username" />
                    <button className="p-2 text-slate-400 hover:text-rose-600" aria-label="Remove account" onClick={() => set("testing.accounts", accounts.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline" onClick={() => set("testing.accounts", [...accounts, { role: "", username: "" }])}><Plus className="w-4 h-4" /> Add an account</button>
              </div>
              <div className="mt-4"><Field label="Shared password" hint="The demo accounts' password, shown to testers."><input value={v["testing.password"]} onChange={(e) => set("testing.password", e.target.value)} className={`${field} max-w-[240px] font-mono`} /></Field></div>
              <div className="mt-4"><button className={btn} disabled={busy} onClick={() => save(["testing.accounts", "testing.password"], { "testing.accounts": accounts.filter((x) => x.role.trim() && x.username.trim()) })}>Save accounts</button></div>
            </Card>
            <Card title="Mobile app note" sub="The line shown on the Dashboard about the mobile app. Leave it empty to hide it.">
              <textarea rows={2} value={v["testing.mobile_note"]} onChange={(e) => set("testing.mobile_note", e.target.value)} className={input} />
              <div className="mt-3"><button className={btn} disabled={busy} onClick={() => save(["testing.mobile_note"])}>Save</button></div>
            </Card>
          </>)}

          {tab === "runs" && (<>
            <Card title="Automated runs" sub="Browser checks on a throw-away copy of the Lite portal.">
              <div className="space-y-4">
                <Toggle on={!!v["testing.testers_can_run"]} onChange={(x) => set("testing.testers_can_run", x)} label="Agentryx testers can start runs" hint="When off, only admins can start them; testers still see the results." />
                <Field label="Stop a run after (minutes)" hint="A full run takes about 6 minutes. Allowed: 5–120.">
                  <input type="number" min={5} max={120} value={v["testing.run_timeout_min"]} onChange={(e) => set("testing.run_timeout_min", Number(e.target.value))} className={`${field} max-w-[120px]`} />
                </Field>
                <button className={btn} disabled={busy} onClick={() => save(["testing.testers_can_run", "testing.run_timeout_min"])}>Save</button>
              </div>
            </Card>
            <Card title="Sign-off" sub="Rules for recording a result on a case.">
              <div className="space-y-4">
                <Toggle on={!!v["testing.fail_note_required"]} onChange={(x) => set("testing.fail_note_required", x)} label="A Fail needs a note" hint="The tester must say what went wrong before saving a Fail." />
                <button className={btn} disabled={busy} onClick={() => save(["testing.fail_note_required"])}>Save</button>
              </div>
            </Card>
          </>)}
        </div>
      </div>
    </Page>
  );
}

export function Settings() {
  return <Shell title="Settings"><Body /></Shell>;
}
