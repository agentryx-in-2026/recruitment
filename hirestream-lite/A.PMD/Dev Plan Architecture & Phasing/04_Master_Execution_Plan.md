# HireStream — Master Execution Plan

**Project:** Overseas Placement Portal (HPSEDC)  
**Version:** 1.0 | **Date:** 2026-04-12  
**Supersedes:** 03_Phasing_Milestones.md (v1.1), Roadmap_R1.md  
**Status:** ACTIVE — Execution Ready

---

## 1. Current State Assessment

As of 12 April 2026, HireStream is **~40-45% complete**. Here is what exists and what does not.

### What's Built & Working

| Area | Status | Details |
|------|--------|---------|
| Infrastructure | LIVE | Nginx, SSL, PM2, auto-start, domain (hirestream.osipl.dev) |
| PostgreSQL Database | CONNECTED | 8 tables created, PgStorage class operational |
| Frontend UI | ~90% | 4 dashboards, landing page, auth page, 40+ shadcn components |
| Authentication | ~70% | Register, login, logout, sessions, Passport.js, bcrypt |
| RBAC Middleware | WORKING | protect() + requireRole() middleware, 4 roles enforced |
| Validation Middleware | WORKING | Zod validation on all API inputs |
| Rate Limiting | WORKING | 20/15min auth, 100/15min API |
| Error Handling | WORKING | Global error handler, consistent error format |
| Candidate Profile | ~60% | GET/PATCH profile, auto-creation, basic fields |
| Job Management | ~60% | POST/GET jobs, basic search, agent-must-be-verified check |
| Job Application | ~50% | Apply endpoint, match score (random), status tracking |
| Agency Management | ~60% | Register, verify, search candidates |
| Admin Dashboard | ~50% | Health check, logs, config, agency approval |
| Notifications | ~60% | In-app CRUD, mark-read, created on apply/verify events |

### What's NOT Built (Gaps)

| Gap | Impact |
|-----|--------|
| OTP is mocked ("123456") | No real identity verification |
| Match score is random (60-100%) | Core value proposition is fake |
| No file upload (multer not wired) | Can't upload CV, passport, certificates |
| No education/experience tables | Candidate profile is incomplete |
| No recruitment drives | FRS core requirement missing |
| No interview scheduling | FRS core requirement missing |
| No placement tracking | FRS core requirement missing |
| No appointment letters | FRS core requirement missing |
| No email/SMS notifications | All notifications are in-app only |
| No admin reports | Can't generate reports by district/agency/skill |
| No grievance system | FRS core requirement missing |
| No FAQ/announcements | FRS core requirement missing |
| No audit log | ISO 27001 compliance gap |
| No i18n (EN/HI) | FRS bilingual requirement missing |
| No job edit/close/deactivate | Job management incomplete |
| No per-job applicant view | Agency can't see who applied to their job |
| No shortlisting workflow | Agency can't shortlist candidates |
| No PDF export | Agency can't download candidate profiles |
| Dashboard metrics are mock/hardcoded | Admin sees fake numbers |
| No HIM Access SSO | FRS integration missing |
| No UIDAI/Aadhaar verification | FRS integration missing |
| No DigiLocker | FRS integration missing |
| No testing | Zero tests exist |
| No Ops Console | No server monitoring from browser |
| No Super Console | No admin system controls |
| Login page is minimal | UI needs polish for government portal |
| UI pages are scattered | Need layout consistency, proper navigation |

---

## 2. Module Inventory (Revised)

Expanded from 14 to 18 modules to include Health/Admin/Testing as first-class work.

