# HireStream — Phasing, Milestones & Release Plan
**Project:** Overseas Placement Portal (HPSEDC)
**Version:** 1.1 | **Date:** 2026-03-26

---

## 1. Document Purpose

This document organizes the 10 development modules from the Development Plan into **4 delivery phases**, defines milestones, dependency chains, risk mitigation, and release criteria. This is the project manager's execution guide and the client's visibility document.

---

## 2. Phase Overview

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  PHASE 1              PHASE 2              PHASE 3              PHASE 4    ║
║  Foundation &         Core Business        Advanced             Polish &   ║
║  Security             Logic                Workflows            Launch     ║
║  ──────────           ─────────            ──────────           ────────   ║
║  Week 1-2             Week 3-5             Week 6-7             Week 8-9   ║
║                                                                            ║
║  M1: Infra Config     M4: Job Mgmt         M6: Drives/Intrvw   M9: i18n   ║
║  M2: Auth/RBAC        M5: Applications     M7: Admin/Agency    M10: QA    ║
║  M3: Profiles/Docs    M8: Notifications    M7: Grievances/FAQ  M11: PWA   ║
║                                             M7: Training/CMS              ║
║  ▶ MVP Demo           ▶ Beta Release       ▶ Feature Complete  ▶ Go Live  ║
║                                                                            ║
║  PHASE 5: Exceed Expectations (Week 10)                                    ║
║  M12: AI Resume Parse  M13: Journey Timeline  M14: Agency Ratings          ║
║  ▶ v1.1 Release                                                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Dependency Chain

```
M1 (Infra) ──────┐
                  ├──▶ M2 (Auth) ──┐
                  │                 ├──▶ M3 (Profiles) ──┐
                  │                 │                     ├──▶ M4 (Jobs) ──┐
                  │                 │                     │                ├──▶ M5 (Apply/Match)
                  │                 │                     │                │
                  │                 │                     │                ├──▶ M6 (Drives)
                  │                 │                     │                │
                  │                 │                     │                └──▶ M7 (Admin)
                  │                 │                     │
                  │                 │                     └──▶ M8 (Notifications) [parallel from M3]
                  │                 │
                  │                 └──▶ M9 (i18n) [can start parallel from M2]
                  │
                  └──▶ M10 (Testing) [continuous from M2 onwards]
```

**Critical Path:** M1 → M2 → M3 → M4 → M5 (17 days minimum)

---

## 4. Phase 1: Foundation & Security (Week 1–2)

### Objective
Stand up the entire backend infrastructure, authentication system, and candidate profiles so the application transitions from a frontend prototype to a working full-stack application.

### Modules Included
| Module | Effort | Deliverables |
|:---|:---|:---|
| **M1** Infrastructure | 2 days | Env config, logger, security middleware, error handler, DB migrations |
| **M2** Authentication | 5 days | Register, login, OTP, session, RBAC, HIM Access SSO integration |
| **M3** Profiles & Docs | 4 days | Candidate CRUD, file upload, DigiLocker integration |

### Milestone: **MVP Demo** (End of Week 2)
> A user can register, verify OTP, login, complete their profile, and upload documents. All data persists to PostgreSQL. Role-based access is enforced.

### Deliverables Checklist
- [ ] PostgreSQL connected with all tables created
- [ ] `.env` validated on startup
- [ ] Structured logging operational
- [ ] Helmet, rate-limit, CORS configured
- [ ] User registration with bcrypt password hashing
- [ ] OTP verification (email/SMS)
- [ ] Session-based login with role redirect
- [ ] RBAC middleware blocking unauthorized routes
- [ ] HIM Access SSO callback (pending HP API credentials)
- [ ] Candidate profile CRUD connected to UI
- [ ] File upload working (PDF/JPG, max 5MB)
- [ ] Profile completion percentage
- [ ] Structured education & work experience records
- [ ] Health-check endpoint returning green

