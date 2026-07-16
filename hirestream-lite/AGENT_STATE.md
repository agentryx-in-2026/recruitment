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
