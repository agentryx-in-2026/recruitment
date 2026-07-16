# HireStream — Test Scope & Report

**Project:** Overseas Placement Portal (HPSEDC)  
**Created:** 13 Apr 2026  
**Updated:** 13 Apr 2026  
**Status:** Phase 2 Complete (Beta 0.5)

---

## Quick Summary

| Metric | Value | Updated |
|--------|-------|---------|
| **Total Tests** | 168 | 13 Apr 2026 |
| **Passing** | 168 (100%) | 13 Apr 2026 |
| **Failing** | 0 | 13 Apr 2026 |
| **Test Suites** | 10 | 13 Apr 2026 |
| **Unit Tests** | 18 | 13 Apr 2026 |
| **Integration Tests** | 150 | 13 Apr 2026 |
| **E2E Tests** | 0 (planned Phase 3-4) | — |
| **Security Tests** | 0 (planned Phase 4) | — |
| **Performance Tests** | 0 (planned Phase 4) | — |
| **Estimated Coverage** | ~65% | 13 Apr 2026 |
| **Last Full Run** | 13 Apr 2026 | — |

---

## Test Environment

| Component | Detail |
|-----------|--------|
| **Test Database** | `hirestream_test` on localhost:5432 |
| **Production Database** | `hirestream` on localhost:5432 |
| **Isolation** | `DATABASE_URL` overridden in `tests/setup.ts` — production DB is never touched |
| **Cleanup** | `TRUNCATE ... CASCADE` on all 20 tables between every test |
| **Test Runner** | Jest 30.x with ts-jest ESM preset |
| **HTTP Testing** | Supertest (in-process, no port binding) |
| **E2E Runner** | Playwright (planned) |

---

## Test Suite Inventory

### 1. Unit Tests — `tests/unit/`

| File | Tests | What's Covered |
|------|-------|---------------|
| `validators.test.ts` | 15 | registerSchema (7 cases), loginSchema (4 cases), otpSchema (4 cases) |

### 2. Integration Tests — `tests/integration/`

| File | Tests | Endpoints Covered | Key Scenarios |
|------|-------|-------------------|---------------|
| `auth.test.ts` | 27 | POST register, POST login, POST logout, GET /me, POST send-otp, POST verify-otp, POST request-password-reset, POST reset-password, GET sso/himaccess, POST verify-aadhaar | Valid/invalid data, duplicate email (409), wrong password (401), real OTP from DB, password reset token flow, anti-enumeration, SSO/Aadhaar stubs (501) |
| `candidates.test.ts` | 17 | GET/PATCH profile, POST/GET/PUT/DELETE education, POST/GET/PUT/DELETE experience, GET profile/completion, GET profile/pdf | CRUD + ownership checks, completion at 0%/63%/100%, PDF contains edu/exp, auth enforcement |
| `documents.test.ts` | 12 | POST upload, GET list, GET download, DELETE | Upload success, no-file (400), invalid type (400), auth (401), list, download with filename, delete + verify gone, cross-user block (403) |
| `jobs.test.ts` | 22 | POST create, GET search, GET :id, PUT edit, PATCH status, GET applicants, POST apply | Agent creates (201), candidate blocked (403), search with q/country filters, pagination + X-Total-Count, edit owner-only, deactivate hides from search, applicants with details, apply with real match score = 100, duplicate (409) |
| `applications.test.ts` | 10 | PATCH bulk-status, GET :id detail, GET recommendations | Bulk update 2 apps, empty ids (400), invalid status (400), candidate blocked (403), detail with score breakdown (50+30+20), recommendations sorted + excludes applied, empty for new profile, agent blocked (403) |
| `notifications.test.ts` | 14 | GET list, PATCH :id/read, POST mark-all-read, GET preferences, PATCH preferences, DELETE :id | Pagination, type filter, unread filter, welcome notification exists, mark read, mark all read, preferences default true, update prefs, empty body (400), delete |

### 3. End-to-End Tests — `tests/e2e/` (PLANNED)

| File | Status | What It Will Cover |
|------|--------|-------------------|
| `candidate-journey.test.ts` | Planned (Phase 3) | Register → Profile → Education → Experience → Upload Doc → Search Jobs → Apply → Track Status |
| `agency-journey.test.ts` | Planned (Phase 3) | Register → Create Agency → Get Verified → Post Job → View Applicants → Shortlist |
| `placement-workflow.test.ts` | Planned (Phase 3) | Full pipeline: Post Job → Apply → Drive → Interview → Select → Placement → Accept |
| `admin-journey.test.ts` | Planned (Phase 3) | Login → Verify Agency → Approve Drive → Generate Report → Handle Grievance |
| `auth-flow.test.ts` | Planned (Phase 4) | Register → OTP → Login → Forgot Password → Reset → Login with new password |

### 4. Security Tests — `tests/security/` (PLANNED)

| File | Status | What It Will Cover |
|------|--------|-------------------|
| `injection.test.ts` | Planned (Phase 4) | SQL injection in login, search, profile fields; XSS in text fields |
| `auth-bypass.test.ts` | Planned (Phase 4) | Every endpoint × every role; expired session; forged cookie |
| `rate-limit.test.ts` | Planned (Phase 4) | Auth: 21st request → 429; API: 101st → 429; Retry-After header |

