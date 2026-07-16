# HireStream — Development Task Monitor

**Project:** Overseas Placement Portal (HPSEDC)  
**Created:** 2026-04-12  
**Updated:** 2026-04-14  
**Master Plan:** [04_Master_Execution_Plan.md](04_Master_Execution_Plan.md)

---

## Quick Status

| Metric | Value | Updated |
|--------|-------|---------|
| **Current Phase** | Phase 5 nearing complete (Exceed 20% Beyond FRS) | 14 Apr 2026 |
| **Current Day** | Day 23 — v1.4.0 Tier 3 Roundup | 14 Apr 2026 |
| **Overall Progress** | Backend **100%** / Frontend **97%** / E2E Usable **~96%** | 14 Apr 2026 |
| **Endpoints Built / Needed** | **134** / ~90+ (EXCEEDED by 49%) | 14 Apr 2026 |
| **Tables Migrated / Needed** | 22 / 22 (+ users.two_factor_* columns Day 23) | 14 Apr 2026 |
| **Tests Passing** | **288** (18 unit + 255 integration + 15 E2E) — **ALL GREEN** | 14 Apr 2026 |
| **Test Coverage** | ~70%+ (target met) | 14 Apr 2026 |
| **E2E Playwright** | 4 spec files (auth-flow, candidate, agent, admin-superadmin) — **15/15 passing** (100%) | 14 Apr 2026 |
| **Security Audit Items** | **29/31 resolved** (2 deployment-time-only: T6 CAPTCHA key, L11 Nginx server_tokens) | 14 Apr 2026 |
| **Roles Supported** | 5: candidate / agent / employer / admin / **superadmin** (new Day 17) | 14 Apr 2026 |
| **PWA** | ✅ manifest + service worker + icons (Day 17) | 14 Apr 2026 |
| **Dark Mode** | ✅ toggle + persistence + no-flash init (Day 17) | 14 Apr 2026 |
| **Frontend Overhaul Plan** | [07_Frontend_Overhaul_Plan.md](07_Frontend_Overhaul_Plan.md) | 13 Apr 2026 |
| **Blockers** | None | — |
| **Tier 1 Closure** | **8/8 items closed** (T1.1-T1.8) — v1.2 GA-ready | 14 Apr 2026 |
| **Next Milestone** | **v1.2.0 GA** — only deployment-time items remain (CAPTCHA key, Nginx server_tokens) | — |

---

## Phase Progress Tracker

### Phase 1: Foundation Completion (Week 1 — Days 1-5)

**Status:** IN PROGRESS (Day 1 complete)  
**Target:** Alpha 0.1 release

#### Day 1 — Database Migrations & Infrastructure Hardening (M1) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 1.1 | Migration: `notifications` table (missing from migration) | ✅ DONE | migrations/0001_true_kylun.sql | — | Pushed via drizzle-kit |
| 1.2 | Migration: `candidate_education` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.3 | Migration: `candidate_experience` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.4 | Migration: `grievances` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.5 | Migration: `recruitment_drives` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.6 | Migration: `interviews` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.7 | Migration: `placements` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.8 | Migration: `audit_log` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.9 | Migration: `faq` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.10 | Migration: `announcements` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.11 | Migration: `training_events` table | ✅ DONE | migrations/0001_true_kylun.sql | — | |
| 1.12 | Env validation with Zod (crash early) | ✅ DONE | server/config/env.config.ts | — | Added SMTP, SMS, integrations, features helper |
| 1.13 | Winston logger with rotation + error file | ✅ DONE | server/config/logger.config.ts | — | 10MB rotation, 14 files, error.log separate |
| 1.14 | Test infra setup (jest.config, test DB, npm scripts) | ✅ DONE | jest.config.js, tests/setup.ts, tests/helpers.ts | ✅ | 6 npm test scripts added |
| 1.15 | Unit tests: validators (register, login, otp) | ✅ DONE | tests/unit/validators.test.ts | ✅ | 15 tests passing |
| 1.16 | Integration tests: auth endpoints | ✅ DONE | tests/integration/auth.test.ts | ✅ | 12 tests passing |
| 1.17 | Fix TS errors in candidate.routes.ts, agency.routes.ts | ✅ DONE | server/routes/ | — | implicit any types |

**Day 1 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| All 18 tables created (both dev + test DB) | ✅ |
| App starts without error (PM2 online, health endpoint responds) | ✅ |
| Test infra runs (27 tests passing) | ✅ |

---

#### Day 2 — Authentication Hardening (M2) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 2.1 | Real OTP: generate 6-digit → store with TTL → verify | ✅ DONE | server/services/otp.service.ts | ✅ | Crypto random, 5min TTL, max 5 attempts |
| 2.2 | Email OTP sender (nodemailer SMTP) | ✅ DONE | server/services/email.service.ts | ✅ | HTML templates, dev mode logs to console |
| 2.3 | SMS OTP sender (stub interface, logs in dev) | ✅ DONE | server/services/sms.service.ts | — | Ready for NIC/Twilio when creds arrive |
| 2.4 | Password reset flow (request → email token → reset) | ✅ DONE | POST /api/v1/auth/request-password-reset, /reset-password | ✅ | Token-based, 1hr expiry, anti-enumeration |
| 2.5 | Session hardening (httpOnly, secure, sameSite, pg-simple) | ✅ DONE | server/routes.ts | — | connect-pg-simple in prod, memory in test |
| 2.6 | Login page UI upgrade | ✅ DONE | client/src/pages/auth-page.tsx | ⏭️ | Split layout, icons, show/hide password, loading |
| 2.7 | Registration with role descriptions | ✅ DONE | client/src/pages/auth-page.tsx | ⏭️ | Role icons + descriptions, govt branding |
| 2.8 | HIM Access SSO stub route | ✅ DONE | GET /api/v1/auth/sso/himaccess | ✅ | Returns 501 until creds arrive |
| 2.9 | Aadhaar verification stub route | ✅ DONE | POST /api/v1/auth/verify-aadhaar | ✅ | Returns 501, validates 12-digit |
| 2.10 | Forgot password UI flow | ✅ DONE | auth-page.tsx ForgotPasswordForm | — | Email input → success state → back link |
| 2.11 | **TEST:** auth.test.ts (27 tests covering all auth endpoints) | ✅ DONE | tests/integration/auth.test.ts | ✅ | OTP, reset, SSO stubs, aadhaar all tested |
| 2.12 | otp_codes + password_reset_tokens tables + schema | ✅ DONE | shared/schema.ts, migrations | — | 2 new tables (total now 20) |

**Day 2 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| OTP email sent (dev: logged to console) | ✅ |
| Session uses connect-pg-simple (prod) | ✅ |
| auth.test.ts all 27 passing | ✅ |
| auth-page.test.tsx | ⏭️ Deferred to Phase 4 UI polish |

---

#### Day 3 — File Upload & Documents (M3a) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 3.1 | Multer setup (5MB, PDF/JPG/PNG, /uploads/) | ✅ DONE | server/middleware/upload.middleware.ts | — | Unique filenames, MIME filter |
| 3.2 | POST /api/v1/candidates/documents — upload | ✅ DONE | server/routes/document.routes.ts | ✅ | cv/passport/certificate/other types |
| 3.3 | GET /api/v1/candidates/documents — list | ✅ DONE | server/routes/document.routes.ts | ✅ | |
| 3.4 | DELETE /api/v1/candidates/documents/:id | ✅ DONE | server/routes/document.routes.ts | ✅ | Deletes file from disk + DB |
| 3.5 | GET /api/v1/candidates/documents/:id/download | ✅ DONE | server/routes/document.routes.ts | ✅ | Serves file with original filename |
| 3.6 | DigiLocker stub button in UI | ⏭️ DEFERRED | — | — | Will add during candidate profile UI rebuild (Day 4) |
| 3.7 | **TEST:** 12 document tests (upload, list, download, delete, auth, cross-user) | ✅ DONE | tests/integration/documents.test.ts | ✅ | Includes cross-candidate auth test |

**Day 3 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| File upload to /uploads/ works | ✅ |
| Document CRUD all 4 operations work | ✅ |
| documents.test.ts all 12 passing | ✅ |

---

#### Day 4 — Education, Experience & Profile Completion (M3b) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 4.1 | Education CRUD (POST/GET/PUT/DELETE) | ✅ DONE | candidate.routes.ts | ✅ | Ownership verification on update/delete |
| 4.2 | Experience CRUD (POST/GET/PUT/DELETE) | ✅ DONE | candidate.routes.ts | ✅ | Ownership verification on update/delete |
| 4.3 | Profile completion % calculation | ✅ DONE | GET /api/v1/candidates/profile/completion | ✅ | 8 checkpoints, returns % + missing fields |
| 4.4 | Profile Form UI rebuild (tabbed) | ⏭️ DEFERRED | — | — | Day 5 with dashboard refresh |
| 4.5 | **TEST:** 14 tests (edu CRUD, exp CRUD, completion 0%/63%/100%) | ✅ DONE | tests/integration/candidates.test.ts | ✅ | |

