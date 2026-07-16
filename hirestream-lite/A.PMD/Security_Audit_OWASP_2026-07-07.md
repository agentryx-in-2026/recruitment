# HireStream-HP — Application Security Audit (OWASP Top 10 2021 / CERT-In VAPT)

**Target:** `/home/subhash.thakur.india/Projects/Recruitment/hirestream-hp`
**Stack:** Express + drizzle-orm/Postgres, React client, session-cookie auth (+ mobile JWT)
**Date:** 2026-07-07 · **Auditor:** Fable (senior appsec, CERT-In VAPT style) · **Version:** 0.9.17
**Method:** READ-ONLY static review. No code was modified, no app run, nothing pushed.
Each finding cites `file:line`, is marked **CONFIRMED** (exact code read) or **PLAUSIBLE**, with a one-line exploit and one-line fix.

Scope confirmation: Batch-1 remediations (ownership.ts gating, legacy status route removal, OTP brute-force cap + crypto OTP, mobile register gate, dependency patch) were re-checked and **hold**. The findings below are what a VAPT would *still* flag.

---

## TOP FIXES TO MAKE NOW (ranked, genuinely exploitable)

1. **Neutralise the unauthenticated dev-login / demo-reset endpoints.** `POST /api/v1/auth/dev-login` (auth.routes.ts:151) and `POST /api/v1/auth/demo-reset` (auth.routes.ts:242) have **no `protect`** and are gated only by DB flag `feature.quick_login_enabled`, whose **default value is `true`** (superadmin.routes.ts:258) and which is auto-inserted into the DB the moment a superadmin opens the Feature-Flags page (ensureDefaultFlags, superadmin.routes.ts:263-270). Once that flag is `true` in prod, an anonymous attacker logs in as `demo_admin` **without a password**, and can **wipe the entire database** (demo-reset spawns the TRUNCATE-CASCADE seed). → *Fix:* default the flag to `false`, hard-disable both routes when `NODE_ENV==="production"`, and require `protect`+superadmin regardless.

2. **Remove / rotate the shipped default credentials.** `scripts/seed.ts:37-38` hardcodes `superadmin / hpsedc@super2026` and `demo_admin / test123` (plus dozens of `test123` accounts) — committed to the repo and applied by every seed/reseed. A known highest-privilege password in a govt deployment is an automatic CERT-In CRITICAL. → *Fix:* never seed a superadmin password into prod; provision it out-of-band, force reset on first login, delete demo accounts in prod builds.

3. **Stop returning 2FA secrets and Aadhaar in user dumps.** `GET /api/v1/admin/reports/export/users.csv` (admin/reports.ts:368-388) strips only `password`, so it exports `twoFactorSecret`, `twoFactorRecoveryCodes` and `aadhaarNumber` for **every user** to any *admin* — exporting the raw TOTP seed defeats 2FA for the whole userbase, plus mass-Aadhaar exposure (DPDP). Same class: superadmin.routes.ts:35 (`GET /users`), superadmin-ops.routes.ts:524 (`GET /lookup`). → *Fix:* select an explicit safe-column whitelist (never emit `twoFactorSecret`/`twoFactorRecoveryCodes`; mask Aadhaar) on every user-serialising path.

4. **Scope + minimise the candidate browse list.** `GET /api/v1/agencies/candidates` (agency.routes.ts:101-134) returns full `candidates` rows — including `passportNumber` and `aadhaarNumber` — for **all** candidates to any employer/agent. The `:id` detail route was already fixed (S6) to scope employers and strip passport/Aadhaar; the **list route never got that fix**. → *Fix:* apply the same S6 scoping + PII stripping to the list endpoint.

5. **Add the missing ownership checks on the interview/placement/drive routes.** Four sibling routes lost the IDOR guard their neighbours have: `GET /agent/interviews/:id.ics` (agent-productivity.routes.ts:422), `GET /drives/:driveId/interviews` (drive.routes.ts:479), `PATCH /agent/interviews/:id/feedback` (agent-productivity.routes.ts:121), `PATCH /agent/placements/:id/welfare` (agent-productivity.routes.ts:808). → *Fix:* gate each with `userOwnsApplication` / owning-agency check (the pattern already used by `respond-reschedule`, `visa-status`, `/:id/registrations`).