### Demo Script
1. Open portal → Landing page loads
2. Click "Register" → Fill form → Submit → OTP sent
3. Verify OTP → Redirected to Candidate Dashboard
4. Edit profile → Add skills, experience, preferences → Save
5. Upload CV (PDF) → File appears in documents list
6. Logout → Login again → Profile data persists
7. Try accessing `/admin` → 403 Forbidden

---

## 5. Phase 2: Core Business Logic (Week 3–5)

### Objective
Build the complete job posting, search, application, and matching workflows that form the core value proposition of the portal.

### Modules Included
| Module | Effort | Deliverables |
|:---|:---|:---|
| **M4** Job Management | 4 days | Job CRUD, search/filter, pagination, analytics |
| **M5** Applications & Matching | 5 days | Apply, status workflow, AI matching algorithm, recommendations |
| **M8** Notifications | 3 days | Email templates, SMS gateway, in-app notifications |

### Milestone: **Beta Release** (End of Week 5)
> Agencies can post jobs. Candidates can search, filter, apply, and receive match scores. Application status flows through the full workflow. Email/SMS notifications fire on key events.

### Deliverables Checklist
- [ ] Job CRUD API with Zod validation
- [ ] Job search with multi-filter + pagination (< 500ms)
- [ ] Only verified agents/employers can post
- [ ] One-click apply with duplicate prevention
- [ ] Match score algorithm (skill/experience/country/location/salary)
- [ ] "Recommended For You" section on candidate dashboard
- [ ] Application status workflow: submitted → ... → placed/rejected
- [ ] Agency view: applicant list, sort by score, bulk status update
- [ ] Email notifications: registration, application, status change
- [ ] SMS: OTP, interview calls
- [ ] In-app notification bell with unread count
- [ ] All mock data replaced with real API data

### Demo Script
1. Login as Agent → Post new job (Dubai, Hospitality, 3yr exp)
2. Login as Candidate → Search "Dubai" → Job appears → Match score 85%
3. Apply → Application status = "submitted"
4. Check email → Application confirmation received
5. Login as Agent → View applicants → Shortlist candidate
6. Candidate checks dashboard → Status = "shortlisted"
7. Notification bell shows "1 unread" → Click → Status update message

---

## 6. Phase 3: Advanced Workflows (Week 6–7)

### Objective
Implement the full recruitment lifecycle (drives, interviews, placements) and administrative controls (verification, reports, grievances) required by the FRS.

### Modules Included
| Module | Effort | Deliverables |
|:---|:---|:---|
| **M6** Drives & Interviews | 4 days | Drive scheduling, interviews, placements, appointment letters |
| **M7** Admin & Agencies | 4 days | Agency verification, dashboard, reports, grievances |

### Milestone: **Feature Complete** (End of Week 7)
> All FRS functional requirements are implemented. Admin can verify agencies, generate reports, handle grievances. Agencies can run recruitment drives end-to-end.

### Deliverables Checklist
- [ ] Recruitment drive CRUD with admin approval
- [ ] Interview scheduling with candidate notification
- [ ] Interview result recording
- [ ] Placement records with appointment letter upload
- [ ] Visa status tracking
- [ ] Agency registration → pending → approved flow
- [ ] Admin dashboard with real aggregated metrics
- [ ] Report generation by district/agency/skill/status (CSV export)
- [ ] Grievance submission, tracking, and resolution
- [ ] Audit log for all admin actions
- [ ] FAQ management (Admin CRUD + public page)
- [ ] Announcements banner on landing page
- [ ] Training events with candidate registration + notifications
- [ ] Admin approval required for recruitment drives
- [ ] Agency past record captured during registration
- [ ] Candidate accept/decline step in placement flow
- [ ] PDF profile export for agencies
- [ ] Bulk applicant CSV/ZIP export

