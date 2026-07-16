# HireStream — Manual Test Scenarios & Scripts

**For:** Human QA Tester  
**Project:** Overseas Placement Portal (HPSEDC)  
**Version:** Beta 0.5  
**URL:** https://hirestream.osipl.dev  
**Created:** 13 Apr 2026

---

## Instructions for Tester

1. Open https://hirestream.osipl.dev in a modern browser (Chrome, Firefox, Edge)
2. Execute each scenario below step by step
3. Mark each step as PASS or FAIL
4. For any FAIL, note the actual behavior and take a screenshot
5. Do NOT use production data — create fresh test accounts using the provided test data

### Test Accounts to Create

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Candidate | `test.candidate@example.com` | `Test@123` | Job seeker testing |
| Agent | `test.agent@example.com` | `Test@123` | Agency testing |
| Employer | `test.employer@example.com` | `Test@123` | Employer testing |
| Admin | (use existing admin account) | — | Admin panel testing |

---

## SCENARIO 1: Candidate Registration & Login

**Precondition:** No account exists for the test email

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 1.1 | Open portal → Landing page loads | See hero section, role cards, "Get Started" buttons | |
| 1.2 | Click "Get Started" or navigate to /auth | See split-screen auth page: left = branding, right = form | |
| 1.3 | Select "Create Account" tab | Registration form shows with role selector | |
| 1.4 | Select role "Job Seeker (Candidate)" | Role description appears below: "Search and apply for verified..." | |
| 1.5 | Enter full name, email, password (min 6 chars) | Fields accept input, password field has show/hide toggle | |
| 1.6 | Click "Create Account" | Account created, redirected to candidate dashboard | |
| 1.7 | Verify dashboard shows your name | Name appears in header with initials avatar (colored circle) | |
| 1.8 | Click Logout | Redirected to landing page | |
| 1.9 | Go to /auth → Sign In tab | Login form shows | |
| 1.10 | Enter email + password → Sign In | Logged in, redirected to dashboard | |
| 1.11 | Try wrong password | Error toast: "Login Failed" | |
| 1.12 | Click "Forgot password?" link | Forgot password form appears | |
| 1.13 | Enter email → "Send Reset Link" | Success message: "Check your email" with mail icon | |

---

## SCENARIO 2: Candidate Profile Completion

**Precondition:** Logged in as candidate

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 2.1 | View dashboard right sidebar → "Profile Completion" | Shows percentage with 8 checkpoints | |
| 2.2 | Click "Edit Profile" button | Profile form opens | |
| 2.3 | Fill: phone, location, skills (comma-separated), preferred countries | Form accepts all fields | |
| 2.4 | Save profile | Success toast, profile updated | |
| 2.5 | Check completion % updated | Should increase (e.g., 63% with 5/8 fields) | |

---

## SCENARIO 3: Education & Experience

**Precondition:** Logged in as candidate with profile

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 3.1 | Navigate to Education section | Shows empty state or existing records | |
| 3.2 | Add education: Degree=B.Tech, Institution=IIT, Year=2020 | Record created, appears in list | |
| 3.3 | Edit the education record → change degree to "B.Tech (Hons)" | Record updated | |
| 3.4 | Add another education record | Two records now visible | |
| 3.5 | Delete the second record | Record removed, one remaining | |
| 3.6 | Add experience: Company=TCS, Role=Developer, Years=3, Country=India | Record created | |
| 3.7 | Check profile completion % | Should increase with edu + exp added | |

---

## SCENARIO 4: Document Upload

**Precondition:** Logged in as candidate with profile

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 4.1 | Navigate to Documents section | Shows empty state | |
| 4.2 | Upload a PDF file (< 5MB) as type "CV" | File uploaded, appears in documents list | |
| 4.3 | Upload a JPG file as type "Certificate" | File uploaded, appears in list | |
| 4.4 | Click download on uploaded file | File downloads with original filename | |
| 4.5 | Delete a document | Document removed from list | |
| 4.6 | Try uploading a .exe file | Should be rejected (only PDF, JPG, PNG allowed) | |
| 4.7 | Try uploading a file > 5MB | Should be rejected | |
| 4.8 | Check profile completion → Documents should be green | 100% if all 8 checkpoints met | |