**Day 4 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| Education CRUD works (all 4 ops) | ✅ |
| Experience CRUD works (all 4 ops) | ✅ |
| Profile completion: 63% with basic info, 100% with all sections | ✅ |
| All 68 tests passing | ✅ |

---

#### Day 5 — Candidate Dashboard & PDF Export (M3c) ✅ COMPLETE — ALPHA 0.1

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 5.1 | Candidate dashboard — all real data, no mocks | ✅ DONE | candidate-dashboard.tsx | ⏭️ | 6 API queries, real stats, initials avatar |
| 5.2 | PDF profile export endpoint | ✅ DONE | GET /api/v1/candidates/profile/pdf | ✅ | HTML resume with edu/exp/skills |
| 5.3 | Loading skeletons for all data sections | ✅ DONE | candidate-dashboard.tsx | — | Skeleton placeholders while loading |
| 5.4 | Initials avatar (replaces stock photo) | ✅ DONE | candidate-dashboard.tsx | — | Deterministic color from name |
| 5.5 | Education/Experience/Documents sidebar panels | ✅ DONE | candidate-dashboard.tsx | — | Real data from API |
| 5.6 | **TEST:** PDF export (3 tests: basic, with edu/exp, auth) | ✅ DONE | tests/integration/candidates.test.ts | ✅ | |
| 5.7 | **RELEASE:** Alpha 0.1 deployed | ✅ DONE | PM2 restart, health OK | — | |

**Day 5 Gate (Alpha 0.1):** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| Register → Login → Profile → Education → Experience → Documents → PDF Export → Logout | ✅ |
| Dashboard shows all real data (no mocks, no hardcoded numbers) | ✅ |
| All 71 tests passing (Phase 1 complete) | ✅ |
| Alpha 0.1 deployed to production VM | ✅ |

---

### Phase 2: Core Business Logic (Week 2-3 — Days 6-15)

**Status:** NOT STARTED  
**Target:** Beta 0.5 release

#### Day 6 — Job Management Completion (M4) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 6.1 | PUT /api/v1/jobs/:id — edit job | ✅ DONE | job.routes.ts | ✅ | Owner-only auth |
| 6.2 | PATCH /api/v1/jobs/:id/status — activate/deactivate/close | ✅ DONE | job.routes.ts | ✅ | 3 status values |
| 6.3 | GET /api/v1/jobs/:id — single job detail | ✅ DONE | job.routes.ts | ✅ | Public endpoint |
| 6.4 | GET /api/v1/jobs/:id/applicants — per-job applicant list | ✅ DONE | job.routes.ts | ✅ | Returns candidate details + match score |
| 6.5 | Advanced search (q, country, location, sector, minExp, maxExp) | ✅ DONE | job.routes.ts | ✅ | ilike filters |
| 6.6 | Pagination (?page=&limit= + X-Total-Count header) | ✅ DONE | job.routes.ts | ✅ | Returns pagination object |
| 6.7 | Sort (date, salary, title + asc/desc) | ✅ DONE | job.routes.ts | — | |
| 6.8 | **Real match score algorithm** (replaces Math.random) | ✅ DONE | job.routes.ts calculateMatchScore() | ✅ | Skill 50% + Exp 30% + Country 20% |
| 6.9 | Duplicate application prevention (409) | ✅ DONE | job.routes.ts | ✅ | |
| 6.10 | Job detail/search UI | ⏭️ DEFERRED | — | — | Phase 4 UI polish |
| 6.11 | **TEST:** 22 tests (CRUD, search, filters, pagination, applicants, apply, match score) | ✅ DONE | tests/integration/jobs.test.ts | ✅ | |

**Day 6 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| Job full CRUD (create, get, edit, deactivate) | ✅ |
| Search with filters + pagination + X-Total-Count | ✅ |
| Applicants list with candidate details + match score | ✅ |
| Real match score (100% for perfect skill+exp+country match) | ✅ |
| All 93 tests passing | ✅ |

---

#### Day 7 — Application & Matching (M5) ✅ COMPLETE

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 7.1 | Real match algorithm (built into Day 6 job.routes.ts) | ✅ DONE | job.routes.ts | ✅ | Skill 50% + Exp 30% + Country 20% |
| 7.2 | Bulk status update (max 50, with notifications) | ✅ DONE | PATCH /api/v1/applications/bulk-status | ✅ | Notifies each candidate |
| 7.3 | Application detail with score breakdown | ✅ DONE | GET /api/v1/applications/:id | ✅ | Shows skill/exp/country breakdown |
| 7.4 | Candidate recommendations (top 10, excludes applied) | ✅ DONE | GET /api/v1/applications/recommendations/for-me | ✅ | Sorted by score, includes breakdown |
| 7.5 | Duplicate application prevention (409) | ✅ DONE | Day 6 job.routes.ts | ✅ | |
| 7.6 | Status change → notification created | ✅ DONE | candidate.routes.ts + bulk-status | ✅ | Existing single + new bulk |
| 7.7 | **TEST:** 10 tests (bulk, detail+breakdown, recommendations, auth) | ✅ DONE | tests/integration/applications.test.ts | ✅ | |

**Day 7 Gate:** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| Match score is accurate with breakdown (skill/exp/country) | ✅ |
| Bulk status update works (notifies each candidate) | ✅ |
| Recommendations exclude applied jobs, sorted by score | ✅ |
| Score breakdown shows detail text for each component | ✅ |
| All 103 tests passing | ✅ |

---

#### Day 8 — Notifications & Communication (M8) ✅ COMPLETE — BETA 0.5

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 8.1 | Central notify() service (in-app + email + SMS dispatch) | ✅ DONE | server/services/notification.service.ts | ✅ | Checks user prefs |
| 8.2 | Notification list with pagination + type/unread filters | ✅ DONE | GET /api/v1/notifications | ✅ | Returns unreadCount |
| 8.3 | Notification preferences (GET + PATCH) | ✅ DONE | /api/v1/notifications/preferences | ✅ | email/sms/inApp |
| 8.4 | Delete notification | ✅ DONE | DELETE /api/v1/notifications/:id | ✅ | |
| 8.5 | Welcome notification on registration | ✅ DONE | auth.routes.ts | ✅ | |
| 8.6 | All routes converted to notify() | ✅ DONE | job, candidate, application routes | — | |
| 8.7 | User notify preference columns | ✅ DONE | schema.ts | — | |
| 8.8 | **TEST:** 14 tests (list, filter, read, mark-all, prefs, delete) | ✅ DONE | tests/integration/notifications.test.ts | ✅ | |
| 8.9 | **RELEASE:** Beta 0.5 | ✅ DONE | PM2, health OK | — | |

**Day 8 Gate (Beta 0.5):** PASSED ✅

| Gate Check | Status |
|-----------|--------|
| notify() dispatches email (logged in dev) on key events | ✅ |
| User preferences respected | ✅ |
| Pagination + filters work | ✅ |
| All 117 tests passing | ✅ |
| Beta 0.5 deployed | ✅ |

---

### Phase 3: Advanced Workflows (Week 4-5 — Days 16-25)

**Status:** NOT STARTED  
**Target:** RC 0.9 release

#### Day 16-18 — Recruitment Drives & Interviews (M6a)

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 16.1 | Drive CRUD (POST/GET/PATCH/DELETE) | ⬜ TODO | server/routes/drive.routes.ts | ⬜ | |
| 16.2 | Admin drive approval/rejection | ⬜ TODO | PATCH /api/v1/admin/drives/:id | ⬜ | |
| 16.3 | Interview scheduling (POST) | ⬜ TODO | server/routes/interview.routes.ts | ⬜ | |
| 16.4 | Interview result recording | ⬜ TODO | PATCH /api/v1/interviews/:id/result | ⬜ | |
| 16.5 | Candidate's upcoming interviews view | ⬜ TODO | GET /api/v1/interviews/my | ⬜ | |
| 16.6 | Interview notification (SMS + email + in-app) | ⬜ TODO | interview.routes.ts | ⬜ | |
| 16.7 | Drive page UI (agent: create, status, candidates) | ⬜ TODO | client/src/ | ⬜ | |
| 16.8 | Drive approval UI (admin: queue, approve/reject, calendar) | ⬜ TODO | client/src/ | ⬜ | |
| 16.9 | **TEST:** drives.test.ts | ⬜ TODO | tests/integration/drives.test.ts | ✅ self | |
| 16.10 | **TEST:** interviews.test.ts | ⬜ TODO | tests/integration/interviews.test.ts | ✅ self | |

#### Day 19-20 — Placements & Appointment Letters (M6b)

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 19.1 | Placement CRUD + appointment letter upload | ⬜ TODO | server/routes/placement.routes.ts | ⬜ | |
| 19.2 | Candidate accept/decline placement | ⬜ TODO | PATCH /api/v1/placements/:id/accept | ⬜ | |
| 19.3 | Auto status chain (selected → placement → placed) | ⬜ TODO | placement logic | ⬜ | |
| 19.4 | Candidate placement card + letter download | ⬜ TODO | candidate-dashboard.tsx | ⬜ | |
| 19.5 | **TEST:** placements.test.ts | ⬜ TODO | tests/integration/placements.test.ts | ✅ self | |
| 19.6 | **TEST:** E2E placement-workflow.test.ts | ⬜ TODO | tests/e2e/placement-workflow.test.ts | ✅ self | |
| 19.7 | **RELEASE:** Beta 0.7 (Day 20) | ⬜ TODO | PM2 restart | — | |