| # | Module | Effort | Status | Phase |
|---|--------|--------|--------|-------|
| M1 | Infrastructure & Config | 1 day | 80% done — needs new migrations, env validation | 1 |
| M2 | Authentication & RBAC | 2 days | 70% done — needs real OTP, SSO stub, session hardening | 1 |
| M3 | Candidate Profiles & Documents | 4 days | 40% done — needs education/experience tables, file upload, PDF export | 1 |
| M4 | Job Management | 2.5 days | 50% done — needs edit/close, per-job applicants, advanced filters, pagination | 2 |
| M5 | Application & Matching | 3.5 days | 30% done — needs real match algorithm, shortlisting, bulk status, recommendations | 2 |
| M6 | Recruitment Drives & Interviews | 4.5 days | 0% — new tables, full CRUD, admin approval, scheduling, results, placements | 3 |
| M7 | Agency Verification & Admin | 4 days | 30% done — needs reports engine, real metrics, enhanced verification flow | 3 |
| M8 | Notifications & Communication | 3 days | 30% done — needs email (nodemailer), SMS gateway, notification preferences | 2 |
| M9 | Grievances, FAQ & Announcements | 3 days | 0% — new tables, submission/resolution workflow, CRUD, public display | 3 |
| M10 | Internationalization (EN/HI) | 2.5 days | 0% — react-i18next, translation extraction, language toggle | 4 |
| M11 | Audit Log & Compliance | 1.5 days | 0% — audit_log table, middleware interceptor, CSV export | 3 |
| M12 | UI Polish & Layout Consistency | 3 days | Needs work — login page, navigation, responsive fixes, loading states | 4 |
| M13 | Testing Module | 4 days net | 0% — infra + unit + integration + component + E2E + security | Continuous |
| M14 | Ops Console (Health & Monitoring) | 7 days | 0% — 10-tab dashboard, 17 endpoints, smart alerts | 5 |
| M15 | Admin Console (Super Console) | 5 days | 0% — system controls, settings, backup mgmt, seed tools | 5 |
| M16 | PWA & Offline | 2 days | 0% — service worker, install prompt, push notifications | 5 |
| M17 | AI Features (Resume Parse + Smart Match) | 3 days | 0% — real match algorithm, CV parsing, recommendations | 5 |
| M18 | Exceed Features (Journey Timeline + Agency Ratings) | 2.5 days | 0% — visual timeline, rating/review system | 5 |

**Total remaining effort: ~52 days**

---

## 3. Dependency Chain (Updated)

```
M1 (Infra) ─────┐
                 ├──▶ M2 (Auth) ──────────────┐
                 │                              ├──▶ M3 (Profiles/Docs) ───┐
                 │                              │                           ├──▶ M4 (Jobs) ──────────┐
                 │                              │                           │                         ├──▶ M5 (Apply/Match)
                 │                              │                           │                         │
                 │                              │                           │                         ├──▶ M6 (Drives/Interviews)
                 │                              │                           │                         │
                 │                              │                           │                         └──▶ M7 (Admin/Reports)
                 │                              │                           │
                 │                              │                           └──▶ M8 (Notifications) ─── [parallel from M3]
                 │                              │
                 │                              ├──▶ M9 (Grievances/FAQ) ── [parallel from M2]
                 │                              │
                 │                              ├──▶ M11 (Audit Log) ────── [parallel from M2]
                 │                              │
                 │                              └──▶ M10 (i18n) ─────────── [parallel, can start late]
                 │
                 ├──▶ M12 (UI Polish) ──────── [parallel, continuous]
                 │
                 ├──▶ M13 (Testing) ─────────── [continuous from M2 onwards]
                 │
                 └──▶ M14-M18 (Exceed) ──────── [after M7 complete]
```

**Critical Path:** M1 → M2 → M3 → M4 → M5 → M6 → M7 (21 days minimum)

---

## 4. Phase Plan

### Phase 1: Foundation Completion (Week 1 — Days 1-5)

**Objective:** Fix the foundation — complete auth, build real candidate profiles with file upload, run first migrations for missing tables.

**What we're fixing (already partially built):**

#### Day 1: Database Migrations & Infrastructure Hardening (M1)
- [ ] Create migration: `documents` table (id, candidateId, type, fileName, fileUrl, fileSize, uploadedAt, verified, verifiedBy)
- [ ] Create migration: `candidate_education` table (id, candidateId, degree, institution, year, percentage)
- [ ] Create migration: `candidate_experience` table (id, candidateId, company, role, years, country, description)
- [ ] Create migration: `grievances` table (id, userId, category, subject, description, status, adminNotes, resolvedAt)
- [ ] Create migration: `recruitment_drives` table (id, agencyId, title, date, location, targetRoles, status, approvedBy)
- [ ] Create migration: `interviews` table (id, driveId, applicationId, scheduledAt, result, notes)
- [ ] Create migration: `placements` table (id, applicationId, appointmentLetterUrl, startDate, country, salary, status)
- [ ] Create migration: `audit_log` table (id, userId, action, resourceType, resourceId, details, ipAddress, createdAt)
- [ ] Create migration: `faq` table (id, question, questionHi, answer, answerHi, category, sortOrder)
- [ ] Create migration: `announcements` table (id, title, body, targetRole, startDate, endDate, pinned)
- [ ] Create migration: `training_events` table (id, title, description, date, location, targetAudience)
- [ ] Validate all `.env` vars on startup with Zod (crash early with clear message)
- [ ] Winston logger writing to `/var/log/hirestream/` with daily rotation
- **Gate:** `npm run db:push` succeeds, all 19 tables exist, app starts clean

