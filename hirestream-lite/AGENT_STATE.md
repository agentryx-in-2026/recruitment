# hirestream-lite — agent state

**The simplification line.** Forked from `hirestream-hp` at `v0.9.47`
(tag `v0.9.47-uat03-reference`) on 16 July 2026, after the UAT-04 meeting asked
for significant workflow simplification.

| | reference | this |
|---|---|---|
| dir | `hirestream-hp/` | `hirestream-lite/` |
| url | hirestream-hp.agentryx.dev | hirestream-lite.agentryx.dev |
| port | 5003 | **5004** |
| db | `hirestream_hp` | **`hirestream_lite`** |
| test db | `hirestream_hp_test` | **`hirestream_lite_test`** |
| pm2 | `hirestream-hp` | **`hirestream-lite`** |
| version | v0.9.47 (frozen ref) | v0.1.0 (own line) |

`hirestream-hp` stays LIVE and FROZEN as the reference HPSEDC signed off against
— do not modify it. Verified isolated: a write to `hirestream_lite` is invisible
on port 5003.

**Deploy cadence (identical, different port):**
`echo X.Y.Z > VERSION` → `npm run --silent check` → `npm run --silent build`
→ `pm2 restart hirestream-lite --update-env` → `curl http://localhost:5004/api/v1/version`

**Landmine:** there are now FOUR look-alike portals with HPSEDC branding
(hirestream-lite, hirestream-hp, hirestream-stg, hptourism-stg). Always confirm
with `curl <url>/api/v1/version` before judging a bug — this has already cost
real time twice.

---

## UAT-05 — registration rebuild (in progress)

Design docs: `PMD-Final wrapup/UAT & Approval/UAT-05/` — the proposal (why), the
field spec (what), and the checklist (HPSEDC's 21 items).

**v0.3.0 — foundation.** Schema, profession catalogue, settings, API. No UI yet;
the old flows (`/start`, `/apply`, `/apply/pro`, `/profile`) are all still live
and still write to the old shape. The 4-page flow is the next push.

**Three policy questions are settings, not code** — HPSEDC flip them without a
release, and can change their mind after seeing real numbers:
`registration.passport_mandatory` (item 4 — escape hatch, default OFF),
`registration.gate_browsing` (item 2 — default OFF), `registration.max_professions`
(item 15 — default 3).

**Item 21 is a lookup table, not a rule engine.** `profession_requirements`, 19
rows, 5 with add-on blocks. `seedProfessions()` inserts MISSING rows only and
never updates — once HPSEDC edit a row it is theirs, and a redeploy that
"restored defaults" would silently revert their eligibility policy. Verified.

### Landmines found and fixed on 17-07-2026

- **`npm test` was 152/497 red — and it was the test DB, not the code.**
  `hirestream_lite_test` was pg_dump-copied at fork time and never schema-synced,
  so it was missing columns as old as v0.4.x (`date_of_birth`). Every
  `select … from candidates` 500'd, which is most of the suite. Fixed by pushing
  the schema to it; now **490/497**. The 7 remaining (agency-reviews ×3,
  candidates-completion ×3, drives ×1) are pre-existing and **unrelated to
  UAT-05** — verified by running them at baseline with the synced DB.
  **If you fork again, run `db:push` against the test DB immediately.**

- **`npm run db:push` offered to DROP the `session` table.** `session` is
  express-session's store (connect-pg-simple owns it) and is not in schema.ts, so
  drizzle read it as an orphan — answering "yes" logs out every user. It also
  made push unrunnable non-interactively (it asks "is <new table> a rename of
  session?"). Fixed with `tablesFilter: ["!session"]` in drizzle.config.ts.

- **`drizzle-kit generate` produces GARBAGE here — never use it.** `migrations/`
  is vestigial and its snapshot is stale at `0001`, so generate diffs against an
  ancient baseline and emits a migration that recreates the whole schema. This
  project syncs with `db:push` (which diffs the live DB). `npm run db:push:test`
  is broken separately (`dotenv: not found`); use
  `DATABASE_URL="$TEST_DATABASE_URL" npx drizzle-kit push`.

- **The smoke had NEVER run against this fork — and silently smoked a different
  portal instead.** `deep-smoke.mjs` defaulted `DEEP_URL` to
  `hirestream-stg.agentryx.dev`, and `smoke:local` pointed at port **5001**
  (neither lite:5004 nor hp:5003 — copied unchanged through two forks). So
  `npm run test:deep` reported on someone else's system and looked fine. Fixed:
  `DEEP_URL` is now REQUIRED (no default), `smoke` → hirestream-lite.agentryx.dev,
  `smoke:local` → :5004, and **every run prints the target's
  `/api/v1/version` banner first** so the four-portal landmine cannot bite again.
- **The smoke could not authenticate at all over http.** pm2 runs
  `NODE_ENV=production` → `cookieSecure=true` → no session cookie over plain
  http. Every role then failed to log in, and the AUTHZ layer read that as
  "correctly denied" — i.e. it **passed while testing nothing**. The harness now
  sends `X-Forwarded-Proto: https` (what nginx does; `trust proxy` is on) and
  shouts if a 200 login yields no cookie. Same trick works with curl:
  `curl -H 'X-Forwarded-Proto: https' ...` — without it every local API call 401s.
- **Route autodiscovery** needs `DEEP_SMOKE_TOKEN` + `DEEP_ROUTES_DEBUG=1` (the
  latter because production omits `/api/v1/__routes`, so the SPA catch-all
  returns HTML and it died on `Unexpected token '<'`). Both are now in `.env`
  (gitignored — **the token is NOT in git; regenerate per environment**).
- **The smoke's 72 "authz LEAK: admin reached X" were calibration, not leaks.**
  Verified against each route's real guard: admin is HPSEDC's oversight role by
  design (e.g. `employer.routes.ts:26-31` explicitly allows
  `["employer","admin","superadmin"]`). The allowlist was never calibrated
  because the harness had never run. Now calibrated with a `file:line`
  justification per pattern — **deliberately NOT a wildcard for admin**, so the
  negative matrix keeps meaning something. A new admin-reachable route must be
  justified and added the same way. Self-scoped endpoints (`/candidates/*`) were
  verified empirically, not just by reading: uploaded a passport as
  demo_candidate, confirmed agent and employer both see 0 rows.

**Current gate status: `npm test` 497/497 · `npm run smoke:local` pass=537 warn=35 FAIL=0.**
Run `set -a; . ./.env; set +a` before `smoke:local` so the token is exported.
Note the smoke probes ~350 endpoints and the API rate limit is 2000/15min per IP
— two or three back-to-back runs will 429 you. `pm2 restart hirestream-lite`
resets the in-memory limiter.

### Known-broken, NOT fixed (pre-existing)

- `npm run db:push:test` fails with `dotenv: not found`. Use
  `DATABASE_URL="$TEST_DATABASE_URL" npx drizzle-kit push` instead.
- `job.routes.ts:~913` has a DRIFTED SECOND COPY of the profile-completion
  calculation (8 checks, generic any-document) vs the endpoint's 9 (id + passport
  specifically). Two definitions of the same number. Left alone deliberately —
  changing it alters the apply gate, and UAT-05 rewrites completion anyway.