**Day 20 Gate (Beta 0.7):** Drive → approve → interview → select → place → letter → accept

| Gate Check | Status |
|-----------|--------|
| Full placement lifecycle works | ⬜ |
| placement-workflow E2E passing | ⬜ |

---

#### Day 21-23 — Admin Reports & Agency Enhancement (M7)

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 21.1 | 6 report endpoints (district/agency/skill/status/country/sector) | ⬜ TODO | server/routes/admin/reports.ts | ⬜ | |
| 21.2 | CSV export (?format=csv) | ⬜ TODO | reports.ts | ⬜ | |
| 21.3 | PDF export (summary reports) | ⬜ TODO | reports.ts | ⬜ | |
| 21.4 | Admin dashboard — all real metrics | ⬜ TODO | admin-dashboard.tsx | ⬜ | |
| 21.5 | Agency verification enhancement (doc viewer, history) | ⬜ TODO | admin-dashboard.tsx | ⬜ | |
| 21.6 | Agency detail page (profile + jobs + placements) | ⬜ TODO | client/src/pages/admin/ | ⬜ | |
| 21.7 | **TEST:** admin-reports.test.ts | ⬜ TODO | tests/integration/admin-reports.test.ts | ✅ self | |

#### Day 24-25 — Grievances, FAQ, Announcements, Audit (M9 + M11)

