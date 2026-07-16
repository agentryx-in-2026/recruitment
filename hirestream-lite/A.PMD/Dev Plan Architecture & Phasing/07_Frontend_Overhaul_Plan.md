# HireStream — Frontend Overhaul Plan

**Phase:** 4.5 (inserted between Phase 4 Polish and Phase 5 Exceed)  
**Created:** 13 Apr 2026  
**Trigger:** Backend is 95% complete (94 endpoints, 168 tests), but frontend only exposes ~40% of functionality. User cannot complete any end-to-end journey without hitting a dead end.  
**Goal:** Transform the frontend from a thin dashboard shell into a workflow-driven portal where every API endpoint has a usable UI.

---

## Current State (Honest)

| What We Have | What's Missing |
|---|---|
| 94 backend API endpoints (tested) | ~50% have no frontend UI to call them |
| 5-field profile dialog | Multi-step wizard with education, experience, documents, preferences |
| Job list with "Apply Now" | Split-pane search, filters sidebar, job detail panel |
| Basic application list | Visual pipeline (Applied → Shortlisted → Interview → Selected → Placed) |
| Agent dashboard with tabs | No create-drive form, no interview scheduler, no applicant management |
| Admin metrics (real data) | No charts, no action buttons on grievances, no user management |
| Document upload API | No upload widget in UI |
| Toast messages on many buttons | Real forms and actions that call APIs |

---

## Research-Backed UI Patterns to Implement

Based on analysis of eMigrate (India), POEA (Philippines), Musaned (Saudi), MOHRE (UAE), NCS India, LinkedIn, Naukri, Greenhouse, and Lever.

---

## Sprint Plan — Two Sprints

### Sprint A: Core User Journeys (Critical — 3 days)

Makes the candidate and agent journeys fully usable end-to-end.

#### A1. Fix Auto-Profile + Apply Flow (0.5 day)
- [ ] Auto-create `candidates` record on registration (backend fix)
- [ ] Auto-create `employers` record on registration (backend fix)
- [ ] "Apply Now" button works immediately after registration
- [ ] Show success toast with match score after applying
- [ ] Disable "Apply Now" if already applied (show "Applied ✓")

#### A2. Multi-Step Profile Wizard (1 day)
Replace the 5-field dialog with a full-page tabbed profile builder:
- [ ] **Tab 1: Basic Info** — Full name, email, phone, location, date of birth, gender
- [ ] **Tab 2: Education** — Add/edit/delete education records (degree, institution, year, percentage)
- [ ] **Tab 3: Experience** — Add/edit/delete work experience (company, role, years, country, description)
- [ ] **Tab 4: Skills & Preferences** — Skills tags, preferred countries (multi-select), experience years
- [ ] **Tab 5: Documents** — Drag-and-drop upload zone, categorized cards (CV, Passport, Certificate), file preview, delete
- [ ] Profile strength meter on dashboard (replaces 0% bar)
- [ ] Each tab calls the real API (education CRUD, experience CRUD, document upload)
- [ ] Save per tab (not just at the end)

#### A3. Visual Application Pipeline (0.5 day)
Replace the basic list with a horizontal stepper:
- [ ] Pipeline stages: Submitted → Reviewed → Shortlisted → Interview → Selected → Placed
- [ ] Color coding: Green (completed), Blue (current), Grey (upcoming), Red (rejected)
- [ ] Click a stage to expand details (date, notes, match score breakdown)
- [ ] Empty state: "No applications yet — browse jobs to get started"

#### A4. Agent Applicant Management (0.5 day)
Wire the agent's "View Applicants" to real functionality:
- [ ] Data table view: candidate name, skills, experience, match score, status, applied date
- [ ] Status dropdown per row (change: reviewed → shortlisted → interview_scheduled → selected)
- [ ] Bulk select + bulk status change
- [ ] Click candidate row → side panel with full profile
- [ ] Sort by match score, date, status

#### A5. Agent Drive + Interview Forms (0.5 day)
- [ ] Create Drive form: title, date, location, target roles, expected candidates
- [ ] Create Interview modal: select candidate, date/time, location, mode (in-person/virtual)
- [ ] Record Interview Result: selected/rejected/hold + notes
- [ ] Create Placement: country, salary, start date (only for selected candidates)
- [ ] Candidate: accept/decline placement with reason

