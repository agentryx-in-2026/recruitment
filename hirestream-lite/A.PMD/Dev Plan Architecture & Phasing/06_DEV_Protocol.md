# HireStream — Development Protocol

**Project:** Overseas Placement Portal (HPSEDC)  
**Created:** 2026-04-12  
**Purpose:** Standard operating procedure for every development session. Makes testing automatic, not an afterthought.

---

## The One Rule

> **No function ships without its test. No exception.**

If you build an API endpoint, you write its integration test before moving to the next task.  
If you build a UI component, you write its component test before moving to the next task.  
If you build a utility function, you write its unit test before moving to the next task.

Tests are not a Phase 4 activity. Tests are written **during** development, in the same session, as part of the same task.

---

## Session Protocol (Every Development Session)

### 1. Start of Session — Context Load (2 minutes)

```
Read:  05_DEV_TASK_Monitor.md     → Know where we are
Read:  04_Master_Execution_Plan.md → Know what's next (if needed)
Run:   npm test                    → Confirm existing tests still pass
Run:   npm run dev                 → App starts without errors
```

### 2. During Session — Build + Test Cycle

For **each task** (not each session — each individual task):

```
Step 1: BUILD the feature
         - Write the backend code (route, storage, service)
         - Wire the frontend (API call, form, state)
         - Verify manually in browser (quick sanity check)

Step 2: SECURITY CHECK the feature (before testing)
         - Check: Does this endpoint validate all input? (Zod schema)
         - Check: Does this endpoint enforce RBAC? (protect + requireRole)
         - Check: Does this endpoint return password or sensitive data? (strip it)
         - Check: If file upload — is MIME type validated?
         - Check: If user-generated text — is it stored safely (no raw SQL)?
         - Check: If new cookie/session change — are flags set (httpOnly, secure, sameSite)?
         - Reference: A.PMD/Deployment Package/Security Audit/00_Security_Master_Checklist_HireStream.md

Step 3: TEST the feature (immediately, same session)
         - Write integration test for the endpoint
         - Write component test for the UI (if new component)
         - Write unit test for pure logic (if new utility)
         - Run: npm test -- --testPathPattern=<your-test-file>
         - All new tests must PASS before moving on

Step 4: VERIFY no regression
         - Run: npm test (full suite)
         - All existing tests must still PASS
         - If anything broke, fix it NOW

Step 5: COMMIT
         - git add <specific files>
         - git commit with descriptive message
         - Include test files in the same commit as the feature
```

### 3. End of Session — Update ALL Documents (5 minutes)

```
A. Update: 05_DEV_TASK_Monitor.md
         - Mark completed tasks: ⬜ → ✅
         - Mark test status: ⬜ → ✅
         - Update gate checks if milestone reached
         - Update Daily Log entry
         - Update Test Health Dashboard numbers
         - Update Quick Status section at top
         - Log any blockers

B. Update: Testing & User Documents/01_Test_Scope_Report.md
         - Update Quick Summary table (test counts, coverage)
         - Add new test files to Suite Inventory
         - Update Coverage by Feature Area table
         - Add entry to Test Run History

C. Update: Testing & User Documents/02_Test_Scenarios_Manual_Testing.md
         - Add new SCENARIO sections for any user-facing features built today
         - Update Post-Test Summary totals

D. Update: Testing & User Documents/03_User_Guide.md
         - Add how-to sections for any new end-user features
         - Update FAQ if relevant

E. Update: Testing & User Documents/04_Reference_Manual.md
         - Add new API endpoints to the reference tables
         - Update database schema section if tables changed
         - Update any system configuration changes
```

F. Create Release Pack (at phase gates / milestones only):
         - Run: npm run release:minor  (or :patch / :major / :hotfix)
         - Script runs tests → build → creates versioned tar.gz
         - Pack saved to: A.PMD/Deployment Package/Releases/
         - Update RELEASE_LOG.md
         - See: Releases/RELEASE_PIPELINE.md for full process

