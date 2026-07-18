#!/usr/bin/env node
/**
 * Deep smoke / health harness — repeatable, environment-agnostic.
 *
 * Runs against ANY running HireStream instance (no test DB needed). Three layers:
 *   1. AUTH       — every role logs in; bad creds + unauthenticated are rejected.
 *   2. ROUTE      — every role's GET endpoints respond without 5xx, with the
 *                   {success:true} envelope (catches the agency /documents 404
 *                   route-shadow class of bug).
 *   3. AUTHZ      — negative matrix: a role is DENIED (401/403) on another
 *                   role's protected endpoints (catches privilege-escalation /
 *                   "role X reads role Y's data" bugs).
 *
 * Usage:
 *   npm run smoke            # this fork's deployment (hirestream-lite)
 *   npm run smoke:local      # this fork's local server (port 5004)
 *   DEEP_URL=<url> node scripts/deep-smoke.mjs
 *
 * DEEP_URL is REQUIRED — it used to default to hirestream-stg.agentryx.dev,
 * which is a DIFFERENT PORTAL. There are four look-alike HPSEDC-branded portals
 * (hirestream-lite :5004, hirestream-hp :5003, hirestream-stg, hptourism-stg),
 * so a forgotten env var did not fail — it silently smoked someone else's
 * system and reported the result as if it were yours. Every run now prints the
 * target and its /api/v1/version banner before doing anything, because "which
 * portal am I even looking at" has already cost real time more than once.
 *
 * Needs, on the target:
 *   DEEP_SMOKE_TOKEN=<secret>   — gates /api/v1/__routes (route autodiscovery)
 *   DEEP_ROUTES_DEBUG=1         — required only when NODE_ENV=production, which
 *                                 otherwise omits __routes entirely (the SPA
 *                                 catch-all then returns HTML and the harness
 *                                 dies on `Unexpected token '<'`).
 *
 * Credentials come from env (DEEP_PW_<ROLE>) or fall back to the seed defaults.
 * Exit code 1 if any FAIL — safe to wire into CI / a pre-release gate.
 */

if (!process.env.DEEP_URL) {
  console.error("FATAL: DEEP_URL is not set.\n" +
    "  Refusing to guess — four look-alike portals run side by side and the old\n" +
    "  default (hirestream-stg) would smoke the wrong one and look like it passed.\n" +
    "  Use `npm run smoke` / `npm run smoke:local`, or set DEEP_URL explicitly.");
  process.exit(1);
}
const BASE = process.env.DEEP_URL.replace(/\/$/, "");

// Sessions are Secure cookies whenever NODE_ENV=production (env.config.ts
// cookieSecure), and pm2 runs production even locally. Over plain http the
// server then issues no cookie at all, every role fails to authenticate, and
// the AUTHZ layer reads that as "denied" — i.e. it passes while testing
// nothing. In real use nginx terminates TLS and forwards this header, and the
// app trusts it (`app.set("trust proxy", 1)`), so sending it is exactly what
// production looks like — and it is a no-op against an https target.
const PROXY_HEADERS = { "X-Forwarded-Proto": "https" };

const ROLES = {
  candidate:  { u: process.env.DEEP_U_CANDIDATE  || "demo_candidate", p: process.env.DEEP_PW_CANDIDATE  || "test123" },
  agent:      { u: process.env.DEEP_U_AGENT      || "demo_agent",     p: process.env.DEEP_PW_AGENT      || "test123" },
  employer:   { u: process.env.DEEP_U_EMPLOYER   || "demo_employer",  p: process.env.DEEP_PW_EMPLOYER   || "test123" },
  admin:      { u: process.env.DEEP_U_ADMIN      || "demo_admin",     p: process.env.DEEP_PW_ADMIN      || "test123" },
  superadmin: { u: process.env.DEEP_U_SUPERADMIN || "superadmin",     p: process.env.DEEP_PW_SUPERADMIN || "hpsedc@super2026" },
};

