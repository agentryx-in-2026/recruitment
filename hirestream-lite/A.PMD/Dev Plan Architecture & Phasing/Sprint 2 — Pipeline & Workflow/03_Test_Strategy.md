# Sprint 2 — Test Strategy Update

**Anchor:** PWS §3 visibility, §5 notifications, §6 cascade, §8 audit.
**Goal:** every PWS rule has at least one automated test. No rule is assumed.

## 1. Test pyramid

| Layer | Count target | Runs on |
|---|---|---|
| Unit (Zod schemas, pure functions) | ~40 | every commit |
| Integration (route + DB, one happy + edge cases) | ~35 | every commit |
| E2E (full pipeline flows via API) | ~12 | pre-merge + nightly |
| Visibility matrix (role × entity table) | ~28 cells | pre-merge |
| UI smoke (Playwright, critical paths) | ~8 | pre-deploy |

## 2. What's being added or changed

### 2.1 New test files

| File | Purpose |
|---|---|
| `tests/integration/pipeline-visibility.test.ts` | Role × visibility matrix — every cell |
| `tests/integration/requisition-pickup.test.ts` | Employer post → agent pick up → derivative creation |
| `tests/integration/cascading-close.test.ts` | Employer close → derivatives close → candidates notified |
| `tests/integration/notifications-matrix.test.ts` | Each of 14 events → correct recipients |
| `tests/integration/audit-log.test.ts` | Every state transition logged with required fields |
| `tests/integration/auto-close-cron.test.ts` | Cron scans and closes expired jobs |
| `tests/unit/notification-templates.test.ts` | Template interpolation, employer-name scrubbing |
| `tests/e2e/pipeline-full-flow.test.ts` | Full happy path end-to-end via API |

### 2.2 Updated existing tests

- `tests/integration/jobs.test.ts` — assert `visibility` column returned, filter works for anonymous/candidate
- `tests/integration/applications.test.ts` — assert candidate-facing notifications scrub employer names in negatives
- `tests/integration/superadmin-v121.test.ts` — assert new settings (pairing_mode, cascade_close_derivatives, etc.) round-trip correctly
- `tests/e2e/auth.test.ts` — ensure session stays valid across role transitions in the pipeline

## 3. Visibility matrix test (mandatory coverage)

File: `tests/integration/pipeline-visibility.test.ts`

For each cell in PWS §3, write a separate `it(...)` block. Example structure:

```
describe("Visibility matrix", () => {
  describe("candidate", () => {
    it("sees public agent jobs in /api/v1/jobs", ...)
    it("does NOT see visibility=agents_only", ...)
    it("sees derivative agent jobs (parent_requisition_id set) as normal public jobs", ...)
    it("404s on direct GET /api/v1/jobs/{employer_req_id}", ...)
  })
  describe("agent", () => {
    it("sees own requisition in /api/v1/agent/requisitions", ...)
    it("in pairing_mode=open, sees other employer reqs", ...)
    it("in pairing_mode=pinned_only + not pinned, does NOT see req", ...)
    ...
  })
  ...
})
```

Target: **28 test cases** covering every cell of the 4×7 matrix (some rows N/A).

## 4. Notification matrix test

File: `tests/integration/notifications-matrix.test.ts`

For each of the 14 events in PWS §5:

1. Trigger the event via API.
2. Query `notifications` table for candidate, agent, employer (3 queries).
3. Assert each received the expected count + that the message matches the expected template (with interpolation).
4. For negative events (reject, close): assert candidate's message contains **no employer name** (regex match against `employerName` in the test fixture).

```
it("Employer rejects a shortlist", async () => {
  // setup: employer, agent, candidate, job, application in shortlisted state
  await api.employer.reject(applicationId, { reason: "wrong skills" });

  const notifs = await db.notifications.where(...).all();
  expect(notifs.filter(n => n.userId === candidate.id)).toHaveLength(1);
  expect(notifs.filter(n => n.userId === candidate.id)[0].message)
    .not.toContain(employer.companyName);
  expect(notifs.filter(n => n.userId === candidate.id)[0].message)
    .toContain("Not selected this round");

  expect(notifs.filter(n => n.userId === agent.id)[0].message)
    .toContain(`Employer rejected ${candidate.fullName}`);

  // Audit log:
  const audit = await db.audit_log.where({ applicationId, action: "reject" }).first();
  expect(audit.actor_role).toBe("employer");
  expect(audit.from_state).toBe("shortlisted");
  expect(audit.to_state).toBe("rejected");
});
```

