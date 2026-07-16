# HireStream — Detailed Development Plan
**Project:** Overseas Placement Portal (HPSEDC)
**Version:** 1.1 | **Date:** 2026-03-26

---

## 1. Document Purpose

This Development Plan translates the System Architecture into **concrete, implementable work units**. Each module is broken into user stories with acceptance criteria, technical tasks, API endpoints, and estimated effort.

---

## 2. Development Standards & Conventions

### 2.1 Coding Standards
| Area | Standard |
|:---|:---|
| **Language** | TypeScript strict mode throughout |
| **Naming** | camelCase (vars/fns), PascalCase (components/types), snake_case (DB cols) |
| **API Routes** | RESTful, `/api/v1/` prefix, kebab-case resources |
| **Validation** | All API inputs validated with Zod schemas in `shared/validators.ts` |
| **Error Handling** | Centralized via `errorHandler.middleware.ts` |
| **Logging** | Winston/Pino structured JSON; levels: error, warn, info, debug |
| **Git** | Feature branches → PR → Review → Merge `develop` → Release `main` |

### 2.2 Commit Convention
```
<type>(<scope>): <description>
Types: feat, fix, refactor, docs, test, chore, style
Scope: auth, candidate, job, application, agency, admin, ui, infra
```

### 2.3 Definition of Done (DoD)
- [ ] Zero TypeScript errors
- [ ] Zod validation on all inputs
- [ ] Proper error codes (400, 401, 403, 404, 500)
- [ ] At least one integration test per endpoint
- [ ] UI connected to real API (no mock data)
- [ ] Responsive on mobile (≥ 375px)
- [ ] Peer code review approved

---

## 3. Module Breakdown

### MODULE 1: Infrastructure & Configuration
**FRS Ref:** §2.9, §3.2 | **Effort:** 2 days

| ID | Task | Details | Effort |
|:---|:---|:---|:---|
| M1-T1 | Environment Config | `server/config/env.config.ts` with Zod-validated env vars. Create `.env.example`. | 2h |
| M1-T2 | Logger Setup | Install `winston`. Create `server/config/logger.config.ts`. Structured JSON logs with request-id. | 3h |
| M1-T3 | Security Middleware | Install `helmet`, `express-rate-limit`. CORS whitelist. Add to Express pipeline. | 3h |
| M1-T4 | Error Handler | `server/middleware/errorHandler.middleware.ts`. Consistent JSON error responses. | 2h |
| M1-T5 | Validation Middleware | Generic middleware taking Zod schema, validates `req.body/params/query`. | 2h |
| M1-T6 | Database Migrations | Run `drizzle-kit generate` + `push`. Add migration scripts to `package.json`. | 2h |
| M1-T7 | **Backup & Health** | Automated `pg_dump` cron (6-hourly). `GET /api/v1/admin/health` endpoint returning DB, disk, backup status. | 3h |

**Acceptance:** App starts with validated env; logs are structured JSON; helmet headers visible; rate limit returns 429; health endpoint returns green.

---

### MODULE 2: Authentication & Authorization
**FRS Ref:** §2.2, §2.3 | **Effort:** 5 days

**US-2.1: User Registration**

| ID | Task | Effort |
|:---|:---|:---|
| M2-T1 | `POST /api/v1/auth/register` — bcrypt hash, insert user, return without password | 4h |
| M2-T2 | Registration form UI — React Hook Form + Zod, role selector | 4h |
| M2-T3 | OTP send/verify API — store OTP with 5-min TTL, verify before activation | 6h |

**US-2.2: User Login**

| ID | Task | Effort |
|:---|:---|:---|
| M2-T4 | `POST /api/v1/auth/login` — Passport local, session via connect-pg-simple | 4h |
| M2-T5 | Login form UI — error handling, redirect to role dashboard | 3h |
| M2-T6 | `GET /api/v1/auth/me` — session user. Auto-redirect if expired | 2h |
| M2-T7 | `POST /api/v1/auth/logout` — destroy session, clear cookie | 1h |

**US-2.3: HIM Access SSO**

| ID | Task | Effort |
|:---|:---|:---|
| M2-T8 | OAuth2/SAML HIM Access integration — redirect, callback, user link | 8h |

**US-2.4: RBAC Guards**

