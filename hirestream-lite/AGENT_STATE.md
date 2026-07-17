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

### Known-broken, NOT fixed (pre-existing)

- **The smoke half of `test:deep` has never worked against lite.** Two reasons:
  the script reads **`DEEP_URL`** (not `SMOKE_BASE` — passing the wrong var
  silently smokes `hirestream-stg` instead, which is exactly the four-portal
  landmine above), and its route autodiscovery needs `DEEP_SMOKE_TOKEN` + the
  `/api/v1/__routes` endpoint, which is dev-only — on a production build the SPA
  catch-all returns HTML and it dies on `Unexpected token '<'`. Setting the token
  is a config/secret decision for a human. **`npm test` (jest) is currently the
  only working gate.**