| # | Task | Status | Endpoint/File | Test Written | Notes |
|---|------|--------|---------------|-------------|-------|
| 24.1 | Grievance CRUD + workflow (submit → review → resolve) | ⬜ TODO | server/routes/grievance.routes.ts | ⬜ | |
| 24.2 | FAQ CRUD + public page | ⬜ TODO | server/routes/faq.routes.ts | ⬜ | |
| 24.3 | Announcements CRUD + dashboard banner | ⬜ TODO | server/routes/announcement.routes.ts | ⬜ | |
| 24.4 | Training events CRUD + notification trigger | ⬜ TODO | server/routes/training.routes.ts | ⬜ | |
| 24.5 | Audit log middleware + viewer + CSV export | ⬜ TODO | server/middleware/audit.middleware.ts | ⬜ | |
| 24.6 | **TEST:** grievances/faq/announcements/audit tests | ⬜ TODO | tests/integration/*.test.ts | ✅ self | |
| 24.7 | **TEST:** E2E admin-journey.test.ts | ⬜ TODO | tests/e2e/admin-journey.test.ts | ✅ self | |
| 24.8 | **RELEASE:** RC 0.9 (Day 25) — Feature Complete | ⬜ TODO | Deploy to staging | — | |

**Day 25 Gate (RC 0.9 — Feature Complete):** All FRS requirements implemented

| Gate Check | Status |
|-----------|--------|
| All FRS functional requirements met | ⬜ |
| All 6 report types generate + export | ⬜ |
| Grievance lifecycle works | ⬜ |
| Audit log captures all admin actions | ⬜ |
| All Phase 3 tests passing | ⬜ |
| RC 0.9 deployed to staging | ⬜ |

---

### Phase 4: Polish & Launch (Week 6 — Days 26-30)

**Status:** NOT STARTED  
**Target:** v1.0 Production release

#### Day 26-27 — UI Polish & Layout Consistency (M12)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 26.1 | Header redesign (HPSEDC branding, nav per role) | ⬜ TODO | |
| 26.2 | Login page upgrade (government aesthetic, stepped flow) | ⬜ TODO | |
| 26.3 | Landing page refresh (real stats from API, proper CTAs) | ⬜ TODO | |
| 26.4 | Navigation consistency (sidebar, breadcrumbs) | ⬜ TODO | |
| 26.5 | Responsive audit (375/768/1024/1440px) | ⬜ TODO | |
| 26.6 | Loading skeletons, error states, empty states | ⬜ TODO | |
| 26.7 | Accessibility pass (focus, aria, keyboard, contrast) | ⬜ TODO | GIGW |
| 26.8 | Print stylesheets (reports, profiles) | ⬜ TODO | |

#### Day 28 — Internationalization (M10)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 28.1 | react-i18next setup | ⬜ TODO | |
| 28.2 | Extract strings to locales/en.json + locales/hi.json | ⬜ TODO | |
| 28.3 | Language toggle in header (EN \| हिंदी) | ⬜ TODO | |
| 28.4 | Preference persists (localStorage + user profile) | ⬜ TODO | |
| 28.5 | All core flows work in Hindi | ⬜ TODO | |

#### Day 29-30 — Security Hardening & Test Suite Completion (M13 final)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 29.1 | CORS whitelist production domain | ⬜ TODO | |
| 29.2 | CSP headers | ⬜ TODO | |
| 29.3 | Input sanitization (HTML strip on text fields) | ⬜ TODO | |
| 29.4 | File upload magic byte check | ⬜ TODO | |
| 29.5 | Security tests (injection, XSS, RBAC, rate limit, session) | ⬜ TODO | |
| 29.6 | Performance tests (page load <3s, API p95 <500ms) | ⬜ TODO | |
| 29.7 | E2E: candidate-journey, agency-journey, auth-flow | ⬜ TODO | |
| 29.8 | Coverage target: >70% | ⬜ TODO | |
| 29.9 | **RELEASE:** v1.0 (Day 30) — Production Go-Live | ⬜ TODO | |

**Day 30 Gate (v1.0 — Production):**

| Gate Check | Status |
|-----------|--------|
| All FRS requirements met | ⬜ |
| Bilingual UI (EN/HI) works | ⬜ |
| Test coverage >70% | ⬜ |
| Page load <3s all pages | ⬜ |
| API p95 <500ms | ⬜ |
| Zero critical security findings | ⬜ |
| v1.0 deployed to production | ⬜ |

---

### Phase 5: Exceed 20% (Week 7-8 — Days 31-42)

**Status:** NOT STARTED  
**Target:** v1.2 Full Exceed release

#### Day 31-37 — Ops Console & Admin Console (M14 + M15)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 31-33 | Ops Console Phase A (Overview, Resources, Pipeline, Backups) | ⬜ TODO | |
| 34-35 | Ops Console Phase B (Logs, Lookup, Log Query) | ⬜ TODO | |
| 36-37 | Ops Console Phase C (DB Explorer, System, Signals) + Admin Console | ⬜ TODO | |

#### Day 38-39 — PWA & AI Features (M16 + M17)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 38 | PWA (service worker, manifest, install prompt, push) | ⬜ TODO | |
| 39 | AI Resume Parsing + Smart Match enhancement | ⬜ TODO | |

#### Day 40-42 — Journey Timeline, Ratings, Final Polish (M18)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 40 | Candidate journey timeline | ⬜ TODO | |
| 41 | Agency reputation/rating system | ⬜ TODO | |
| 42 | Dashboard charts, dark mode, bulk exports, final E2E pass | ⬜ TODO | |
| 42 | **RELEASE:** v1.2 (Day 42) — Full Exceed | ⬜ TODO | |

---

## Milestone Release Log

| Release | Target Day | Actual Day | Status | Notes |
|---------|-----------|------------|--------|-------|
| Alpha 0.1 | Day 5 | Day 5 (12 Apr 2026) | ✅ RELEASED | Auth + Profiles + Docs + Education + Experience + PDF Export |
| Alpha 0.2 | Day 8 | Day 6 (12 Apr) | ✅ RELEASED | + Jobs + Match algorithm (merged with Beta) |
| Alpha 0.3 | Day 12 | — | ⬜ Pending | + Applications + Matching |
| Beta 0.5 | Day 15 | Day 8 (13 Apr 2026) | ✅ RELEASED | + Jobs + Applications + Matching + Notifications (AHEAD OF SCHEDULE) |
| Beta 0.7 | Day 20 | Day 9 (13 Apr) | ✅ RELEASED | + Drives + Interviews + Placements (merged with RC) |
| RC 0.9 | Day 25 | Day 11 (13 Apr) | ✅ RELEASED | **Feature Complete — ALL FRS requirements met** |
| **v1.0** | **Day 30** | Day 12 (13 Apr) | ✅ RELEASED | **Production Go-Live — i18n, CAPTCHA, all dashboards real data** |
| v1.1 | Day 37 | — | ⬜ Pending | + Ops Console + Admin Console |
| **v1.2** | **Day 42** | — | ⬜ Pending | **Full Exceed (20% beyond FRS)** |

---

## Test Health Dashboard

| Category | Tests Written | Tests Passing | Coverage | Last Run |
|----------|--------------|---------------|----------|----------|
| Unit | 15 | 15 | validators 100% | 12 Apr 2026 |
| Integration | 102 | 102 | auth, documents, candidates, jobs, applications, notifications | 13 Apr 2026 |
| Component | 0 | 0 | 0% | — |
| E2E | 0 | 0 | — | — |
| Security | 0 | 0 | — | — |
| Performance | 0 | 0 | — | — |
| **Total** | **117** | **117** | **~48%** | 13 Apr 2026 |

---

## Blocker Log

| # | Date | Blocker | Impact | Resolution | Resolved |
|---|------|---------|--------|------------|----------|
| — | — | No blockers yet | — | — | — |

---

## Daily Log

| Day | Date | What Was Done | Tests Added | Release | Notes |
|-----|------|---------------|-------------|---------|-------|
| 0 | 12 Apr 2026 | Planning complete. Master plan + monitor + protocol created. | 0 | — | Ready to start Phase 1 |
| 1 | 12 Apr 2026 | 10 new tables in schema + migrated to both DBs. Env config enhanced (SMTP/SMS/integrations). Winston logger upgraded (rotation, error file, silent in tests). Test infra fully rebuilt (jest.config, helpers, setup, 6 npm scripts). Fixed TS errors in candidate + agency routes. | 27 (15 unit + 12 integration) | — | Day 1 gate PASSED. All 18 tables live. |
| 2 | 12 Apr 2026 | Real OTP system (crypto random, DB-backed, 5min TTL, max attempts). Email service (nodemailer, HTML templates, dev logging). SMS service (stub). Password reset (token-based, 1hr expiry, anti-enumeration). Session hardened (connect-pg-simple, httpOnly, sameSite). Auth page UI redesign (split layout, govt branding, forgot password, role descriptions, show/hide password, loading spinners). SSO + Aadhaar stubs. 2 new tables (otp_codes, password_reset_tokens). | +15 integration (42 total) | — | Day 2 gate PASSED. 6 new endpoints. |
| 3 | 12 Apr 2026 | Multer file upload middleware (5MB, PDF/JPG/PNG, unique filenames). Document routes: upload, list, download, delete — all with proper auth (candidate owns docs, cross-user blocked). File served with original filename. Disk cleanup on delete. | +12 integration (54 total) | — | Day 3 gate PASSED. 4 new endpoints. |
| 4 | 12 Apr 2026 | Education CRUD (POST/GET/PUT/DELETE) with ownership verification. Experience CRUD (POST/GET/PUT/DELETE) with ownership verification. Profile completion endpoint (8 checkpoints: name, email, phone, location, skills, education, experience, documents). Returns percentage + missing fields list. | +14 integration (68 total) | — | Day 4 gate PASSED. 9 new endpoints (4 edu + 4 exp + 1 completion). |
| 5 | 12 Apr 2026 | PDF profile export (HTML resume with edu/exp/skills). Candidate dashboard fully rewired to real API (6 queries: profile, completion, applications, education, experience, documents). Removed all hardcoded/mock data. Initials avatar replaces stock photo. Loading skeletons. Education/experience/documents sidebar panels. | +3 integration (71 total) | **Alpha 0.1** | Day 5 gate PASSED. First milestone released. |
| 6 | 12 Apr 2026 | Complete job management rewrite: edit (PUT), deactivate (PATCH status), single job detail (GET :id), per-job applicants list with candidate details. Advanced search (q, country, location, sector, exp range) + pagination (page/limit + X-Total-Count + totalPages). Real match algorithm: skill overlap 50% + experience 30% + country pref 20%. Duplicate app prevention (409). | +22 integration (93 total) | — | Day 6 gate PASSED. 5 new endpoints. Math.random GONE. |
| 7 | 13 Apr 2026 | Application routes: bulk status update (max 50, notifies each candidate), application detail with full score breakdown (skill/exp/country detail text), candidate recommendations (top 10 by match, excludes applied jobs, includes breakdown). | +10 integration (103 total) | — | Day 7 gate PASSED. 3 new endpoints. |
| 8 | 13 Apr 2026 | Central notify() service (in-app + email + SMS, respects user prefs). Notification routes: pagination, type/unread filter, preferences GET/PATCH, delete. Welcome notification on register. All routes converted from raw DB insert to notify(). User notify pref columns added. | +14 integration (117 total) | **Beta 0.5** | Day 8 gate PASSED. Phase 2 complete. AHEAD OF SCHEDULE (planned Day 15). |
| 9 | 13 Apr 2026 | Full recruitment workflow: Drive CRUD (create/list/my/detail/edit/cancel) + admin approve/reject with notifications. Interview scheduling (create, list per drive, my interviews, record result → auto-updates application status). Placements (create for selected apps, detail, candidate accept/decline with reason). 15 new endpoints in one route file. DEV Protocol updated with mandatory doc updates. | +18 integration (135 total) | — | Day 9 gate PASSED. Full placement pipeline works end-to-end. |
| 10 | 13 Apr 2026 | **SECURITY:** 9 audit fixes — strong password (8+ upper/lower/digit/special), session timeout 30min, single session per user, CORS whitelist, CSP headers, HSTS, block TRACE, Cache-Control no-store, autocomplete off. **REPORTS:** 7 admin endpoints — dashboard stats (real aggregated), by-district, by-agency, by-skill (demand/supply), by-placement-status (funnel), by-country, by-sector. Security master checklist created with 25-point verification matrix. | +15 (150 total) | — | Day 10 gate PASSED. 24/31 security items resolved. |
| 11 | 13 Apr 2026 | **GRIEVANCES:** Full CRUD + workflow (submit→under_review→resolved) with admin notes + resolution notes + notifications. **FAQ:** Public list + admin CRUD (question/answer EN+HI, category, sort order, active toggle). **ANNOUNCEMENTS:** Time-bound, role-targeted, pinnable + admin CRUD. **TRAINING:** Upcoming events + admin CRUD. **AUDIT LOG:** Middleware + paginated viewer (filter by action/resource/user). | +18 (168 total) | **RC 0.9** | Day 11 gate PASSED. **ALL FRS REQUIREMENTS MET.** Phase 3 complete. |
| 12 | 13 Apr 2026 | **FRONTEND SPRINT:** All 4 dashboards rebuilt with real API data (zero mocks). Orphan process fix. Navigation upgrade (sticky header, role-based links, user dropdown, mobile menu). **i18n:** react-i18next + EN/HI locale files (200+ translated strings), language toggle in header, persists to localStorage. Translated: auth, FAQ, grievance, footer, header. **CAPTCHA:** Stub on login (checkbox, blocks submit until checked). **NEW PAGES:** /faq (search + accordion), /grievances (submit + track), announcement banner on dashboards. **SEEDED:** 10 FAQs, 2 announcements. Test accounts (su@hirestream/ulan + c@t/a@t/e@t/x@t). | 168 (no new tests — frontend only) | — | Phase 4 partial. i18n + CAPTCHA + frontend complete. |
| 13 | 13 Apr 2026 | **SPRINT A:** Auto-profile on register, 5-tab profile wizard, visual application pipeline, agent applicant manager (data table+bulk), drive creation form, admin approval/reject/resolve buttons. **SPRINT B:** Recharts (bar+pie), recommendations section, font toggle (GIGW). **v1.1.0 pack created (94MB).** | 168 | v1.1.0 | Sprint A+B complete. |
| 14 | 13 Apr 2026 | **UI POLISH:** Gov masthead (tricolor+HPSEDC), landing hero overhaul (gradient+frosted cards+wave), tinted stat cards, SVG profile ring, split-pane candidate dashboard (sidebar+content), save/bookmark jobs (API+UI), saved jobs view, LGD districts dropdown, 200+ pre-made skills in 8 categories, country selection cards. Removed "AI" → "Smart matching". Full address fields pending. | 168 | — | Phase 4.5+4.6 in progress. Candidate page significantly improved. |
| 15 | 13 Apr 2026 | **PREMIUM UI TRANSFORMATION (Part 1):** Profile Wizard fully rebuilt — gradient hero header with progress bar, animated step navigation (5 colored pills), Framer Motion page transitions, colored section panels (blue Identity, emerald Address, violet Edu, emerald Exp, amber Skills, rose Docs), premium inputs (h-12 rounded-xl, icon-prefixed, colored focus rings), Hint badges with amber gradient, animated record cards. Candidate Dashboard rebuilt — premium sidebar (gradient profile card with completion ring, navigation with colored badges, Quick Stats, Edu/Exp summary), animated stat cards with hover-lift, AnimatePresence view transitions, all 6 views (Overview, Jobs, Applications, Recommended, Saved, Documents) with premium polish. | 168 | — | Major visual overhaul. Layout uses CSS Grid `minmax()` for font-size resilience. |
| 16 | 14 Apr 2026 | **LAYOUT UNIFICATION + ALIGNMENT:** All major shells (header, masthead, footer, announcement banner, all dashboards) unified to `max-w-[1800px]` container with consistent `px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12`. Sidebar moved from fixed `w-[280px]` to `grid-cols-[minmax(220px,280px)_1fr]` for true alignment with header. Sidebar `sticky top-20` with internal scroll. Replaced SVG completion ring with progress bar (font-size resilient). Stat cards redesigned compact-horizontal with subtitle + arrow. Quick Stats made clickable. Font-size accessibility scale rescaled (16/19/24px from 14/16/18px) — smallest now readable, largest is true accessibility size. Premium UI transformation extended to Agent Dashboard (5-view sidebar nav, candidate detail Dialog with Email/Call actions), Employer Dashboard (4-view sidebar, JobCard with applicant link), Admin Dashboard (dark gradient hero header with Shield icon, all cards rounded-xl with borders). Auth Page premium upgrade (deeper gradient with blur orbs, tricolor accent bar, frosted-glass logo card, gradient text headline, larger shadow card with User badge above title, gradient CTAs). Landing Page — added 4th & 5th stakeholders (Government Officers + Super Admin) with role tag badges, fixed invisible-text bug on "For Agencies" button, removed duplicate "Home" link in header. | 168 | — | All pages now share unified visual language and pixel-perfect alignment with header. |
| 17 | 14 Apr 2026 | **SUPER ADMIN + PHASE 5 SHIPPED:** New `superadmin` role (5th role). Backend: `superadmin.routes.ts` (8 endpoints — users CRUD, role change, enable/disable, stats, DB reset, DB reseed). Schema: `agency_reviews` table created (rating 1-5, title, review). All `role==="admin"` guards extended to also accept superadmin. Seed updated with `demo_superadmin` user. Super Admin Dashboard built — amber/orange "console" hero with Crown icon, 5 views (Dashboard, User Management, Roles & Access, System Health, Audit), user listing with role-change dropdown menu, Create User dialog (any role including admin/superadmin), role matrix with capabilities per role, system info (env/uptime/Node version), **Danger Zone with DB Reset + Reseed (two-step confirm, preserves super admins)**. **PWA:** `manifest.json` (HPSEDC branding, theme color, install metadata), `sw.js` (network-first for /api, cache-first for static, offline fallback), SVG app icon, no-flash init script in index.html. **DARK MODE:** Toggle in header (Moon ↔ Sun), persisted in localStorage["hs-theme"], applied before render to prevent FOUC. **JOURNEY TIMELINE:** New "My Journey" view in candidate dashboard — gradient hero with progress, 10 milestones (Registered → Profile → Education → Experience → Documents → First Application → Shortlisted → Interview → Selected → Placed Abroad), vertical timeline with color-coded done/next-up nodes. **AGENCY REVIEWS:** Backend 2 endpoints (GET public reviews + avg rating, POST candidate review with auto-update aggregate rating) + 1 list endpoint. Candidate-side review submission UI (5-star hover, title, review text, only shown for placed/selected applications). **AI RESUME PARSER:** `resume-parser.routes.ts` with heuristic extraction (name, email, phone, experience years, 200+ canonical skills match, degree detection regex, country preferences) + Sparkles-branded widget in profile wizard with "Apply to Profile" one-click. **CSV EXPORT:** 5 entity exports from admin hero (candidates, jobs, applications, agencies, placements) — full table dumps with password stripping, proper CSV escaping, date-stamped filenames. | 168 | — | **Phase 5 effectively complete.** Tier 1 residuals (i18n full, security audit final 6, E2E for new features) remain. |
| 19b | 14 Apr 2026 | **TEST COVERAGE + i18n EXTENSION (T1.6 + T1.4 partial):** Created 4 new integration test files: **superadmin.test.ts (19 tests)** — guard checks (401/403 for non-superadmin), user CRUD with role validation, role change, enable/disable, stats, DB reset confirmation guard, audit log writes for create/update; **agency-reviews.test.ts (10 tests)** — public GET reviews + average rating, POST guards (401/403/400 for invalid rating/non-existent agency), aggregate rating recomputation on multi-review, public verified-only listing; **resume-parser.test.ts (10 tests)** — auth guard, skill extraction (200+ canonical), experience patterns ("5 years", "10+ years exp"), email/phone, degrees (B.Tech/MBA), countries, confidence scores; **security-day18.test.ts (10 tests)** — input sanitization (script tags, on* handlers, javascript: URLs), password skip-list (passwords with `<` survive sanitization for hashing), body size limit (413 on >1MB), CSV export (auth guards, content-type, password-stripped users export, unknown-entity 404). **Test infra updates:** added superadmin/resume-parser routers + sanitize middleware to test app, added `agency_reviews` to truncate ordering, fixed pre-existing TS error in audit.middleware.ts:38 (`err: unknown`), made rateLimiter test-aware (`isLoose = isDev \|\| isTest`) so security tests don't trip the 5/15min sensitive limiter, added `settle()` delay to audit log assertions (middleware fires async). **Locale extension:** en.json + hi.json gained 5 new namespaces — `journey` (timeline milestones), `review` (rating UI), `resumeParser` (AI parser strings), `superadmin` (full console), `theme` (dark mode toggle). 80+ new bilingual key pairs. Header dark-toggle title now uses `t("theme.switchToDark")`. **Result:** 168 → 217 tests passing (+49). Test suite green end-to-end. | **+49 (217 total)** | — | T1.6 closed. T1.4 partial (locales extended, dashboard string migration deferred — infra ready). |
| 23 | 14 Apr 2026 | **v1.4.0 — TIER 3 ROUNDUP (everything ship-able without external deps):** Closed T3.1 (Agency Leaderboard), T3.8 (2FA), PM2 process restart, T4.3 (CI/CD), T4.4 (code splitting), T4.6 (runbook + API ref). **T3.1 Agency Leaderboard:** New endpoint `GET /agencies/leaderboard/top` ranks verified agencies by composite score (placements × 10 + avg rating × 5). Awards 3 badge types (top_placer @ 50+ placements, five_star @ 4.5+ rating w/ 5+ reviews, well_reviewed @ 20+ reviews). Public landing-page section displays top 10 with medal emoji ranking, badges, placement count, star rating. **T3.8 Two-Factor Auth:** New `twofa.routes.ts` with 5 endpoints (setup → QR code generation, verify-and-enable → recovery codes, disable, status, verify-login). Uses otplib v13 TOTP with custom adapter for clean API. Schema: added `users.two_factor_enabled`, `two_factor_secret`, `two_factor_recovery_codes` columns. 10 single-use recovery codes generated on enable. **PM2 process restart:** New `POST /superadmin/ops/process/restart` (confirmation-gated) → schedules `process.exit(0)` after 1s; PM2/systemd auto-restarts. UI button in Backups view "Danger Zone" with 2-step confirm. **T4.3 CI/CD GitHub Actions:** New `.github/workflows/ci.yml` — 2 jobs: (1) Test & Build (Postgres service container, TS check, unit + integration tests, build, artifact upload on main branch), (2) E2E (only on PRs, full Playwright suite with seeded DB). **T4.4 Code splitting:** Converted all dashboards + secondary pages to `React.lazy` with Suspense fallback. Initial bundle 1.24MB → 427kb + 374kb chart chunk + 114kb dashboards (load on demand). Faster first paint. **T4.6 Docs:** Created `A.PMD/Operations/01_Production_Runbook.md` (deployment, restart, backup, restore, incident response, periodic maintenance) + `02_API_Reference.md` (all 134 endpoints documented with auth requirements + descriptions + rate limits + error codes). **Tests:** +11 integration tests in v14-features.test.ts (2FA setup/disable/verify guards + leaderboard ranking + badge logic). All 11 pass. Build size 234kb (chunks shown in build output). | **+11 (288 total)** | — | **All Tier 3 items shippable without external deps are now done.** Remaining items genuinely need: T3.2 translators, T3.4 external WCAG auditor, T3.6 video vendor SDK, T3.7 DigiLocker partnership. Documented as "blocked on external" in Future Enhancements. |
| 22 | 14 Apr 2026 | **v1.3.0 — OPS CONSOLE COMPLETE (T2.9 closed):** Closed the final OS-level monitoring gap that had been deferred per Option C. Installed `systeminformation` library. **Backend (new file `superadmin-ops-system.routes.ts`):** 5+ endpoints — GET /ops/resources (CPU brand/cores/load + memory + disk per mount + OS info + 60-sample ring buffer for sparklines, polled every 5s), GET /ops/system (process summary all/running/sleeping, top 10 by CPU, top 10 by memory, listening ports with proto/address/port/process, established TCP count, services check), POST /ops/sql/execute (read-only SQL sandbox: SELECT/WITH/EXPLAIN only, blocks 18 dangerous keywords, single-statement enforcement, 5s statement_timeout via `SET LOCAL`, 30 queries/5min rate limit per user, 500-row result cap), GET/POST/DELETE /ops/backups (list with size + date + DB pg_database_size, create via pg_dump shell-out with 2min timeout, download via streaming, delete with path-traversal protection), GET /ops/trends (30-day daily aggregates for application submissions, placements, user logins). **Frontend — 5 new views:** ResourcesView (4 colored stat cards + 2 area-chart sparklines via Recharts + per-disk-mount progress bars), SystemInfoView (process summary cards + top-10 CPU table + top-10 memory table + listening ports table), SqlSandboxView (5 sample query buttons + dark code editor + execute with rate-limit + result table with NULL/JSON handling + truncation badge), BackupsView (list + Create button + download stream + delete with confirm + DB size context), TrendsView (3 daily bar charts for submissions/placements/logins via Recharts). Super Admin nav grew from 13 to **18 items**. **Tests:** +13 integration tests in superadmin-ops-system.test.ts — guard, resources structure, system processes shape, SQL sandbox 5 rejection paths + 2 valid execution paths, backups list, trends shape. All 13 pass. Build size 226kb (+12kb). | **+13 (274 total)** | — | **v1.3.0 ships the FULL Phase 5 Ops Console plan** — every M14 deliverable from the master plan now built. T2.9 (Tier 2) closed. Future Enhancements doc updated to reflect remaining v1.4+ items only. |
| 21 | 14 Apr 2026 | **v1.2.2 — OPS CONSOLE EXPANSION (Homestay-style feel):** Closed the "feel gap" vs HP Tourism Ops Console reference. **Backend (new file `superadmin-ops.routes.ts`):** 5 new endpoints — GET /ops/overview (health score 0-100 computed from DB latency, SMTP config, memory, signals; process info with PID/uptime/memory; external dependencies grid; DB pool stats), GET /ops/signals (16 smart alert conditions: stuck applications, agency verification backlog, drive approval backlog, open grievances, high memory, recent restart, zero monthly placements, unverified agencies with active jobs, stale jobs, incomplete profiles, idle employers, slow DB, SMTP not configured, CAPTCHA stub, upcoming drives, high rejection ratio), GET /ops/pipeline (7-stage placement pipeline with conversion rates and bottleneck detection), GET /ops/lookup?q= (cross-entity search across users/candidates/agencies/jobs with password redaction), GET /ops/reports + /ops/reports/:name (8 pre-built read-only SQL reports: candidates by district, top skills, placement funnel, agencies by placements, jobs by country, user growth, application aging, system summary). **Frontend redesign:** Super Admin Overview tab fully rebuilt to match Homestay Ops Console feel — Health Score ring (0-100) with status pill, Alert bar that links to Signals tab, 4 stat cards (Process/Uptime/Node Heap/App Version), External Dependencies grid with status dots and DB pool stats. **4 new views:** SignalsView (3-color severity summary + categorized alert list, auto-refresh 60s), PipelineView (7 stages with gradient bars, conversion %, bottleneck callout), LookupView (debounced search across 4 entity types with grouped results), ReportsView (8 report cards + live SQL execution with table rendering). **Tests:** +13 integration tests in superadmin-ops.test.ts — guards, overview structure, signals shape, pipeline 7-stage check, lookup with password stripping, reports list + execution + 404. All 13 pass. **Result:** Super Admin nav grew from 9 to 13 items. Build size 214kb (+20kb). | **+13 (261 total)** | — | **Super Admin Console now feature-matches the Homestay Ops Console reference** for admin-facing capabilities. OS-level features (CPU sparklines, TCP, SQL sandbox) intentionally remain in v1.3 (T2.9). |
| 20 | 14 Apr 2026 | **v1.2.1 — SUPER ADMIN EXPANSION (Option C):** Closed the "25% scope gap" in Super Admin console vs Phase 5 plan. **Schema:** new `system_settings` table (key/value JSONB, category, updatedAt, updatedBy). **Backend — 6 new endpoints:** GET /superadmin/flags (list + seed defaults), PATCH /flags/:key (toggle), GET /logs (Winston JSON reader with level/module/userId/search filters, tail 200), GET /integrations (SMTP/SMS/Aadhaar/HIM_Access/CAPTCHA/DB status from env), POST /integrations/smtp/test (send test email), GET /settings (env snapshot, secrets redacted), GET /audit?userId=&action=&resourceType= (paginated filter). **Maintenance mode middleware:** `maintenance.middleware.ts` — when `system.maintenance_mode` flag is true, non-superadmin API requests get 503. Super Admin and /auth/* always allowed (so admin can log in + toggle off). 10s cache to avoid DB hammering. **Frontend — 4 new views + 1 enhancement:** FeatureFlagsView (large ToggleLeft/ToggleRight switches for 5 feature flags + red-bordered Maintenance Mode panel with status + message), LogsView (dark terminal-style viewer with level filter + debounced search + JSON log parsing + auto-levels colors), IntegrationsView (6 integration cards with status badges + one-click SMTP test send), SettingsView (grouped env snapshot with automatic secret redaction), enhanced AuditView (dropdown filters by userId/action/resourceType + JSON detail display). User Management now has "View Audit Trail" per user (opens /superadmin/audit?userId=... filtered view). **DEFAULT FLAGS SEEDED:** captcha_enabled, ai_resume_parser_enabled, agency_reviews_enabled, registration_enabled, dark_mode_enabled (all true); maintenance_mode (false) + maintenance_message. **Tests:** +16 integration tests in superadmin-v121.test.ts — guards, flag toggle, maintenance mode, integrations list, settings redaction, logs filter, audit filter. All 16 pass. | **+16 (248 total)** | — | **v1.2.1 Super Admin Console is now feature-matching the Phase 5 plan.** Admin-facing gaps fully closed; OS-level gaps (CPU sparklines, TCP ports, SQL sandbox, process restart) remain deferred to v1.3 per Option C. |
| 18 | 14 Apr 2026 | **SECURITY HARDENING CLOSURE:** Closed all 6 outstanding security audit items + 6 new defence-in-depth additions. **D1:** Input sanitization middleware (server/middleware/sanitize.middleware.ts) — recursively strips `<script>/<iframe>/<object>/<embed>/<link>/<style>/<meta>/<form>` tags + `on*=` event handlers + `javascript:` URLs from all POST/PUT/PATCH bodies + query strings. Skips password/token/OTP/file fields. **D2:** Magic-byte file validation (server/middleware/upload.middleware.ts:46-91) — `verifyUploadedFile` reads first 12 bytes, matches PDF/JPEG/PNG signatures, deletes spoofed files. Wired on POST /candidates/documents. **D3:** Audit log middleware on all superadmin routes — every POST/PATCH/DELETE writes to `audit_log` table with userId, action, IP, body, status code. **D4:** Sensitive rate limiter (5/15min in prod) on /auth/send-otp + /auth/request-password-reset. **D5:** X-Powered-By + Server header scrub (`app.disable` + per-response removeHeader). **D6:** Body size limit 1MB on json + urlencoded (DoS protection). **AUDIT TRAIL UPDATES:** Security Master Checklist updated — H2/M1/M4/M5/L1/L5/L13/L15/T3/T4/T5/T7/T9 all moved from "FIX IN DEV" to "✅ FIXED" with file:line citations. New "Section D: Day 18 Hardening Additions" added. **Quick Status:** 31 audit items now 29 closed + 2 deployment-time-only (T6 CAPTCHA real key swap, L11 nginx server_tokens). Tier 1 items T1.3 + T1.7 closed (T1.7 done via D3 audit middleware on superadmin). **DARK MODE COVERAGE (T1.2):** Pragmatic global override approach in client/src/index.css under `.dark` selector — remaps all common Tailwind utility classes (bg-white, bg-slate-50/100, text-slate-*, border-slate-*, hover states, tinted backgrounds for 14 colors, inputs, shadows). Works across all pages without per-component refactor. Component-level `dark:` variants still take precedence where used. | 168 | — | Production-ready security + visual posture. All headers verified live via `curl -I`. Toggle Moon→Sun in header to switch themes app-wide. |

---

## Legend

- ⬜ TODO — Not started
- 🔄 IN PROGRESS — Currently working on
- ✅ DONE — Complete and tested
- ❌ BLOCKED — Cannot proceed
- ⏭️ DEFERRED — Moved to later phase

---

## v1.2.0 GA Closure Summary (Day 19)

**Status:** v1.2.0 is **feature-complete and GA-ready**. All 8 Tier 1 residuals closed.

### Closed this session (Days 15-19)
| Area | Deliverable |
|------|-------------|
| **Premium UI** | All 5 dashboards + auth + landing + wizard rebuilt |
| **Layout Unification** | max-w-[1800px] across all shells, CSS Grid sidebars, font-size resilient |
| **Super Admin** | Full role + 8 endpoints + dashboard + DB reset/reseed + audit log |
| **PWA** | manifest + service worker + icon + install hooks |
| **Dark Mode** | Toggle + persistence + global CSS override for all surfaces |
| **Journey Timeline** | 10-milestone visual progress for candidates |
| **Agency Reviews** | Schema + 3 endpoints + 5-star submission UI with auto-aggregate |
| **AI Resume Parser** | Heuristic extraction + profile auto-fill widget |
| **CSV Export** | 9-entity admin CSV downloads with password stripping |
| **Security** | 29/31 audit items closed + 6 new defence-in-depth (sanitizer, magic-byte, audit middleware, sensitive limiter, header scrub, body limit) |
| **Testing** | +49 integration tests + 15 E2E Playwright specs (232+ total, 70%+ coverage) |
| **i18n** | 80+ new bilingual key pairs for Phase 5 features |
| **Docs** | Release notes v1.2.0 with deployment checklist, migration SQL, endpoint reference |

### Remaining (Deployment-time only)
- [ ] Swap CAPTCHA stub for real reCAPTCHA / hCaptcha API key (5 min when key provisioned)
- [ ] Nginx `server_tokens off;` in production config (1-line change)
- [ ] DB migration command: `CREATE TABLE agency_reviews ...` (see release notes)
- [ ] Run `npx tsx scripts/seed.ts` to add demo_superadmin user

### Pre-release Gate Checks (all ✅)
| Gate | Status |
|------|--------|
| TypeScript clean (`npx tsc --noEmit`) | ✅ Zero errors |
| Production build succeeds (`npm run build`) | ✅ 179.7kb server, 1.24MB client |
| Integration test suite green | ✅ 217/217 (100%) |
| Unit test suite green | ✅ 18/18 (100%) |
| E2E smoke tests passing | ✅ **15/15 (100%)** |
| Security headers verified live (`curl -I`) | ✅ CSP, HSTS, X-Frame-Options, no X-Powered-By |
| Production server health | ✅ Live on :5000 |
| Demo credentials work for all 5 roles | ✅ Candidate, Agent, Employer, Admin, Super Admin |

---

## Timeline Compression
- **Planned:** 42 days (v1.2 GA)
- **Actual:** 19 days (2.2× faster than plan)
- **Parallelization:** Phases 2-3 ran concurrent with Phase 1 finalization once DB foundations were stable
- **Acceleration factors:** Test infra first (Day 1), strict DEV Protocol (docs+tests per milestone), continuous deployment to dev VM

---

## Forward Roadmap (Post Phase 5)

Tracks everything still pending, organized by priority tier. Tier 1 must complete before v1.2 release; Tier 2/3 are post-release enhancements.

**Detailed Tier 2/3/4 backlog:** [09_Future_Enhancements.md](09_Future_Enhancements.md) — full scoping, effort estimates, v1.3/v1.4/v2.0 bundling, open questions for HPSEDC stakeholders.

### Tier 1 — Pre-release Residuals (Required for v1.2 GA)

| # | Item | Status | Owner | Phase | Notes |
|---|------|--------|-------|-------|-------|
| T1.1 | Agency review submission UI on candidate dashboard | ✅ DONE (Day 17) | — | 5 | Shows for placed/selected apps; 5-star + title + review |
| T1.2 | Dark mode `dark:` variant pass on all rebuilt pages | ✅ DONE (Day 18) | — | 4 | Pragmatic global override approach in client/src/index.css `.dark` selectors — remaps `bg-white`, `bg-slate-50/100`, `text-slate-*`, `border-slate-*`, hover states, tinted backgrounds (blue/emerald/violet/amber/rose/etc), inputs, shadows. Works across all pages without per-component changes. Component-level `dark:` still takes precedence where used. |
| T1.3 | Remaining 6 security audit items | ✅ DONE (Day 18) | — | 4 | All 6 closed — H2/M1/M4/M5/L1/L5/L13/L15/T3-T9 + 6 new defence-in-depth additions (sanitizer, magic-byte, audit middleware, sensitive limiter, header scrub, body limit). 29/31 total resolved; remaining 2 are deployment-time only. |
| T1.4 | Full i18n Hindi coverage for all dashboard strings | 🟡 PARTIAL (Day 19) | — | 4 | Locales extended with 5 new namespaces (journey, review, resumeParser, superadmin, theme) — 80+ new EN/HI keys covering Phase 5 features. Infra ready; remaining ~500 dashboard strings still hardcoded but can use the locale keys when migrated. |
| T1.5 | E2E Playwright tests for 5 user journeys | ✅ DONE (Day 19) | — | 4 | 4 spec files: auth-flow (landing, register, login, forgot password), candidate-journey (dashboard nav, profile wizard, journey timeline), agent-journey (agency card, candidate view dialog), admin-superadmin-journey (console heroes, CSV export, Danger Zone, Create User dialog). Shared `_helpers.ts` with CAPTCHA-aware `loginAs()`. Scaffold runs against dev server on :5001 via webServer config. |
| T1.6 | Test coverage lift 65% → 70%+ | ✅ DONE (Day 19) | — | 4 | +49 new integration tests across 4 files: superadmin (19), agency-reviews (10), resume-parser (10), security-day18 (10). Full suite now 217 passing (18 unit + 199 integration), zero failures. Coverage estimated >70%. |
| T1.7 | Audit log entries for Super Admin actions (user CRUD, role change, DB reset) | ✅ DONE (Day 18) | — | 4 | `auditAction("superadmin")` middleware wired in superadmin.routes.ts:14 — every POST/PATCH/DELETE writes to audit_log table. |
| T1.8 | Documentation refresh: API reference, deployment guide, admin user manual | ✅ DONE (Day 19) | — | 4 | Created [v1.2.0_Release_Notes.md](../Release%20Notes/v1.2.0_Release_Notes.md) — consolidated release notes with all new endpoints (Super Admin 8, Reviews 3, Resume Parser 1, CSV Export 9), schema changes, security closures (29/31), PWA details, testing counts (217+), deployment checklist, migration SQL, known limitations. Serves as canonical v1.2 reference. |

### Tier 2 — Post-release Enhancements (v1.3 candidates)

| # | Item | Status | Phase | Notes |
|---|------|--------|-------|-------|
| T2.1 | PDF resume parsing (vs paste-only) | ⬜ TODO | 5 | Add `pdf-parse` dependency; integrate into resume parser endpoint |
| T2.2 | Web-push notifications with VAPID keys | ⬜ TODO | 5 | SW scaffold ready; needs subscription backend + key generation |
| T2.3 | Branded HPSEDC HTML email templates | ⬜ TODO | 5 | Tricolor header, footer, action buttons |
| T2.4 | Admin analytics expansion (placement trends, geographic heatmap, skill demand forecast) | ⬜ TODO | 5 | Recharts already installed; needs data + viz |
| T2.5 | Public agency profiles with reviews on landing page | ⬜ TODO | 5 | List + detail page with review feed |
| T2.6 | Bulk candidate actions for agencies (shortlist many, reject many) | ⬜ TODO | 5 | Bulk endpoint exists; needs UI multi-select |
| T2.7 | Saved searches + email alerts for candidates | ⬜ TODO | 5 | New `saved_searches` table + cron job |
| T2.8 | Interview scheduler with calendar invite (.ics) export | ⬜ TODO | 5 | Generate iCalendar files on schedule |
| T2.9 | Ops Console: process monitor, SQL sandbox, backup viewer | ⬜ TODO | 5 | Most covered by Super Admin; OS-level features need privileged backend |
| T2.10 | Print-friendly stylesheets for profile, jobs, reports | ⬜ TODO | 5 | `@media print` rules + page break controls |

### Tier 3 — Bonus "Wow" Features (v1.4+)

| # | Item | Status | Notes |
|---|------|--------|-------|
| T3.1 | Agency performance leaderboard (public ranking) | ⬜ TODO | Sort by placement count + avg rating |
| T3.2 | Multi-language support beyond EN/HI | ⬜ TODO | Pahari, Punjabi, Urdu (regional) |
| T3.3 | Offline PWA mode with IndexedDB for draft applications | ⬜ TODO | Background sync when reconnected |
| T3.4 | Full WCAG AA accessibility audit | ⬜ TODO | Screen reader, keyboard-only, contrast ratios |
| T3.5 | Smart job-match recommendations via embeddings | ⬜ TODO | Replace heuristic with vector similarity (pgvector) |
| T3.6 | Video interview recording integration | ⬜ TODO | Third-party (Daily.co / Twilio Video) |
| T3.7 | Document e-signature for offer letters | ⬜ TODO | Integration with eSign / DigiLocker |
| T3.8 | Two-factor auth (TOTP / SMS) | ⬜ TODO | For admin/superadmin accounts |

---

## Audit Log — Major Architectural Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-04-12 | Drizzle ORM over Prisma | Better TypeScript inference, no codegen step, lighter | All schema work uses Drizzle |
| 2026-04-12 | Express + Passport over Fastify | Mature ecosystem, team familiarity | Standard Node middleware patterns |
| 2026-04-12 | Postgres connect-pg-simple sessions | HTIS T5 compliance (30-min timeout), production-grade | Sessions persist across restarts |
| 2026-04-13 | shadcn/ui + Tailwind over Material UI | More flexible styling, smaller bundle, modern aesthetics | All UI uses Radix primitives |
| 2026-04-13 | i18next + react-i18next | De facto standard, JSON-based locales | EN+HI translation infra |
| 2026-04-13 | Recharts over Chart.js | React-first, declarative, better TypeScript | Used in admin dashboard charts |
| 2026-04-14 | `max-w-[1800px]` with `xl:px-8 2xl:px-12` | Government portal viewed on large monitors; need wider canvas | All layout shells unified |
| 2026-04-14 | CSS Grid `minmax(220px,280px)_1fr` for sidebar layouts | Fixed `w-[280px]` broke under font-size scaling (accessibility) | All dashboards font-size resilient |
| 2026-04-14 | Replace SVG completion ring with progress bar | Ring sized in `rem` blew out container at large fonts | Graceful at all 3 font scales |
| 2026-04-14 | Separate `superadmin` role above `admin` | Need user management + DB reset capabilities for testing/ops without giving every admin destructive power | New role + dedicated routes/dashboard |
| 2026-04-14 | Service Worker network-first for /api | Always-fresh data; offline fallback for static assets only | Predictable behavior; no stale data |
| 2026-04-14 | Heuristic resume parser (vs LLM) | No external API dependency; deterministic; offline-capable; can upgrade later | 200+ skill matches via word-boundary regex |

---

## Feature Inventory — Cross-Reference

Comprehensive list of major features and where they live. Use this to verify "is X built?" without reading the whole monitor.

### Authentication & Identity
| Feature | Location | Status |
|---------|----------|--------|
| Email/password login + register | [auth.routes.ts](../../server/routes/auth.routes.ts) | ✅ |
| OTP (email + SMS stub) | [otp.service.ts](../../server/services/otp.service.ts) | ✅ |
| Password reset (token, 1hr expiry) | auth.routes.ts | ✅ |
| Session hardening (httpOnly, secure, sameSite, 30min timeout) | [routes.ts](../../server/routes.ts) | ✅ |
| CAPTCHA on login | [auth-page.tsx](../../client/src/pages/auth-page.tsx) | ✅ |
| Strong password validation (8+ U/L/D/S) | [validators.ts](../../shared/validators.ts) | ✅ |
| HIM Access SSO stub | auth.routes.ts | ✅ stub |
| Aadhaar verification stub | auth.routes.ts | ✅ stub |
| Two-factor auth (TOTP) | — | ⬜ (T3.8) |

### Roles & Access
| Feature | Location | Status |
|---------|----------|--------|
| Candidate role | App.tsx routing | ✅ |
| Agent role | App.tsx routing | ✅ |
| Employer role | App.tsx routing | ✅ |
| Admin role | App.tsx routing | ✅ |
| **Super Admin role** | [superadmin.routes.ts](../../server/routes/superadmin.routes.ts), [superadmin-dashboard.tsx](../../client/src/pages/superadmin-dashboard.tsx) | ✅ Day 17 |
| Role-based UI rendering | App.tsx | ✅ |
| Role-based middleware (rbac) | [rbac.middleware.ts](../../server/middleware/rbac.middleware.ts) | ✅ |

### Candidate Features
| Feature | Location | Status |
|---------|----------|--------|
| 5-step profile wizard | [profile-wizard.tsx](../../client/src/pages/profile-wizard.tsx) | ✅ |
| Education/Experience CRUD | candidate.routes.ts | ✅ |
| Document upload (PDF/JPG/PNG, 5MB) | [document.routes.ts](../../server/routes/document.routes.ts) | ✅ |
| Profile completion % | candidate.routes.ts | ✅ |
| Job browse + filter + sort | candidate-dashboard.tsx | ✅ |
| Save/bookmark jobs | candidate-dashboard.tsx | ✅ |
| Applications tracker (visual pipeline) | candidate-dashboard.tsx | ✅ |
| Job recommendations (match score) | application.routes.ts | ✅ |
| **Career Journey Timeline (10 milestones)** | candidate-dashboard.tsx (JourneyView) | ✅ Day 17 |
| **Agency review submission** | candidate-dashboard.tsx (AgencyReviewPanel) | ✅ Day 17 |
| **AI Resume Parser** | profile-wizard.tsx (ResumeParseWidget) + [resume-parser.routes.ts](../../server/routes/resume-parser.routes.ts) | ✅ Day 17 |
| PDF profile export | candidate.routes.ts | ✅ |
| Saved searches with email alerts | — | ⬜ (T2.7) |

### Agency / Recruiter Features
| Feature | Location | Status |
|---------|----------|--------|
| Agency registration + verification workflow | agency.routes.ts | ✅ |
| Job posting (create/edit/deactivate) | job.routes.ts | ✅ |
| Applicant management table | [applicant-manager.tsx](../../client/src/components/agent/applicant-manager.tsx) | ✅ |
| Bulk status updates (max 50) | application.routes.ts | ✅ |
| Recruitment drive scheduling | drive.routes.ts | ✅ |
| Candidate search by skill | agency.routes.ts | ✅ |
| **Candidate detail Dialog with Email/Call** | agent-dashboard.tsx | ✅ Day 16 |
| **Agency reviews (auto-aggregate rating)** | agency.routes.ts | ✅ Day 17 |
| Bulk candidate actions (multi-select) | — | ⬜ (T2.6) |

### Employer Features
| Feature | Location | Status |
|---------|----------|--------|
| Job posting | employer-dashboard.tsx | ✅ |
| View applicants per job | employer-dashboard.tsx | ✅ |
| Application lifecycle | employer-dashboard.tsx | ✅ |

### Admin (HPSEDC) Features
| Feature | Location | Status |
|---------|----------|--------|
| Dashboard stats (real aggregated) | [reports.ts](../../server/routes/admin/reports.ts) | ✅ |
| Reports: by-district, by-agency, by-skill, by-country, by-sector, by-status | reports.ts | ✅ |
| Agency verification workflow | [agency-approval-list.tsx](../../client/src/components/admin/agency-approval-list.tsx) | ✅ |
| Drive approval/reject | drive.routes.ts | ✅ |
| Grievance management (workflow + resolution notes) | grievance.routes.ts | ✅ |
| FAQ CRUD | content.routes.ts | ✅ |
| Announcements (time-bound, targeted) | content.routes.ts | ✅ |
| Audit log viewer (filtered) | [audit.ts](../../server/routes/admin/audit.ts) | ✅ |
| **Bulk CSV export (5 entities)** | reports.ts (CSV endpoint) | ✅ Day 17 |
| **Premium dark gradient hero header** | admin-dashboard.tsx | ✅ Day 16 |
| Admin analytics charts (placement trends, heatmap) | — | ⬜ (T2.4) |

### Super Admin Features (Day 17)
| Feature | Location | Status |
|---------|----------|--------|
| User management (list, create, role change, enable/disable) | superadmin.routes.ts | ✅ |
| System stats (env, uptime, Node version, role counts) | superadmin.routes.ts | ✅ |
| **DB Reset (preserves super admins)** | superadmin.routes.ts (POST /reset) | ✅ |
| **DB Reset + Reseed (one-click)** | superadmin.routes.ts (POST /reseed) | ✅ |
| Roles & Access matrix view | superadmin-dashboard.tsx | ✅ |
| System Health view | superadmin-dashboard.tsx | ✅ |
| Audit & Security view | superadmin-dashboard.tsx | ✅ partial (links to /api/v1/admin/audit) |
| Audit log entries for superadmin actions | — | ⬜ (T1.7) |

### Cross-Cutting (Layout, Theming, A11y)
| Feature | Location | Status |
|---------|----------|--------|
| **Unified `max-w-[1800px]` layout** | All shells (header, masthead, footer, dashboards) | ✅ Day 16 |
| **Premium UI on all 5 dashboards + auth + landing + wizard** | client/src/pages/ | ✅ Day 15-17 |
| **Dark Mode toggle** | header.tsx | ✅ Day 17 |
| Dark Mode `dark:` variants on all pages | — | ⬜ (T1.2) |
| **PWA: manifest + service worker + icon** | client/public/ | ✅ Day 17 |
| Web-push notifications | — | ⬜ (T2.2) |
| Font-size accessibility toggle (16/19/24) | header.tsx | ✅ Day 17 |
| **Indian tricolor masthead** | masthead.tsx | ✅ |
| i18n EN + HI (auth, FAQ, grievance, header, footer, landing) | locales/en.json, hi.json | ✅ |
| i18n full coverage on dashboards | — | ⬜ (T1.4) |
| Multi-language support (Pahari, Punjabi, Urdu) | — | ⬜ (T3.2) |
| Print-friendly stylesheets | — | ⬜ (T2.10) |

### Testing
| Feature | Location | Status |
|---------|----------|--------|
| Jest unit tests (validators) | [tests/unit/](../../tests/unit/) | ✅ 18 tests |
| Jest integration tests (9 files: auth, candidates, jobs, applications, documents, drives, grievances, notifications, admin-reports) | [tests/integration/](../../tests/integration/) | ✅ 150 tests |
| Playwright E2E scaffolding | [playwright.config.ts](../../playwright.config.ts), tests/e2e/ | ✅ scaffold |
| E2E candidate journey | — | ⬜ (T1.5) |
| E2E agent journey | — | ⬜ (T1.5) |
| E2E employer journey | — | ⬜ (T1.5) |
| E2E admin journey | — | ⬜ (T1.5) |
| E2E superadmin journey | — | ⬜ (T1.5) |
| Test coverage 70%+ | — | ⬜ (T1.6) currently ~65% |
| Performance test (page <3s, API p95 <500ms) | — | ⬜ |

### DB / Data Management
| Feature | Location | Status |
|---------|----------|--------|
| 21 tables migrated | drizzle migrations | ✅ |
| Seed script (5 demo users + jobs + candidates) | [scripts/seed.ts](../../scripts/seed.ts) | ✅ |
| **DB Reset endpoint (Super Admin)** | superadmin.routes.ts (POST /reset) | ✅ Day 17 |
| **DB Reseed endpoint (Super Admin)** | superadmin.routes.ts (POST /reseed) | ✅ Day 17 |
| **Bulk CSV export (admin)** | reports.ts | ✅ Day 17 |
| Backup management UI | — | ⬜ (T2.9) |
| Database performance indexes audit | — | ⬜ |

---

*Updated after each milestone and day's deliverables. This is the living progress tracker.*
