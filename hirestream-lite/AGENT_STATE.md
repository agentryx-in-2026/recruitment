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

**v0.3.0 — foundation.** Schema, profession catalogue, settings, API.
**v0.3.1 — both test gates repaired** (see below).
**v0.4.0 — the flow is live.** `/register` is now the ONLY way in.

| route | was | now |
|---|---|---|
| `/register` | — | **the flow** — 4 pages |
| `/callback` | — | assisted callback (extracted from the tier chooser) |
| `/apply` | 10-screen blue-collar flow | → redirects to `/register` |
| `/apply/pro` | 14-screen professional flow | → redirects to `/register` |
| `/start` | tier chooser | → `/register` (`?mode=assisted` → `/callback`) |
| `/profile` | onboarding wizard | edit-only surface for an existing profile |

Old routes REDIRECT, they do not 404 — candidates have them in history, SMS
links and printouts, and a dead link to a government portal reads as "the scheme
is gone", not "the URL changed". Drop them once the logs go quiet.

**Deleted:** `simple-apply.tsx`, `simple-apply/`, `simple-apply-pro.tsx`,
`simple-apply-pro/`, `register-start.tsx`. The tiers are gone entirely — the
Standard/Professional split is what let `/apply` omit email while email is one
of the nine completion checkpoints, so a blue-collar candidate could finish it
perfectly and still be mathematically stuck below 100%.

**The layout complaint (HPSEDC demo).** The old shell hard-capped every screen at
`max-w-xl` = 576px — 30% of a 1920px projector, 70% white. It was a deliberate
mobile-first choice that nobody made responsive. Now 576 → 768 → **1100px** with
two-column fields on desktop; verified in a real browser at 1600px (form uses
1052px, grid `514px 514px`) and at 390px (single column, no sideways scroll).
**"Make it wider" would have been the wrong fix** — 20,000 HP applicants are on
phones.

**Page 4 prints a real A4 form** (`window.print()` → Print + native Save-as-PDF).
Verified by generating the PDF, not by trusting the CSS: the first attempt
printed the progress bar, the screen heading and the buttons, and dropped the
trust footer ON TOP of the candidate's answers — because the print rule targeted
`header, nav, footer` and the shell is built from divs. Chrome now carries
`print:hidden` at its source. A server-generated stored PDF is the later option
if HPSEDC want one on file.

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

### Still to do (UAT-05)

- **Pages 5 + 6** — documents. Page 5 unlocks on `shortlisted` (prove the claims);
  page 6 on `selected` (PCC + medical, item 9). Nothing is stage-gated yet, and
  `/documents` still shows every slot to everyone.
- **The completion rewrite** — `/profile/completion` still demands an ID scan and
  a passport scan for 100%, which is the rule the 20k:500 design reverses. Split
  into "application complete" (pages 1-4, no docs) and "deployment ready".
  Remember the drifted second copy in `job.routes.ts:~913`.
- **Document vocabulary** — still THREE disagreeing lists. The seeded
  `requiredDocs` keys (`nursing_council_registration`, `driving_licence`,
  `iti_certificate`, `trade_test`) are NOT in the upload whitelist at
  `document.routes.ts:40` and will 400 until it is unified. Inert until page 5
  exists, which is why seeding them early was safe.
- **Admin CRUD for professions** — HPSEDC can only edit `profession_requirements`
  via SQL today. Item 21's "configurable by the administrator" is not met until
  the screen exists.
- **Job Posting module** — items 10 (fixed salary), 11 (hide placed vacancies),
  20 (remove the pipeline). Untouched, and there is no field spec for it yet;
  item 20's scope question blocks writing one.
- **Email verification (item 1)** — the field is collected, the verification is
  not built. Send the mail and gate the SUBMIT, not page 1 — hard-blocking at the
  first page sends the candidate to an inbox and a real share never come back.

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
