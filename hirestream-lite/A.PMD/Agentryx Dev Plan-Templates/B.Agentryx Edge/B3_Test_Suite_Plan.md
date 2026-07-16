# B3: Test Suite & Quality Assurance Plan — {Project Name}
> **Template Version:** 2.0 | **Created By:** AI Agent Pipeline
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Method:** Incremental test accumulation — tests are built WITH each function, NOT after. By project completion, the full regression suite already exists.
> **Architecture:** Dual-database — demo/test accounts always connect to `{dbname}-test`. Production data is never touched by tests.

---

## 1. Test Database Architecture

### The Dual-Database Design

```
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL Server (single instance)                          │
│                                                               │
│  ┌─────────────────────┐     ┌─────────────────────┐        │
│  │   {projectname}     │     │  {projectname}-test  │        │
│  │   (Main Database)   │     │  (Test Database)     │        │
│  │                     │     │                      │        │
│  │  Real users         │     │  Demo accounts only  │        │
│  │  Real data          │     │  Test/seed data      │        │
│  │  Production traffic │     │  Test traffic only   │        │
│  │                     │     │                      │        │
│  │  Used by:           │     │  Used by:            │        │
│  │  All real users     │     │  Demo accounts       │        │
│  │                     │     │  AI agent tests      │        │
│  │                     │     │  Admin test runner   │        │
│  └─────────────────────┘     └─────────────────────┘        │
│           ↑                            ↑                     │
│           └──── Same schema migrations ────┘                 │
│                 (drizzle-kit push runs on BOTH)              │
└──────────────────────────────────────────────────────────────┘
```

### Database Naming Convention
| Environment | Main Database | Test Database |
|-------------|:-------------|:-------------|
| Development | `{projectname}_dev` | `{projectname}_dev-test` |
| Staging | `{projectname}` | `{projectname}-test` |
| Production | `{projectname}` | `{projectname}-test` |

### Environment Variables
```env
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/{projectname}
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/{projectname}-test
```

### Schema Sync — How It Works
```bash
# Same migration command runs against BOTH databases
# Option 1: Two config files
npx drizzle-kit push --config=drizzle.config.ts          # → main DB
npx drizzle-kit push --config=drizzle.config.test.ts     # → test DB

# Option 2: Single script that does both
npx tsx scripts/migrate-all.ts   # Runs migrations on main + test

# Both databases ALWAYS have identical schema
# The ONLY difference is the DATA inside them
```

### Migration Script
```typescript
// scripts/migrate-all.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function migrateAll() {
  // Migrate main database
  const mainDb = postgres(process.env.DATABASE_URL!);
  await migrate(drizzle(mainDb), { migrationsFolder: './migrations' });
  console.log('✅ Main database migrated');
  await mainDb.end();

  // Migrate test database (same migrations, different target)
  const testDb = postgres(process.env.DATABASE_URL_TEST!);
  await migrate(drizzle(testDb), { migrationsFolder: './migrations' });
  console.log('✅ Test database migrated');
  await testDb.end();

  // Seed test database with demo data
  await seedTestDatabase();
  console.log('✅ Test database seeded with demo data');
}
```

---

## 2. Demo Accounts (Test Database Only)

### Demo Account Architecture
```
When a user logs in:
  │
  ├─ Is this a demo account? (user.is_demo === true)
  │     │
  │     YES → Route ALL queries to testDb ({projectname}-test)
  │     │     This user sees only test data
  │     │     This user can create/edit/delete freely
  │     │     Zero impact on production
  │     │
  │     NO → Route ALL queries to mainDb ({projectname})
  │           Normal production operation
  │
```

### Implementation — Database Selection Middleware
```typescript
// server/middleware/databaseSelector.ts

import { mainDb, testDb } from '../config/database';

export function databaseSelector(req, res, next) {
  // If the logged-in user is a demo account → use test DB
  if (req.user && req.user.is_demo === true) {
    req.db = testDb;       // All queries for this request → test database
    req.isTestMode = true;
  } else {
    req.db = mainDb;       // All queries for this request → main database
    req.isTestMode = false;
  }
  next();
}

// Usage in routes — ALWAYS use req.db, never import db directly
// router.get('/jobs', async (req, res) => {
//   const jobs = await req.db.select().from(schema.jobs);  // Correct ✅
// });
```