## 5. Cascading close test

File: `tests/integration/cascading-close.test.ts`

Setup fixtures:
- 1 employer requisition R
- 2 derivative agent jobs (J1, J2) linking to R
- 5 candidates with applications across J1 and J2 in various states

Test:
1. Employer closes R.
2. Assert R.status = closed, J1.status = closed, J2.status = closed.
3. Assert each candidate got a notification with "Position filled" and NOT the employer name.
4. Assert audit log has 3 rows (1 for R, 2 for derivatives) with correct cascade reason.
5. Counter-test: close J1 alone → assert R and J2 unchanged.

## 6. E2E full-flow test

File: `tests/e2e/pipeline-full-flow.test.ts`

One giant test, fixture-driven:

```
Happy path:
  1. Employer posts requisition (visibility=agents_only)
  2. Candidate searches /api/v1/jobs → does NOT see R
  3. Agent searches /api/v1/agent/requisitions → sees R
  4. Agent picks up R → creates derivative D (visibility=public)
  5. Candidate searches → sees D
  6. Candidate applies to D
  7. Agent reviews, shortlists
  8. Employer sees shortlist, approves
  9. Agent schedules interview
  10. Employer selects
  11. Agent issues appointment letter
  12. Candidate accepts
  13. Placement record created
  14. Assert every notification in §5 fired exactly once
  15. Assert audit log has 9 transitions

Sad path:
  Candidate declines → agent gets substitute prompt → new candidate added → loop
```

## 7. Security tests (continued from WASA)

Add to `tests/security/`:

- Candidate tries `GET /api/v1/jobs?status=all&mine=true` — assert only their own applied jobs, never employer reqs
- Agent A tries to pick up a requisition pinned to Agent B — assert 403
- Candidate tries `GET /api/v1/jobs/{employer_req_id}` directly by UUID — assert 404
- Employer A tries to see Employer B's requisition — assert 404

## 8. UI smoke tests (Playwright)

File: `tests/e2e/ui-pipeline-smoke.spec.ts`

Critical paths only (no deep interaction):
1. Candidate login → Browse Jobs → no employer requisition titles visible
2. Agent login → Open Requisitions tab exists → can click Pick Up
3. Employer login → Requisitions tab shows own → edit → close → reopen
4. Admin → System Config → flip `requisition.pairing_mode` to `pinned_only` → save → no errors

## 9. Test data / fixtures

Add to `tests/fixtures/pipeline.fixtures.ts`:
- `employerWithRequisition(partial?)` — seeds employer + requisition
- `agentWithDerivative(parentReqId, partial?)` — seeds agent + derivative job
- `candidateWithApplication(jobId, state, partial?)` — candidate + app in given state
- `fullPipelineState()` — composes all three + walks through all states

Seeders wire into existing `scripts/seed.ts` as a new optional flag `--pipeline-fixtures`.

## 10. CI configuration

| Check | Threshold | Blocking? |
|---|---|---|
| Unit tests pass | 100% | Yes |
| Integration tests pass | 100% | Yes |
| E2E tests pass | 100% | Yes |
| Visibility matrix coverage | 28/28 cells | Yes |
| Notification matrix coverage | 14/14 events | Yes |
| Code coverage on `server/routes/job.routes.ts` and `server/services/notification.service.ts` | ≥85% | Yes |
| Security tests | 100% | Yes |

## 11. Regression prevention

- Every new PWS amendment triggers a test-first workflow: write the failing test that captures the new rule, then write the code.
- Renaming a field or state is a PWS-level change — requires doc update + all tests updated in same PR.
- The Visibility Matrix test file has a comment: `// If you change this, update PWS §3`.

## 12. Deliverables checklist

- [ ] All 8 new test files written and passing
- [ ] All updated existing tests green
- [ ] CI pipeline green on main
- [ ] Test count visible in README.md
- [ ] `npm run test:pipeline` script added (runs only pipeline-related tests for fast feedback)

## 13. Test execution order in dev loop

During Phase 1–5 build:
1. Write failing test for the PWS rule being implemented.
2. Make the minimum code change to pass it.
3. Run affected test file only (`npm run test -- pipeline-visibility`).
4. Run full suite before commit.
5. Push → CI runs full matrix.

No phase is "done" until its tests are written, green, and reviewed.
