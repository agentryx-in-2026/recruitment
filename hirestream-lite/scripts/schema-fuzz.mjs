#!/usr/bin/env node
/**
 * Schema Fuzzing harness — environment-agnostic boundary validation.
 *
 * Runs against ANY running HireStream instance (no test DB needed).
 * Probes endpoints with malformed payloads derived from Zod schemas to ensure
 * they are cleanly rejected with a 4xx structured envelope ({ success: false }).
 * Any 500 error or 200 silent acceptance is logged as a FAIL.
 *
 * Usage:
 *   node scripts/schema-fuzz.mjs                      # defaults to staging
 *   DEEP_URL=http://localhost:5001 node scripts/schema-fuzz.mjs
 *   npm run schema-fuzz
 *
 * Exit code 1 if any FAIL. Safe to wire into CI.
 * Add new endpoints to the FUZZ_TARGETS registry below.
 */

const BASE = (process.env.DEEP_URL || "https://hirestream-stg.agentryx.dev").replace(/\/$/, "");
const THROTTLE_MS = parseInt(process.env.SCHEMA_FUZZ_THROTTLE_MS || "50", 10);

const ROLES = {
  candidate:  { u: process.env.DEEP_U_CANDIDATE  || "demo_candidate", p: process.env.DEEP_PW_CANDIDATE  || "test123" },
  agent:      { u: process.env.DEEP_U_AGENT      || "demo_agent",     p: process.env.DEEP_PW_AGENT      || "test123" },
  employer:   { u: process.env.DEEP_U_EMPLOYER   || "demo_employer",  p: process.env.DEEP_PW_EMPLOYER   || "test123" },
  admin:      { u: process.env.DEEP_U_ADMIN      || "demo_admin",     p: process.env.DEEP_PW_ADMIN      || "test123" },
  superadmin: { u: process.env.DEEP_U_SUPERADMIN || "superadmin",     p: process.env.DEEP_PW_SUPERADMIN || "hpsedc@super2026" },
};