---

## CONFIRMED findings by severity
- **CRITICAL: 2** · **HIGH: 4** · **MEDIUM: 6** · **LOW: 6**
(PLAUSIBLE/INFO items listed separately, not counted.)

---

## A01 — Broken Access Control

| # | Sev | Status | Location | Exploit | Fix |
|---|-----|--------|----------|---------|-----|
| A01-1 | HIGH | CONFIRMED | agency.routes.ts:114 (`GET /candidates`) | Any employer/agent bulk-harvests every candidate's `passportNumber`+`aadhaarNumber`+phone; only unverified *agents* are gated, employers unrestricted | Scope to caller's applicants and strip passport/Aadhaar (mirror the `:id` S6 fix) |
| A01-2 | HIGH | CONFIRMED | agent-productivity.routes.ts:422 (`GET /interviews/:id.ics`) | Only `protect`; any authenticated user (incl. any candidate) enumerates interview IDs → other candidates' name/email/job/time/location | Add `userOwnsApplication`/candidate-self ownership check |
| A01-3 | HIGH | CONFIRMED | drive.routes.ts:479-503 (`GET /:driveId/interviews`) | Only `protect`; any authenticated user lists all interviews for any drive with candidate `fullName/email/skills` | Reuse the admin-or-owning-agency check from `/:id/registrations` (drive.routes.ts:997) |
| A01-4 | MEDIUM | CONFIRMED | agent-productivity.routes.ts:121-158 (`PATCH /interviews/:id/feedback`) | Role gate only; any agent/employer overwrites rating/scorecard/recommendation on ANY interview (`update … where eq(interviews.id, req.params.id)`, line 156) → corrupts another job's hiring decision | Add ownership guard like sibling `respond-reschedule` (line 194) |
| A01-5 | MEDIUM | CONFIRMED | agent-productivity.routes.ts:808 (`PATCH /placements/:id/welfare`) | Role gate only; any agent/employer stamps 30/60/90-day welfare status on any placement → falsifies welfare-compliance records | Add ownership guard like sibling `visa-status`/`emigration-clearance` |
| A01-6 | MEDIUM | CONFIRMED | agent-productivity.routes.ts:457-473 (`GET /placements/:id/offer-letter.pdf`) | Check is `isOwner OR role∈{agent,employer,admin}`; any *employer* downloads any placement's offer letter (candidate name, salary, start date) cross-tenant | Restrict employers to their own placements; keep agent/admin broad if intended |
| A01-7 | LOW | CONFIRMED | drive.routes.ts:194-206 (`GET /:id`) | **No `protect`** and no status filter → unauthenticated read of `pending/rejected/cancelled` drives incl. `rejectionReason` | Require auth and/or filter `status='approved'` for anonymous |
| A01-8 | LOW | CONFIRMED | candidate.routes.ts:617 / :632 (`POST`/`DELETE /:id/country-rejection`) | Role-gated (agent/admin) but no per-candidate ownership → any staff edits any candidate's visa-refusal countries | Add `userOwnsCandidate`; acceptable only while single-agency mode holds |

**PLAUSIBLE (A01):** job.routes.ts:398 (`GET /jobs/:id`) treats any `role==="agent"` as "verified", so an *unverified* agency can read `agents_only` requisitions by UUID — tighten to `agent.verified`. post-placement.routes.ts:33-36 (`POST /`) stores body `placementId` without verifying it belongs to the calling candidate — low-impact queue pollution.

---

## A02 — Cryptographic Failures / Sensitive Data Exposure