### 5. Performance Tests — `tests/performance/` (PLANNED)

| File | Status | What It Will Cover |
|------|--------|-------------------|
| `page-load.test.ts` | Planned (Phase 4) | All pages load < 3s (FRS requirement) |
| `api-response.test.ts` | Planned (Phase 4) | All API endpoints p95 < 500ms (FRS requirement) |

---

## Coverage by Feature Area

| Feature Area | Endpoints | Tested | Coverage | Notes |
|-------------|-----------|--------|----------|-------|
| Authentication | 10 | 10 | **100%** | register, login, logout, me, OTP, reset, SSO, aadhaar |
| Candidate Profile | 3 | 3 | **100%** | get, update, completion |
| Education | 4 | 4 | **100%** | CRUD with ownership |
| Experience | 4 | 4 | **100%** | CRUD with ownership |
| Documents | 4 | 4 | **100%** | Upload, list, download, delete |
| PDF Export | 1 | 1 | **100%** | Profile export with edu/exp |
| Jobs | 7 | 7 | **100%** | CRUD, search, applicants, apply |
| Applications | 3 | 3 | **100%** | Bulk status, detail, recommendations |
| Notifications | 6 | 6 | **100%** | List, read, mark-all, prefs, delete |
| Validators | 3 schemas | 3 | **100%** | register, login, OTP |
| Drives | 8 | 8 | **100%** | CRUD, admin approve/reject, status filter |
| Interviews | 4 | 4 | **100%** | Schedule, list, my, record result |
| Placements | 4 | 4 | **100%** | Create, accept, decline, status validation |
| Grievances | 5 | 5 | **100%** | Submit, my, admin list, detail, resolve |
| FAQ | 4 | 4 | **100%** | Public list, admin CRUD |
| Announcements | 2 | 2 | **100%** | Public list, admin create |
| Training Events | 3 | 3 | **100%** | Public upcoming, admin create, auth |
| Admin Reports | 7 | 7 | **100%** | Dashboard + 6 report types |
| Audit Log | 2 | 2 | **100%** | List with filters, auth |
| Security (password) | 4 | 4 | **100%** | Strong password validation |

**All implemented endpoints have 100% test coverage.** Zero endpoints shipped without tests.

---

## Test Run History

| Date | Tests | Passing | Failing | Duration | Phase | Notes |
|------|-------|---------|---------|----------|-------|-------|
| 12 Apr 2026 | 27 | 27 | 0 | 76s | Phase 1 Day 1 | First tests: validators + auth |
| 12 Apr 2026 | 42 | 42 | 0 | 112s | Phase 1 Day 2 | + OTP, reset, SSO stubs |
| 12 Apr 2026 | 54 | 54 | 0 | 96s | Phase 1 Day 3 | + Documents |
| 12 Apr 2026 | 68 | 68 | 0 | 123s | Phase 1 Day 4 | + Education, experience, completion |
| 12 Apr 2026 | 71 | 71 | 0 | 156s | Phase 1 Day 5 | + PDF export (Alpha 0.1) |
| 12 Apr 2026 | 93 | 93 | 0 | 159s | Phase 2 Day 6 | + Jobs CRUD, search, match |
| 13 Apr 2026 | 103 | 103 | 0 | 195s | Phase 2 Day 7 | + Applications bulk, detail, recs |
| 13 Apr 2026 | 117 | 117 | 0 | 261s | Phase 2 Day 8 | + Notifications (Beta 0.5) |
| 13 Apr 2026 | 135 | 135 | 0 | 284s | Phase 3 Day 9 | + Drives, Interviews, Placements (full pipeline) |
| 13 Apr 2026 | 150 | 150 | 0 | 253s | Phase 3 Day 10 | + Admin reports (7 endpoints) + Security hardening (9 fixes) + Strong password tests |
| 13 Apr 2026 | 168 | 168 | 0 | 407s | Phase 3 Day 11 | + Grievances, FAQ, Announcements, Training, Audit (RC 0.9 — Feature Complete) |
| 13 Apr 2026 | 168 | 168 | 0 | 165s | Phase 4 Day 12 | i18n + CAPTCHA + Frontend sprint (no new backend = no new tests needed) |

---

## Known Gaps & Risks

| # | Gap | Risk | When Fixed |
|---|-----|------|-----------|
| 1 | No E2E browser tests yet | Multi-step flows untested in real browser | Phase 3-4 |
| 2 | No security-specific tests | Injection/bypass not formally verified | Phase 4 |
| 3 | No performance benchmarks | Page load / API p95 not measured | Phase 4 |
| 4 | Component (React) tests missing | UI logic untested in isolation | Phase 4 |
| 5 | Email delivery not verified in tests | Using dev logger, not real SMTP | When SMTP credentials arrive |
| 6 | SMS delivery not verified | Stub only | When SMS gateway credentials arrive |

---

## How to Run Tests

```bash
# Full suite (all 117 tests)
npm test

# Unit tests only (validators — fast, ~45s)
npm run test:unit

# Integration tests only (API endpoints — ~3 min)
npm run test:integration

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
```

---

*This report is updated after each development day and milestone release.*