### Database Connection Setup
```typescript
// server/config/database.ts

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';

// Main database — production data
const mainConnection = postgres(process.env.DATABASE_URL!);
export const mainDb = drizzle(mainConnection, { schema });

// Test database — demo/test data only
const testConnection = postgres(process.env.DATABASE_URL_TEST!);
export const testDb = drizzle(testConnection, { schema });
```

### Demo Account Registry
> *These accounts exist ONLY in the test database. Seeded automatically.*

| # | Email | Password | Role | Purpose |
|---|-------|----------|------|---------|
| 1 | `demo.superadmin@{project}.test` | `DemoSuper@2026` | super_admin | Test all admin functions |
| 2 | `demo.admin@{project}.test` | `DemoAdmin@2026` | admin | Test admin operations |
| 3 | `demo.candidate@{project}.test` | `DemoCandidate@2026` | candidate | Test candidate journey |
| 4 | `demo.agency@{project}.test` | `DemoAgency@2026` | agency | Test agency functions |
| 5 | `demo.candidate2@{project}.test` | `DemoCandidate2@2026` | candidate | Test multi-user scenarios |

### Demo Account Properties
```typescript
// Demo accounts have a special flag
{
  email: 'demo.candidate@project.test',
  is_demo: true,           // ← This flag routes to test DB
  role: 'candidate',
  name: 'Priya Sharma (Demo)',
  // All other fields same as regular users
}
```

### Demo Data Seed Script
```typescript
// scripts/seed-test-database.ts
// Runs against {projectname}-test ONLY

export async function seedTestDatabase() {
  const db = testDb;

  // 1. Create demo user accounts
  await db.insert(schema.users).values([
    { email: 'demo.superadmin@project.test', role: 'super_admin', is_demo: true, name: 'Super Admin (Demo)', ... },
    { email: 'demo.admin@project.test', role: 'admin', is_demo: true, name: 'Admin (Demo)', ... },
    { email: 'demo.candidate@project.test', role: 'candidate', is_demo: true, name: 'Priya Sharma (Demo)', ... },
    { email: 'demo.agency@project.test', role: 'agency', is_demo: true, name: 'Global Placements Ltd (Demo)', ... },
  ]);

  // 2. Create realistic test data
  await db.insert(schema.jobs).values([
    { title: 'Software Engineer — Dubai', company: 'TechCorp FZE', salary: '...' },
    { title: 'Nurse — Singapore', company: 'Healthcare Pte', salary: '...' },
    // 10-20 realistic test jobs
  ]);

  // 3. Create test applications, documents, etc.
  // ... enough data to test all features realistically
}
```

---

## 3. Test Runner in Admin Console (B7 Integration)

### Admin Panel → Test Runner Page