#### Day 2: Authentication Hardening (M2)
- [ ] Real OTP flow: generate 6-digit code → store in Redis/DB with 5-min TTL → verify
- [ ] Email OTP sender (nodemailer — configure SMTP)
- [ ] SMS OTP sender (stub interface — real gateway when credentials arrive)
- [ ] Password reset flow: request → email token → reset page → update
- [ ] Session hardening: httpOnly, secure (prod), sameSite=strict, maxAge=24h
- [ ] Login page UI upgrade: proper form layout, OTP tab, error states, loading states
- [ ] Registration page UI: step-by-step flow (role → credentials → verify OTP → profile basics)
- [ ] HIM Access SSO: stub route + UI button (real integration when HP API credentials arrive)
- [ ] Aadhaar verification: stub route + UI field (real integration when UIDAI credentials arrive)
- **Gate:** Register → OTP email arrives → Verify → Login → Session persists across refresh → Logout works

#### Days 3-5: Candidate Profiles & Documents (M3)
- [ ] `multer` setup: file upload middleware, `/data/uploads/` storage, 5MB limit, PDF/JPG/PNG only
- [ ] `POST /api/v1/candidates/documents` — upload document (CV, passport, certificate)
- [ ] `GET /api/v1/candidates/documents` — list uploaded documents
- [ ] `DELETE /api/v1/candidates/documents/:id` — remove document
- [ ] `GET /api/v1/candidates/documents/:id/download` — serve file
- [ ] DigiLocker: stub button in UI (real integration when API key arrives)
- [ ] `POST /api/v1/candidates/education` — add education record
- [ ] `GET /api/v1/candidates/education` — list education records
- [ ] `PUT /api/v1/candidates/education/:id` — update education record
- [ ] `DELETE /api/v1/candidates/education/:id` — remove education record
- [ ] `POST /api/v1/candidates/experience` — add work experience
- [ ] `GET /api/v1/candidates/experience` — list work experience
- [ ] `PUT /api/v1/candidates/experience/:id` — update work experience
- [ ] `DELETE /api/v1/candidates/experience/:id` — remove work experience
- [ ] Profile completion percentage calculation (name + email + phone + location + skills + 1 education + 1 experience + 1 document = 100%)
- [ ] Candidate Profile Form UI rebuild: tabbed layout (Basic Info | Education | Experience | Documents | Preferences)
- [ ] Candidate Dashboard UI refresh: real data everywhere, no mock data, loading skeletons
- [ ] `GET /api/v1/candidates/:id/pdf` — PDF profile export (puppeteer or pdf-lib)
- **Gate:** Complete profile with photo/CV upload → education/experience entries → profile PDF downloads correctly → profile completion shows 100%

**Phase 1 Tests (M13 — written during development):**
- [ ] Unit: registerSchema, loginSchema, otpSchema validators
- [ ] Integration: auth.test.ts (register, login, logout, OTP, session)
- [ ] Integration: candidates.test.ts (profile CRUD, education, experience, documents)
- [ ] Component: auth-page.test.tsx, candidate-profile-form.test.tsx

---

### Phase 2: Core Business Logic (Week 2-3 — Days 6-15)

**Objective:** Build the complete job lifecycle — posting, searching, applying, matching, and notifications. This is where the portal becomes useful.

#### Days 6-8: Job Management Completion (M4)
- [ ] `PUT /api/v1/jobs/:id` — edit job (agent/employer who owns it)
- [ ] `PATCH /api/v1/jobs/:id/status` — activate/deactivate job
- [ ] `DELETE /api/v1/jobs/:id` — soft-delete job (set inactive)
- [ ] `GET /api/v1/jobs/:id` — single job detail page
- [ ] `GET /api/v1/jobs/:id/applicants` — list applicants for a job (agent/employer view)
- [ ] Advanced search filters: country, salary range, experience range, sector, posted date
- [ ] Pagination: `?page=1&limit=20` with total count in response headers
- [ ] Sort: by date, salary, match score, applicant count
- [ ] Job detail page UI (full description, requirements, apply button, company info)
- [ ] Job search page UI: filter sidebar, grid/list toggle, pagination controls
- [ ] Agent dashboard: "My Jobs" section with applicant counts, edit/close buttons
- [ ] Employer dashboard: "My Jobs" section with applicant counts
- **Gate:** Post job → search finds it with filters → detail page renders → edit/close works → applicant list shows who applied

