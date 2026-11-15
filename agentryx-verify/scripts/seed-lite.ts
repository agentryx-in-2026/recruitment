import "dotenv/config";
import { db, pool } from "../server/config/db";
import { projects, requirements, reviewers, projectReviewers, issues } from "../shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * HireStream Lite — the stripped-down HPSEDC phase-1 portal
 * (hirestream-lite.agentryx.dev): HPSEDC acting as the government recruiting agency, Direct
 * 4-stage pipeline, documents only at selection, admin-configurable form and
 * professions. Cases follow the Lite user guides (hirestream-lite/A.PMD/User
 * Guides and Videos - Lite). §6 holds the launch defects found while making
 * those guides (17 Oct 2026) — each also logged as an open issue (HL-xxx).
 *
 * Section → role card in ProjectView: §1 Candidate, §2 Agency (= HPSEDC
 * Placement Cell, account hpsedc_agency), §4 Officer (= Admin Console),
 * §5–6 Cross-cutting.
 *
 * Idempotent for the project row; re-running REPLACES the requirements
 * (cascades sign-offs) — do not re-run once testing has started.
 */
type Status = "delivered" | "partial" | "not_delivered" | "deferred" | "n_a";
interface Row { itemRef: string; section: number; sectionTitle: string; description: string; status: Status; evidence: string | null; testSteps: string; expectedResult: string; }

