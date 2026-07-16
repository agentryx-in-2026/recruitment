# Deep / repeatable testing

Run these anytime — before a release, after a big change, or to re-verify a deployed
environment. Three independent layers; each catches a different class of problem.

| Command | What it is | What it catches | Needs |
|---|---|---|---|
| `npm test` | Jest integration + unit (~485 tests) | functional/logic bugs across every module & role | test DB (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright UI journeys (candidate/agent/admin/auth) | broken navigation, render, login flows | starts its own dev server on :5001 |
| `npm run smoke` | `scripts/deep-smoke.mjs` against a **running** server | broken routes (5xx/404), route-shadowing, missing role guards / privilege escalation | a running instance |
| `npm run test:deep` | `npm test` + `npm run smoke` | the combined gate | both of the above |

## The smoke harness (`scripts/deep-smoke.mjs`)

Environment-agnostic — point it at any running instance:

```bash
npm run smoke                                   # staging (default)
DEEP_URL=http://localhost:5001 npm run smoke    # local dev server
DEEP_URL=https://prod.example npm run smoke     # any environment
```

Credentials default to the seed accounts; override per role with `DEEP_PW_<ROLE>` /
`DEEP_U_<ROLE>` env vars. Exits non-zero on any failure (CI / pre-release gate friendly).

Three layers:
1. **AUTH** — every role logs in; bad password and unauthenticated requests are rejected.
2. **ROUTE HEALTH** — every role's GET endpoints return non-5xx with the `{success:true}`
   envelope. *(This is what caught the `/agencies/documents` 404 route-shadow bug — a
   literal route declared after `/:id` was being captured as an id.)*
3. **AUTHZ NEGATIVE MATRIX** — each role is **denied** (401/403) on endpoints belonging to
   other roles, so privilege-escalation / "role X reads role Y's data" regressions surface.

## Extending it

- New endpoint a role should read → add the path to that role's list in `ROUTES`.
- New endpoint a role must **not** reach → add it to that role's list in `FORBIDDEN`.
- Intentionally cross-role endpoints (e.g. `/agent/placements`, readable by agent **and**
  employer, each scoped to their own rows in the handler) belong in `ROUTES`, **not**
  `FORBIDDEN`. Verify the handler scopes the data before treating cross-role access as a leak.

## Known gaps (next layers to build)

The current harness is read-only (GET). Not yet covered, in rough priority order:
- **Mutation smoke** — POST/PATCH/DELETE happy-paths + validation rejections (best as Jest
  against the test DB, to avoid mutating shared state).
- **Data-isolation** — employer A cannot see employer B's placements (needs 2 fixture accounts).
- **Input-boundary** — empty/oversized/malformed payloads, error-path responses.

## CI gating

The `.github/workflows/pr-check.yml` workflow enforces deep testing on PRs to `main`.
It runs both `npm test` (Jest) and `npm run smoke` against a local dev server spun up in CI.
A red status check means your branch introduced a regression; you must fix it to unblock merging.
View the workflow execution logs in the Actions tab of the GitHub repository to debug failures.

## Deploy gate

`scripts/deploy-gate.sh <target-url>` wraps `pm2 restart hirestream` with a pre-flight smoke probe. A red smoke harness aborts the restart.

Usage:

    # Standard deploy
    ./scripts/deploy-gate.sh https://hirestream-stg.agentryx.dev

    # Emergency bypass (rarely correct; logs a loud warning):
    ./scripts/deploy-gate.sh https://hirestream-stg.agentryx.dev --force

This is the standard deploy path. Bare `pm2 restart hirestream` should not be invoked.