#### Days 9-12: Application & Matching (M5)
- [ ] **Real match algorithm** (replaces random score):
  - Skill match: intersection(candidate.skills, job.skills) / job.skills.length × 50 points
  - Experience match: min(candidate.experience / job.experienceRequired, 1) × 30 points
  - Location/country preference match: candidate.preferredCountries includes job.country → 20 points
  - Total: 0-100, weighted sum
- [ ] Match score stored on application, recalculated if profile changes
- [ ] `PATCH /api/v1/applications/:id/status` — agent/employer can change status (reviewed, shortlisted, interview_scheduled, selected, rejected)
- [ ] Bulk status update: `PATCH /api/v1/applications/bulk-status` — body: { ids: [], status: "shortlisted" }
- [ ] `GET /api/v1/candidates/recommendations` — top 10 jobs by match score for authenticated candidate
- [ ] "Recommended For You" section on candidate dashboard
- [ ] Application detail page: job info, match score breakdown, status timeline
- [ ] Agent's applicant management: table view with sort by score, bulk select, status dropdown
- [ ] Duplicate application prevention (409 if already applied)
- [ ] Application status change creates notification for candidate
- **Gate:** Candidate applies → match score is accurate → agent reviews/shortlists → candidate sees status change + notification → recommendations show relevant jobs

#### Days 13-15: Notifications & Communication (M8)
- [ ] `nodemailer` setup with SMTP config from env
- [ ] Email templates (HTML): welcome, application submitted, status change, interview scheduled, agency verified, grievance update
- [ ] SMS interface (stub — sends to log in dev, real gateway in prod)
- [ ] Notification preferences: `PATCH /api/v1/users/notification-preferences` (email: on/off, sms: on/off, in-app: always on)
- [ ] Notification triggers:
  - Candidate registers → welcome email
  - Candidate applies → confirmation email + in-app
  - Application status changes → email + in-app
  - Agency verified → email + in-app
  - Interview scheduled → email + SMS + in-app
  - Grievance update → email + in-app
  - New job matches profile → in-app (daily digest email if enabled)
- [ ] Notification bell UI: unread count badge, popover with recent 20, "mark all read"
- [ ] Notification page: full list with pagination, filter by type
- **Gate:** Apply to job → email arrives within 30s → notification bell shows "1" → agent changes status → candidate gets email + in-app notification

**Phase 2 Tests (M13):**
- [ ] Unit: match-algorithm.test.ts (perfect match, zero match, partial, edge cases)
- [ ] Integration: jobs.test.ts (CRUD, search, filters, pagination, applicants)
- [ ] Integration: applications bulk status, recommendations endpoint
- [ ] Integration: notifications.test.ts (CRUD, mark-read, triggers)
- [ ] Component: job-search-board.test.tsx, application-tracker.test.tsx, notifications-popover.test.tsx

---

### Phase 3: Advanced Workflows (Week 4-5 — Days 16-25)

**Objective:** Complete the full recruitment lifecycle and all admin capabilities required by the FRS.

#### Days 16-18: Recruitment Drives & Interviews (M6)
- [ ] `POST /api/v1/drives` — create drive (verified agent only)
- [ ] `GET /api/v1/drives` — list drives (public: upcoming active drives)
- [ ] `GET /api/v1/drives/my` — agent's own drives
- [ ] `PATCH /api/v1/drives/:id` — edit drive (before approval)
- [ ] `DELETE /api/v1/drives/:id` — cancel drive
- [ ] `PATCH /api/v1/admin/drives/:id/approve` — admin approves drive
- [ ] `PATCH /api/v1/admin/drives/:id/reject` — admin rejects drive (with reason)
- [ ] `POST /api/v1/interviews` — schedule interview (agent, for shortlisted candidate)
- [ ] `GET /api/v1/interviews/my` — candidate's upcoming interviews
- [ ] `PATCH /api/v1/interviews/:id/result` — record result (selected/rejected/hold + notes)
- [ ] Interview scheduling sends SMS + email + in-app to candidate
- [ ] Drive page UI for agents: create drive form, status tracker, candidate list
- [ ] Drive approval UI for admin: pending queue, approve/reject buttons, calendar view
- [ ] Interview management UI: schedule modal, result recording form