```
┌──────────────────────────────────────────────────────────────┐
│  🧪 Test Runner                                  Super Admin │
│                                                               │
│  Database: {projectname}-test (always)                        │
│  Status: Ready                                                │
│                                                               │
│  ┌─ Select Modules ──────────────────────────────────────┐   │
│  │ [✅] M0  — Infrastructure (health, security, logging) │   │
│  │ [✅] M-AUTH — Authentication (register, login, RBAC)   │   │
│  │ [✅] M-ADMIN — Admin & Operations (config, users)     │   │
│  │ [  ] M1  — Candidate Profiles                         │   │
│  │ [  ] M2  — Job Management                             │   │
│  │ [  ] M3  — Applications                               │   │
│  │ [✅] ALL — Full Regression Suite                       │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Test Type ────────────────────────────────────────────┐   │
│  │ [✅] API Tests (backend endpoint tests)                │   │
│  │ [✅] UI Tests (browser automation via Playwright)      │   │
│  │ [  ] Security Tests (OWASP checks)                     │   │
│  │ [  ] Performance Tests (load testing)                  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  [ ▶ Run Selected Tests ]  [ 🔄 Reset Test Data ]            │
│                                                               │
│  ═══════════════════════════════════════════════════════════   │
│  📊 Results — Run #14 — 2026-04-02 10:30:15                  │
│                                                               │
│  M0 Infrastructure    ████████████████████ 12/12  ✅ 0.8s    │
│  M-AUTH Authentication ███████████████████ 24/24  ✅ 1.4s    │
│  M-ADMIN Operations   ████████████████████ 18/18  ✅ 1.1s    │
│  M1 Profiles          ██████████████████░░ 16/18  ⚠️ 1.2s    │
│  M2 Jobs              ████████████████████ 22/22  ✅ 0.9s    │
│                                                               │
│  Total: 92/94 passed | 2 failed | Coverage: 87% | 5.4s      │
│                                                               │
│  ┌─ Failed Tests ────────────────────────────────────────┐   │
│  │ ❌ M1.U14: should validate Aadhaar format             │   │
│  │    Expected: ValidationError                           │   │
│  │    Received: 200 OK                                    │   │
│  │    File: tests/unit/profiles/validation.test.ts:42    │   │
│  │                                                        │   │
│  │ ❌ M1.E03: profile edit saves changes (UI)             │   │
│  │    Expected: "Profile updated" toast                   │   │
│  │    Received: Timeout waiting for toast                 │   │
│  │    File: tests/e2e/profiles/edit.spec.ts:28           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Test History ────────────────────────────────────────┐   │
│  │ Run #14  2026-04-02 10:30  92/94  ⚠️  5.4s           │   │
│  │ Run #13  2026-04-01 16:20  90/90  ✅  4.8s           │   │
│  │ Run #12  2026-03-30 11:45  85/88  ⚠️  4.2s           │   │
│  │ Run #11  2026-03-28 09:30  82/82  ✅  3.9s           │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Test Runner API
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/v1/admin/tests/run` | Execute selected tests | Super Admin |
| GET | `/api/v1/admin/tests/status/:runId` | Poll test run progress | Super Admin |
| GET | `/api/v1/admin/tests/results/:runId` | Get detailed results | Super Admin |
| GET | `/api/v1/admin/tests/history` | List past test runs | Super Admin |
| POST | `/api/v1/admin/tests/reset-data` | Reset test DB to seed state | Super Admin |
| GET | `/api/v1/admin/tests/modules` | List available test modules | Super Admin |

### Test Run Request
```json
{
  "modules": ["M0", "M-AUTH", "M-ADMIN"],  // or ["ALL"]
  "types": ["api", "ui"],                    // api | ui | security | performance
  "database": "test"                         // always "test" in production
}
```

### Test Run Response (SSE / polling)
```json
{
  "runId": "run-014",
  "status": "running",  // running | passed | failed | error
  "startedAt": "2026-04-02T10:30:15Z",
  "progress": {
    "total": 94,
    "completed": 54,
    "passed": 54,
    "failed": 0,
    "currentModule": "M1 — Profiles"
  }
}
```