| # | Sev | Status | Location | Exploit | Fix |
|---|-----|--------|----------|---------|-----|
| A02-1 | CRITICAL | CONFIRMED | scripts/seed.ts:37-38 (committed) | Known superadmin password `hpsedc@super2026` + `demo_admin/test123` ship in-repo and are applied by seed/reseed → full admin takeover if run against prod / not rotated | Provision superadmin out-of-band, force first-login reset, drop demo users in prod |
| A02-2 | HIGH | CONFIRMED | admin/reports.ts:381-383 (`GET /export/users.csv`) | Strips only `password`; exports `twoFactorSecret`+`twoFactorRecoveryCodes`+`aadhaarNumber` for all users to any admin → 2FA seeds recoverable, mass Aadhaar leak | Whitelist safe columns; never emit TOTP secret/recovery codes; mask Aadhaar |
| A02-3 | MEDIUM | CONFIRMED | superadmin.routes.ts:35 (`GET /users`); superadmin-ops.routes.ts:524 (`GET /lookup`) | Same strip-only-`password` bug → `twoFactorSecret`/recovery codes/Aadhaar returned in JSON (superadmin-scoped) | Same column-whitelist serializer |
| A02-4 | LOW | PLAUSIBLE | auth.routes.ts:543 | OAuth CSRF `state` uses `Math.random()` (weak PRNG); SSO handshake is currently stubbed (returns 501) so not yet reachable | Use `crypto.randomBytes` and validate `state` on callback |

**Note (positive):** `.env` (real `SESSION_SECRET`/`JWT_SECRET`) is correctly **git-ignored and untracked** — no secrets in the repo history. No other hardcoded credentials found. Seed uses bcrypt cost 10 vs. app's 12 (minor inconsistency, not exploitable).

**PLAUSIBLE (A02):** superadmin.routes.ts:442 (`GET /settings`) reveals first-4 + last-2 chars + length of every secret env var; weakens brute-force of short secrets (superadmin-only).

---

## A03 — Injection

