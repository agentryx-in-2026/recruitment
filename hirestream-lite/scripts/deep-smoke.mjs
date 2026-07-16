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
 *   node scripts/deep-smoke.mjs                      # defaults to staging
 *   DEEP_URL=http://localhost:5000 node scripts/deep-smoke.mjs
 *   npm run smoke            (see package.json)
 *
 * Credentials come from env (DEEP_PW_<ROLE>) or fall back to the seed defaults.
 * Exit code 1 if any FAIL — safe to wire into CI / a pre-release gate.
 */

const BASE = (process.env.DEEP_URL || "https://hirestream-stg.agentryx.dev").replace(/\/$/, "");

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
  common: [
    /^\/content\/.*/, 
    /^\/matching\/version/, 
    /^\/notifications\/.*/,
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
    /^\/auth\/.*/
  ],
  employer: [
    /^\/employer\/.*/,
    /^\/jobs\/.*/,
    // NOTE: /agent/placements is intentionally cross-role (agent+employer+admin),
    // each scoped to their own rows in the handler — so it is explicitly allowed here.
    /^\/agent\/placements/,
    /^\/auth\/.*/
  ],
  admin: [
    /^\/admin\/.*/,
    /^\/grievances\/.*/,
    /^\/agent\/placements/,
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
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
    const r = await fetch(`${BASE}/api/v1${path}`, { headers: cookie ? { Cookie: cookie } : {} });
    let body = {};
    try { body = await r.json(); } catch { /* non-json */ }
    return { status: r.status, body };
  } catch (e) { return { status: -1, body: { error: String(e) } }; }
}

async function run() {
  console.log(`\nDEEP SMOKE — ${BASE}\n${"=".repeat(60)}`);
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
    const res = await fetch(`${BASE}/api/v1/__routes`, { headers: { "X-Deep-Smoke-Token": adminToken } });
    const json = await res.json();
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
        if (r.status >= 500 || r.status === -1) { fail.push(`${role} GET ${ep} -> ${r.status}`); layer2Logs.push(`  FAIL  ${role} ${ep} -> ${r.status}`); }
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