---

## SCENARIO 5: PDF Profile Export

**Precondition:** Candidate with profile, education, experience, documents

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 5.1 | Click "Export PDF" button on dashboard | New tab opens with formatted HTML profile | |
| 5.2 | Verify profile contains: name, email, skills | All present in document | |
| 5.3 | Verify education records listed | Degree, institution, year shown | |
| 5.4 | Verify experience records listed | Company, role, years, country shown | |
| 5.5 | Print or save as PDF from browser | Clean printable layout | |

---

## SCENARIO 6: Agent Registration & Agency Setup

**Precondition:** No agent account exists

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 6.1 | Register with role "Recruitment Agency" | Account created, redirected to agent dashboard | |
| 6.2 | See "Agency Registration" prompt | Form to register agency (name, license, specializations) | |
| 6.3 | Fill agency details → Submit | Agency created with "Pending Verification" status | |
| 6.4 | Try posting a job before verification | Should be blocked: "Agency must be verified" | |
| 6.5 | (Admin verifies the agency) | — | |
| 6.6 | Refresh page → Status changes to "Verified" | Green verified badge | |

---

## SCENARIO 7: Job Posting & Management

**Precondition:** Logged in as verified agent

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 7.1 | Navigate to job posting section | Job creation form | |
| 7.2 | Fill: Title=React Developer, Company=TechCorp, Location=Dubai, Country=UAE, Salary=3000 USD, Skills=React, Node.js, Experience=2 years | Form accepts all fields | |
| 7.3 | Submit job | Job created, appears in "My Jobs" | |
| 7.4 | Edit the job → change salary to 4000 USD | Job updated | |
| 7.5 | Create 2 more jobs with different countries/skills | Jobs appear in list | |
| 7.6 | Deactivate one job | Job status changes to "inactive" | |
| 7.7 | Verify deactivated job doesn't appear in candidate search | Not visible in public search | |

---

## SCENARIO 8: Job Search & Application

**Precondition:** Candidate logged in, jobs exist in the system

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 8.1 | Navigate to Job Search section | See available jobs | |
| 8.2 | Search by keyword "React" | Only matching jobs shown | |
| 8.3 | Filter by country "UAE" | Only UAE jobs shown | |
| 8.4 | Verify pagination works (if > 20 jobs) | Page controls visible, navigate between pages | |
| 8.5 | Click on a job to view details | Full job description, requirements, salary shown | |
| 8.6 | Click "Apply" | Application submitted, match score displayed | |
| 8.7 | Verify match score is meaningful (not random) | Score reflects skill/experience/country overlap | |
| 8.8 | Try applying to the same job again | Error: "You have already applied" | |
| 8.9 | Check Application Tracker on dashboard | Application appears with "Submitted" status | |
| 8.10 | Check notifications | "Application Submitted" notification present | |

---

## SCENARIO 9: Application Management (Agent Side)

**Precondition:** Agent logged in, candidates have applied to their jobs

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 9.1 | Navigate to a posted job → View Applicants | List of candidates with match scores | |
| 9.2 | Verify candidates sorted by match score (highest first) | Descending order | |
| 9.3 | See candidate details: name, email, skills, experience | All fields visible | |
| 9.4 | Change one application status to "Reviewed" | Status updated | |
| 9.5 | Change to "Shortlisted" | Status updated | |
| 9.6 | Select multiple applications → Bulk "Shortlist" | All selected updated at once | |
| 9.7 | Verify candidate receives notification for each status change | Notification in candidate's bell icon | |

---

## SCENARIO 10: Candidate Recommendations

**Precondition:** Candidate with skills/experience, multiple jobs exist

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 10.1 | Check "Recommended For You" section on dashboard | Shows up to 10 jobs sorted by match score | |
| 10.2 | Verify recommended jobs are relevant to candidate's skills | High-scoring jobs at top | |
| 10.3 | Apply to a recommended job | Job disappears from recommendations | |
| 10.4 | Verify score breakdown available | Shows skill %, experience %, country % breakdown | |

---

## SCENARIO 11: Notification Management

