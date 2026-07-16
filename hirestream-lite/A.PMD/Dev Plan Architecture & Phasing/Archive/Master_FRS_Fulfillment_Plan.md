# HireStream: Master FRS Fulfillment & Enhancement Plan

Based on the **Functional Requirements Specification (FRS)** for the Overseas Placement Portal (HPSEDC), here is the exhaustive map of our development trajectory. We will deliver **100% of the FRS requirements** plus **premium enterprise enhancements** ("the some more") to ensure the portal is state-of-the-art and production-ready.

---

## 🟢 PHASE 1: Data & Core Operations (We Are Here)
*Replacing the "shallow" mock data with real database interactions.*

### FRS Requirement Covered: Profile Management & Job Positing (Sections 2.3, 2.5)
- [x] **Database Seeding**: Inject real candidates and jobs to test the UI.
- [ ] **Live Candidate Dashboard**: Wire the dashboard to fetch jobs from `/api/v1/jobs`.
- [ ] **Live Employer/Agent Dashboards**: Wire agent dashboards to live job and candidate counts.
- [ ] **Apply & Track Flow**: Candidates can click "Apply" on a job, and it saves into the `applications` table.
- [ ] **Job Creation Form**: Fully functional multi-step form for Employers/Agents to post new overseas jobs.
- [ ] **Agent Candidate Search**: Agents can search the live database of candidates with filters (location, skills, experience).

---

## 🟡 PHASE 2: FRS Core Workflows (The "Meat")
*Building the required state machines and approval pipelines.*

### FRS Requirement Covered: HPSEDC Admin & Recruitment Workflows (Sections 2.6, 2.7)
- [ ] **Agent/Employer Registration Approval Pipeline**: Agents register -> Admin reviews license -> Status changes to "Verified."
- [ ] **Recruitment Drive & Interview Scheduling**: Agents can select candidates for a job and schedule a calendar interview (with date/time).
- [ ] **Application Status Tracking**: Candidate side updates to show `Shortlisted`, `Interview Scheduled`, `Selected`, `Rejected`.
- [ ] **Admin Oversight Dashboard**: HPSEDC Admins can view all platform metrics (Total placements, Active Agencies, Grievances).

---

## 🟠 PHASE 3: Identity, Security & Documents 
*Implementing the required government integrations.*

### FRS Requirement Covered: Security, UIDAI, and Documents (Sections 2.3, 2.8, 2.9)
- [ ] **HIM Access (SSO) & Aadhaar Integration Prep**: Create the authentication hooks and mock API integration for HIM Access and Aadhaar OTP verification. *(Note: Actual live UIDAI integration requires gov API keys, but the system architecture will be fully prepared).*
- [ ] **Secure Document Upload (Digi-Locker Prep)**: Candidates can upload PDF CVs, Passports, and Certificates. Files are securely stored (S3 bucket or local secure storage).
- [ ] **Bilingual Interface Prep**: Add `i18n` (internationalization) support so the UI can toggle between English and Hindi.

---

## 🚀 PHASE 4: The "And Some More" (Premium Enhancements)
*Going beyond the FRS to deliver a world-class, modern application.*

- [ ] **AI-Powered Candidate Match Score**: When an agent views a job, the system automatically grades candidates with a `MatchScore` (0-100%) based on required skills vs. candidate skills.
- [ ] **Dynamic Analytics & Charts**: Replace static dashboard numbers with live, interactive `Recharts` graphs (e.g., Hiring funnel, Placement Geography Maps).
- [ ] **In-App Notification Engine**: A dropdown bell icon that pushes real-time alerts to candidates ("Your application to Tech Solutions Canada was viewed!") and agents.
- [ ] **PDF Export Engine**: Generate beautiful "Appointment Letters" and "Candidate Resumes" as downloadable PDFs directly from the browser.
- [ ] **Dark Mode / Premium Theming**: High-end visual aesthetic options compliant with GIGW guidelines.

---

### Immediate Next Step
To move us out of the "shallow" phase right now, our next technical step is **wiring the Candidate Dashboard and Employer Dashboard to the real Postgres database** using React Query.