**This is mandatory, not optional.** Every milestone ships with updated docs + release pack.

---

## Test Writing Rules

### What Gets Tested and When

| You Built This | Write This Test | In This File | When |
|----------------|----------------|--------------|------|
| API endpoint (any CRUD) | Integration test | `tests/integration/<module>.test.ts` | Same session as endpoint |
| Zod validator/schema | Unit test | `tests/unit/validators.test.ts` | Same session as schema |
| Pure logic function (matching, calculation) | Unit test | `tests/unit/<function>.test.ts` | Same session as function |
| React page/component | Component test | `tests/component/<component>.test.tsx` | Same session as component |
| Multi-step workflow complete | E2E test | `tests/e2e/<workflow>.test.ts` | When workflow is end-to-end |
| Security-sensitive code | Security test | `tests/security/<area>.test.ts` | Same session |

### Test Coverage Expectations by Phase

| Phase | Cumulative Tests | Coverage Target |
|-------|-----------------|-----------------|
| Phase 1 complete | ~25 tests | >40% |
| Phase 2 complete | ~55 tests | >55% |
| Phase 3 complete | ~85 tests | >65% |
| Phase 4 complete | ~120 tests | >70% |
| Phase 5 complete | ~150 tests | >75% |

### Test File Naming Convention

```
tests/
├── unit/           → <function-name>.test.ts
├── integration/    → <module-name>.test.ts
├── component/      → <component-name>.test.tsx
├── e2e/            → <workflow-name>.test.ts
├── security/       → <area>.test.ts
└── performance/    → <metric>.test.ts
```

### Integration Test Template (copy for each new endpoint)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../server/app';  // or however app is exported
import { setupTestDB, teardownTestDB, truncateTables } from './setup';

describe('MODULE_NAME', () => {
  beforeAll(async () => { await setupTestDB(); });
  afterAll(async () => { await teardownTestDB(); });
  beforeEach(async () => { await truncateTables(); });

  describe('POST /api/v1/resource', () => {
    it('creates resource with valid data → 201', async () => {
      const res = await request(app)
        .post('/api/v1/resource')
        .send({ /* valid data */ })
        .expect(201);
      
      expect(res.body).toHaveProperty('id');
    });

    it('rejects missing required fields → 400', async () => {
      await request(app)
        .post('/api/v1/resource')
        .send({})
        .expect(400);
    });

    it('rejects unauthorized user → 401', async () => {
      await request(app)
        .post('/api/v1/resource')
        .send({ /* valid data */ })
        // no auth cookie
        .expect(401);
    });

    it('rejects wrong role → 403', async () => {
      // login as candidate, try agent endpoint
      await request(app)
        .post('/api/v1/resource')
        .set('Cookie', candidateCookie)
        .send({ /* valid data */ })
        .expect(403);
    });
  });
});
```

---

## Commit Protocol

### Commit Message Format

```
<type>(<scope>): <description>

- <detail 1>
- <detail 2>
- Tests: <test file(s) added/updated>
```

**Types:** feat, fix, test, refactor, style, docs, chore  
**Scope:** auth, candidate, jobs, applications, agencies, admin, drives, interviews, placements, notifications, grievances, faq, audit, i18n, ui, infra, ops-console

### Examples

```
feat(candidate): add education and experience CRUD

- POST/GET/PUT/DELETE for education records
- POST/GET/PUT/DELETE for experience records
- Profile completion percentage calculation
- Tests: candidates.test.ts, profile.test.ts
```

```
feat(jobs): implement advanced search with pagination