### Demo Script
1. Login as Agent → Create recruitment drive (Delhi, March 30)
2. Login as Admin → Approve drive
3. Agent → Schedule interviews for shortlisted candidates
4. Candidate receives SMS → "Interview scheduled March 30, 10 AM"
5. Agent → Record result: "Selected" → Issue appointment letter
6. Candidate dashboard → Placement details + letter download
7. Admin → Generate report: "Placements by district, Q1 2026" → CSV downloads
8. Candidate → File grievance about delayed visa processing
9. Admin → View grievance → Assign → Resolve → Candidate notified

---

## 7. Phase 4: Polish & Launch (Week 8)

### Objective
Add internationalization, execute the full test suite, perform security/performance audits, and prepare for production launch.

### Modules Included
| Module | Effort | Deliverables |
|:---|:---|:---|
| **M9** Internationalization | 2 days | English/Hindi toggle, translations, persistence |
| **M10** Testing & QA | 4 days | Unit, integration, E2E, performance, security tests |

### Milestone: **Production Go-Live** (End of Week 8)
> Portal is bilingual, fully tested, security-hardened, and deployed to production with monitoring.

### Deliverables Checklist
- [ ] Language toggle EN ↔ Hindi in header
- [ ] All UI strings translated
- [ ] Language preference persists in localStorage + user profile
- [ ] Unit tests: 30+ passing
- [ ] API integration tests: 40+ passing
- [ ] Component tests: 15+ passing
- [ ] E2E tests: 5 critical flows passing
- [ ] Code coverage ≥ 70%
- [ ] Load test: 5000 concurrent users, < 500ms p95
- [ ] OWASP ZAP: 0 critical/high vulnerabilities
- [ ] PM2 cluster mode configured
- [ ] Nginx SSL + static caching
- [ ] Database backup automation (6-hourly)
- [ ] Error tracking (Sentry) or logging dashboard
- [ ] Admin user seeded
- [ ] Production deployment verified

---

## 8. Phase 5: Exceed Expectations (Week 10)

### Objective
Deliver premium features that go **beyond the FRS** to differentiate HireStream and impress stakeholders.

### Modules Included
| Module | Effort | Deliverables |
|:---|:---|:---|
| **M11** PWA | 2 days | Installable app, offline support, push notifications |
| **M12** AI Resume Parsing | 2 days | Auto-extract skills/education from uploaded CVs |
| **M13** Candidate Journey Timeline | 1 day | Visual timeline on candidate dashboard |
| **M14** Agency Reputation System | 1.5 days | Star ratings + reviews from placed candidates |

### Milestone: **v1.1 Release** (End of Week 10)
> Portal exceeds FRS scope. Candidates can install as mobile app, see AI-parsed profiles, track their complete journey visually, and rate agencies.

### Deliverables Checklist
- [ ] PWA installable on Android/iOS browsers
- [ ] Offline mode for cached pages
- [ ] Push notifications for job matches
- [ ] CV upload auto-fills profile fields
- [ ] Journey timeline on candidate dashboard
- [ ] Agency review/rating system live
- [ ] Average agency rating displayed publicly

---

## 8. Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|:---|:---|:---|:---|:---|
| R1 | HIM Access SSO API credentials delayed | HIGH | HIGH | Build email/OTP auth first. SSO is additive, not blocking. |
| R2 | DigiLocker API access delayed | MEDIUM | HIGH | Manual document upload works without DigiLocker. Add later. |
| R3 | Government SMS Gateway approval slow | MEDIUM | HIGH | Use Twilio/MSG91 as interim; swap provider later. |
| R4 | Single developer bottleneck | HIGH | MEDIUM | Prioritize critical path (M1→M2→M4→M5). Defer M6, M9 if needed. |
| R5 | Database performance under load | HIGH | LOW | Indexed queries via Drizzle. Neon auto-scaling. Add Redis cache if needed. |
| R6 | FRS scope changes from HPSEDC | MEDIUM | MEDIUM | Modular architecture allows feature additions without refactoring. |
| R7 | Hindi translation quality | LOW | MEDIUM | Professional review before launch. Community feedback post-launch. |
| R8 | GIGW compliance audit failure | MEDIUM | MEDIUM | Integrate axe-core checks in Phase 4. Address contrast/nav issues early. |
| R9 | AI resume parsing accuracy low | LOW | HIGH | Keep as "suggestion" mode — user always confirms before saving. |
| R10 | PWA push notification browser support | LOW | LOW | Graceful fallback to email/SMS. Chrome/Firefox support is sufficient. |