| ID | Task | Effort |
|:---|:---|:---|
| M2-T9 | Auth middleware — check `req.isAuthenticated()`, return 401 | 2h |
| M2-T10 | RBAC middleware — check role against allowed roles, return 403 | 2h |
| M2-T11 | `<ProtectedRoute>` wrapper — replace current `useRole` context switch | 4h |

**Acceptance:** Register → OTP → Login works; bcrypt verified in DB; sessions persist; RBAC enforced (403 on wrong role).

---

### MODULE 3: Candidate Profile & Documents
**FRS Ref:** §2.2, §2.3 | **Effort:** 4 days

| ID | Task | Effort |
|:---|:---|:---|
| M3-T1 | Profile CRUD API — `GET/PATCH /api/v1/candidates/:id`, owner/admin only | 4h |
| M3-T2 | Profile completion % — calculate from filled fields, store in DB | 3h |
| M3-T3 | Connect profile UI to real API — replace mock data with TanStack Query | 4h |
| M3-T4 | Upload API — `multer`, PDF/JPG/PNG max 5MB, store to uploads/ or S3 | 6h |
| M3-T5 | `documents` table schema — type, fileName, fileUrl, verified, verifiedBy | 2h |
| M3-T6 | Upload UI — drag-and-drop, progress bar, download/delete | 4h |
| M3-T7 | DigiLocker integration — consent flow, fetch verified docs, mark verified | 8h |
| M3-T8 | **Structured Education** — `candidate_education` table CRUD + UI (degree, institution, year, grade) | 4h |
| M3-T9 | **Structured Work Experience** — `candidate_experience` table CRUD + UI (company, role, dates) | 4h |
| M3-T10 | **PDF Profile Export** — `GET /api/v1/candidates/:id/pdf` generates formatted PDF for agency download | 4h |

**Acceptance:** Profile persists to PostgreSQL; files upload/retrieve; type/size validation works; completion % dynamic; education & experience are structured records; PDF downloads correctly.

---

### MODULE 4: Job Management
**FRS Ref:** §2.4, §2.5 | **Effort:** 4 days

| ID | Task | Effort |
|:---|:---|:---|
| M4-T1 | Job CRUD API — only verified agents/employers create; Zod validation | 6h |
| M4-T2 | Job listing API with filters — country, skill, salary, experience, **sector**, pagination | 6h |
| M4-T3 | Job posting UI — connect forms to API, add validation, **add sector dropdown** | 4h |
| M4-T4 | Job search UI — filter sidebar (incl. sector), search bar, pagination tied to API | 4h |
| M4-T5 | View counter — debounced per session increment | 2h |
| M4-T6 | Job analytics API — views, applications, shortlisted, conversion | 3h |
| M4-T7 | **Bulk applicant export** — `GET /api/v1/jobs/:id/applicants/export` CSV/ZIP | 3h |

**Acceptance:** Full CRUD works; search returns filtered paginated results < 500ms; only verified users can post.

---

### MODULE 5: Application & Matching
**FRS Ref:** §2.4, §2.7 | **Effort:** 5 days

| ID | Task | Effort |
|:---|:---|:---|
| M5-T1 | Apply API — prevent duplicates, auto-calculate matchScore | 4h |
| M5-T2 | **Application documents** — allow per-application doc attachments (cover letter, etc.) | 3h |
| M5-T3 | Application status API — list with details, update status (agent/employer) | 4h |
| M5-T4 | Application UI — status badges per workflow state | 4h |
| M5-T5 | Agency application view — list applicants, sort by score, bulk update | 4h |
| M5-T6 | Matching service — skill(40%), experience(20%), country(20%), location(10%), salary(10%) | 8h |
| M5-T7 | Recommendations API — top 10 jobs by match score per candidate | 4h |
| M5-T8 | Matching UI — score badges on cards, "Recommended" section | 3h |

**Status Workflow:**
```
submitted → under_review → shortlisted → interview_scheduled
         → interviewed → selected → **candidate_accepted** / **candidate_declined**
         → placement_initiated → placed
         → rejected (any stage) | withdrawn (by candidate)
```

> **FRS Gap #2 Fix:** Added explicit `candidate_accepted` / `candidate_declined` step between `selected` and `placement_initiated` so candidates actively confirm offers.

**Acceptance:** Apply works; duplicates blocked; scores display; status transitions enforced; recommendations update.

---