### Server-Side Test Execution
```typescript
// server/services/testRunner.service.ts

import { exec } from 'child_process';

export async function executeTests(options: TestRunOptions) {
  const { modules, types } = options;

  // Build the test command dynamically based on selected modules
  const testPaths = modules.map(m => `tests/**/${m.toLowerCase()}/**`);
  const grepPattern = types.includes('ui') ? '' : '--grep "^(?!.*\\[UI\\])"';

  // Set environment to use test database
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_TEST, // Force test DB
    NODE_ENV: 'test',
  };

  // Run Jest for API tests
  if (types.includes('api')) {
    await runCommand(`npx jest ${testPaths.join(' ')} --json --outputFile=results.json`, env);
  }

  // Run Playwright for UI tests
  if (types.includes('ui')) {
    await runCommand(`npx playwright test ${testPaths.join(' ')} --reporter=json`, env);
  }

  return parseResults('results.json');
}
```

---

## 4. Incremental Test Accumulation Pipeline

### The Core Principle
> **Every function built = its tests written and run immediately.** Tests are not an afterthought. They accumulate module-by-module. By project completion, the full regression suite already exists and has been validated at every step.

### How It Works

```
Phase 1: Build M0 (Infrastructure)
  │  Agent builds: health check, error handler, security middleware
  │  Agent writes: 12 tests (unit + integration)
  │  Agent runs: 12/12 pass ✅
  │  Master suite: 12 tests
  │
Phase 1: Build M-AUTH (Authentication)
  │  Agent builds: register, login, RBAC middleware
  │  Agent writes: 24 tests (unit + integration + UI)
  │  Agent runs: 24/24 new pass ✅
  │  Agent runs: 12 previous tests (REGRESSION) ✅
  │  Master suite: 36 tests (12 + 24)
  │
Phase 1: Build M-ADMIN.1 (Config Management)
  │  Agent builds: config CRUD, config API
  │  Agent writes: 14 tests
  │  Agent runs: 14/14 new pass ✅
  │  Agent runs: 36 previous tests (REGRESSION) ✅
  │  Master suite: 50 tests (36 + 14)
  │
Phase 2: Build M1 (Profiles)
  │  Agent builds: profile CRUD, file upload
  │  Agent writes: 18 tests
  │  Agent runs: 18/18 new pass ✅
  │  Agent runs: 50 previous tests (REGRESSION) ✅
  │  Master suite: 68 tests (50 + 18)
  │
  ... continues for every module ...
  │
Phase 4 (End): All modules complete
  │  Master suite: ~150+ tests
  │  ALL 150+ tests have been run and validated
  │  Full regression: every function tested against every other function
  │  Zero test debt — nothing to write "at the end"
```

### The Rule
```
┌─────────────────────────────────────────────────────────────┐
│  DEVELOPMENT RULE: NO CODE SHIPS WITHOUT ITS TESTS          │
│                                                              │
│  1. Build function → Write tests → Run tests → Pass → DONE │
│  2. Run ALL previous tests (regression) → Must still pass   │
│  3. If regression fails → fix before moving on              │
│  4. Tests go in master suite → never deleted                │
│                                                              │
│  If new tests: 18/18 pass ✅                                │
│  But old tests: 49/50 pass ❌  ← THIS BLOCKS PROGRESS      │
│  Fix the regression FIRST, then continue.                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Test Types & Frameworks

### Test Layers

| Layer | Framework | Runs Against | What It Tests | When |
|-------|----------|:-------------|:-------------|:-----|
| **Unit Tests** | Jest | In-memory (no DB) | Individual functions, validators, helpers | Every code change |
| **Integration Tests** | Jest + Supertest | Test DB (`{project}-test`) | API endpoints end-to-end (HTTP → response) | Every code change |
| **UI Tests (E2E)** | Playwright | Test DB (via demo accounts) | Browser-level user flows (click, type, verify) | After each module |
| **Security Tests** | Custom + OWASP checklist | Test DB | Injection, broken auth, access control | Phase gates |
| **Performance Tests** | k6 / Artillery | Test DB | Response time, concurrent load | Phase gates |

### Test File Organization
```
tests/
├── unit/                           # Unit tests (no DB, no HTTP)
│   ├── auth/
│   │   ├── register.test.ts        # M-AUTH unit tests
│   │   ├── login.test.ts
│   │   └── rbac.test.ts
│   ├── profiles/
│   │   ├── validation.test.ts      # M1 unit tests
│   │   └── service.test.ts
│   └── jobs/
│       └── service.test.ts         # M2 unit tests
│
├── integration/                    # API endpoint tests (uses test DB)
│   ├── auth.test.ts                # POST /api/v1/auth/*
│   ├── profiles.test.ts            # /api/v1/profiles/*
│   ├── jobs.test.ts                # /api/v1/jobs/*
│   ├── admin.config.test.ts        # /api/v1/admin/config/*
│   └── admin.users.test.ts         # /api/v1/admin/users/*
│
├── e2e/                            # Browser UI tests (Playwright, uses demo accounts)
│   ├── auth/
│   │   ├── register.spec.ts        # Fill registration form, verify account created
│   │   └── login.spec.ts           # Login with demo account, verify dashboard
│   ├── profiles/
│   │   └── edit-profile.spec.ts    # Edit profile fields, verify saved
│   ├── jobs/
│   │   ├── search.spec.ts          # Search with filters, verify results
│   │   └── apply.spec.ts           # Apply for job, verify confirmation
│   ├── admin/
│   │   ├── config.spec.ts          # Change config values, verify applied
│   │   ├── log-viewer.spec.ts      # Open log viewer, verify logs display
│   │   └── user-mgmt.spec.ts       # CRUD users, verify changes
│   └── full-regression.spec.ts     # Complete user journey: register → login → profile → apply → track
│
├── security/                       # OWASP security tests
│   ├── injection.test.ts
│   ├── auth-bypass.test.ts
│   └── access-control.test.ts
│
├── performance/                    # Load tests
│   └── load.k6.js
│
├── fixtures/                       # Test data and helpers
│   ├── seed-test-db.ts             # Seed test database
│   ├── demo-accounts.ts            # Demo account credentials
│   └── test-data.ts                # Reusable test data factories
│
└── jest.config.ts                  # Test configuration
```

---

## 6. Test Scenario Templates

### Per Module — Unit + Integration + UI Tests

#### Module: {Module ID} — {Name}

**Unit Tests**
| # | Test ID | Test Name | Input | Expected | Priority | Status |
|---|---------|-----------|-------|----------|:--------:|:------:|
| 1 | {M}.U01 | {should validate email format} | `"not-an-email"` | `ValidationError` | P0 | ☐ |
| 2 | {M}.U02 | {should hash password} | `"plaintext"` | `hash ≠ input` | P0 | ☐ |
| 3 | {M}.U03 | {should enforce min password length} | `"ab"` | `ValidationError` | P0 | ☐ |

**Integration Tests (API)**
| # | Test ID | Method | Endpoint | Input | Expected Status | Priority | Status |
|---|---------|--------|----------|-------|:---------------:|:--------:|:------:|
| 1 | {M}.I01 | POST | `/api/v1/{resource}` | Valid payload | 201 | P0 | ☐ |
| 2 | {M}.I02 | POST | `/api/v1/{resource}` | Missing required field | 400 | P0 | ☐ |
| 3 | {M}.I03 | POST | `/api/v1/{resource}` | Duplicate entry | 409 | P0 | ☐ |
| 4 | {M}.I04 | GET | `/api/v1/{resource}` | No auth | 401 | P0 | ☐ |
| 5 | {M}.I05 | GET | `/api/v1/{resource}` | Wrong role | 403 | P0 | ☐ |
| 6 | {M}.I06 | GET | `/api/v1/{resource}` | Valid auth | 200 + data | P0 | ☐ |
| 7 | {M}.I07 | PATCH | `/api/v1/{resource}/:id` | Valid update | 200 + updated | P1 | ☐ |
| 8 | {M}.I08 | DELETE | `/api/v1/{resource}/:id` | Valid delete | 200 | P1 | ☐ |

**UI Tests (E2E — Playwright)**
| # | Test ID | Scenario | Demo Account | Steps | Expected | Status |
|---|---------|----------|:-------------|-------|----------|:------:|
| 1 | {M}.E01 | {Feature visible on page} | `demo.candidate` | Navigate to page | Page loads, elements visible | ☐ |
| 2 | {M}.E02 | {Form submission works} | `demo.candidate` | Fill form → submit | Success toast, data appears in list | ☐ |
| 3 | {M}.E03 | {Form validation shows errors} | `demo.candidate` | Submit empty form | Error messages appear under fields | ☐ |
| 4 | {M}.E04 | {Unauthorized access blocked} | `demo.candidate` | Navigate to admin page | Redirected to dashboard / 403 page | ☐ |

---

## 7. Playwright E2E Test Structure

### How UI Tests Use Demo Accounts
```typescript
// tests/e2e/auth/login.spec.ts

import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../fixtures/demo-accounts';

// All E2E tests use demo accounts → always connected to test DB
test.describe('Login Flow', () => {
  
  test('candidate can login and see dashboard', async ({ page }) => {
    await page.goto('/login');
    
    // Use demo candidate account (→ test DB automatically)
    await page.fill('#email', DEMO_ACCOUNTS.candidate.email);
    await page.fill('#password', DEMO_ACCOUNTS.candidate.password);
    await page.click('button[type=submit]');
    
    // Verify dashboard loaded
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('.stats-card')).toBeVisible();
  });

  test('admin can access admin panel', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('#email', DEMO_ACCOUNTS.admin.email);
    await page.fill('#password', DEMO_ACCOUNTS.admin.password);
    await page.click('button[type=submit]');
    
    // Navigate to admin panel
    await page.click('a[href="/admin"]');
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('.admin-panel')).toBeVisible();
  });

  test('candidate CANNOT access admin panel', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('#email', DEMO_ACCOUNTS.candidate.email);
    await page.fill('#password', DEMO_ACCOUNTS.candidate.password);
    await page.click('button[type=submit]');
    
    // Try to access admin panel
    await page.goto('/admin');
    
    // Should be redirected or see 403
    await expect(page).not.toHaveURL('/admin');
  });
});
```

### Demo Accounts Fixture
```typescript
// tests/fixtures/demo-accounts.ts

export const DEMO_ACCOUNTS = {
  super_admin: {
    email: 'demo.superadmin@{project}.test',
    password: 'DemoSuper@2026',
    role: 'super_admin',
  },
  admin: {
    email: 'demo.admin@{project}.test',
    password: 'DemoAdmin@2026',
    role: 'admin',
  },
  candidate: {
    email: 'demo.candidate@{project}.test',
    password: 'DemoCandidate@2026',
    role: 'candidate',
  },
  agency: {
    email: 'demo.agency@{project}.test',
    password: 'DemoAgency@2026',
    role: 'agency',
  },
};
```

### Playwright Config
```typescript
// playwright.config.ts
export default {
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:5000',
    // Demo accounts always use test DB — no special config needed
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',      // Save video of failed tests for debugging
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // Add 'firefox', 'webkit' if cross-browser testing needed
  ],
};
```

---

## 8. Test Data Reset

### Why Reset?
Tests create, modify, and delete data. Over time, the test DB accumulates residual data. Resetting restores it to a clean, known state.

### Reset Process
```
Admin Panel → Test Runner → [🔄 Reset Test Data]
   │
   ▼
1. Truncate all tables in {projectname}-test (CASCADE)
2. Re-run seed script (demo accounts + test data)
3. Verify seed: all demo accounts can login
4. Report: "Test database reset to clean state"
```

### Reset API
```
POST /api/v1/admin/tests/reset-data
Auth: Super Admin only
Response: { "status": "reset_complete", "tables_truncated": 12, "demo_accounts": 5, "test_records": 85 }
```

### Auto-Reset Options
| Strategy | When | Use Case |
|----------|------|----------|
| **Manual reset** | Admin clicks "Reset Test Data" | Before a planned test run |
| **Before each test run** | Auto-reset before `▶ Run Selected Tests` | Clean state for every test run |
| **Keep state** | Don't reset — tests accumulate data | Useful for testing data growth scenarios |

> Default recommendation: **Auto-reset before each full test run.** Tests should be independent and not rely on side effects of previous runs.

---

## 9. Security Test Checklist (OWASP Top 10)

| # | Vulnerability | Test Method | Runs Against | Status |
|---|--------------|------------|:-------------|:------:|
| S01 | SQL Injection | Inject `'; DROP TABLE--` in all text inputs | Test DB | ☐ |
| S02 | Broken Authentication | Use expired/tampered session, brute force login | Test DB | ☐ |
| S03 | Sensitive Data Exposure | Check password not in API response or logs | Test DB | ☐ |
| S04 | XXE | Send XML payload to JSON endpoints | Test DB | ☐ |
| S05 | Broken Access Control | Access admin routes with candidate token | Test DB | ☐ |
| S06 | Security Misconfiguration | Check headers: X-Frame, CSP, HSTS, X-Content-Type | Test DB | ☐ |
| S07 | XSS | Inject `<script>alert('xss')</script>` in text fields | Test DB | ☐ |
| S08 | Insecure Deserialization | Send malformed JSON payloads | Test DB | ☐ |
| S09 | Known Vulnerabilities | `npm audit` — 0 critical/high | N/A | ☐ |
| S10 | Insufficient Logging | Verify all auth events logged, no PII in logs | Test DB | ☐ |

---

## 10. Performance Benchmarks

| Endpoint | Method | Target (p95) | Concurrent Users | Duration | Status |
|----------|--------|:-------------|:----------------:|:--------:|:------:|
| `/api/v1/health` | GET | < 50ms | 100 | 60s | ☐ |
| `/api/v1/auth/login` | POST | < 300ms | 50 | 60s | ☐ |
| `/api/v1/jobs` (with filters) | GET | < 200ms | 50 | 60s | ☐ |
| `/api/v1/jobs/:id` | GET | < 100ms | 50 | 60s | ☐ |
| Dashboard page load | Browser | < 2s (FCP) | 10 | — | ☐ |

---

## 11. Master Test Registry (Incremental Growth Tracker)

> *This table grows as each module is built. It is the proof that tests accumulated incrementally.*

| Module | Phase | Unit | Integration | UI (E2E) | Security | Total | All Pass? | Added Date |
|--------|:-----:|:----:|:----------:|:--------:|:--------:|:-----:|:---------:|:----------:|
| M0 Infrastructure | 1 | 4 | 6 | 2 | — | 12 | ☐ | {date} |
| M-AUTH | 1 | 8 | 10 | 6 | — | 24 | ☐ | {date} |
| M-ADMIN.1 Config | 1 | 4 | 6 | 4 | — | 14 | ☐ | {date} |
| M-ADMIN.4 Users | 1 | 4 | 6 | 4 | — | 14 | ☐ | {date} |
| M1 Profiles | 2 | 6 | 8 | 4 | — | 18 | ☐ | {date} |
| M2 Jobs | 2 | 8 | 10 | 4 | — | 22 | ☐ | {date} |
| M3 Applications | 2 | 8 | 10 | 6 | — | 24 | ☐ | {date} |
| Security Suite | 3 | — | — | — | 10 | 10 | ☐ | {date} |
| Performance Suite | 4 | — | — | — | 5 | 5 | ☐ | {date} |
| **TOTAL** | | **42** | **56** | **30** | **15** | **143** | | |

### Regression Check at Each Phase Gate
```
Phase 1 Gate: Run 64 tests (M0 + M-AUTH + M-ADMIN.1 + M-ADMIN.4)
Phase 2 Gate: Run 128 tests (Phase 1 + M1 + M2 + M3)
Phase 3 Gate: Run 138 tests (Phase 2 + Security)
Phase 4 Gate: Run 143 tests (ALL — full regression) ← FINAL
```

---

## 12. Full Regression Test (End-to-End Journey)

> *The ultimate test — a complete user journey through the entire system.*

```typescript
// tests/e2e/full-regression.spec.ts
// This test simulates a complete user lifecycle

test.describe('Full System Regression', () => {

  test('Complete candidate journey', async ({ page }) => {
    // 1. Register new candidate
    await page.goto('/register');
    await page.fill('#name', 'Regression Test User');
    await page.fill('#email', 'regression@test.example');
    await page.fill('#password', 'RegressionTest@2026');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL('/dashboard');

    // 2. Complete profile
    await page.click('a[href="/profile"]');
    await page.fill('#phone', '+91 98765 43210');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.toast-success')).toBeVisible();

    // 3. Upload document
    await page.click('a[href="/documents"]');
    await page.setInputFiles('input[type=file]', 'tests/fixtures/sample-resume.pdf');
    await expect(page.locator('.document-card')).toBeVisible();

    // 4. Search for jobs
    await page.click('a[href="/jobs"]');
    await page.fill('#search', 'Engineer');
    await expect(page.locator('.job-card')).toHaveCount({ min: 1 });

    // 5. Apply for a job
    await page.click('.job-card >> nth=0');
    await page.click('button:has-text("Apply")');
    await expect(page.locator('.toast-success')).toContainText('Application submitted');

    // 6. Check application status
    await page.click('a[href="/applications"]');
    await expect(page.locator('.application-card')).toHaveCount({ min: 1 });
    await expect(page.locator('.status-badge')).toContainText('Submitted');

    // 7. Logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL('/login');
  });

  test('Complete admin journey', async ({ page }) => {
    // Login as demo admin
    await page.goto('/login');
    await page.fill('#email', DEMO_ACCOUNTS.admin.email);
    await page.fill('#password', DEMO_ACCOUNTS.admin.password);
    await page.click('button[type=submit]');

    // 1. Check admin dashboard
    await expect(page.locator('.admin-stats')).toBeVisible();

    // 2. View and manage users
    await page.click('a[href="/admin/users"]');
    await expect(page.locator('table')).toBeVisible();

    // 3. Change a config setting
    await page.click('a[href="/admin/config"]');
    // ... verify config panel works

    // 4. View logs
    await page.click('a[href="/admin/logs"]');
    await expect(page.locator('.log-entry')).toHaveCount({ min: 1 });

    // 5. Check health dashboard
    await page.click('a[href="/admin/health"]');
    await expect(page.locator('.health-status')).toContainText('Online');
  });
});
```

---

## 13. Test Commands Reference

```bash
# Run all unit tests
npm run test:unit

# Run all integration tests (uses test DB)
npm run test:integration

# Run all E2E tests (uses demo accounts → test DB)
npm run test:e2e

# Run tests for a specific module
npm run test -- --grep "M-AUTH"
npm run test:e2e -- --grep "auth"

# Run full regression (all tests)
npm run test:all

# Run with coverage report
npm run test:coverage

# Run security tests
npm run test:security

# Run performance tests
npm run test:perf

# Reset test database to clean state
npm run test:reset
```

### package.json scripts
```json
{
  "scripts": {
    "test:unit": "jest --testPathPattern=tests/unit",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:e2e": "npx playwright test",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:coverage": "jest --coverage --testPathPattern='tests/(unit|integration)'",
    "test:security": "jest --testPathPattern=tests/security",
    "test:perf": "k6 run tests/performance/load.k6.js",
    "test:reset": "npx tsx scripts/seed-test-database.ts"
  }
}
```

---

## 14. Database Tables Added by Test Module

| Table | Database | Purpose |
|-------|:---------|---------|
| `test_runs` | Main DB | Test run history (run ID, timestamp, results summary) |
| `test_results` | Main DB | Detailed test results per run (each test case result) |

> Note: Test run metadata is stored in the MAIN database (it's operational data about the system). The actual tests EXECUTE against the TEST database.

---

## 15. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial test plan |
| 2.0 | {YYYY-MM-DD} | | Rewritten: dual-database architecture, demo accounts, admin UI test runner, incremental accumulation |

---

> *Tests are built WITH the code, not after. They accumulate incrementally. By Phase 4, you have 140+ tests covering every function — and every test has already been validated. The test database ensures zero risk to production data. The admin console lets you run any subset of tests with one click. The AI agent writes and maintains the entire test suite.*