#### Days 19-20: Placements & Appointment Letters (M6 continued)
- [ ] `POST /api/v1/placements` — record placement (after interview result = selected)
- [ ] `GET /api/v1/placements/:id` — placement detail
- [ ] `PATCH /api/v1/placements/:id` — update placement (visa status, start date)
- [ ] `POST /api/v1/placements/:id/appointment-letter` — upload appointment letter (PDF)
- [ ] `GET /api/v1/placements/:id/appointment-letter` — download letter
- [ ] `PATCH /api/v1/placements/:id/accept` — candidate accepts placement
- [ ] `PATCH /api/v1/placements/:id/decline` — candidate declines (with reason)
- [ ] Candidate dashboard: placement details card, letter download, accept/decline buttons
- [ ] Application status auto-updates: interview result → "selected" → placement created → "placed"
- **Gate:** Agent creates drive → admin approves → agent schedules interview → records "selected" → creates placement → uploads letter → candidate sees placement + downloads letter → accepts

#### Days 21-23: Admin Reports & Agency Verification Enhancement (M7)
- [ ] Report endpoints:
  - `GET /api/v1/admin/reports/by-district` — candidates + placements by location
  - `GET /api/v1/admin/reports/by-agency` — applications, placements, success rate per agency
  - `GET /api/v1/admin/reports/by-skill` — demand (from jobs) vs supply (from candidates)
  - `GET /api/v1/admin/reports/by-placement-status` — full funnel metrics
  - `GET /api/v1/admin/reports/by-country` — placements by destination country
  - `GET /api/v1/admin/reports/by-sector` — jobs and placements by industry
- [ ] CSV export for all reports: `?format=csv`
- [ ] PDF export for summary reports (puppeteer)
- [ ] Admin dashboard: replace ALL mock metrics with real aggregated queries
  - Total registered candidates (with trend)
  - Total verified agencies
  - Total active jobs
  - Total placements (with trend)
  - Pending verifications count
  - Pending drive approvals count
  - Open grievances count
  - Applications this week/month
- [ ] Agency verification enhancement:
  - Inline document viewer (PDF/image preview in modal)
  - Verification history log (who approved/rejected, when, why)
  - Agency past-record upload during registration
  - Rejection requires reason (stored in audit log)
- [ ] Agency detail page for admin: profile + jobs + placements + reviews + verification history
- **Gate:** Admin dashboard shows real numbers → generates district report → downloads CSV → views agency docs inline → approves with log entry

#### Days 24-25: Grievances, FAQ, Announcements, Audit Log (M9 + M11)
- [ ] `POST /api/v1/grievances` — submit grievance (candidate/agent)
- [ ] `GET /api/v1/grievances/my` — user's own grievances
- [ ] `GET /api/v1/admin/grievances` — all grievances (admin)
- [ ] `PATCH /api/v1/admin/grievances/:id` — update status, add admin notes, resolve
- [ ] Grievance categories: agency_complaint, application_issue, technical_problem, policy_inquiry, other
- [ ] Grievance status flow: submitted → under_review → action_taken → resolved
- [ ] Grievance UI: submission form (candidate side), management queue (admin side)
- [ ] `GET /api/v1/faq` — public FAQ list (grouped by category)
- [ ] `POST /api/v1/admin/faq` — create FAQ entry (EN + HI)
- [ ] `PUT /api/v1/admin/faq/:id` — edit FAQ
- [ ] `DELETE /api/v1/admin/faq/:id` — delete FAQ
- [ ] FAQ page: public, searchable, collapsible accordion by category
- [ ] `POST /api/v1/admin/announcements` — create announcement (title, body, target role, dates)
- [ ] `GET /api/v1/announcements` — active announcements for current user's role
- [ ] Announcement banner on dashboard pages
- [ ] `POST /api/v1/admin/training` — create training event
- [ ] `GET /api/v1/training` — upcoming training events (public)
- [ ] Training event notification trigger on creation
- [ ] Audit log middleware: intercept all admin actions (create/update/delete/verify/reject)
- [ ] `GET /api/v1/admin/audit` — paginated audit log with filters
- [ ] `GET /api/v1/admin/audit/export` — CSV export
- **Gate:** Candidate files grievance → admin sees it → resolves → candidate notified → FAQ page has entries → announcement banner shows on dashboard → audit log captures all actions

