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

**v0.4.1 — the content sweep** (items 7/17/19 across the surfaces the rebuild did
not touch; `/profile` had kept ALL the old wrong content).

**v0.5.0 — documents are stage-gated. Items 9 + 21 closed.**

The back half of the 20k:500 design. Documents are now owed per (candidate,
APPLICATION) and only once that application justifies the ask:

| application status | owes |
|---|---|
| submitted / reviewed | **NOTHING.** ~19,500 people sit here |
| shortlisted / interview_scheduled | prove the claims (base ∪ profession ∪ country ∪ vacancy) |
| selected / placed | PCC + medical (item 9) |

- **`shared/documents.ts`** — ONE vocabulary. There were three and they
  disagreed: the server whitelist (the only enforced one, missing medical/PCC/
  trade test and every profession certificate), a client-only country table the
  server never read (so the portal claimed the UK needs IELTS while nothing
  checked), and the compliance service reading status columns. `shared/` on
  purpose — a client copy and a server copy is how you get back to two lists.
- **The stage is a property OF THE DOCUMENT**, not a rule beside it. The old
  `BASE_JOB_DOCUMENTS` demanded medical + PCC from every applicant for every job
  — that IS item 9, and the fix is `stage: "deploy"` on those two rows.
- **`relevantProfessions()`** — found by smoking the resolver, not by reading it:
  a candidate shortlisted for a MASON job was asked for a Nursing Council
  registration because the union ran over every trade they hold. Scoped via
  `profession_requirements.jobCategoryKey` → `jobs.category`. A job with NO
  category matches nothing and under-asks deliberately.
- **Completion means APPLICATION COMPLETE** — 7 checks, no documents. It had 9,
  two of them document scans, so a candidate who answered everything truthfully
  sat at 78% and was nagged for a passport scan they need only if they are one of
  the 500. **A candidate with zero documents is now 100%.** The drifted inline
  copy in `job.routes` is gone: both callers use
  `services/profile-completion.service.ts`.
- **`jobs.additional_required_docs`** — the vacancy dimension. Small on purpose:
  a job carries `category` + `country`, so most requirements derive; this is only
  the exception (one employer wanting a trade test).

**v0.6.0 — Admin → Professions. Item 21 fully MET.**

Admin Console → OPERATIONS → **Professions**. HPSEDC edit a trade's accepted
qualifications, specific-skills list, required/optional documents and the note
the candidate sees — live, no release. Verified end-to-end in a browser: admin
edits welder's note → candidate's catalogue returns the new text immediately.