### MODULE 6: Recruitment Drives & Interviews
**FRS Ref:** §2.5, §2.7 | **Effort:** 4 days

| ID | Task | Effort |
|:---|:---|:---|
| M6-T1 | `recruitment_drives` table schema | 2h |
| M6-T2 | Drive CRUD API — admin approval required before activation | 4h |
| M6-T3 | Drive UI — scheduling form, calendar view, candidate invitations | 5h |
| M6-T4 | `interviews` table schema — mode, result, notes, conductedBy | 2h |
| M6-T5 | Interview API — schedule, record results, notify candidate | 4h |
| M6-T6 | Interview UI — calendar for agencies, notification view for candidates | 5h |
| M6-T7 | `placements` table schema — appointmentLetter, visaStatus, departureDate | 2h |
| M6-T8 | Placement API — create, update, upload appointment letter | 4h |
| M6-T9 | Placement UI — details view, tracker, admin statistics | 4h |
| M6-T10 | **Candidate Accept/Decline UI** — Accept or decline offer with deadline timer | 3h |

**Acceptance:** Drives created/approved; interviews scheduled with notifications; appointment letters uploadable.

---

### MODULE 7: Agency Verification & Admin
**FRS Ref:** §2.5, §2.6 | **Effort:** 4 days

| ID | Task | Effort |
|:---|:---|:---|
| M7-T1 | Agency registration API — set `verified: false` | 3h |
| M7-T2 | Admin approval API — approve/reject with comments, notify agency | 4h |
| M7-T3 | Admin verification UI — pending list, document preview, approve/reject | 4h |
| M7-T4 | Dashboard API — aggregated stats (candidates, jobs, applications, placements) | 4h |
| M7-T5 | Reports API — CSV/PDF export by district, agency, skill, status, date | 6h |
| M7-T6 | Dashboard UI — connect charts to real data, add date range filters | 4h |
| M7-T7 | `grievances` table schema — category, priority, assignedTo, resolution | 2h |
| M7-T8 | Grievance API — create, list (own/all), update | 4h |
| M7-T9 | Grievance UI — submission form, ticket tracker, admin panel | 4h |
| M7-T10 | **FAQ CRUD** — Admin creates/edits FAQ entries; public FAQ page for all roles | 3h |
| M7-T11 | **Announcements** — `announcements` table + Admin CRUD + banner on landing page | 3h |
| M7-T12 | **Training Events** — `training_events` table + Admin CRUD + candidate registration + notification trigger | 4h |
| M7-T13 | **Drive Admin Approval** — `PATCH /api/v1/admin/drives/:id/approve` endpoint + pending drives list in Admin UI | 3h |
| M7-T14 | **Agency Past Record** — Add `pastRecord` and `references` fields to agency registration + verification UI | 2h |

**Acceptance:** Agencies flow through registration→pending→approved; dashboard shows real data; reports export as CSV; grievances trackable; FAQs published; announcements display; training events notify candidates; drives require admin approval; agency past record is captured.

---

### MODULE 8: Notifications & Communication
**FRS Ref:** §2.2, §2.8 | **Effort:** 3 days

| ID | Task | Effort |
|:---|:---|:---|
| M8-T1 | Notification service — unified `sendEmail()`, `sendSMS()` interface | 4h |
| M8-T2 | Email setup — `nodemailer`, templates for all trigger events | 4h |
| M8-T3 | SMS setup — NIC/CDAC API, OTP + status templates | 4h |
| M8-T4 | `notifications` table — type, channel, status, sentAt | 2h |
| M8-T5 | In-app notifications — API + bell icon with unread count | 4h |

**Trigger Map:** Registration, OTP, job match, application submitted, status change, interview scheduled, drive notification, placement, grievance update.

**Acceptance:** Emails sent on all triggers; SMS OTPs within 30s; bell icon shows unread count.

---

### MODULE 9: Internationalization (i18n)
**FRS Ref:** §1.2 | **Effort:** 2 days

| ID | Task | Effort |
|:---|:---|:---|
| M9-T1 | i18n setup — `react-i18next`, English/Hindi locale folders | 3h |
| M9-T2 | Extract all hardcoded strings — replace with `t('key')` calls | 6h |
| M9-T3 | Hindi translations — review with native speaker | 4h |
| M9-T4 | Language toggle — header switcher, persist in localStorage + user profile | 2h |