**Phase 3 Tests (M13):**
- [ ] Integration: drives.test.ts, interviews.test.ts, placements.test.ts
- [ ] Integration: grievances.test.ts, faq.test.ts, announcements.test.ts, audit.test.ts
- [ ] Integration: admin reports (all 6 report endpoints)
- [ ] E2E: placement-workflow.test.ts (full pipeline)
- [ ] E2E: admin-journey.test.ts

---

### Phase 4: Polish & Launch Prep (Week 6 — Days 26-30)

**Objective:** Bilingual UI, UI consistency overhaul, security hardening, and comprehensive testing. The portal becomes production-ready.

#### Days 26-27: UI Polish & Layout Consistency (M12)
- [ ] **Header redesign:** HPSEDC government branding, bilingual title, proper navigation for each role
- [ ] **Login page upgrade:** government portal aesthetic, HPSEDC logo, step-by-step auth flow, OTP tab
- [ ] **Landing page refresh:** professional hero, real statistics (from API), clear CTAs, footer with links
- [ ] **Navigation consistency:** sidebar for dashboards (candidate/agent/employer/admin), breadcrumbs
- [ ] **Responsive audit:** test all pages at 375px, 768px, 1024px, 1440px — fix breakpoints
- [ ] **Loading states:** skeleton screens for all data-fetching pages (no blank white screens)
- [ ] **Error states:** friendly error pages (network error, 404, 403, 500) with retry buttons
- [ ] **Empty states:** meaningful empty states for all lists ("No applications yet — browse jobs to get started")
- [ ] **Form UX:** proper validation messages, disabled submit during loading, success toasts
- [ ] **Accessibility pass:** focus indicators, aria labels, keyboard navigation, contrast ratios (GIGW)
- [ ] **Print stylesheets:** reports and profile pages should print cleanly
- **Gate:** Every page looks professional, loads with skeleton, handles errors gracefully, works on mobile

#### Day 28: Internationalization (M10)
- [ ] Install and configure `react-i18next` + `i18next`
- [ ] Extract all UI strings to `locales/en.json` and `locales/hi.json`
- [ ] Language toggle in header (EN | हिंदी)
- [ ] Language preference persists: localStorage + user profile `preferredLanguage` field
- [ ] Translate: navigation, buttons, form labels, error messages, status labels, FAQ
- [ ] RTL not needed (Hindi is LTR)
- [ ] Date formatting respects locale
- **Gate:** Toggle language → entire UI switches → refresh → preference persists → all core flows work in Hindi

#### Days 29-30: Security Hardening & Test Suite Completion (M13 final)
- [ ] CORS configuration: whitelist production domain only
- [ ] CSP headers: restrict script/style sources
- [ ] Input sanitization: HTML strip on all user-generated text fields
- [ ] File upload validation: magic byte check (not just extension)
- [ ] SQL injection test suite (all endpoints with malicious input)
- [ ] XSS test suite (script tags in all text fields)
- [ ] RBAC enforcement test (every endpoint × every role)
- [ ] Rate limit verification test
- [ ] Session security test (httpOnly, secure, sameSite)
- [ ] Performance test: page load < 3s, API p95 < 500ms
- [ ] E2E: candidate-journey.test.ts (full lifecycle)
- [ ] E2E: agency-journey.test.ts (full lifecycle)
- [ ] E2E: auth-flow.test.ts (edge cases)
- [ ] Coverage target: >70% lines
- **Gate:** Full test suite green → coverage >70% → zero critical security findings → all pages load <3s

---

### Phase 5: Exceed Expectations — 20% Beyond FRS (Week 7-8 — Days 31-42)

**Objective:** Deliver everything the FRS didn't ask for but the portal needs to be exceptional. This is what makes HireStream a reference project.

#### Days 31-37: Ops Console & Admin Console (M14 + M15)
- [ ] **Ops Console Phase A (3 days):** Overview + Resources + Pipeline + Backups tabs
  - Health score (0-100), smart alerts (16 conditions), process status, dependencies
  - CPU/RAM/disk sparklines, event loop delay, FD gauge
  - Placement pipeline health: stuck apps, agency verification backlog, drive health, grievance backlog
  - Backup scheduler status + history
- [ ] **Ops Console Phase B (2 days):** Logs + Lookup + Log Query
  - Winston JSON log reader with filters (level, module, userId, search)
  - RegExp grep panel with quick patterns
  - Entity lookup: search candidates/agencies/jobs/applications from one search box
- [ ] **Ops Console Phase C (2 days):** DB Explorer + System + Signals
  - 8 pre-built SQL reports + SQL sandbox (SELECT-only, 5s timeout, admin only)
  - TCP connections, zombie detector, listening ports, top processes
  - Trend charts: submissions, placements, registrations, API latency
  - Process restart + log clear with 2-step confirm