Editable = the DATA (HPSEDC's eligibility policy). NOT editable:
- `professionKey` after creation — it is identity; `candidate_professions` rows
  point at it and renaming orphans every candidate holding that trade. Verified
  the server drops it even when a valid lowercase key is sent.
- `hasAddonBlock` — it selects a CODE-defined form shape in
  `client/src/pages/register/profession-blocks.tsx`. Turning it on for a trade
  with no block is a silent no-op. Admin-authorable field SHAPES = a form
  builder = the rule engine this design exists to avoid. The panel says so.
- Documents are picked from the shared vocabulary, never typed — a free-text key
  would be silently unenforceable and 400 on upload.

**Delete is deactivate.** A hard delete breaks every `candidate_professions` row
pointing at the key (no cascade from that side). Deactivating drops it from the
picker and leaves existing candidates' trades and documents intact.

**v0.7.0 — Job Posting: items 10, 11, 20.**

- **Item 10** — salary RANGE → fixed AMOUNT. New `SalaryAmountPicker` beside the
  range picker (shared currency/period/tier machinery), wired into BOTH posting
  forms (agent `job-poster` + employer `job-creation-form`). Still writes the
  free-text `jobs.salary`, so old ranged posts still render; a legacy range reads
  back as its floor (the guaranteed figure).
- **Item 11** — a placed vacancy disappears from candidate/anonymous listings,
  stays for staff. A job is "filled" when its SETTLED placements
  (accepted/active/completed/placed) reach `targetHires` (default 1). Filter in
  the public `GET /jobs` behind `!isStaff`. Verified by walking one placement
  across the settled boundary: placed/accepted → hidden, offered/declined →
  visible; admin always sees it.
- **Item 20** — the detailed 6-stage `CandidatePipelineStrip` is removed from the
  candidate dashboard (both views). The candidate keeps the stat cards
  (Applications/Shortlisted/Offers), the offers banner, and the simple
  per-application status. The AGENT/HPSEDC pipeline (`AgentPipelineFunnel`) is
  untouched — it MUST stay, because document staging depends on
  shortlisted/selected (item 9). Dead `application-tracker.tsx` deleted too.

**v0.8.0 — form layout + REGRESSIONS THE REBUILD INTRODUCED.**

⚠️ **Read this before rebuilding anything else.** Rebuilding `/register` from the
spec instead of PORTING the old flows silently dropped fixes that had been made
deliberately, each with an audit reference. The shared modules were all still
there — the new page just never imported them:

| Lost | Restored in v0.8.0 |
|---|---|
| `@shared/aadhaar` — format/mask/Verhoeff (HPSEDC 2026-07-07) | `formatAadhaar` + `stripAadhaar` on input, `maskAadhaar` on review |
| Inline per-field validation (bad checksum, expired passport) | `Field`'s error slot; 9 `reg.err.*` messages, en + hi |
| Voice input `MicField` — 10 uses in the old pro flow | `MicInput` on every free-text field |
| audit C12 — check `res.ok` on language writes | diff-based save, errors no longer swallowed |
| audit Batch 3 — aria-label on icon-only buttons | experience steppers + months input |

**The review page had also re-implemented Aadhaar masking by hand** — a second
source of truth for a UIDAI/DPDP rule, which is the exact defect class this
session spent its time removing elsewhere. It now calls `maskAadhaar()`.

**Layout** (`register/Field.tsx`): one `Field` owning label/hint/error, a
12-column grid so a PIN code is 3 columns and an address is 8, and numbered dark
section bands. Note `inputCls` needs `md:text-[15px]` — `ui/input` ends its class
list with `md:text-sm`, which silently shrank every field back to 14px at
desktop widths.

**Borrowed from the HP Tourism eServices homestay form** (same team, screenshots
in the UAT-05 thread): a pre-flight "Before you start" checklist, per-stage
progress with its own %, an overall %, and a time-spent clock. Ours lists
INFORMATION rather than documents, because stage 1 is upload-free — promising a
document list and then not asking for documents would be worse than no checklist.

**v0.8.3 — in-form sidebar navigation + portal colour.**

- **`FormSidebar`** (lg+ only) fills what was ~700px of dead page on a desktop:
  overall % + time-spent, the four stages with per-stage progress, and help
  (callback / FAQ / report fraud) reachable at the moment a candidate is stuck —
  which is the moment they would otherwise close the tab. Viewport use went 55% →
  67%. The horizontal stepper is now `lg:hidden`, i.e. mobile only.
- **Stage navigation is BACKWARD-ONLY.** `maxStepReached` gates it: each page
  saves on Next, so a forward jump would leave earlier pages unsaved and later
  ones prefilled from nothing. Verified in-browser that stage 3 is disabled from
  page 1 and stage 1 is reachable from page 2.
- **Background** is a faint blue wash (`#f6f9fe → #fbfcfe → #f4f7fd`) instead of
  flat white. On pure white the white form cards had no edge to sit against,
  which is what made the page read as one slab.
- **Languages trimmed to Hindi / English / Urdu / Arabic** + the "Other language"
  free-text. Arabic stays because it is the DESTINATION language — a candidate
  who speaks it is materially more employable in the Gulf. Changed in BOTH
  `register.tsx` (`LANGS`) and `profile-wizard.tsx` (`COMMON_LANGUAGES`) — these
  two must never drift; two flows keeping their own language lists is part of
  why the tiers were removed.

**v0.9.0 — progress back at the top, real depth, and TEST MODE.**

- **The stepper belongs at the TOP.** v0.8.3 moved it into the sidebar and that
  was a regression — it is the first thing a candidate looks for, it needs the
  full width, and a horizontal run of stages reads as a journey where a vertical
  list does not. Restored as a card: four stages with icon / label / own % / own
  bar, plus overall % and the time clock on the right. The sidebar keeps
  "GO TO" jump-navigation and help, and no longer duplicates any number.
- **Depth.** The form was white cards on a white page holding white inputs —
  nothing had an edge, so it read as one sheet. Now three surfaces: a deep slate
  gradient section header (structure), a faint slate body wash, and WHITE fields
  with an inner shadow so they lift off it and look like somewhere to write.
- **TEST MODE — `/register?test=1`.** Per-page "Autofill this page" so a tester
  is not retyping 18 fields to reach page 3. Gated by a URL param persisted in
  sessionStorage: no build flag, no setting, no server involvement, dies with the
  tab. Verified the bar does NOT render for a normal candidate.
  The sample Aadhaar (234567890124) is **Verhoeff-valid on purpose** — random
  digits would be rejected by the very validation the autofill exists to help
  test, and the tester would think autofill was broken. Autofill also reads the
  LIVE profession catalogue (skills come from `skillsOptions`, trades are
  filtered to what exists and capped at `max_professions`), so it keeps working
  after HPSEDC edit the catalogue.

**v0.9.5 — TEST MODE (how to use it), persisted timer, phone country codes.**

### How to test the candidate journey now

1. Go to `/auth`. On a UAT host a discreet **"Enable test mode"** link shows —
   click it (or use `?test=1` anywhere). Production hosts show nothing at all;
   the allowlist is `UAT_HOSTS` in `pages/register/test-mode.ts`.
2. **"Create a fresh test account"** makes the next free `demoN@demo.com`
   (password `Demo@1234`), signs you in and drops you into the form. A brand-new
   candidate every time, which is the only way to see the first-run experience.
3. In the form, **every section has its own "Fill" button** — fill the ones you
   do not care about, hand-test the one you do.

**Gotcha that cost time:** `POST /auth/register` answers **201 with a generic
message and no user object** when the email is taken — a deliberate
account-enumeration defence, so it never confirms whether an address exists.
`res.ok` is therefore TRUE for an account that was not created. Detect success by
`body.data.id`, never by status. Also redirect with `window.location.assign`, not
wouter's `setLocation`: the auth context still holds the logged-out state right
after registering, so a soft navigation gets bounced straight back to `/auth`.

### Timer

`useFormTimer` — persisted in localStorage, so it survives reload and return
(a per-mount `Date.now()` reset it every time, making the number evidence of
nothing). It has an explicit **pause/resume**, and **auto-pauses when the tab is
hidden**: someone who opens the form and goes to find their passport must not
come back to "47:12", or the "about four minutes" promise is destroyed. A run
that was never frozen (tab killed) is discarded rather than banked, so closed-tab
time is never counted.

### Phone

`PhoneInput` — dial-code select + number, stored as one string (`+971 501234567`),
which the existing `phoneRegex` already accepts, so no schema change. Gulf codes
are listed first: a candidate applying for their NEXT placement is often already
overseas. Validation counts the NATIONAL part only — counting the dial code would
let `+971 501234` pass and reject a real Indian number.

### Still to do (UAT-05)
- **Email verification (item 1)** — the field is collected, the verification is
  not built. Send the mail and gate the SUBMIT, not page 1 — hard-blocking at the
  first page sends the candidate to an inbox and a real share never come back.
- **Item 2** — `/register` resumes correctly, but login still lands on the
  dashboard; the "page 0" routing rule is unbuilt.
- **PDO / PBBY / emigration** are deploy-stage in the spec but are still tracked
  as candidate STATUS columns by `deployment.service.ts`, not as uploads. Left
  alone: that service is a third model of the same domain and merging it is its
  own job.
- **An SLA on deploy-stage documents.** Deferring PCC/medical to selection means
  a selected candidate must produce them or the placement slips. HPSEDC to set
  the number; nothing chases them today.

**Current gate status: `npm test` 497/497 · `npm run smoke:local` pass=537 warn=35 FAIL=0.**
Run `set -a; . ./.env; set +a` before `smoke:local` so the token is exported.
Note the smoke probes ~350 endpoints and the API rate limit is 2000/15min per IP
— two or three back-to-back runs will 429 you. `pm2 restart hirestream-lite`
resets the in-memory limiter.

### Testing this portal — learned the hard way, 17-07-2026

- **NEVER set application status with raw SQL.** `UPDATE applications SET
  status=… WHERE job_id=…` hits EVERY candidate on that job — it clobbered four
  demo candidates' statuses in one line. It also skips the audit log and the
  route's side effects (a `selected` transition auto-creates a placement). Use
  `PATCH /api/v1/applications/:id/status` as **demo_admin** (demo_agent hits the
  IDOR guard — it does not own the seeded jobs). Recovery, if it happens again:
  `audit_log.details->>'from'/'to'` holds the history, and no audit rows means
  the application never left its creation default (`submitted`).
- **Playwright: one browser context per ROLE.** Contexts share cookies, so after
  the candidate logs in, `/auth` redirects any other page in that context away as
  already-authenticated and the login form never renders (a 30s locator timeout
  that looks like a broken page). `browser.newContext()` per role.
- **curl against localhost needs `-H 'X-Forwarded-Proto: https'`** or every call
  401s — pm2 runs NODE_ENV=production, so session cookies are `Secure`.
- **Reset candidate state between UI runs.** Tiles toggle, so a driver that
  assumes a clean slate un-picks what a previous run selected and then reports
  the app is broken.

### Known-broken, NOT fixed (pre-existing)

- `npm run db:push:test` fails with `dotenv: not found`. Use
  `DATABASE_URL="$TEST_DATABASE_URL" npx drizzle-kit push` instead.
- `job.routes.ts:~913` has a DRIFTED SECOND COPY of the profile-completion
  calculation (8 checks, generic any-document) vs the endpoint's 9 (id + passport
  specifically). Two definitions of the same number. Left alone deliberately —
  changing it alters the apply gate, and UAT-05 rewrites completion anyway.