// A route is allowed for a role if the path (without /api/v1) matches any of their allowlist regexes.
// The allowlist must cover ALL endpoints that role is allowed to access.
const ROLE_ALLOWLIST = {
  // Calibrated 2026-07-17 by reading every route's ACTUAL guard (file:line in
  // the comments below). Two endpoint classes belong in `common` — they are
  // reachable by every authenticated role BY DESIGN, and flagging them as
  // "authz LEAK" was a calibration error, not a finding:
  //   PUBLIC       — no `protect` on the handler at all (open catalogues/lists).
  //   SELF-SCOPED  — `protect` only; the handler filters WHERE user.id (or the
  //                  caller's own candidate/agency row) and returns [] for roles
  //                  that have no such row. No cross-user data is reachable.
  common: [
    // ── PUBLIC (handler has no auth guard — verified) ──
    /^\/version$/,                      // server/index.ts:118 — portal identity banner
    /^\/config\/public$/,               // public-config.routes.ts:9
    /^\/professions$/,                  // profession.routes.ts:43 — profession catalogue
    /^\/registration-fields$/,          // registration-fields.routes.ts — which form
                                        // fields are on/required. Public for the same
                                        // reason as the catalogue above: the form must
                                        // render before a session exists. Carries only
                                        // {enabled,required} booleans — HPSEDC's published
                                        // form policy, no personal data.
    /^\/jobs$/,                         // job.routes.ts:202 — public job listing
    /^\/agencies$/,                     // agency.routes.ts:389 — public agency listing
    /^\/agencies\/leaderboard\/top$/,   // agency.routes.ts:459
    /^\/drives$/,                       // drive.routes.ts:123 — public drive listing
    // ── SELF-SCOPED (protect only; handler scopes to the caller — verified) ──
    /^\/professions\/mine$/,            // profession.routes.ts:62
    /^\/candidates\/(profile|applications|education|languages|experience|documents)$/,
                                        // candidate.routes.ts:20,116,369,441,523 + document.routes.ts:14,74
                                        // — every handler resolves candidates.userId = user.id first
    /^\/candidates\/profile\/(pdf|completion)$/, // candidate.routes.ts:227,592
    /^\/jobs\/saved\/my$/,              // job.routes.ts:1099
    /^\/drives\/(my|upcoming)$/,        // drive.routes.ts:148,169
    /^\/drives\/interviews\/my$/,       // drive.routes.ts:542
    /^\/grievances\/(my|assigned-to-me)$/, // grievance.routes.ts:151,167 — WHERE userId/assignedTo = user.id
    /^\/me\/references$/,               // candidate-self-service.routes.ts:29 (protect), :148
    /^\/post-placement\/my$/,           // post-placement.routes.ts:47
    /^\/support\/messages\/(my|unread)$/, // support.routes.ts:42,58
    /^\/agent\/segments$/,              // agent-productivity.routes.ts:410 — per-user saved segments,
                                        // WHERE savedSegments.userId = user.id; no role guard by design
    // ── infrastructure / misc (pre-existing) ──
    /^\/content\/.*/,
    /^\/matching\/version/,
    /^\/notifications(\/.*)?$/,         // notification.routes.ts:11 — protect only, WHERE userId
    /^\/public\/.*/,
    /^\/mobile\/.*/,
    /^\/2fa\/.*/,
    /^\/__routes/,
    /^\/resume\/.*/
  ],
  candidate: [
    /^\/candidates\/.*/,
    /^\/jobs\/.*/,
    /^\/drives\/.*/,
    /^\/me\/.*/,
    /^\/applications\/.*/,
    /^\/auth\/.*/
  ],
  agent: [
    /^\/agencies\/.*/,
    /^\/agent\/.*/,
    /^\/drives\/.*/,
    /^\/jobs\/.*/,
    /^\/grievances\/.*/,
    /^\/support\/threads$/,             // support.routes.ts:72-75 — explicit ["admin","superadmin","agent"]
    /^\/post-placement$/,               // post-placement.routes.ts:60-62 — explicit ["admin","superadmin","agent"]
    /^\/auth\/.*/
  ],
  employer: [
    /^\/employer\/.*/,
    /^\/jobs\/.*/,
    // NOTE: /agent/* below are intentionally cross-role — each handler carries
    // an explicit role array including "employer", and scopes employers to
    // their own jobs/placements:
    //   placements  agent-productivity.routes.ts:806   applicants :1490 (v0.4.30, FRS §2.2)
    //   reports     agent-productivity.routes.ts:1131
    /^\/agent\/(placements|reports|applicants)$/,
    /^\/agencies\/candidates$/,         // agency.routes.ts:105-107 — explicit agent/employer/admin;
                                        // employers scoped to their own applicants (A01-1 fix, :122-141)
    /^\/auth\/.*/
  ],
  admin: [
    // Admin is HPSEDC's oversight role by design — it is deliberately admitted
    // to staff/cross-role surfaces beyond /admin/*. Every pattern below is
    // backed by a role guard actually read in the code (file:line), NOT a
    // wildcard: if a new admin-reachable route appears, it must be justified
    // and added here the same way, so the negative matrix keeps meaning
    // something. If admin's privileges narrow in future, delete the pattern
    // and the matrix will start asserting the denial again.
    /^\/admin(\/.*)?$/,
    /^\/grievances(\/.*)?$/,            // grievance.routes.ts:16,185 — requireRole(["admin","superadmin"]) on the god-view
    /^\/agent\/(placements|reports|requisitions|applicants)$/,
                                        // agent-productivity.routes.ts:806,1131,1428,1490 — each handler's
                                        // explicit role array includes "admin"; admin sees ALL rows (oversight)
    /^\/agencies\/candidates$/,         // agency.routes.ts:105-107 — "Agents/admins are HPSEDC staff and keep full access"
    /^\/employer(\/.*)?$/,              // employer.routes.ts:26-31 — router-level guard ["employer","admin","superadmin"]
    /^\/support\/threads$/,             // support.routes.ts:72-75 — explicit ["admin","superadmin","agent"]
    /^\/post-placement$/,               // post-placement.routes.ts:60-62 — explicit ["admin","superadmin","agent"]
    /^\/auth\/.*/
  ],
  superadmin: [
    // Superadmin is the full-access role in HireStream by design — it reaches
    // every other role's endpoints (admin oversight, agent placements,
    // employer review queues, etc.) for incident response + audit. Treating
    // any of these as "authz LEAK" would be a calibration error, not a real
    // finding. If superadmin's privileges narrow in future, replace the
    // wildcard with the actual allowed pattern set.
    /.*/,
  ]
};