- Filter by country, salary range, experience, sector
- Pagination with ?page=&limit= and X-Total-Count header
- Sort by date, salary, match score
- Tests: jobs.test.ts (12 new test cases)
```

### What Goes in the Same Commit
- Feature code + its test = **one commit**
- Never commit feature without test
- Never commit test without feature (unless fixing a test)

---

## Definition of Done (Per Task)

A task is ✅ DONE only when ALL of these are true:

- [ ] Feature code written (backend + frontend if applicable)
- [ ] Feature works end-to-end (verified in browser)
- [ ] Test(s) written for the feature
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] No TypeScript errors (`npm run typecheck` or build succeeds)
- [ ] No console errors in browser
- [ ] Committed to git with descriptive message
- [ ] Task marked ✅ in 05_DEV_TASK_Monitor.md

---

## Definition of Done (Per Phase Gate)

A phase gate passes only when ALL of these are true:

- [ ] All phase tasks marked ✅ in monitor
- [ ] Demo script runs clean (from 04_Master_Execution_Plan.md)
- [ ] All tests passing (unit + integration + component)
- [ ] Test coverage has not decreased from previous phase
- [ ] No critical bugs open
- [ ] Release deployed to target environment
- [ ] Monitor updated: milestone log, test health, quick status

---

## Regression Prevention

### Before Starting Any New Feature

```bash
# Run the full test suite FIRST
npm test

# If anything fails, fix it BEFORE writing new code
# Never build on top of a broken test suite
```

### When a Test Breaks

1. **Stop current work.** A broken test is the highest priority.
2. **Diagnose:** Is this a test bug or a code bug?
3. **Fix:** If code changed and test is correct → fix the code. If test is outdated → update the test.
4. **Never delete a failing test** unless the feature was intentionally removed.
5. **Never skip a test** (`it.skip`) without a comment and a task to re-enable it.

---

## Monitor Update Checklist

After each development session, update 05_DEV_TASK_Monitor.md:

```
□ Quick Status table (current phase, day, overall %, endpoints, tables, tests)
□ Task checkboxes (⬜ → ✅ for completed tasks)
□ Test Written column (⬜ → ✅ for tests written)
□ Gate checks (if milestone reached)
□ Test Health Dashboard (tests written, passing, coverage)
□ Daily Log (new entry with what was done, tests added, release if any)
□ Blocker Log (if any new blockers)
□ Milestone Release Log (actual day filled in if released)
```

---

## When to Create E2E Tests

E2E tests are more expensive to write and maintain. Create them at these specific milestones:

| Milestone | E2E Test | Trigger |
|-----------|----------|---------|
| Phase 1 complete | `auth-flow.test.ts` | Full register → OTP → login → profile → logout |
| Phase 2 complete | `candidate-journey.test.ts` | Register → profile → search → apply → track |
| Phase 2 complete | `agency-journey.test.ts` | Register → agency → post job → manage applicants |
| Phase 3 complete | `placement-workflow.test.ts` | Full pipeline: post → apply → drive → interview → place |
| Phase 3 complete | `admin-journey.test.ts` | Login → verify agency → approve drive → generate report |
| Phase 4 complete | `i18n.test.ts` | Toggle language → verify all core flows in Hindi |

---

## Emergency Procedures

### If Tests Are Failing and You Can't Fix Them

1. Create a blocker entry in 05_DEV_TASK_Monitor.md
2. Document: which test, what error, what you tried
3. Do NOT proceed to next task — fix this first
4. If genuinely stuck: create `tests/__broken__/` and move the file there with a TODO comment

### If a Deployed Release Has a Bug

1. Write a test that reproduces the bug FIRST
2. Fix the bug
3. Verify the test passes
4. Commit: `fix(<scope>): <description of bug>`
5. Deploy hotfix
6. Log in monitor under Blocker Log

### If External API Integration Fails

1. Ensure the stub/mock interface is working
2. Log the external dependency issue in Blocker Log
3. Continue development with stubs
4. Mark the integration task as ⏭️ DEFERRED with reason

---

*This protocol is non-negotiable. It's what separates a project that ships from a project that crumbles.*