### Sprint B: Polish + Quick Wins (2 days)

#### B1. Split-Pane Job Search (0.5 day)
- [ ] Left: filter sidebar (country, salary range, experience, skills, sector)
- [ ] Center: job card list with pagination
- [ ] Right: job detail panel (click card → shows full description, requirements, apply button)
- [ ] Country flag emoji on job cards
- [ ] "Verified" badge on agency-posted jobs
- [ ] "Already Applied" badge on jobs user applied to

#### B2. Admin Action Buttons + Charts (0.5 day)
- [ ] Grievance: "Review" → "Resolve" → "Escalate" action buttons
- [ ] Drive: "Approve" / "Reject" buttons in pending queue
- [ ] Reports: Recharts bar/line/pie charts for funnel, district, country, skill data
- [ ] User management table (list, activate/deactivate)

#### B3. Dashboard Upgrades (0.5 day)
- [ ] Candidate: "Recommended Jobs" section (top 5 by match score)
- [ ] Candidate: Recent notifications inline (not just bell)
- [ ] Agent: Job posting stats (applications per job, conversion rate)
- [ ] Admin: Action items section ("3 agencies pending, 2 drives to approve, 1 grievance open")

#### B4. Quick Wins (0.5 day)
- [ ] Country flag emojis on all job cards
- [ ] Font size toggle in header (small/medium/large — GIGW)
- [ ] Skip navigation link (GIGW accessibility)
- [ ] Profile strength meter (visual ring/bar, not just %)
- [ ] "Verified by HPSEDC" badge component (reusable)
- [ ] Loading skeletons on all pages (consistent)
- [ ] Empty states with illustrations on all lists
- [ ] Responsive audit: test 375px, 768px, 1024px

---

## Updated Phase Map

```
Phase 1:   Foundation (Auth, Profiles, Docs)              ✅ Days 1-5
Phase 2:   Core Business (Jobs, Applications, Matching)    ✅ Days 6-8
Phase 3:   Advanced Workflows (Drives, Reports, Grievances)✅ Days 9-11
Phase 4:   Polish (i18n, Security, Frontend wiring)        ✅ Day 12
Phase 4.5: FRONTEND OVERHAUL ← WE ARE HERE               📍 Days 13-17
  Sprint A: Core Journeys (profile wizard, pipeline,       Days 13-15
            applicant mgmt, drive/interview forms)
  Sprint B: Polish + Quick Wins (split-pane search,        Days 16-17
            charts, admin actions, accessibility)
Phase 5:   Exceed 20% (Ops Console, PWA, AI, Ratings)      Days 18-25+
```

---

## Success Criteria

After this overhaul, every user journey should work end-to-end:

**Candidate:** Register → Complete Profile (7 steps) → Upload Documents → Browse Jobs (with filters) → Apply (instant, with match score) → Track Pipeline (visual) → Accept Placement

**Agent:** Register → Register Agency → Get Verified → Post Job → View Applicants (table) → Shortlist → Create Drive → Schedule Interview → Record Result → Create Placement

**Admin:** Login → See Real Metrics + Charts → Verify Agencies (approve/reject) → Approve Drives → Resolve Grievances → View Reports (with charts) → Export Data

**No toast messages as placeholders. Every button does something real.**

---

## Dependencies

- All backend APIs are already built and tested (94 endpoints, 168 tests)
- No new backend work needed for Sprint A (except auto-profile creation on register)
- Sprint B may need 1-2 small backend additions (user management CRUD for admin)
- Recharts already installed in package.json

---

## Estimated Effort

| Sprint | Items | Effort |
|--------|-------|--------|
| Sprint A | A1-A5 (core journeys) | 3 days |
| Sprint B | B1-B4 (polish + wins) | 2 days |
| **Total** | | **5 days** |

---

*This phase was not in the original 04_Master_Execution_Plan.md because the frontend gap only became visible when testing the portal end-to-end. It is now the highest priority before Phase 5.*