const pass = [], warn = [], fail = [];
const ms = () => 0; // (no Date.now needed; timing not asserted)

async function login(u, p) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", ...PROXY_HEADERS },
    body: JSON.stringify({ username: u, password: p }),
  });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  // A 200 with no cookie means the session silently did not stick — almost
  // always Secure-cookie-over-http. Surfaced here because the symptom
  // otherwise appears three layers later as "every role is correctly denied".
  if (r.status === 200 && !cookie) {
    console.error(`  WARN  ${u} logged in 200 but got NO session cookie — the run below is meaningless.`);
  }
  return { status: r.status, cookie };
}
// Small inter-request delay to avoid tripping express-rate-limit on the
// target server. Tunable via env. The new auto-discovery probes ~250
// endpoints (5 roles × ~50 routes); at 0ms we trip the limit, at 30ms the
// full run takes ~30-40s end-to-end and stays well under any reasonable
// per-IP cap.
const THROTTLE_MS = parseInt(process.env.DEEP_SMOKE_THROTTLE_MS || "30", 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(path, cookie) {
  if (THROTTLE_MS > 0) await sleep(THROTTLE_MS);
  try {
    const r = await fetch(`${BASE}/api/v1${path}`, { headers: { ...PROXY_HEADERS, ...(cookie ? { Cookie: cookie } : {}) } });
    let body = {};
    try { body = await r.json(); } catch { /* non-json */ }
    return { status: r.status, body };
  } catch (e) { return { status: -1, body: { error: String(e) } }; }
}

async function run() {
  console.log(`\nDEEP SMOKE — ${BASE}\n${"=".repeat(60)}`);

  // Identity banner. Four look-alike portals run side by side, so "which one is
  // this?" must be answered before any result below can be trusted. Version is
  // the only thing that distinguishes them at a glance.
  try {
    const v = await fetch(`${BASE}/api/v1/version`, { headers: PROXY_HEADERS });
    const body = await v.json();
    console.log(`TARGET VERSION: ${body?.data?.version ?? "(unknown)"}   <-- confirm this is the portal you meant`);
  } catch (e) {
    console.error(`FATAL: ${BASE} did not answer /api/v1/version (${e.message}). Is it running?`);
    process.exit(1);
  }

  const cookies = {};

  // ---- Layer 1: AUTH ----
  console.log("\n[1] AUTH");
  for (const [role, { u, p }] of Object.entries(ROLES)) {
    const s = await login(u, p);
    if (s.status === 200 && s.cookie) { cookies[role] = s.cookie; pass.push(`auth ${role}`); console.log(`  ok    login ${role}`); }
    else { fail.push(`auth ${role} -> ${s.status}${s.cookie ? "" : " NO COOKIE"}`); console.log(`  FAIL  login ${role} -> ${s.status}`); }
  }
  // negative auth
  const badLogin = await login("demo_candidate", "wrong-password-xyz");
  if (badLogin.status === 401) { pass.push("auth reject bad password"); console.log("  ok    bad password -> 401"); }
  else { fail.push(`bad password -> ${badLogin.status} (expected 401)`); console.log(`  FAIL  bad password -> ${badLogin.status}`); }
  const unauth = await get("/candidates/profile", "");
  if (unauth.status === 401) { pass.push("auth reject unauthenticated"); console.log("  ok    unauthenticated /candidates/profile -> 401"); }
  else { fail.push(`unauthenticated /candidates/profile -> ${unauth.status} (expected 401)`); console.log(`  FAIL  unauthenticated -> ${unauth.status}`); }

  // Fetch routes from the diagnostic endpoint
  let discoveredRoutes = [];
  try {
    const adminToken = process.env.DEEP_SMOKE_TOKEN || "test123";
    const res = await fetch(`${BASE}/api/v1/__routes`, { headers: { "X-Deep-Smoke-Token": adminToken, ...PROXY_HEADERS } });
    // A production build omits __routes unless DEEP_ROUTES_DEBUG=1, so the SPA
    // catch-all serves index.html and res.json() throws `Unexpected token '<'`
    // — an error that says nothing about the actual cause. Name it instead.
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(
        `/__routes returned ${res.status} ${ct || "(no content-type)"} instead of JSON. ` +
        `Set DEEP_SMOKE_TOKEN on the target, and DEEP_ROUTES_DEBUG=1 if it runs NODE_ENV=production.`);
    }
    const json = await res.json();
    if (res.status === 401) throw new Error("/__routes rejected DEEP_SMOKE_TOKEN — token missing or mismatched on the target.");
    if (json.success && Array.isArray(json.data)) {
      discoveredRoutes = json.data
        .map(r => r.path.replace(/^\/api\/v1/, ""))
        // Exclude calibration noise:
        //  - Parameterised routes (containing ":") — the harness can't probe
        //    them without real IDs; they always 404 on literal ":id". When we
        //    add mutation/data-isolation in P2.2, real IDs will be injected
        //    and these can be re-enabled (probably via a fixture set).
        //  - The /__routes diagnostic endpoint itself — it's harness
        //    infrastructure, not application traffic; gated separately.
        .filter(p => !p.includes(":") && p !== "/__routes");
    } else {
      fail.push(`Route autodiscovery failed: ${res.status}`);
      console.log(`\nFAIL  __routes -> ${res.status} ${JSON.stringify(json)}`);
    }
  } catch (e) {
    fail.push(`Route autodiscovery error: ${e.message}`);
    console.log(`\nFAIL  __routes -> ${e.message}`);
  }

  // Pre-fetch all routes for all roles to separate the logs
  const layer2Logs = [];
  const layer3Logs = [];
  
  for (const role of Object.keys(ROLES)) {
    if (!cookies[role]) { 
      layer2Logs.push(`  -- skip ${role} (no session)`); 
      layer3Logs.push(`  -- skip ${role} (no session)`); 
      continue; 
    }
    const allowlist = (ROLE_ALLOWLIST[role] || []).concat(ROLE_ALLOWLIST.common || []);
    let matchCount = 0;
    
    for (const ep of discoveredRoutes) {
      const isMatch = allowlist.some(re => re.test(ep));
      const r = await get(ep, cookies[role]);

      if (isMatch) {
        matchCount++;
        // 501 is a DELIBERATE not-implemented stub, not a route-health failure:
        // /auth/sso/himaccess[,/callback] (auth.routes.ts:558-584) return 501 by
        // design until the HIM Access provider config is saved by an admin —
        // the handler checks provider_config and 501s with a clear message.
        // Config-gated stubs surface as warn so a red bar always means broken.
        if (r.status === 501) { warn.push(`${role} GET ${ep} -> 501 (deliberate not-implemented stub, config-gated)`); layer2Logs.push(`  warn  ${role} ${ep} -> 501 (deliberate stub)`); }
        else if (r.status >= 500 || r.status === -1) { fail.push(`${role} GET ${ep} -> ${r.status}`); layer2Logs.push(`  FAIL  ${role} ${ep} -> ${r.status}`); }
        else if (r.status === 429) { warn.push(`${role} GET ${ep} -> 429 (rate-limited)`); layer2Logs.push(`  warn  ${role} ${ep} -> 429 (rate-limited)`); }
        else if (r.status >= 400) { warn.push(`${role} GET ${ep} -> ${r.status}`); layer2Logs.push(`  warn  ${role} ${ep} -> ${r.status}`); }
        else if (r.body && r.body.success === false) { fail.push(`${role} GET ${ep} -> 200 but success:false`); layer2Logs.push(`  FAIL  ${role} ${ep} -> 200 success:false`); }
        else { pass.push(`${role} GET ${ep}`); layer2Logs.push(`  ok    ${role} GET ${ep}`); }
      } else {
        // 429 is transient (rate-limited), neither pass nor leak — log as warn.
        if (r.status === 401 || r.status === 403) { pass.push(`authz ${role} denied ${ep}`); layer3Logs.push(`  ok    ${role} denied ${ep} (${r.status})`); }
        else if (r.status === 429) { warn.push(`authz ${role} ${ep} -> 429 (rate-limited, cannot determine)`); layer3Logs.push(`  warn  ${role} ${ep} -> 429`); }
        else if (r.status >= 500) { fail.push(`authz ${role} ${ep} -> ${r.status} (server error)`); layer3Logs.push(`  FAIL  ${role} ${ep} -> ${r.status}`); }
        else { fail.push(`authz LEAK: ${role} reached ${ep} -> ${r.status} (expected 401/403)`); layer3Logs.push(`  FAIL  LEAK ${role} reached ${ep} -> ${r.status}`); }
      }
    }
    layer2Logs.push(`  ... ${role}: ${matchCount} endpoints checked`);
  }

  console.log("\n[2] ROUTE HEALTH (per role)");
  layer2Logs.forEach(l => { if (!l.startsWith("  ok")) console.log(l); });

  console.log("\n[3] AUTHZ NEGATIVE (role must be DENIED on others' endpoints)");
  layer3Logs.forEach(l => { if (!l.startsWith("  --")) console.log(l); });

  // ---- SUMMARY ----
  console.log(`\n${"=".repeat(60)}\nSUMMARY  pass=${pass.length}  warn=${warn.length}  FAIL=${fail.length}`);
  if (warn.length) { console.log("\n4xx (often expected — empty/forbidden-by-design):"); warn.forEach((w) => console.log("  - " + w)); }
  if (fail.length) { console.log("\nFAILURES:"); fail.forEach((f) => console.log("  - " + f)); }
  console.log(fail.length ? "\nRESULT: FAIL" : "\nRESULT: PASS");
  process.exit(fail.length ? 1 : 0);
}

run();