---

## 9. Resource Requirements

| Resource | Requirement | Phase |
|:---|:---|:---|
| **PostgreSQL Database** | Neon free tier (dev), Pro tier (prod) | Phase 1 |
| **File Storage** | Local `uploads/` (dev), MinIO or S3 (prod) | Phase 1 |
| **SMTP Server** | Government mail or SendGrid (interim) | Phase 2 |
| **SMS Gateway** | NIC/CDAC or MSG91 (interim) | Phase 2 |
| **HIM Access Credentials** | OAuth2 client ID/secret from HP IT Dept | Phase 1 |
| **DigiLocker API Key** | Registration via DigiLocker partner program | Phase 1 |
| **SSL Certificate** | Let's Encrypt (auto-renew via certbot) | Phase 4 |
| **VM / Server** | 2 vCPU, 4GB RAM minimum (existing setup) | All |
| **Domain** | Configured via Cloudflare DNS | All |

---

## 10. Release Cadence

| Release | Week | Content | Environment |
|:---|:---|:---|:---|
| **Alpha 0.1** | Week 2 | Auth + Profiles (MVP Demo) | Development VM |
| **Alpha 0.2** | Week 3 | + Jobs CRUD | Development VM |
| **Beta 0.5** | Week 5 | + Applications, Matching, Notifications | Staging |
| **RC 0.9** | Week 7 | + Drives, Admin, Grievances, FAQ, Training (Feature Complete) | Staging |
| **v1.0** | Week 9 | + i18n, Tests, Security Hardened, PWA | **Production** |
| **v1.1** | Week 10 | + AI Resume Parse, Timeline, Agency Ratings (Exceed) | **Production** |

---

## 11. Standardized Methodology: FRS → Dev → Delivery

This project establishes a repeatable methodology for all future OSIPL projects:

```
┌────────────┐     ┌────────────────────┐     ┌───────────────────┐
│   FRS /    │     │  01_Architecture   │     │  02_Dev_Plan      │
│   Scope    │────▶│  - Tech stack      │────▶│  - Modules        │
│   Document │     │  - Data model      │     │  - User stories   │
│            │     │  - API contracts   │     │  - Tasks + effort  │
│            │     │  - Security design │     │  - Acceptance crit │
│            │     │  - Integrations    │     │  - DoD standards   │
└────────────┘     └────────────────────┘     └───────────────────┘
                                                       │
                                                       ▼
                                              ┌───────────────────┐
                                              │  03_Phasing       │
                                              │  - Phase plan     │
                                              │  - Dependencies   │
                                              │  - Milestones     │
                                              │  - Risk register  │
                                              │  - Release plan   │
                                              └───────────────────┘
```

### Steps to Replicate for Any New Project
1. **Receive FRS / Scope Document** → Save to `A.PMD/FRS/`
2. **Run Gap Analysis** → Compare FRS against existing codebase (if any)
3. **Create 01_Architecture** → Tech stack, data model, API map, security, deployments
4. **Create 02_Development_Plan** → Modules, user stories, tasks, estimates, DoD
5. **Create 03_Phasing** → Phases, milestones, dependencies, risks, release cadence
6. **Begin Development** → Follow Phase 1 → Phase N with milestone demos

---

## 12. Revision History

| Version | Date | Author | Changes |
|:---|:---|:---|:---|
| 1.0 | 2026-03-26 | HireStream Dev Team | Initial phasing plan derived from Architecture & Dev Plan |
| 1.1 | 2026-03-26 | HireStream Dev Team | FRS cross-check: added Phase 5 (Exceed), +3 risks, expanded Phase 3-4 deliverables, updated release cadence |