**Acceptance:** Full UI toggles EN↔HI; preference persists; all labels/buttons/messages translated.

---

### MODULE 10: Testing & QA
**FRS Ref:** §3.3 | **Effort:** 4 days

| ID | Task | Effort |
|:---|:---|:---|
| M10-T1 | Test setup — jest, testing-library, supertest, playwright | 3h |
| M10-T2 | Unit tests — services, validators, utilities (30+ tests) | 6h |
| M10-T3 | API integration tests — all endpoints with supertest (40+ tests) | 8h |
| M10-T4 | Component tests — key UI forms and displays (15+ tests) | 4h |
| M10-T5 | E2E tests — 5 critical flows with Playwright | 6h |
| M10-T6 | Performance tests — Artillery/k6, confirm NFR targets | 4h |

**Quality Targets:** ≥70% coverage, 100% API pass, <3s page load, <500ms API p95, 0 critical vulnerabilities.

---

### MODULE 11: Progressive Web App (PWA) — *Exceed Expectations*
**FRS Ref:** §2.8 (iOS/Android) | **Effort:** 2 days

| ID | Task | Effort |
|:---|:---|:---|
| M11-T1 | Install `vite-plugin-pwa`, configure manifest.json (app name, icons, theme) | 2h |
| M11-T2 | Service worker with offline caching for static assets + API fallback | 4h |
| M11-T3 | Install prompt banner (“Add to Home Screen”) on mobile browsers | 2h |
| M11-T4 | Push notification subscription (Web Push API) | 6h |

**Acceptance:** App is installable on Android/iOS via browser; works offline for cached pages; push notifications deliver.

---

### MODULE 12: AI Resume Parsing — *Exceed Expectations*
**Effort:** 2 days

| ID | Task | Effort |
|:---|:---|:---|
| M12-T1 | PDF text extraction from uploaded CVs using `pdf-parse` | 4h |
| M12-T2 | Regex/NLP extraction of skills, experience years, education | 6h |
| M12-T3 | Auto-populate profile fields from parsed CV, allow user to review/confirm | 4h |

**Acceptance:** Uploading a CV auto-fills skills, experience, education fields. User can edit before saving.

---

### MODULE 13: Candidate Journey Timeline — *Exceed Expectations*
**Effort:** 1 day

| ID | Task | Effort |
|:---|:---|:---|
| M13-T1 | Timeline component showing: Registered → Profile Complete → Applied → Shortlisted → Interviewed → Placed | 4h |
| M13-T2 | Aggregate timeline data from applications, interviews, placements tables | 3h |

**Acceptance:** Candidate dashboard shows a visual journey timeline. Each step is clickable for details.

---

### MODULE 14: Agency Reputation System — *Exceed Expectations*
**Effort:** 1.5 days

| ID | Task | Effort |
|:---|:---|:---|
| M14-T1 | `agency_reviews` table: candidateId, agencyId, rating (1-5), comment, createdAt | 2h |
| M14-T2 | Review submission API (only placed candidates can review) | 3h |
| M14-T3 | Star ratings + reviews display on agency public profile | 3h |
| M14-T4 | Aggregate rating calculation → update `recruitment_agents.rating` | 2h |

**Acceptance:** Placed candidates can rate agencies. Average rating displays publicly. Only verified placements can submit reviews.

---

## 4. Effort Summary

| Module | Description | Days |
|:---|:---|:---|
| M1 | Infrastructure & Configuration | 2.5 |
| M2 | Authentication & Authorization | 5 |
| M3 | Candidate Profile & Documents | 6 |
| M4 | Job Management | 4.5 |
| M5 | Application & Matching | 5.5 |
| M6 | Recruitment Drives & Interviews | 4.5 |
| M7 | Agency Verification & Admin | 6 |
| M8 | Notifications & Communication | 3 |
| M9 | Internationalization (i18n) | 2 |
| M10 | Testing & Quality Assurance | 4 |
| M11 | PWA (Exceed) | 2 |
| M12 | AI Resume Parsing (Exceed) | 2 |
| M13 | Candidate Journey Timeline (Exceed) | 1 |
| M14 | Agency Reputation System (Exceed) | 1.5 |
| | **TOTAL** | **49 days** |

> **Calendar Time:** ~10 weeks (1 dev) / ~6 weeks (2 devs)