**Precondition:** Logged in user with some notifications

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 11.1 | Check notification bell icon | Shows unread count badge | |
| 11.2 | Click bell → See notification list | Recent notifications listed | |
| 11.3 | Click on a notification → Marked as read | Unread count decreases | |
| 11.4 | Click "Mark All as Read" | All notifications marked read, badge disappears | |
| 11.5 | Go to notification preferences | See email/SMS/in-app toggles | |
| 11.6 | Disable email notifications → Trigger an event | No email sent (in-app still works) | |

---

## SCENARIO 12: Admin — Agency Verification

**Precondition:** Logged in as admin, pending agency exists

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 12.1 | Navigate to Admin Dashboard → Agencies tab | See list of agencies with verification status | |
| 12.2 | Find pending agency | Shows agency name, license, "Pending" badge | |
| 12.3 | Click "Approve" | Agency status changes to "Verified" | |
| 12.4 | Verify agent receives notification | "Agency Verified" notification | |
| 12.5 | Verify agent can now post jobs | Job posting works after verification | |

---

## SCENARIO 13: Cross-Role Security

**Precondition:** Multiple accounts of different roles

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 13.1 | As candidate → try accessing /admin | Blocked or redirect | |
| 13.2 | As candidate → try editing another candidate's profile | 403 Forbidden | |
| 13.3 | As candidate → try deleting another candidate's document | 403 Forbidden | |
| 13.4 | As agent → try accessing admin endpoints | 403 Forbidden | |
| 13.5 | Log out → try accessing any /api/v1/ endpoint | 401 Unauthorized | |
| 13.6 | Try registering with an existing email | 409 Conflict | |

---

## SCENARIO 14: Password Reset Flow

**Precondition:** Account exists with known email

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 14.1 | Go to /auth → Sign In → "Forgot password?" | Forgot password form | |
| 14.2 | Enter registered email → Submit | "Check your email" success screen | |
| 14.3 | (Check email or dev logs for reset link/token) | Email contains reset link | |
| 14.4 | Use reset token to set new password | "Password reset successfully" | |
| 14.5 | Login with new password | Login succeeds | |
| 14.6 | Login with old password | Login fails (401) | |

---

## SCENARIO 15: Recruitment Drive Management

**Precondition:** Logged in as verified agent

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 15.1 | Create recruitment drive: title, date, location, target roles | Drive created with "Pending" status | |
| 15.2 | View "My Drives" list | Drive appears in list | |
| 15.3 | Edit the drive (change location) | Updated successfully | |
| 15.4 | Try editing after admin approves | Blocked: "Can only edit pending drives" | |
| 15.5 | Cancel a pending drive | Status changes to "Cancelled" | |

---

## SCENARIO 16: Drive Approval (Admin)

**Precondition:** Logged in as admin, pending drive exists

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 16.1 | View drives list filtered by "pending" | Pending drives shown | |
| 16.2 | Approve a drive | Status → "Approved", agent notified | |
| 16.3 | Reject a drive with reason | Status → "Rejected", reason stored, agent notified | |
| 16.4 | Approved drive appears in public drive list | Visible to all users | |

---

## SCENARIO 17: Interview Scheduling

**Precondition:** Agent with approved drive, candidate has applied to agent's job

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 17.1 | Schedule interview for a candidate (date, location, mode) | Interview created, application → "Interview Scheduled" | |
| 17.2 | Candidate receives notification | "Interview Scheduled" with date and location | |
| 17.3 | View drive's interview list | All scheduled interviews shown with candidate details | |
| 17.4 | Candidate views "My Interviews" | Interview listed with job title and date | |

---

## SCENARIO 18: Interview Result & Selection

**Precondition:** Interview has been scheduled

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 18.1 | Agent records result: "Selected" with notes | Interview result saved, application → "Selected" | |
| 18.2 | Candidate notified of selection | "Congratulations! You've been selected" | |
| 18.3 | Agent records result: "Rejected" for another candidate | Application → "Rejected", candidate notified | |
| 18.4 | Agent records "Hold" | No status change on application | |

---

## SCENARIO 19: Placement & Appointment

**Precondition:** Candidate is "Selected" after interview

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 19.1 | Agent creates placement (country, salary, start date) | Placement created with "Offered" status | |
| 19.2 | Candidate receives placement offer notification | "Placement Offer Received!" | |
| 19.3 | Candidate accepts the placement | Status → "Accepted", application → "Placed" | |
| 19.4 | Try creating placement for non-selected application | Rejected: "Application must be in selected status" | |