- [ ] **Admin Console (5 days):**
  - Super Console: system overview, reset zone, communication config, external integration status, seed tools, smoke tests, feature toggles, maintenance mode
  - Settings page: all configurable parameters with read/write access control
  - User management: full CRUD, role assignment, activate/deactivate, audit trail per user
  - Backup management: schedule, history, download, delete, verify
  - Enhanced agency management: inline document viewer, approval queue, performance dashboard
  - Drive approval dashboard with calendar view
  - Grievance management with SLA tracking

#### Days 38-39: PWA & AI Features (M16 + M17)
- [ ] Service worker: cache static assets, offline fallback page
- [ ] Web app manifest: installable on Android/iOS, app icon, splash screen
- [ ] "Add to Home Screen" prompt
- [ ] Push notifications via service worker (job matches, status changes)
- [ ] **AI Resume Parsing:** upload PDF → extract text → identify skills, education, experience → pre-fill profile fields (user confirms before saving)
- [ ] **Smart Match Enhancement:** add sector matching, salary expectation alignment, language skills factor
- [ ] "Why this score?" — match score breakdown tooltip on each application

#### Days 40-42: Journey Timeline, Agency Ratings, Final Polish (M18)
- [ ] **Candidate Journey Timeline:** visual vertical timeline on dashboard showing every milestone
  - Registered → Profile completed → First application → Shortlisted → Interview → Selected → Placed
  - Each node shows date + details
- [ ] **Agency Reputation System:**
  - `POST /api/v1/agencies/:id/reviews` — placed candidate can rate (1-5 stars) + text review
  - `GET /api/v1/agencies/:id/reviews` — public reviews
  - Average rating displayed on agency cards + public profile
  - Only candidates who were placed through the agency can review
- [ ] **Dashboard analytics charts** (Recharts):
  - Admin: placement trend line, application funnel, geographic heatmap, skill demand/supply
  - Agent: applicant pipeline chart, placement rate over time
  - Candidate: match score distribution for their applications
- [ ] **Bulk CSV export:** admin can export candidate list, job list, placement list
- [ ] **Dark mode toggle** (Tailwind dark class, toggle in header, preference persists)
- [ ] **Email templates** with professional HTML design (HPSEDC branding)
- [ ] Final E2E test pass — all 5 journeys clean
- [ ] Final performance test — all pages <3s, API p95 <500ms with seeded data
- **Gate:** Portal is fully functional, exceeds FRS by 20%, all tests pass, ready for UAT

---

## 5. Release Cadence

| Release | Day | Week | Content | Environment |
|---------|-----|------|---------|-------------|
| **Alpha 0.1** | Day 5 | Week 1 | Auth hardened + Profiles + Documents | Dev VM |
| **Alpha 0.2** | Day 8 | Week 2 | + Jobs complete + Real match algorithm | Dev VM |
| **Alpha 0.3** | Day 12 | Week 2 | + Applications + Matching + Notifications | Dev VM |
| **Beta 0.5** | Day 15 | Week 3 | + Email/SMS notifications | Staging |
| **Beta 0.7** | Day 20 | Week 4 | + Drives + Interviews + Placements | Staging |
| **RC 0.9** | Day 25 | Week 5 | + Admin reports + Grievances + FAQ + Audit (Feature Complete) | Staging |
| **v1.0** | Day 30 | Week 6 | + i18n + UI Polish + Tests + Security (Production Ready) | **Production** |
| **v1.1** | Day 37 | Week 7-8 | + Ops Console + Admin Console | Production |
| **v1.2** | Day 42 | Week 8 | + PWA + AI + Timeline + Ratings (Full Exceed) | Production |

---

## 6. What "20% Beyond FRS" Looks Like

The FRS defines a functional placement portal. Here's what HireStream delivers beyond that:

| FRS Says | HireStream Delivers | Category |
|----------|---------------------|----------|
| "Job matching" | Real AI match algorithm with score breakdown tooltip | Smart |
| "Mobile app" | PWA (installable, offline, push notifications) — no app store needed | Smart |
| "User registration" | AI resume parsing auto-fills profile from uploaded CV | Smart |
| (not mentioned) | Ops Console: 10-tab server monitoring dashboard from browser | Operational |
| (not mentioned) | Admin Console: full system control without SSH | Operational |
| (not mentioned) | Testing module: automated tests for every feature | Quality |
| (not mentioned) | Candidate journey timeline visualization | UX |
| (not mentioned) | Agency reputation/rating system | Trust |
| (not mentioned) | Dashboard analytics with charts | Insight |
| (not mentioned) | Dark mode | UX |
| (not mentioned) | Smart alerts (16 auto-detected conditions) | Proactive |
| (not mentioned) | Bulk CSV/PDF exports for all data | Productivity |
| (not mentioned) | Audit log with compliance export | Compliance |
| "Grievance mechanism" | Full grievance workflow with SLA tracking | Enhanced |
| "Reports" | 11 report types + CSV + PDF + scheduled email delivery | Enhanced |
| "Admin dashboard" | Real-time metrics, not just static numbers | Enhanced |

---

## 7. Quality Gates

### Per-Feature Gate (before moving to next task)
- [ ] Feature works end-to-end (API + UI connected)
- [ ] Integration test written and passing
- [ ] No TypeScript errors
- [ ] No console errors in browser

### Per-Phase Gate (before moving to next phase)
- [ ] All phase deliverables checked off
- [ ] Demo script runs clean
- [ ] All tests passing
- [ ] Coverage does not decrease
- [ ] No critical bugs open

### Go-Live Gate (v1.0)
- [ ] All FRS functional requirements met
- [ ] Test suite green (>70% coverage)
- [ ] Performance: page load <3s, API p95 <500ms
- [ ] Security: zero critical/high vulnerabilities
- [ ] Bilingual UI operational (EN/HI)
- [ ] PM2 cluster mode + Nginx + SSL + auto-start
- [ ] Database backup automation (6-hourly)
- [ ] Admin account seeded
- [ ] Smoke tests pass on production URL

### v1.2 Gate (Full Exceed)
- [ ] Ops Console operational (all 10 tabs)
- [ ] Admin Console operational (all sections)
- [ ] PWA installable + push notifications working
- [ ] AI resume parsing working (suggestion mode)
- [ ] Agency rating system live
- [ ] Journey timeline rendering
- [ ] All E2E tests passing

---

## 8. Risk Register (Updated)

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | HIM Access SSO credentials delayed | HIGH | HIGH | Stub route built Day 2. SSO is additive — auth works without it. |
| R2 | DigiLocker API access delayed | MEDIUM | HIGH | Manual upload works from Day 3. DigiLocker is additive. |
| R3 | SMS Gateway approval slow | MEDIUM | HIGH | OTP goes to email first. SMS is additive. Twilio as interim. |
| R4 | Single developer bottleneck | HIGH | MEDIUM | Critical path is 21 days. Phases are designed for solo execution. |
| R5 | DB performance under load | HIGH | LOW | Indexed queries, Drizzle parameterized, Redis cache if needed. |
| R6 | FRS scope changes from HPSEDC | MEDIUM | MEDIUM | Modular architecture. Phases 1-4 lock FRS. Phase 5 is buffer. |
| R7 | Hindi translation quality | LOW | MEDIUM | Machine-translate first, professional review pre-launch. |
| R8 | GIGW compliance audit | MEDIUM | MEDIUM | Accessibility pass in Phase 4 (Day 26-27). axe-core in tests. |
| R9 | AI resume parsing accuracy | LOW | HIGH | Suggestion mode only — user always confirms. |
| R10 | PWA browser support | LOW | LOW | Graceful fallback to web. Chrome/Firefox cover 90%+ users. |
| R11 | Phase 5 time squeeze | MEDIUM | MEDIUM | Ops Console is isolated (try/catch). Can ship v1.0 without it. |

---

## 9. Daily Execution Model

Each development day follows this rhythm:

```
Morning:   Read today's tasks from this plan
           Check what tests need to be written alongside today's features
           
Build:     Implement backend (routes, storage, migrations)
           Wire frontend (API calls, forms, state)
           Write tests during development (not after)
           
Evening:   Run full test suite
           Update completion checkboxes in this document
           Git commit with descriptive message
           Deploy to dev VM (pm2 restart)
           
Weekly:    Phase gate review
           Demo to stakeholders (if milestone)
           Deploy to staging (if beta+)
```

---

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-12 | Created. Unified plan incorporating FRS scope, Health/Admin/Testing modules, 20% exceed. Supersedes 03_Phasing_Milestones v1.1 and Roadmap_R1. |

---

*This is the single source of truth for HireStream development. When in doubt, check this plan.*
