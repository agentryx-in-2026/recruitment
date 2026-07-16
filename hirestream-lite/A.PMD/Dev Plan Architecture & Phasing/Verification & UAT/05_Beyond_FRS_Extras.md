# HireStream — Beyond FRS Deliverables

**Document version:** 1.0
**Date:** 2026-04-14
**Build reference:** HireStream v1.4.0

## Purpose

This document lists features delivered by Agentryx **over and above** the original FRS scope. These items are **not requirements** — they are value-adds that strengthen the portal's usability, security, operational control, and long-term maintainability.

They are logged here separately so FRS acceptance review remains clean and focused on contracted scope.

---

## Index

1. [Enhanced UX & Visual Design](#1-enhanced-ux--visual-design)
2. [Progressive Web App (PWA)](#2-progressive-web-app-pwa)
3. [AI Resume Parser](#3-ai-resume-parser)
4. [Candidate Journey Timeline](#4-candidate-journey-timeline)
5. [Agency Review System](#5-agency-review-system)
6. [Agency Performance Leaderboard](#6-agency-performance-leaderboard)
7. [Dark Mode](#7-dark-mode)
8. [Two-Factor Authentication (TOTP)](#8-two-factor-authentication-totp)
9. [Bulk CSV Export](#9-bulk-csv-export)
10. [Advanced Job Matching](#10-advanced-job-matching)
11. [Save/Bookmark Jobs](#11-savebookmark-jobs)
12. [Recommended-for-me Feed](#12-recommended-for-me-feed)
13. [Defence-in-Depth Security](#13-defence-in-depth-security)
14. [Code Splitting (Performance)](#14-code-splitting-performance)
15. [Automated Test Suite](#15-automated-test-suite)
16. [CI/CD Pipeline](#16-cicd-pipeline)
17. [Comprehensive Operations Documentation](#17-comprehensive-operations-documentation)

---

## 1. Enhanced UX & Visual Design

**FRS asked for:** Clean, responsive design.

**Delivered beyond:**
- Premium government-portal aesthetic with gradient hero sections, animated stat cards, Framer Motion transitions
- Indian tricolor masthead on every page
- Consistent design system across 4 role dashboards (matching visual language)
- Profile Wizard with colored step-panels and animated field transitions
- Role-specific color identity (blue for Candidate, emerald for Agency, purple for Employer, red for Admin)

**Why it matters:** Government portals often look dated. This builds candidate trust and matches the quality of modern private-sector job portals.

---

## 2. Progressive Web App (PWA)

**FRS asked for:** Web app + iOS/Android native apps.

**Delivered beyond:**
- Fully installable PWA via "Add to Home Screen" on both iOS and Android
- Offline fallback via service worker
- App-like icon, splash screen, theme color
- No App Store / Play Store submission required

**Why it matters:** Users get a mobile "app" experience without the overhead of native-app development, submission, and ongoing maintenance across two platforms. Native apps can be added later in v2.0 if required.

---

## 3. AI Resume Parser

**FRS asked for:** Profile management (manual entry).

**Delivered beyond:**
- Paste a resume → portal extracts name, email, phone, experience, skills (matched against 200+ canonical skills), degrees, country preferences
- Confidence scores per field
- One-click apply-to-profile

**Why it matters:** Dramatically reduces onboarding friction. A candidate who would otherwise take 15 minutes entering data can complete profile setup in under 2 minutes.

---

## 4. Candidate Journey Timeline

**FRS asked for:** Track application status.

**Delivered beyond:**
- Visual 10-milestone lifecycle view: Registered → Profile → Education → Experience → Documents → First Application → Shortlisted → Interview → Selected → Placed Abroad
- Per-milestone status badges and "Next Up" indicator
- Motivational progress tracking for candidates

**Why it matters:** Candidates often drop off portals without knowing what to do next. Timeline shows clear progress and next action, improving completion rates.

---

## 5. Agency Review System

**FRS asked for:** Agency registration and job postings.

**Delivered beyond:**
- Candidates placed through an agency can submit 1-5 star reviews with optional title and text
- Automatic aggregate rating computation
- Public display on agency profile
- `agency_reviews` table with audit trail

**Why it matters:** Transparency accountability for agencies. Good agencies get recognized; bad ones are visible to other candidates.

---

## 6. Agency Performance Leaderboard

**FRS asked for:** (not in FRS)

**Delivered beyond:**
- Public-facing ranking of verified agencies on landing page
- Composite score: `placements × 10 + average rating × 5`
- 3 badge types: Top Placer (50+ placements), 5-Star (4.5+ rating w/ 5+ reviews), Well Reviewed (20+ reviews)
- Medal emoji ranking for top 3

**Why it matters:** Market-driven quality signal. Candidates see who has actually delivered placements, not just who claims to.

---

## 7. Dark Mode

**FRS asked for:** (not in FRS)

**Delivered beyond:**
- Toggle in header next to font-size accessibility control
- Persisted across sessions
- No-flash initialization (applied before render)
- Comprehensive theme override via CSS (not per-component dark: variants)

**Why it matters:** User comfort, especially for heavy-use admin/agency roles doing long sessions. Also improves accessibility for light-sensitive users.

---

## 8. Two-Factor Authentication (TOTP)

**FRS asked for:** Secure authentication.

**Delivered beyond:**
- TOTP-based 2FA via authenticator app (Google Authenticator, Authy, 1Password, etc.)
- QR code setup + manual entry key
- 10 single-use recovery codes issued on enable
- Recovery code auto-burning on use

**Why it matters:** Recommended for admin/HPSEDC accounts to prevent credential compromise. Optional for candidates but available.

---

## 9. Bulk CSV Export

**FRS asked for:** Reports (by district, agency, skill, status).

**Delivered beyond:**
- 9 entity types exportable: candidates, jobs, applications, agencies, employers, drives, placements, grievances, users
- Proper CSV escaping (quotes, commas, newlines)
- Password and secret fields automatically stripped
- Date-stamped filenames

**Why it matters:** HPSEDC team can do any custom analysis in Excel/Google Sheets without portal feature requests.

---

## 10. Advanced Job Matching

**FRS asked for:** Targeted search by location, skill, salary.

**Delivered beyond:**
- Weighted match algorithm: Skills 50% + Experience 30% + Country Preference 20%
- Per-application score breakdown stored (transparency — "why this score?")
- Candidate sees match score on every job; agency sees match score on every applicant

**Why it matters:** Quality of match improves candidate-agency fit. Transparent scoring builds trust.

---

## 11. Save/Bookmark Jobs

**FRS asked for:** (not in FRS)

**Delivered beyond:**
- Candidates can bookmark jobs to review later
- Dedicated "Saved Jobs" view
- Reduces pressure to apply immediately

**Why it matters:** Candidates exploring options but not ready to apply yet have a way to revisit.

---

## 12. Recommended-for-me Feed

**FRS asked for:** Job search filters.

**Delivered beyond:**
- Proactive personalized feed of top-10 matched jobs per candidate
- Auto-updates as jobs are posted or profile changes
- Driven by the match algorithm (see §10)

**Why it matters:** Shifts the portal from passive search to proactive discovery. Better candidate engagement.

---

## 13. Defence-in-Depth Security

**FRS asked for:** HTTPS, RBAC, encryption.

**Delivered beyond (6 additional layers):**

| Defence | Purpose |
|---------|---------|
| Input sanitization middleware | Strips `<script>`, event handlers, `javascript:` URLs from all bodies |
| Magic-byte file validation | Defeats extension spoofing (`evil.exe` renamed `cv.pdf`) |
| Audit log middleware | Every mutation logged with user, IP, body, status |
| Sensitive rate limiter | 5 attempts / 15 min on OTP + password reset endpoints |
| Server signature scrub | No `X-Powered-By`, no `Server` header leaked |
| Body size limit | 1MB cap prevents memory-exhaustion attacks |

**Why it matters:** Addresses OWASP Top 10 concerns proactively. Improves defensibility in security audits.

---

## 14. Code Splitting (Performance)

**FRS asked for:** Page load < 3 seconds.

**Delivered beyond:**
- React lazy-loading for all dashboards + secondary pages
- Initial bundle reduced from 1.24 MB to 427 KB (65% smaller)
- Recharts library (374 KB) splits into its own chunk, loaded only when admin views a chart

**Why it matters:** Landing page loads significantly faster for new visitors. Mobile users on slower networks benefit most.

---

## 15. Automated Test Suite

**FRS asked for:** Unit, integration, UAT testing.

**Delivered beyond:**
- 18 unit tests (validators)
- 255+ integration tests across 15 test files
- 15 end-to-end tests via Playwright (full user journeys)
- ~70%+ line coverage
- All tests green at release

**Why it matters:** Catches regressions before they reach production. Enables safer future changes.

---

## 16. CI/CD Pipeline

**FRS asked for:** (not in FRS; implied by "maintainability")

**Delivered beyond:**
- GitHub Actions workflow on every push + PR
- Runs TypeScript check, unit tests, integration tests, build
- Playwright E2E on PRs
- Artifact upload on main-branch merges

**Why it matters:** Every change is automatically validated. Reduces risk of broken deploys.

---

## 17. Comprehensive Operations Documentation

**FRS asked for:** Handover documentation.

**Delivered beyond:**
- **Production Runbook** — deploy, restart, backup/restore, incident response procedures
- **API Reference** — all 134 endpoints documented with auth + rate limits + error codes
- **Dev Task Monitor** — day-by-day build log (Days 0-23) for audit trail
- **Security Master Checklist** — 31 audit items with resolution evidence
- **Future Enhancements** — prioritized backlog with effort estimates
- **This Verification & UAT folder** — scope traceability for sign-off

**Why it matters:** Operations team can run the portal with no tribal knowledge transfer needed. Audit readiness.

---

## Summary

| Category | Count |
|----------|------:|
| User-facing features beyond FRS | 7 |
| Security beyond FRS | 7 defence layers |
| Operational beyond FRS | 4 (PWA, tests, CI/CD, docs) |
| **Total value-add items** | **17 tracked here** |

**Estimated additional engineering value:** ~40-50% of original FRS scope, delivered without additional contract change.

---

## v1.5.0 additions (2026-04-15)

### 18. Runtime System Configuration Module
**FRS asked for:** (not in FRS)

**Delivered:** 21 admin-mutable settings across 8 categories — pipeline rules, rejection policy, access gating, notifications, matching thresholds, application lifecycle, uploads, security. Admin changes behaviour from the dashboard with no deploy. See [`../../06_System_Configuration_Reference.md`](../06_System_Configuration_Reference.md).

**Why it matters:** Post-launch, HPSEDC can tune operational policy without developer involvement. Eliminates the "small change = deploy risk" problem.

### 19. Internal notes on applicants
**FRS asked for:** (not in FRS)

**Delivered:** Per-application notes thread visible to the agency team. Add/delete with author attribution. Expandable inline in the applicant pipeline.

**Why it matters:** Recruiter collaboration, institutional memory, no more lost context between shifts.

### 20. Structured interview feedback
**FRS asked for:** (FRS 2.16 — record interview result, basic)

**Delivered beyond:** 5-point overall rating + strengths + concerns + recommendation (strong yes → strong no) + free-text notes, per interview. Persisted alongside the outcome.

**Why it matters:** HPSEDC audit defensibility — "why did we select this candidate?" has a real answer. Feeds richer rejection feedback to candidates.

### 21. CSV export of applicant pipeline (FRS 2.10 ✅)
**FRS asked for:** Download applicant profiles.

**Delivered:** One-click CSV of every applicant on a job, including candidate personal details + compliance fields (passport, ECR, PDO, IELTS). HPSEDC can slice/filter in Excel.

### 22. Reports / BI dashboard
**FRS asked for:** (FRS 2.17 — analytics on job postings, basic)

**Delivered beyond:** Dedicated agent Reports tab with funnel breakdown, conversion rate (applied → placed), avg time-to-placement in days, top destination countries, applications-over-time trend chart.

**Why it matters:** Agencies see their own performance; HPSEDC uses aggregates for policy decisions.

### 23. ICS calendar export for interviews
**FRS asked for:** (not in FRS)

**Delivered:** Download `.ics` file per interview — adds to Google Calendar / Outlook / Apple Calendar / Proton Calendar in one click. Works offline, no OAuth needed.

### 24. Offer letter PDF generation
**FRS asked for:** (FRS 1.28 stub — DigiLocker-dependent)

**Delivered beyond:** Locally generated branded PDF offer letter (`PDFKit`) available without DigiLocker. Candidate can download from their placement detail page. Includes Emigration Act reference + next-steps checklist.

### 25. Duplicate application detection
**FRS asked for:** (not in FRS)

**Delivered:** Block re-apply to identical company + title within 30 days. Catches "accidentally applied again" cases from duplicated listings.

### 26. Saved candidate search segments
**FRS asked for:** (not in FRS)

**Delivered:** Per-agent saved search segments (backend complete — UI in a follow-up).

### 27. Email templates (admin-editable)
**FRS asked for:** (not in FRS)

**Delivered:** Database-backed email template store with merge-variables. Editor UI follows when SMTP is provisioned.

### 28. Bulk actions on applicant list
**FRS asked for:** (not in FRS)

**Delivered:** Multi-select checkboxes + floating action bar → Mark Reviewed / Shortlist All / Reject All / Clear.

### 29. Agent job edit in-place
**FRS asked for:** (FRS 2.6)

**Delivered beyond:** Edit pencil on every job card → opens JobPoster in edit mode, PUT `/api/v1/jobs/:id`. Applicants in pipeline remain untouched.

### 30. Interview scheduling modal with auto-notify
**FRS asked for:** (FRS 2.14, 2.15)

**Delivered beyond:** Rich modal with date/time/mode/location/drive selector. On submit: interview created + application flipped to `interview_scheduled` + candidate notified in-portal (and email if SMTP configured).

---

## Overseas-placement regulatory depth (MEA / Emigration Act, 1983)

These are not in the FRS but are **regulatory requirements** for any licensed overseas placement portal in India. HireStream tracks them in a unified pre-departure compliance panel per candidate.

### 31. Pre-Departure Orientation (PDO) tracking
Mandatory for ECR-category emigrants. Tracks completion + date. Flagged in placement workflow.

### 32. ECR/ECNR status
Determines whether Protectorate of Emigrants (POE) clearance is needed for 18 Gulf + Malaysia countries.

### 33. Police Clearance Certificate (PCC) tracking
Status + expiry. Most destination employers require fresh PCC.

### 34. Medical fitness tracking
Fit / pending / unfit + test date. Gulf countries require pre-departure medicals.

### 35. IELTS / language proficiency tracking
IELTS band stored on candidate. Extensible JSON for other languages (Arabic, Japanese, German).

### 36. PBBY insurance enrolment
Pravasi Bharatiya Bima Yojana — mandatory under Emigration Act §10 for ECR emigrants. Status + policy number tracked.

### 37. Passport tracking
Passport number + expiry on candidate profile. Enables expiry reminders (cron-ready).

### 38. Post-placement welfare follow-ups (30 / 60 / 90 day)
MEA mandate: agencies should check on emigrants after departure. Dedicated 30-day, 60-day, 90-day check-ins per placement with status (ok / concerns / no_response / not_applicable) + notes.

---

## Summary — v1.5 update

| Category | v1.4 | v1.5 Added | v1.5 Total |
|----------|-----:|-----------:|-----------:|
| User-facing features beyond FRS | 7 | 8 | 15 |
| Agent productivity beyond FRS | — | 6 | 6 |
| Regulatory / welfare (MEA adjacent) | — | 8 | 8 |
| Security beyond FRS | 7 | — | 7 |
| Operational beyond FRS | 4 | 1 (config module) | 5 |
| **Total value-add items** | **17** | **+21** | **38** |

**Estimated additional engineering value:** ~70–80% of original FRS scope, delivered without additional contract change.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-14 | Agentryx | Initial release with HireStream v1.4.0 build |
| 2.0 | 2026-04-15 | Agentryx | v1.5.0 — added 21 runtime-configurable settings + agent productivity suite + MEA regulatory tracking (items 18–38) |
| 2.1 | 2026-04-15 | Agentryx | v1.5.1 — candidate self-service suite: compliance self-edit, portfolio PDF, ICS calendar export, offer-letter PDF button, welfare reply, interview prep tips, references CRUD (items 39–45) |
| 2.2 | 2026-04-15 | Agentryx | v1.5.2 — Employer role overhaul: Offers & Placements tab with appointment-letter link + welfare visibility; Reports tab; shared applicant pipeline; FRS §3 now implementation-complete (items 46–49) |
| 2.3 | 2026-04-15 | Agentryx | v1.5.3 — Employer workflow overhaul: dedicated /employer/review/:id decision-queue page, requisition fields (target hires, deadline, priority), Awaiting Decision hero, side-by-side candidate comparison, employer-specific actions (Approve for interview, Request replacement, Request more), employer welfare notes (items 50–56) |
| 2.4 | 2026-04-15 | Agentryx | v1.5.4 — HPSEDC Admin overhaul: Compliance Oversight tab (MEA policy enforcement), Welfare SLA monitor, Audit Log viewer, User Management, Agency rejection with reason (FRS 4.4), premium job-posting form across agent + employer (items 57–62) |

---

## v1.5.2 additions (Employer overhaul — 2026-04-15)

### 46. Employer — Offers & Placements tab
Dedicated view of every offer from the employer's jobs with status, destination, salary, start date, appointment-letter upload, and the full welfare check-in history (30/60/90 + candidate's own outreach notes).

### 47. Employer — Reports tab
Reuses the agent BI endpoint scoped by `employerId`. Gives employers the same funnel / conversion / time-to-placement / trend chart previously only available to agents.

### 48. Appointment letter linking (FRS 3.5 — now real)
Employer can attach a URL to a signed appointment letter PDF on any placement. Template PDF download still works. Previously this was a metadata-only stub.

### 49. Unified applicant pipeline between agent and employer
`/agent/jobs/:id` page now role-aware — works identically for both agents and employers, with correct ownership checks. Avoids duplicating 1,000 lines of nearly-identical UI code. Employer sees the same pipeline, bulk actions, internal notes, CSV export, structured interview feedback, candidate profile links.

---

## v1.5.1 additions (candidate self-service — 2026-04-15)

### 39. Candidate self-service compliance panel
Candidate edits their own passport, ECR, PCC, medical, IELTS, PDO, PBBY fields. Saves agent time and empowers the candidate. Mirrors the agent-side panel but is self-editable.

### 40. Candidate portfolio PDF
One-click download of a branded PDF summary — profile, skills, education, experience, compliance readiness, documents list. Useful for offline sharing, visa paperwork, family, backup.

### 41. ICS calendar export for candidate interviews
"Add to calendar (.ics)" link on every upcoming interview in the candidate dashboard. Works with Google Calendar / Outlook / Apple Calendar.

### 42. Offer letter PDF download button (candidate-facing)
Button added to the accept/decline offer banner. Candidate gets a branded PDF to share with visa processors or family immediately after receiving offer.

### 43. Welfare reply portal
When a candidate has an accepted/active placement, a "How are you doing?" card appears on their overview letting them proactively send welfare updates to their agency + HPSEDC. Complements the agent-initiated 30/60/90 check-ins.

### 44. Interview prep tips card
Auto-surfaces on overview when a candidate has any upcoming interview. 5 practical tips covering JD review, story prep, country research, virtual setup, questions to ask.

### 45. Professional references (candidate self-managed)
Candidate adds up to 3 references (name, relationship, email, phone, organisation). Agent can see them during background checks. Backend + UI both shipped.

---

## Summary — v1.5.1 update

| Category | Count |
|----------|------:|
| Total beyond-FRS items | **45** |
| Candidate-facing features beyond FRS | 22 |
| Agent productivity beyond FRS | 11 |
| Regulatory / welfare (MEA adjacent) | 9 |
| Security beyond FRS | 7 |
| Operational beyond FRS | 5 |
| Runtime-configurable settings | 21 |