---

## SCENARIO 20: Placement Decline

**Precondition:** Placement offer exists

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 20.1 | Candidate declines with reason | Status → "Declined", reason stored | |
| 20.2 | Try declining an already accepted placement | Rejected: "Can only decline an offered placement" | |

---

## SCENARIO 21: Full Placement Pipeline (End-to-End)

**Precondition:** Agent, admin, and candidate accounts ready

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 21.1 | Agent creates drive → Admin approves | Drive status: Approved | |
| 21.2 | Agent posts job | Job active in search | |
| 21.3 | Candidate applies to job | Application submitted with match score | |
| 21.4 | Agent schedules interview | Application → "Interview Scheduled" | |
| 21.5 | Agent records "Selected" result | Application → "Selected" | |
| 21.6 | Agent creates placement offer | Placement → "Offered" | |
| 21.7 | Candidate accepts | Placement → "Accepted", Application → "Placed" | |
| 21.8 | Verify all notifications received | 5+ notifications in candidate's list | |

---

## SCENARIO 22: Language Toggle (Hindi/English)

**Precondition:** Any page on the portal

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 22.1 | Click "हिं" button in header | All navigation, headings, and labels switch to Hindi | |
| 22.2 | Check FAQ page headings | "अक्सर पूछे जाने वाले प्रश्न" shown | |
| 22.3 | Check grievance page | "शिकायतें" heading, Hindi labels | |
| 22.4 | Check footer | Hindi text for all sections | |
| 22.5 | Refresh the page | Language preference persists (still Hindi) | |
| 22.6 | Click "EN" button | Everything switches back to English | |

---

## SCENARIO 23: CAPTCHA on Login

| # | Step | Expected Result | PASS/FAIL |
|---|------|----------------|-----------|
| 23.1 | Go to login form | See "I'm not a robot" checkbox | |
| 23.2 | Try clicking Sign In without checking CAPTCHA | Button is disabled, can't submit | |
| 23.3 | Check the CAPTCHA checkbox | Box turns green, Sign In button enabled | |
| 23.4 | Submit login | Works normally after CAPTCHA checked | |

---

## Post-Test Summary (To be filled by tester)

| Category | Total Scenarios | Passed | Failed | Blocked | Notes |
|----------|----------------|--------|--------|---------|-------|
| Registration & Login | 13 | | | | |
| Profile Completion | 5 | | | | |
| Education & Experience | 7 | | | | |
| Document Upload | 8 | | | | |
| PDF Export | 5 | | | | |
| Agent & Agency | 6 | | | | |
| Job Management | 7 | | | | |
| Job Search & Application | 10 | | | | |
| Application Management | 7 | | | | |
| Recommendations | 4 | | | | |
| Notifications | 6 | | | | |
| Admin Verification | 5 | | | | |
| Cross-Role Security | 6 | | | | |
| Password Reset | 6 | | | | |
| **TOTAL** | **95** | | | | |

**Tester Name:** _________________  
**Test Date:** _________________  
**Browser/Device:** _________________  
**Build Version:** Beta 0.5  

---

*This document will be extended with Phase 3 scenarios (drives, interviews, placements, grievances, reports) and Phase 4 scenarios (i18n, accessibility, performance) as those features are built.*

---

# v1.5.0 — Additional Test Scenarios

**Build reference:** HireStream v1.5.0 (2026-04-15)

## Agent productivity

### TS-V15-01 — Internal notes on applicants
**Pre:** Logged in as `demo_agent`, job with ≥ 1 applicant.
**Steps:** Open applicant pipeline → click **Internal notes** on a row → add note → refresh → delete note.
**Expected:** Note persists with author + timestamp; count badge updates; delete works (author/admin only).

### TS-V15-02 — Structured interview feedback
**Pre:** Interview scheduled.
**Steps:** On `/agent/drives/:id` click **Feedback** → set rating 4★, recommendation *Yes*, strengths + concerns → Save.
**Expected:** Rating stars + recommendation badge appear on the row; persists in `interviews` table.