const FUZZ_TARGETS = [
  {
    name: "candidate registration",
    role: "anon",
    method: "POST",
    path: "/auth/register",
    schema: "registerSchema",
    // v0.7.6.2 — knownFields aligned with the actual registerSchema in
    // shared/validators.ts. The server sets `username = email` internally;
    // there is no separate `username` field, so fuzzing it was producing
    // ~30 false-positive "server accepted malformed input" findings (Zod
    // .object() strips unknown keys by default — correct behaviour, not a bug).
    knownFields: {
      email: { kind: "email", required: true },
      password: { kind: "string", required: true, min: 8, max: 128 },
      role: { kind: "enum", required: true, allowed: ["candidate", "agent", "employer"] },
      fullName: { kind: "string", min: 2, max: 100 },
    },
    validPayload: () => ({ email: `fuzz${Date.now()}@example.com`, password: "Test@1234", role: "candidate", fullName: "Fuzz User" }),
  },
  {
    name: "candidate profile PATCH",
    role: "candidate",
    method: "PATCH",
    path: "/candidates/profile",
    schema: "updateCandidateSchema",
    knownFields: {
      experience: { kind: "number", min: 0, max: 70 },
      phone: { kind: "string", min: 6, max: 20 },
      ieltsBand: { kind: "number", min: 0, max: 9 }, // testing coercion
      passportExpiry: { kind: "date", future: true },
    },
    validPayload: () => ({ experience: 5, phone: "+91 9876543210", ieltsBand: 7.5, passportExpiry: "2030-01-01" }),
  },
  {
    name: "job creation",
    role: "employer",
    method: "POST",
    path: "/jobs",
    schema: "insertJobSchema",
    knownFields: {
      title: { kind: "string", required: true, min: 2, max: 120 },
      experience: { kind: "number", min: 0, max: 60 },
      targetHires: { kind: "number", min: 1, max: 500 },
      category: { kind: "string", min: 1, max: 60 },
      hiringDeadline: { kind: "date", future: true },
    },
    // v0.7.6.2 — country must be a valid country_info name (v0.7.3.2);
    // "India" is rejected as INDIA_NOT_VALID_DESTINATION which counted as
    // a false-positive on every fuzz run.
    validPayload: () => ({ title: "Software Engineer", company: "FuzzCo", location: "Remote", country: "United Arab Emirates", experience: 3, targetHires: 5, category: "information_technology" }),
  },
  {
    name: "application creation",
    role: "candidate",
    method: "POST",
    path: "/jobs/00000000-0000-0000-0000-000000000000/apply",
    schema: "insertApplicationSchema",
    knownFields: {
      matchScore: { kind: "number", min: 0, max: 100 }
    },
    validPayload: () => ({ matchScore: 90 }),
  },
  {
    name: "interview scheduling (enum drift)",
    role: "agent",
    method: "POST",
    path: "/agent/applications/00000000-0000-0000-0000-000000000000/schedule-interview",
    schema: "scheduleInterviewSchema",
    knownFields: {
      status: { kind: "enum", required: true, allowed: ["interview_scheduled"] },
    },
    validPayload: () => ({ status: "interview_scheduled" }),
  },
  {
    name: "application status patch",
    role: "employer",
    method: "PATCH",
    path: "/applications/00000000-0000-0000-0000-000000000000/status",
    schema: "applicationStatusSchema",
    knownFields: {
      status: { kind: "enum", required: true, allowed: ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "rejected"] },
    },
    validPayload: () => ({ status: "shortlisted" }),
  },
  {
    name: "candidate experience creation",
    role: "candidate",
    method: "POST",
    path: "/candidates/experience",
    schema: "insertExperienceSchema",
    knownFields: {
      company: { kind: "string", required: true, min: 1, max: 200 },
      role: { kind: "string", required: true, min: 1, max: 120 },
      years: { kind: "number", min: 0, max: 70 },
    },
    validPayload: () => ({ company: "TestCorp", role: "Tester", years: 2 }),
  },
  {
    name: "employer requisition update",
    role: "employer",
    method: "PATCH",
    path: "/employer/requisitions/00000000-0000-0000-0000-000000000000",
    schema: "updateRequisitionSchema",
    knownFields: {
      targetHires: { kind: "number", min: 1, max: 500 },
      hiringDeadline: { kind: "date", future: true },
    },
    validPayload: () => ({ targetHires: 10 }),
  },
  {
    name: "agency profile update",
    role: "agent",
    method: "PATCH",
    path: "/agencies/me",
    schema: "updateAgencySchema",
    knownFields: {
      agencyName: { kind: "string", min: 2, max: 150 },
      licenseNumber: { kind: "string", min: 3, max: 50 },
    },
    validPayload: () => ({ agencyName: "Super Agency", licenseNumber: "LIC12345" }),
  },
  {
    name: "grievance creation",
    role: "candidate",
    method: "POST",
    path: "/grievances",
    schema: "insertGrievanceSchema",
    knownFields: {
      subject: { kind: "string", required: true, min: 3, max: 200 },
      description: { kind: "string", required: true, min: 10, max: 3000 },
      category: { kind: "string", max: 40 },
    },
    validPayload: () => ({ subject: "Cannot login", description: "I tried logging in but it failed with an error.", category: "technical_problem" }),
  }
];

function generateCases(kindDef) {
  const cases = [];
  const { kind, min, max, allowed, future } = kindDef;

  if (kind === "string") {
    cases.push({ name: 'empty ""', val: "" });
    if (min > 1) cases.push({ name: 'single-char', val: "a" });
    if (max) cases.push({ name: `oversized ("x".repeat(${max+1}))`, val: "x".repeat(max + 1) });
    cases.push({ name: 'null', val: null });
    cases.push({ name: 'undefined', val: undefined });
    cases.push({ name: 'number 42', val: 42 });
    cases.push({ name: 'object {}', val: {} });
    cases.push({ name: 'array []', val: [] });
  } else if (kind === "email") {
    cases.push({ name: 'empty ""', val: "" });
    cases.push({ name: '"not-an-email"', val: "not-an-email" });
    cases.push({ name: '"a@"', val: "a@" });
    cases.push({ name: '"@b"', val: "@b" });
    cases.push({ name: '"a@b" (no TLD)', val: "a@b" });
    cases.push({ name: 'oversized local-part', val: "x".repeat(300) + "@example.com" });
    cases.push({ name: 'null', val: null });
  } else if (kind === "enum") {
    cases.push({ name: '"interview" (disallowed / enum drift)', val: "interview" });
    cases.push({ name: '"invalid_enum_value"', val: "invalid_enum_value" });
    cases.push({ name: 'empty ""', val: "" });
    cases.push({ name: 'null', val: null });
    if (allowed && allowed.length > 0) {
      cases.push({ name: 'canonical-but-wrong-case', val: allowed[0].toUpperCase() });
    }
  } else if (kind === "number") {
    if (min !== undefined) cases.push({ name: `min - 1 (${min - 1})`, val: min - 1 });
    if (max !== undefined) cases.push({ name: `max + 1 (${max + 1})`, val: max + 1 });
    cases.push({ name: 'NaN', val: NaN });
    cases.push({ name: 'Infinity', val: Infinity });
    cases.push({ name: '"123" (string)', val: "123" });
    if (min >= 0) cases.push({ name: 'negative (-1)', val: -1 });
    cases.push({ name: 'null', val: null });
  } else if (kind === "boolean") {
    cases.push({ name: '"true" (string)', val: "true" });
    cases.push({ name: '1', val: 1 });
    cases.push({ name: '0', val: 0 });
    cases.push({ name: 'null', val: null });
  } else if (kind === "date") {
    cases.push({ name: 'empty ""', val: "" });
    cases.push({ name: 'impossible date ("2026-13-99")', val: "2026-13-99" });
    if (future) {
      cases.push({ name: 'past date', val: "1990-01-01" });
    }
    cases.push({ name: 'far-future ("9999-01-01")', val: "9999-01-01" });
    cases.push({ name: 'null', val: null });
  }

  return cases;
}