- **SQL:** Every `sql\`\``, `db.execute`, and `sql.raw` reviewed. All raw SQL is either fully static or uses drizzle bound parameters. The two suspicious `sql.raw(report.sql)` sites (superadmin-ops.routes.ts:620) resolve `report` from a **hardcoded `REPORTS` whitelist** by name with a 404 on miss — no user input reaches SQL. `data-reset.service.ts` uses `sql.raw` only with a `quoteIdent`-quoted fixed table list. The job-salary filter (job.routes.ts:322-334) interpolates only a column ref + `parseInt`-coerced integers. **The known drizzle-array landmine was not found in any user-reachable query.** No injection confirmed.
- **Superadmin SQL console** (superadmin-ops-system.routes.ts:190-277): SELECT/WITH/EXPLAIN-only allowlist, keyword blocklist, single-statement, 5s `statement_timeout`, 30/5-min rate cap, superadmin-gated. Residual (LOW/PLAUSIBLE): the allowlist permits SELECT of dangerous functions (e.g. `pg_read_file`, `pg_sleep`) — mitigated because the app DB role (`hirestream`) is not a Postgres superuser, but consider an explicit function denylist.
- **XSS (server-rendered HTML):** candidate.routes.ts:228-289 (`GET /profile/pdf`) builds HTML with **unescaped** candidate fields (`fullName`, `email`, education/experience free-text) and returns it as `text/html` (`res.send(html)`, line 289). **A03-XSS / LOW / CONFIRMED** — self-served only (route resolves the caller's own candidate) and the input `sanitizeRequest` middleware strips `<script>`/`<iframe>`/`on*=`, so impact is limited to self. → *Fix:* HTML-escape interpolated fields (or render via pdfkit like the sibling `me/profile.pdf`).
- **XSS (client):** only `dangerouslySetInnerHTML` is in `ui/chart.tsx:81` (recharts-generated CSS, no user data) — safe.
- **Command injection:** `execSync`/`spawn` (superadmin.routes.ts:227, auth.routes.ts:258) use fixed command strings with no user interpolation — not injectable (but see A04-2 for the *reachability* of the unauth one).

---

## A04 — Insecure Design

| # | Sev | Status | Location | Exploit | Fix |
|---|-----|--------|----------|---------|-----|
| A04-1 | CRITICAL | CONFIRMED | auth.routes.ts:151 (`dev-login`) + :242 (`demo-reset`); default-true flag at superadmin.routes.ts:258, auto-inserted at :263-270 | Unauthenticated password-less login as `demo_admin` + unauthenticated destructive DB wipe, live whenever `feature.quick_login_enabled=true` (default true; set on first flags-page view) | Default flag false; hard-disable both in production; require superadmin auth |
| A04-2 | MEDIUM | PLAUSIBLE | twofa.routes.ts (whole file) | `twoFactorVerified` is enrolled/stored but **never enforced** anywhere else in the codebase (no consumer outside these routes) → enabling 2FA gates nothing; also no rate-limit on `/verify-login` TOTP guesses | Enforce a `twoFactorVerified` session step at login for 2FA-enabled users; rate-limit TOTP verification |

Rate-limit coverage is otherwise good: `authLimiter` on `/auth` + `/mobile/auth`; `sensitiveLimiter` on send-otp / request-password-reset / change-password; OTP has a 5-attempt-per-code cap (otp.service.ts:90) + crypto OTP; public-status has its own per-phone OTP + verify-fail lockout.

---

## A05 — Security Misconfiguration

| # | Sev | Status | Location | Exploit | Fix |
|---|-----|--------|----------|---------|-----|
| A05-1 | MEDIUM | CONFIRMED | mobile-config.routes.ts:116,181,271,294,317,376; resume-parser.routes.ts:126; superadmin*.routes.ts (many); errorHandler.middleware.ts:24-30 | Handlers return raw `err.message` to the client (`res.json({message: err.message})`) instead of `next(err)` → DB/internal-error strings leak; superadmin reset/reseed even echo seed-script stderr. Global handler also returns `err.message` for 500s | Route all errors through the global handler; emit a generic message for ≥500, log detail server-side only |

**Verified solid (A05):** Helmet CSP/HSTS/frame-ancestors:'none'/nosniff/referrer live; CORS is a strict `ALLOWED_ORIGINS` whitelist (index.ts:43-54); `x-powered-by`/`Server` stripped; API responses `no-store`; TRACE blocked; only the **photos** leaf is statically served (index.ts:96) — sensitive docs (passport/Aadhaar/offer letters) live under a separate leaf and are download-gated, so **no unauthenticated document exposure**. The `__routes` diagnostic (routes.ts:95) is double-gated (`DEEP_SMOKE_TOKEN` + non-prod). No directory listing.

---

## A07 — Identification & Authentication Failures

- **Session:** httpOnly + `sameSite=strict` + `secure` (prod), 30-min rolling idle timeout, `regenerate()` on login/register/dev-login (fixation-safe), full session invalidation on password reset/change. **Solid, CONFIRMED.**
- **Login enumeration:** passport returns a generic "Invalid username or password" for both missing-user and wrong-password (passport.config.ts:13-19) — good. `request-password-reset` returns a constant response — good.
- **A07-1 / LOW / CONFIRMED — Registration enumeration:** auth.routes.ts:47 returns 409 "User already exists with this email" → an attacker can probe which emails are registered. → *Fix:* return a generic success/neutral response (or gate registration).
- **PLAUSIBLE:** passport.config.ts:13 skips bcrypt when the user is absent → response-timing difference can distinguish existing accounts. Add a dummy `bcrypt.compare` for the not-found branch.
- No PM2 cluster mode (ecosystem.config.cjs) → the in-memory rate-limiters are process-consistent (not a finding).

---

## A08 — Software & Data Integrity

- **File upload pipeline — VERIFIED SOLID.** MIME allowlist (PDF/JPG/PNG) + magic-byte signature check (upload.middleware.ts:80-99, run post-multer, deletes on mismatch) + size cap + **server-generated random filenames** (no user-controlled path) + empty-file rejection + role-scoped destination dirs captured at multer-construction. Download path resolution uses server-stored `fileUrl` with a `path.basename` legacy safety net — no traversal reachable. Magic-byte check reads only the first 12 bytes (polyglot files could pass) — LOW residual, acceptable.
- **Deserialization:** no `eval`/`vm`/unsafe `JSON.parse` of attacker data beyond validated bodies.
- **SSRF (A10):** server-side `fetch` of a URL taken from **admin/superadmin-set config** exists at admin/system-config.ts:147/169/180/192 (connectivity tests) and operator-console.ts:82 (Loki proxy). Reachable only by superadmin, URL is admin-configured → **LOW/INFO**. No SSRF from ordinary-user input (no user avatar-URL fetch, nodemailer uses configured SMTP host).

---

## A09 — Logging & Monitoring

- No passwords, OTP codes, tokens, or 2FA secrets are written to logs (otp.service logs email+purpose only; auth logs user IDs). Good.
- **LOW / CONFIRMED — PII in logs:** phone numbers logged in clear (public-status.routes.ts:70 `OTP issued to <phone>`; mobile-auth.routes.ts:402 email). Minor; consider masking. Password-change/security events are audit-logged (auth.routes.ts:513) — good coverage.

---

## CERT-In additional checks

- **A-CERT-1 / MEDIUM / CONFIRMED — Access token accepted in URL query string:** `mobileBearer.middleware.ts:45-52` accepts the mobile JWT via `?token=` for **every** route, not just media downloads. Tokens in URLs leak via browser history, `Referer`, and proxy/access logs. → *Fix:* restrict query-token auth to the specific media-download routes that need it, or use short-lived one-time media tokens.
- **Passwords in URLs / sensitive data in query:** none found beyond A-CERT-1.
- **Autocomplete on password fields:** correctly set (`current-password` / `new-password`) across auth-page.tsx and change-password-dialog.tsx. Solid.
- **Clickjacking:** `frameAncestors:'none'` + `frameSrc:'none'` + X-Frame-Options. Solid.
- **Uploaded documents access-controlled per-user:** yes — `/candidates/documents/:id/download` enforces owner-or-related-staff (document.routes.ts:114-133); agency/employer/placement docs likewise. Solid (see A01 exceptions for *interview/offer-letter* metadata, not the doc files).
- **File-upload content-type trust:** not trusted — magic-byte verification enforced (A08).

---

## Already solid (verified controls — for the auditor-facing posture doc)

- **Session security:** httpOnly + sameSite=strict + secure(prod) cookies, 30-min rolling idle timeout, session regenerate-on-login (CWE-384), full session invalidation on password reset/change (CWE-613).
- **Password handling:** bcrypt-12 (app), strong password policy on reset/change (upper/lower/digit/special, 8-128), single-use + 1-hour reset tokens with race-safe consume.
- **Helmet headers:** CSP (with frame-ancestors/object-src/base-uri locked), HSTS preload, nosniff, referrer-policy, frame-options — verified in code and per the brief live.
- **CORS:** strict `ALLOWED_ORIGINS` whitelist; empty ⇒ same-origin; OPTIONS/preflight restricted; TRACE blocked; `x-powered-by`/`Server` removed; API `no-store`.
- **Rate limiting:** apiLimiter / authLimiter (skipSuccessful) / sensitiveLimiter, DB-tunable; OTP per-code attempt cap + crypto OTP; public-status per-phone lockout.
- **File uploads:** MIME allowlist + magic-byte verification + size cap + server-random filenames + role-scoped dirs + empty-file reject; CSV-formula-injection defused in the job importer; commit path re-validates every row server-side.
- **Document access control:** per-user/owner-or-related-staff download gating; sensitive docs excluded from static serving (only the photos leaf is public).
- **Ownership layer:** `server/lib/ownership.ts` (`userOwnsJob`/`userOwnsApplication`/`userOwnsCandidate`) correctly gates notes/compliance/candidate-detail/application-status/bulk-status/withdraw/interview-outcome and the document verify route.
- **SQL safety:** no user-reachable raw-SQL injection; the superadmin SQL console is SELECT-only, single-statement, timeout- and rate-capped.
- **Mobile auth:** JWT typed (`mobile_access`), no weak secret fallback (skips if `JWT_SECRET` unset), refresh-token rotation with reuse-detection + per-user cap; mobile register capability-gated (no admin self-register).
- **Diagnostics:** `__routes` double-gated; no `/debug` endpoints exposed in prod.

---

### PLAUSIBLE / INFO backlog (not counted in CONFIRMED totals)
job.routes.ts:398 unverified-agent requisition read · post-placement.routes.ts:33 unvalidated `placementId` · superadmin.routes.ts:442 partial-secret reveal · passport.config.ts:13 login-timing enumeration · superadmin SQL console dangerous-function allowlist · admin/superadmin-set SSRF in config-test/Loki fetch · mobile-push token reassignment · profile-PDF self-XSS (also under A03).