### TS-V15-03 — CSV export of applicants per job
**Steps:** Open `/agent/jobs/:id` → click **Export applicants (CSV)**.
**Expected:** File downloads with name + email + phone + match score + compliance fields; special chars escaped.

### TS-V15-04 — Bulk actions
**Steps:** Check 3 applicants → use sticky action bar → **Shortlist All**.
**Expected:** All 3 move to Shortlisted; toast confirms count.

### TS-V15-05 — Schedule interview modal
**Pre:** Application in Shortlisted.
**Steps:** Click **Schedule Interview** → pick date/time, mode, location → Schedule & Notify.
**Expected:** Application → `interview_scheduled`; interview row created; candidate receives notification; the Upcoming Interviews card on candidate Overview shows it.

### TS-V15-06 — ICS calendar export
**Steps:** Click the `.ics` button next to any scheduled interview.
**Expected:** File opens in Google / Outlook / Apple Calendar with correct time + location.

### TS-V15-07 — Offer letter PDF
**Pre:** Placement in `offered` status.
**Steps:** GET `/api/v1/agent/placements/:id/offer-letter.pdf` (or UI link where wired).
**Expected:** Branded PDF with candidate name, job/salary/start-date, Emigration Act reference, next-steps checklist.

### TS-V15-08 — Agent Reports tab
**Steps:** Log in as agent → **Reports** tab.
**Expected:** 4 stat cards, 7-column funnel, time-to-placement avg, top countries, trend chart — all reflecting real data from this agent's jobs.

### TS-V15-09 — Duplicate application detection
**Pre:** Candidate applied within last 30 days to same company+title.
**Steps:** As same candidate, try applying to identical job.
**Expected:** 409 with friendly message; no duplicate row created.

### TS-V15-10 — Job edit in place
**Steps:** My Jobs → pencil icon → change salary → Save Changes.
**Expected:** Applicants in pipeline untouched; new salary visible.

## Pre-Departure Compliance (MEA)

### TS-V15-11 — Record compliance fields
**Steps:** On `/agent/candidates/:id` → Pre-Departure Compliance panel → set passport, ECR=ECNR, Medical=Fit, IELTS=7.5, PDO Completed, PBBY Enrolled → Save.
**Expected:** Fields persist; badges reflect status.

### TS-V15-12 — Welfare 30-day check-in
**Pre:** Candidate with placement in accepted/active status.
**Steps:** Click 30-day card → status `ok` + notes → confirm.
**Expected:** `placements.welfare_30_day` populated with timestamp.

## System configuration

### TS-V15-13 — Flip a setting (drive approval)
**Steps:** Admin → System Config → *Require admin approval for drives* OFF → agent creates a drive.
**Expected:** Drive goes straight to `approved` without HPSEDC gate.

### TS-V15-14 — Profile-completion gate on apply
**Steps:** Admin sets threshold = 80 → candidate at 60% tries to apply.
**Expected:** 403 with message stating current vs required percentage.

### TS-V15-15 — Max active jobs per agency
**Steps:** Admin sets cap = 3 → agent with 3 active jobs tries Post Job.
**Expected:** 403 with cap-reached message until one is closed.

## Candidate additions

### TS-V15-16 — Salary filter + sort
**Steps:** Browse Jobs → pick *Mid ($40k–$80k)* + *Salary high→low*.
**Expected:** Only mid-tier results, sorted correctly.

### TS-V15-17 — Decline offer with inline reason
**Steps:** Application detail → **Decline** → textarea → enter reason → Confirm.
**Expected:** `placements.status=declined`, reason stored; agent notified.

### TS-V15-18 — Smart profile CTA
**Pre:** Candidate with missing documents.
**Steps:** Click sidebar CTA *"Upload documents"*.
**Expected:** Navigates directly to `/profile?step=5`.

---

## Regression matrix

Run all TS-01 through TS-95 (original) + TS-V15-01 through TS-V15-18 per UAT cycle:

| Build | Cycle | Date | Tester | Pass | Fail | Notes |
|---|---|---|---|---|---|---|
| v1.5.0 | Agentryx Internal | | | | | |
| v1.5.0 | HTIS Review | | | | | |
| v1.5.0 | HPSEDC Staging | | | | | |
| v1.5.0 | HPSEDC Final UAT | | | | | |