const pass = [], warn = [], fail = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function login(u, p) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, cookie };
}

async function request(method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  try {
    const r = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: JSON.stringify(body) });
    let resBody = {};
    try { resBody = await r.json(); } catch { /* non-json */ }
    return { status: r.status, body: resBody };
  } catch (e) {
    return { status: -1, body: { error: String(e) } };
  }
}

async function run() {
  console.log(`\nSCHEMA FUZZ — ${BASE}\n${"=".repeat(60)}`);
  const cookies = {};

  // ---- Layer 1: AUTH ----
  console.log("\n[1] AUTH");
  for (const [role, { u, p }] of Object.entries(ROLES)) {
    const s = await login(u, p);
    if (s.status === 200 && s.cookie) {
      cookies[role] = s.cookie;
      console.log(`  ok    login ${role}`);
    } else {
      console.log(`  FAIL  login ${role} -> ${s.status}`);
      // Don't fail the whole script if we can't login (e.g. on dev without DB)
      // just note it so fuzz targets for this role will naturally fail auth.
    }
  }

  // ---- Layer 2: PER-ENDPOINT FUZZ ----
  console.log("\n[2] PER-ENDPOINT FUZZ");
  for (const target of FUZZ_TARGETS) {
    const cookie = target.role !== "anon" ? cookies[target.role] : null;

    for (const [field, kindDef] of Object.entries(target.knownFields)) {
      const cases = generateCases(kindDef);
      
      for (const tc of cases) {
        const payload = target.validPayload();
        payload[field] = tc.val;

        const r = await request(target.method, target.path, payload, cookie);
        const nameDesc = `${target.name} / ${field} / ${tc.name}`;

        // Expected behaviour: 400 or 422 with {success: false} envelope
        if (r.status === 400 || r.status === 422) {
          if (r.body && r.body.success === false) {
            pass.push(nameDesc);
            console.log(`  ok    ${nameDesc} -> ${r.status} (Zod rejected)`);
          } else {
            warn.push(nameDesc);
            console.log(`  warn  ${nameDesc} -> ${r.status} (missing standard {success:false} envelope)`);
          }
        } else if (r.status >= 500) {
          fail.push(`${nameDesc} -> ${r.status} (Server Error)`);
          console.log(`  FAIL  ${nameDesc} -> ${r.status} (Server Error)`);
        } else if (r.status >= 200 && r.status < 300) {
          fail.push(`${nameDesc} -> ${r.status} (server accepted malformed input)`);
          console.log(`  FAIL  ${nameDesc} -> ${r.status} (server accepted malformed input!)`);
        } else {
          fail.push(`${nameDesc} -> ${r.status} (unexpected response)`);
          console.log(`  FAIL  ${nameDesc} -> ${r.status}`);
        }

        await sleep(THROTTLE_MS);
      }
    }
  }

  // ---- SUMMARY ----
  console.log(`\n${"=".repeat(60)}\nSUMMARY  pass=${pass.length}  warn=${warn.length}  FAIL=${fail.length}`);
  if (warn.length) { 
    console.log("\nWARNINGS (missing structured envelope):"); 
    warn.slice(0, 10).forEach(w => console.log("  - " + w));
    if (warn.length > 10) console.log(`  ... and ${warn.length - 10} more`);
  }
  if (fail.length) { 
    console.log("\nFAILURES:"); 
    fail.slice(0, 10).forEach(f => console.log("  - " + f));
    if (fail.length > 10) console.log(`  ... and ${fail.length - 10} more`);
  }
  
  console.log(fail.length ? "\nRESULT: FAIL" : "\nRESULT: PASS");
  process.exit(fail.length ? 1 : 0);
}

run();