const URL = "https://hirestream-lite.agentryx.dev";
const C = "Candidate";
const R: Row[] = [
  // ══ §1 APPLICANT ═══════════════════════════════════════════════════════
  { itemRef: "L1.1", section: 1, sectionTitle: C, description: "Create account (Job Seeker) — name, email, password with strength rule and confirm", status: "delivered", evidence: "auth-page.tsx Create Account tab", testSteps: `${URL}/auth → Create Account → fill Full Name, a NEW email, password (e.g. Test@2026) twice → Create Account`, expectedResult: "Signed in immediately and the 4-page application form opens with the 'Before you start' checklist" },
  { itemRef: "L1.2", section: 1, sectionTitle: C, description: "Sign in with username OR email; wrong password rejected", status: "delivered", evidence: "passport.config.ts — username or email", testSteps: "Sign in once with the username, once with the email; then with a wrong password", expectedResult: "Both identifiers work; wrong password shows 'Login Failed', no crash" },
  { itemRef: "L1.3", section: 1, sectionTitle: C, description: "English ⇄ Hindi switch on every page", status: "delivered", evidence: "header.tsx language toggle", testSteps: "Click हिं in the header on sign-in, form and dashboard; click EN", expectedResult: "All labels switch to Hindi and back; choice persists on reload" },
  { itemRef: "L1.4", section: 1, sectionTitle: C, description: "Page 1 'About you' — identity, personal, contact, address with inline validation", status: "delivered", evidence: "register.tsx page 1", testSteps: "Fill page 1; try Aadhaar 234567890123 (bad checksum), then 234567890124; try an expired passport date; try PIN with 5 digits", expectedResult: "Bad Aadhaar, expired passport and short PIN show inline errors and block Next; valid values pass" },
  { itemRef: "L1.5", section: 1, sectionTitle: C, description: "'I don't have a passport yet' hides passport fields; applicant can still apply", status: "delivered", evidence: "registration_fields.noPassportOption", testSteps: "Tick 'I don't have a passport yet' on page 1", expectedResult: "Passport fields hide; amber note says a passport is needed before selection; Next works" },
  { itemRef: "L1.6", section: 1, sectionTitle: C, description: "Mobile number with country code; WhatsApp 'same as mobile'", status: "delivered", evidence: "PhoneInput", testSteps: "Pick +971, enter 501234567; untick 'Same as mobile' and enter a different WhatsApp number", expectedResult: "Both saved; review page shows both numbers with codes" },
  { itemRef: "L1.7", section: 1, sectionTitle: C, description: "Page 2 — trades (max 3) and languages with speak/write levels", status: "delivered", evidence: "registration.max_professions = 3", testSteps: "Pick 4 trades; pick Hindi + English with levels; add 'Punjabi' via Another language", expectedResult: "4th trade refused with 'You can pick up to 3 trades'; languages and levels saved" },
  { itemRef: "L1.8", section: 1, sectionTitle: C, description: "Page 3 — education with board / university picker by qualification", status: "delivered", evidence: "register.tsx SCHOOL_BOARDS / HIGHER_INSTITUTIONS (a303e54)", testSteps: "Choose 12th pass → Board list (HPBOSE…); change to Degree → University list (HPU…); choose 'Other' and type a name", expectedResult: "List changes with the qualification; 'Other' opens a text box and the typed name is saved" },
  { itemRef: "L1.9", section: 1, sectionTitle: C, description: "Trade add-on questions (Driver, Nurse, Caregiver, Electrician, Welder) + experience stepper + skills", status: "delivered", evidence: "register/profession-blocks.tsx", testSteps: "Pick Driver and Nurse on page 2; on page 3 fill both cards, use +6 months, tap skill chips", expectedResult: "Required add-on fields block Next until filled; experience shows ≈ years; all saved" },
  { itemRef: "L1.10", section: 1, sectionTitle: C, description: "Page 4 review — masked Aadhaar, Edit links, Print / Save PDF", status: "delivered", evidence: "register/ReviewPage.tsx", testSteps: "Open page 4; click Edit on a section and return; click Print / Save PDF", expectedResult: "Aadhaar shows XXXX XXXX 1234; Edit opens that page; print preview is a clean A4 form without app chrome" },
  { itemRef: "L1.11", section: 1, sectionTitle: C, description: "Submit application and land on the dashboard", status: "delivered", evidence: "register.tsx submit() — see L6.1", testSteps: "On page 4 click Submit application (first time, new account)", expectedResult: "'Application submitted' toast and the dashboard opens (see defect L6.1)" },
  { itemRef: "L1.12", section: 1, sectionTitle: C, description: "Confirm email with 6-digit code before applying", status: "delivered", evidence: "VerifyEmailBanner.tsx; registration.require_verified_email_to_apply", testSteps: "On the dashboard read the 'Confirm your email address' banner; enter the code from email; also try Send a new code", expectedResult: "Correct code confirms ('You can apply for jobs now'); wrong code is rejected; resend has a 30 s cooldown (depends on L6.3)" },
  { itemRef: "L1.13", section: 1, sectionTitle: C, description: "Find a Job — search, filters, sort, match score, save job", status: "delivered", evidence: "candidate-dashboard Browse view", testSteps: "Find a Job → search 'driver'; filter by country and category; sort by salary; bookmark a job", expectedResult: "Results narrow correctly; each card shows match %; saved job toggles" },
  { itemRef: "L1.14", section: 1, sectionTitle: C, description: "Apply Now — gates: email confirmed, duplicate, filled/closed vacancy", status: "delivered", evidence: "job.routes.ts apply gates", testSteps: "Apply before confirming email; confirm and apply; apply again to the same job", expectedResult: "Unconfirmed: clear message; confirmed: 'Applied!'; second attempt: 'You have already applied'" },
  { itemRef: "L1.15", section: 1, sectionTitle: C, description: "My Application — stage of each application", status: "delivered", evidence: "Simple dashboard My Application", testSteps: "Open My Application → click the application", expectedResult: "Detail shows Submitted → Interview → Selected → Placed with the current stage, match score and date (see defect L6.6 for the progress bar)" },
  { itemRef: "L1.16", section: 1, sectionTitle: C, description: "Interview — confirm, reschedule (with reason), decline, add to calendar", status: "delivered", evidence: "InterviewActionsPanel.tsx", testSteps: "After HPSEDC schedules an interview (L2.6): open the application → Confirm attendance; on another, Reschedule with reason; on another, Decline", expectedResult: "Each action updates the badge and is visible to HPSEDC; .ics downloads" },
  { itemRef: "L1.17", section: 1, sectionTitle: C, description: "After selection — documents owed per job, with reason for each", status: "delivered", evidence: "shared/documents.ts obligation engine", testSteps: "Use a candidate HPSEDC has selected (L2.8) → dashboard 'Documents needed before you travel' → Complete your travel documents", expectedResult: "Page 5 lists PCC, medical, ID, passport, education, experience + trade/country documents, each saying why" },
  { itemRef: "L1.18", section: 1, sectionTitle: C, description: "Upload / replace a document (PDF/JPG/PNG ≤ 5 MB; camera on phones)", status: "delivered", evidence: "DeploymentPages.tsx; upload.middleware 5 MB", testSteps: "Upload a PDF; replace it; try a 6 MB file; on a phone check 'Take a photo'", expectedResult: "Row shows 'Uploaded — HPSEDC are checking it'; replace works; 6 MB file refused" },
  { itemRef: "L1.19", section: 1, sectionTitle: C, description: "Page 6 'Before you travel' — PCC, medical, PBBY progress", status: "delivered", evidence: "DeploymentPages.tsx; PATCH /me/compliance", testSteps: "Set PCC 'Applied for it', Medical 'Booked / done', PBBY 'Applied' + policy number → Save my progress", expectedResult: "'Saved'; values persist after reload; values HPSEDC recorded show 'recorded by HPSEDC'" },
  { itemRef: "L1.20", section: 1, sectionTitle: C, description: "Offer — cannot accept until appointment letter uploaded; accept → Placed; decline with reason", status: "delivered", evidence: "drive.routes.ts accept; placement.require_letter_to_accept", testSteps: "Selected candidate before HPSEDC uploads the letter: try Accept; after upload (L2.9): Accept Offer. On another: Decline with reason", expectedResult: "Before letter: refused with explanation; after: 'Offer accepted' and stage = Placed; decline recorded" },
  { itemRef: "L1.21", section: 1, sectionTitle: C, description: "Ask HPSEDC messages, grievance form, fraud report link", status: "delivered", evidence: "pages/help.tsx, grievance-page.tsx", testSteps: "Help → send a message; Grievances → New Grievance (category 'Someone asked me for money') → submit; check the reply after L2.12", expectedResult: "Message and grievance appear for HPSEDC; HPSEDC reply shows on the Help page" },
  { itemRef: "L1.22", section: 1, sectionTitle: C, description: "Notifications bell, change password, sign out", status: "delivered", evidence: "header.tsx", testSteps: "Open the bell after a status change; name menu → Change Password; Sign Out", expectedResult: "Notifications listed; password change works for the next login; sign-out returns to /auth" },

  { itemRef: "L1.23", section: 1, sectionTitle: C, description: "Request a callback — “HPSEDC will call me” for applicants who cannot fill the form", status: "delivered", evidence: "pages/callback.tsx; capability.assisted_callback_enabled = true", testSteps: "New account → in the form sidebar click Request a callback → enter name, mobile, skills → Request a callback; then as demo_admin open Admin → Callbacks", expectedResult: "Thank-you screen for the applicant; the request is listed under Admin → Callbacks and can be marked done" },
  { itemRef: "L1.24", section: 1, sectionTitle: C, description: "Preference of countries (FRS 2.2) — choose preferred destination countries", status: "not_delivered", evidence: "To be built — not asked in the Lite form today", testSteps: "On the application form choose one or more preferred countries → Next → check page 4", expectedResult: "Chosen countries saved, shown on the review page and on the applicant profile for HPSEDC" },

  // ══ §2 HPSEDC PLACEMENT CELL (login hpsedc_agency) ═════════════════════
  { itemRef: "L2.1", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Sign in as hpsedc_agency — dashboard, pipeline counts, recent jobs", status: "delivered", evidence: "agent-dashboard.tsx", testSteps: "Sign in as hpsedc_agency", expectedResult: "Verified Agency card, Post Job, Applicant Pipeline counts and recent jobs load (see L6.10 for the 6-stage display)" },
  { itemRef: "L2.2", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Post a job — country, city, category, fixed salary, experience, description, skills", status: "delivered", evidence: "components/agent/job-poster.tsx", testSteps: "Post Job → fill all fields → Publish Job; then post one with Save as Draft", expectedResult: "Published job appears in My Jobs (Active) and to candidates; draft stays hidden from candidates" },
  { itemRef: "L2.3", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Job page — Edit, Preview, Share, Close / Reopen, Delete (no applicants)", status: "delivered", evidence: "agent-job-detail.tsx", testSteps: "Open a job → try each button", expectedResult: "Each works; closed job disappears for candidates; Delete only offered with 0 applicants" },
  { itemRef: "L2.4", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Export applicants CSV and ZIP (with documents)", status: "delivered", evidence: "/agent/jobs/:id/applicants.csv", testSteps: "Job page → Export CSV; Export ZIP (with docs)", expectedResult: "Files download and contain this job's applicants (and their documents in the ZIP)" },
  { itemRef: "L2.5", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Applications Pipeline — 4 stages + Rejected/Withdrawn, search, filters, Stale", status: "delivered", evidence: "agent-applicants.tsx stageOrder()", testSteps: "Open Applications Pipeline; click each stage tile; search a name; toggle Stale", expectedResult: "Only Submitted / Interview / Selected / Placed / Rejected / Withdrawn; filters and Stale (7+ days) work" },
  { itemRef: "L2.6", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Schedule interview (in-person / virtual with link) → candidate notified", status: "delivered", evidence: "ScheduleInterviewModal.tsx", testSteps: "Submitted row → Schedule interview → date, time, mode, place, interviewer → Schedule & Notify Candidate; repeat as Virtual without a link", expectedResult: "Moves to Interview and candidate sees it; virtual without link cannot be submitted" },
  { itemRef: "L2.7", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Respond to a reschedule request (accept / new time / keep original)", status: "delivered", evidence: "RescheduleResponseModal.tsx", testSteps: "After L1.16 reschedule: Respond to reschedule → try each option on separate requests", expectedResult: "Interview time updates as chosen and the candidate is notified" },
  { itemRef: "L2.8", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Record outcome — Pass / Select (creates offer, requests documents) or Fail / Reject (notes required)", status: "delivered", evidence: "application.routes.ts interview-outcome", testSteps: "Interview row → Outcome → Pass / Select with rating; another → Fail / Reject without notes, then with notes", expectedResult: "Select → Selected + candidate sees documents owed; Reject requires notes" },
  { itemRef: "L2.9", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Appointment letter upload and travel date", status: "delivered", evidence: "agent-candidate-detail.tsx AppointmentTravelPanel", testSteps: "Selected → View → Appointment & travel → Upload signed file; View current; set travel date (try an ECR candidate without PDO/PBBY)", expectedResult: "Letter uploaded and viewable; ECR candidate's date refused until PDO+PBBY recorded; others save" },
  { itemRef: "L2.10", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Visa status with note and history; Pre-Departure Compliance save", status: "delivered", evidence: "VisaStatusPanel; PATCH /agent/candidates/:id/compliance", testSteps: "Set visa 'Application submitted' + note → Update & notify; set PCC/medical/PDO/PBBY → Save compliance", expectedResult: "History entry added, candidate notified; compliance values persist and appear in Admin → Audit Log" },
  { itemRef: "L2.11", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Welfare check-ins 30/60/90 days for placed workers", status: "delivered", evidence: "WelfarePanel", testSteps: "Placed → View → 30-day Record → OK + note → Save", expectedResult: "Shows OK with date and note; Edit works" },
  { itemRef: "L2.12", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Messages (Ask HPSEDC) reply; grievances Assigned to me", status: "delivered", evidence: "SupportInboxPanel.tsx; grievance-page.tsx", testSteps: "Messages → open the L1.21 thread → reply; Grievances → Assigned to me → Start Review → Mark Action Taken", expectedResult: "Reply reaches the candidate; grievance moves through statuses" },
  { itemRef: "L2.13", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Reports — pipeline health, SLA, Emigration Act compliance", status: "delivered", evidence: "ReportsBI.tsx", testSteps: "Menu → Reports; scroll all sections", expectedResult: "All panels load with numbers consistent with the pipeline" },

  { itemRef: "L2.14", section: 2, sectionTitle: "HPSEDC Placement Cell", description: "Candidate pool — search by skill, filter, reach out to candidates", status: "delivered", evidence: "agent-dashboard.tsx Candidates view", testSteps: "As hpsedc_agency: menu → Candidates → search 'welder'; filter by experience; toggle Open to outreach only; View a candidate → Email / Call", expectedResult: "Matching candidates listed; filters narrow the list; the quick view shows contact details and email / call buttons" },

  // ══ §4 ADMIN CONSOLE (login demo_admin) ════════════════════════════════
  { itemRef: "L4.1", section: 4, sectionTitle: "Admin Console", description: "Admin Console overview and CSV exports", status: "delivered", evidence: "admin-dashboard.tsx", testSteps: "Sign in as demo_admin → Overview; click each header CSV button", expectedResult: "Tiles and charts load; candidates/jobs/applications/placements CSVs download" },
  { itemRef: "L4.2", section: 4, sectionTitle: "Admin Console", description: "Smart Job Importer — auto-mapping, row validation, import", status: "delivered", evidence: "JobImportPanel.tsx; job-import.routes.ts", testSteps: "Import Jobs → Choose file → a CSV with one row missing Country → Import N jobs", expectedResult: "Columns auto-mapped; bad row marked Error and skipped; valid rows become active jobs under HPSEDC; listed in Recent imports" },
  { itemRef: "L4.3", section: 4, sectionTitle: "Admin Console", description: "Professions — edit names (EN/HI), categories, qualifications, documents, candidate note; hide/show", status: "delivered", evidence: "ProfessionsPanel.tsx", testSteps: "Edit Welder note → Save → check the candidate form; hide a trade; show it again", expectedResult: "Candidate sees the new note at once; hidden trade disappears from the picker; existing holders keep it" },
  { itemRef: "L4.4", section: 4, sectionTitle: "Admin Console", description: "Form Fields — Shown/Hidden, Must fill/Optional; locked rows", status: "delivered", evidence: "RegistrationFieldsPanel.tsx", testSteps: "Hide 'Mother's name'; make Aadhaar 'Must fill'; try to hide Passport expiry; check the candidate form; revert", expectedResult: "Form changes immediately; passport expiry cannot be hidden; hidden field never required" },
  { itemRef: "L4.5", section: 4, sectionTitle: "Admin Console", description: "System Config — pipeline profile and registration settings take effect immediately", status: "delivered", evidence: "SystemConfigPanel; settings.service.ts", testSteps: "Note Recruitment pipeline = Direct — 4 stages; toggle 'Require a confirmed email before applying' off, test apply, toggle back on", expectedResult: "Setting saved toast; behaviour changes without restart; change appears in Audit Log" },
  { itemRef: "L4.6", section: 4, sectionTitle: "Admin Console", description: "Users — disable / enable an account", status: "delivered", evidence: "UserManagementPanel", testSteps: "Users → Candidates → Disable a test candidate → try to sign in as them → Enable", expectedResult: "Disabled account cannot sign in; enabled again works" },
  { itemRef: "L4.7", section: 4, sectionTitle: "Admin Console", description: "Compliance, Deployment Readiness, Welfare SLA", status: "delivered", evidence: "CompliancePanel, DeploymentReadinessPanel, WelfareSlaPanel", testSteps: "Open each; export Deployment Readiness CSV", expectedResult: "Coverage tiles, risk flags and overdue check-ins match the data; CSV downloads" },
  { itemRef: "L4.8", section: 4, sectionTitle: "Admin Console", description: "Audit Log, Fraud Watch, Duplicates", status: "delivered", evidence: "AuditLogPanel, FraudWatchlistPanel, DuplicatesPanel", testSteps: "Audit Log → filter by resource; Fraud Watch after an L1.21 fraud grievance; Duplicates with two accounts sharing a phone", expectedResult: "Actions from L2/L4 tests listed with who/when; fraud report listed; duplicate pair grouped" },
  { itemRef: "L4.9", section: 4, sectionTitle: "Admin Console", description: "Grievances (All), Messages, Notification templates edit", status: "delivered", evidence: "GrievanceCard, NotificationTemplatesPanel", testSteps: "Grievances → All grievances; Notifications → Edit a candidate template title → trigger it", expectedResult: "All grievances visible to admin; edited template text is what the candidate receives" },
  { itemRef: "L4.10", section: 4, sectionTitle: "Admin Console", description: "Drives approval and Lifecycle run", status: "delivered", evidence: "DriveApprovalCard, LifecyclePanel", testSteps: "Create a drive as hpsedc_agency → approve as admin; Lifecycle → Run Lifecycle Now", expectedResult: "Drive approved and visible to the agency; lifecycle reports closed/nudged counts" },

  // ══ §5 CROSS-CUTTING ═══════════════════════════════════════════════════
  { itemRef: "L5.1", section: 5, sectionTitle: "General", description: "Phone layout (390 px) — form, dashboard and pipeline usable without sideways scroll", status: "delivered", evidence: "Responsive layout (AGENT_STATE v0.4.0)", testSteps: "Open the portal on a phone or Chrome device mode 390×844; walk L1.4–L1.14", expectedResult: "Single column, no horizontal scroll, buttons reachable" },
  { itemRef: "L5.2", section: 5, sectionTitle: "General", description: "Role isolation — candidate cannot open staff pages; agency cannot open Admin", status: "delivered", evidence: "requireRole guards", testSteps: "As a candidate open /agent/applicants and /admin URLs; as hpsedc_agency open Admin pages", expectedResult: "Access denied or redirect; no data shown" },
  { itemRef: "L5.3", section: 5, sectionTitle: "General", description: "Session timeout after 30 minutes idle", status: "delivered", evidence: "auth.session_timeout_minutes = 30", testSteps: "Sign in, leave idle 31 minutes, click something", expectedResult: "Asked to sign in again" },
  { itemRef: "L5.4", section: 5, sectionTitle: "General", description: "Old links redirect (/apply, /apply/pro, /profile, /start)", status: "delivered", evidence: "App.tsx redirects", testSteps: "Open each old URL while signed in as a candidate", expectedResult: "Each lands on /register (or /callback for ?mode=assisted), never a 404" },
  { itemRef: "L5.5", section: 5, sectionTitle: "General", description: "Evidence lock — passport details locked after HPSEDC verify", status: "partial", evidence: "profile-lock.service.ts — no staff verify button (L6.8)", testSteps: "Needs a verified passport (API only today) → as candidate change name on page 1 → Next", expectedResult: "Save refused with the lock reason; replacing the passport releases the lock" },

  // ══ §6 KNOWN LAUNCH DEFECTS — RETEST AFTER FIX ═════════════════════════
  { itemRef: "L6.1", section: 6, sectionTitle: "Known defects — retest", description: "First 'Submit application' bounces the candidate back to page 1", status: "not_delivered", evidence: "register.tsx submit(): setLocation('/') before profile cache refreshes → CandidateEntry redirects to /register", testSteps: "New account → complete pages 1–4 → Submit application", expectedResult: "Dashboard opens after the toast (today: page 1 of the form re-opens)" },
  { itemRef: "L6.2", section: 6, sectionTitle: "Known defects — retest", description: "Forgot password link leads to a missing page", status: "not_delivered", evidence: "email links /reset-password — no client route in App.tsx", testSteps: "Sign-in → Forgot password? → email → open the link", expectedResult: "A reset-password page lets the user set a new password (today: not found)" },
  { itemRef: "L6.3", section: 6, sectionTitle: "Known defects — retest", description: "No email provider configured — verification codes never arrive", status: "not_delivered", evidence: "provider_config empty, no SMTP env; require_verified_email_to_apply = true", testSteps: "Create an account with a real mailbox; wait for the code", expectedResult: "Code email arrives within a minute (today: logged only, so new candidates cannot apply)" },
  { itemRef: "L6.4", section: 6, sectionTitle: "Known defects — retest", description: "'Demo Mode — one-click logins' button shown on the sign-in page", status: "not_delivered", evidence: "auth-page.tsx renders it unconditionally; feature.quick_login_enabled = true", testSteps: "Open /auth signed out", expectedResult: "No Demo Mode button when quick login is off; flag OFF before launch" },
  { itemRef: "L6.5", section: 6, sectionTitle: "Known defects — retest", description: "All live vacancies auto-closed (no deadline → 60-day auto-expire)", status: "not_delivered", evidence: "job.auto_expire_days = 60; 20/20 jobs closed on 17 Oct", testSteps: "As a candidate open Find a Job", expectedResult: "Active vacancies listed, each with a deadline" },
  { itemRef: "L6.6", section: 6, sectionTitle: "Known defects — retest", description: "Simple-dashboard progress bar one stage ahead", status: "not_delivered", evidence: "candidate-dashboard.tsx MIN_FRIENDLY step numbers are for 5 steps", testSteps: "Candidate at Submitted, then at Interview → My Home → My application bar", expectedResult: "Submitted fills 1 of 4, Interview 2 of 4 (today: one more)" },
  { itemRef: "L6.7", section: 6, sectionTitle: "Known defects — retest", description: "Board / university 'Other' box disappears when cleared; old board kept when qualification changes", status: "partial", evidence: "register.tsx a303e54 follow-ups", testSteps: "Page 3: choose Other, type, clear the text; then pick CBSE and switch qualification to Degree", expectedResult: "Other box stays while empty; switching school ⇄ higher clears the board" },
  { itemRef: "L6.8", section: 6, sectionTitle: "Known defects — retest", description: "Staff cannot mark a candidate document as verified on screen", status: "not_delivered", evidence: "PATCH /candidates/documents/:id/verify exists; no UI calls it", testSteps: "hpsedc_agency → selected candidate → Documents", expectedResult: "A Verify / Reject control per document; candidate row shows 'accepted'" },
  { itemRef: "L6.9", section: 6, sectionTitle: "Known defects — retest", description: "'Request a callback' links shown while the callback option is off", status: "partial", evidence: "capability.assisted_callback_enabled = false; links in form sidebar/footer", testSteps: "Form sidebar → Request a callback", expectedResult: "Link hidden when the option is off (today: redirects back to the form)" },
  { itemRef: "L6.10", section: 6, sectionTitle: "Known defects — retest", description: "Agency dashboard funnel, job tiles and Reports show six stages", status: "partial", evidence: "AgentPipelineFunnel / agent-job-detail PIPELINE hard-coded", testSteps: "hpsedc_agency dashboard, any job page, Reports funnel", expectedResult: "Only Submitted / Interview / Selected / Placed (+ Rejected) shown" },
];

const ACTS: [string, string[]][] = [
  ["Act 1 · HPSEDC sets the rules", ["L4.1", "L4.3", "L4.4", "L4.5", "L4.6"]],
  ["Act 2 · Jobs arrive and are published", ["L4.2", "L2.1", "L2.2", "L2.3", "L4.10"]],
  ["Act 3 · Applicants register and apply", ["L1.1", "L1.2", "L1.3", "L1.4", "L1.5", "L1.6", "L1.7", "L1.8", "L1.9", "L1.24", "L1.10", "L1.11", "L1.23", "L1.12", "L1.13", "L1.14", "L1.15"]],
  ["Act 4 · HPSEDC matches, interviews and selects", ["L2.5", "L2.4", "L2.14", "L2.6", "L1.16", "L2.7", "L2.8"]],
  ["Act 5 · Documents and departure", ["L1.17", "L1.18", "L1.19", "L2.9", "L2.10", "L1.20"]],
  ["Act 6 · After departure, and oversight", ["L2.11", "L1.21", "L2.12", "L1.22", "L2.13", "L4.7", "L4.8", "L4.9"]],
  ["Across the portal", ["L5.1", "L5.2", "L5.3", "L5.4", "L5.5"]],
  ["Known defects — retest after fix", ["L6.1", "L6.2", "L6.3", "L6.4", "L6.5", "L6.6", "L6.7", "L6.8", "L6.9", "L6.10"]],
];

const DEFECTS: { shortId: string; itemRef: string; severity: "blocker" | "major" | "minor"; description: string }[] = [
  { shortId: "HL-001", itemRef: "L6.1", severity: "major", description: "First 'Submit application' bounces the candidate back to page 1 of the form." },
  { shortId: "HL-002", itemRef: "L6.2", severity: "major", description: "Forgot-password email links to /reset-password, which has no page." },
  { shortId: "HL-003", itemRef: "L6.3", severity: "blocker", description: "No email provider configured on lite — verification codes never arrive, so new candidates cannot apply." },
  { shortId: "HL-004", itemRef: "L6.4", severity: "major", description: "Demo Mode button rendered on the sign-in page regardless of the feature flag; quick login is ON." },
  { shortId: "HL-005", itemRef: "L6.5", severity: "blocker", description: "All vacancies auto-closed by the 60-day lifecycle; candidates see no jobs." },
  { shortId: "HL-006", itemRef: "L6.6", severity: "minor", description: "Simple-dashboard progress bar shows one stage ahead under the 4-stage pipeline." },
  { shortId: "HL-007", itemRef: "L6.7", severity: "minor", description: "Board picker: 'Other' box vanishes when cleared; stale board kept on qualification change." },
  { shortId: "HL-008", itemRef: "L6.8", severity: "major", description: "No on-screen document verification for staff." },
  { shortId: "HL-009", itemRef: "L6.9", severity: "minor", description: "Callback links shown while the assisted-callback option is off." },
  { shortId: "HL-010", itemRef: "L6.10", severity: "minor", description: "Agency funnel / job tiles / Reports still render six stages." },
];

async function main() {
  const slug = "hirestream-lite";
  let [project] = await db.select().from(projects).where(eq(projects.slug, slug));
  if (project) {
    await db.delete(requirements).where(eq(requirements.projectId, project.id));
    console.log("Cleared old lite requirements.");
  } else {
    [project] = await db.insert(projects).values({
      slug,
      name: "HireStream Lite — HPSEDC Phase-1 Portal",
      buildRef: "v1.1.0",
      contractor: "Agentryx",
      client: "HPSEDC",
      description: "hirestream-lite.agentryx.dev — HPSEDC acting as the government recruiting agency, Direct 4-stage pipeline (Applied → Interview → Selected → Placed), documents only at selection. Test accounts: hpsedc_agency / demo_admin / demo_candidate (password test123); create fresh candidates via Create Account.",
      matrixSourcePath: "/home/subhash.thakur.india/Projects/Recruitment/hirestream-lite/A.PMD/User Guides and Videos - Lite",
      sortOrder: 1,
    }).returning();
    console.log("Created lite project:", project.id);
  }

  // Run order = the phase-1 demo sequence (see the FRS coverage & demo plan).
  // sectionTitle carries the act; section still maps to the role card.
  const byRef = new Map(R.map((r) => [r.itemRef, r]));
  const rows: any[] = [];
  let order = 0;
  for (const [act, refs] of ACTS) {
    for (const ref of refs) {
      const r = byRef.get(ref);
      if (!r) throw new Error(`ACTS names unknown case ${ref}`);
      byRef.delete(ref);
      rows.push({ projectId: project.id, ...r, sectionTitle: act, source: r.section === 6 ? "lite_defect" : "frs", sortOrder: order++ });
    }
  }
  if (byRef.size) throw new Error(`Cases missing from ACTS: ${[...byRef.keys()].join(", ")}`);
  await db.insert(requirements).values(rows);
  console.log(`Inserted ${rows.length} lite requirements.`);

  const [reporter] = await db.select().from(reviewers).where(eq(reviewers.username, "agentryx"));
  for (const d of DEFECTS) {
    const [existing] = await db.select().from(issues).where(and(eq(issues.projectId, project.id), eq(issues.shortId, d.shortId)));
    if (!existing) await db.insert(issues).values({ projectId: project.id, ...d, status: "open", reportedById: reporter?.id ?? null });
  }
  console.log(`Logged ${DEFECTS.length} open issues (HL-001…).`);

  for (const r of await db.select().from(reviewers)) {
    await db.insert(projectReviewers).values({ projectId: project.id, reviewerId: r.id }).onConflictDoNothing();
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
