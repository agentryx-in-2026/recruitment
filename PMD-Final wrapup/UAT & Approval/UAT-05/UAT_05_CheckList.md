# HireStream-HP · UAT-05 Checklist

**Portal:** HireStream-HP (HPSEDC Overseas Placement) · https://hirestream-hp.agentryx.dev
**Source:** HPSEDC observations & change requests from the demonstration held **16-07-2026** (email from HPSEDC Team)
**Items:** 21 (20 change requests + 1 configurable profession-eligibility requirement)
**Status legend:** ☐ Open · 🔄 In progress · ✅ Done · ⛔ Out of scope · ⏳ Deferred

> HPSEDC has also asked for an **estimated implementation timeline** along with the updated build.

---

## A. Registration & onboarding flow

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 1 | Implement **email verification** during candidate registration. | Registration / Auth | ☐ | |
| 2 | On successful login, the **Candidate Dashboard opens directly on the Profile Completion Form** — candidate enters personal, educational and professional details before accessing other portal features. | Candidate Dashboard | ☐ | |
| 3 | **Simplify the registration workflow** — minimise the number of steps; consolidate related information into a single section wherever possible. | Registration | ✅ | 4 pages (was 7+). Tier chooser /start deleted. |
| 4 | Make **Passport Number mandatory** and place it at the **beginning** of registration. | Registration | ✅ | Page 1, first section. 'No passport yet' escape hatch is admin-configurable. |
| 5 | Capture **Email ID, WhatsApp Number and Contact Number** during registration. | Registration | ✅ | Page 1 · Contact: mobile, WhatsApp (+ same-as-mobile), email. Country-code prefix added v0.9.5. |

## B. Field-level changes

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 6 | Add an **"Other Languages"** option under the Languages section. | Profile · Languages | ✅ | Free-text 'other language' + Add button, with proficiency levels. |
| 7 | **Remove "Pahari"** from the list of available languages. | Profile · Languages | ✅ | LANGS = Hindi, English, Urdu, Arabic (your 16-07 call). |
| 8 | **Remove** the field **"Where do you want to work?"** from candidate registration. | Registration | ✅ | Removed from registration entirely. |
| 12 | Add a **Disability** field (Yes/No); if **Yes**, show an additional field to specify the **type of disability**. | Profile · Personal | ✅ | Yes/No + conditional type-of-disability field. |
| 13 | Include **District** and **State** fields in the **Permanent Address** section. | Profile · Address | ✅ | permanentDistrict + permanentState (defaults Himachal Pradesh). |
| 14 | Change label **"What work do you do?" → "What skills do you have?"** | Profile · Skills | ✅ | Page 2 title and tab both read 'What skills do you have?' |
| 15 | Allow candidates to select **multiple professions / skills**, wherever applicable. | Profile · Skills | ✅ | professionKeys — multi-select. |
| 16 | Rename **"Your Town" → "Home Town"**. | Profile · Address | ✅ | reg.p1.homeTown = 'Home Town'. |
| 17 | Update **HPBSE → HPBOSE** in the Education Record section. | Profile · Education | ✅ | HPBOSE in locales and the field seed. |
| 18 | **Expand the Experience / Roles list** with additional professions — e.g. **Nurse, Driver** and other relevant occupations. | Profile · Experience · Masters | ✅ | 21 professions seeded incl. Nurse, Driver, Caregiver, Welder, Electrician. |
| 19 | **Remove predefined company names** such as *Infosys*, *TCS* wherever they appear in the portal. | Global (seed/demo data) | ✅ | Infosys/TCS absent; HCL/Tata/Shapoorji/Mahindra also replaced with fictional names 2026-07-18. |

## C. Workflow & visibility rules

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 9 | **PCC (Police Clearance Certificate)** and **Medical Fitness Certificate** sections stay **hidden initially**, becoming visible **only after the candidate is shortlisted/selected** in the HPSEDC dashboard panel. | Documents · HPSEDC panel | ✅ | Verified 2026-07-18 in all three states: submitted-only -> hidden; shortlisted -> shown without PCC/medical; selected -> both shown. |
| 11 | Once a candidate is **successfully placed**, the corresponding **job vacancy is no longer visible to candidates**. | Jobs · Placement | ✅ | job.routes.ts:262 — filled vacancies hidden from candidates and anonymous visitors, retained for staff. |

## D. Job posting & simplification

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 10 | In **Job Posting**, replace the **salary range** with a **fixed salary amount** field. | Job Posting | ✅ | jobs.salary is a single text field; no min/max on the posting form. |
| 20 | **Simplify Job Posting and Candidate Dashboard** by removing the detailed recruitment pipeline. | Job Posting · Candidate Dashboard | ✅ | Detailed 6-stage pipeline removed from the candidate view; retained for HPSEDC/agents who need stage tracking. |

## E. Profession-specific eligibility (item 21)

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 21 | The portal must enforce **profession-specific mandatory educational qualifications and supporting documents** based on the profession(s)/skill(s) the candidate selects. On selecting a profession, the system **dynamically displays and enforces** the relevant qualification and document requirements. | Profile · Documents · Admin | ✅ | See sub-items below |
| 21.1 | **Admin-configurable** — HPSEDC can add, modify or update profession-specific eligibility criteria **without application changes**. *(HPSEDC recommendation)* | Admin console | ✅ | ProfessionsPanel + RegistrationFieldsPanel — HPSEDC edit criteria with no release. |

**Illustrative requirements provided by HPSEDC**

| Profession | Mandatory qualification | Mandatory / supporting documents |
|------------|------------------------|----------------------------------|
| **Nurse** | Recognised Diploma/Degree in Nursing — GNM / B.Sc. Nursing / Post Basic B.Sc. Nursing, as applicable | Valid **Nursing Council Registration Certificate**; any other profession-specific certification, if required |
| **Driver** | Valid **Driving Licence** (appropriate vehicle class) | Licence upload; where applicable also **badge / commercial driving licence**, experience certificate, driving record |
| **Electrician** | Valid **ITI / Diploma in Electrician Trade** or equivalent recognised qualification | Relevant trade certificates |
| **Welder** | **ITI Certificate in Welding** or equivalent trade certification | Trade certificate |
| **Caregiver / Nurse** | Relevant **caregiver training / certification**, if applicable | Mandatory experience certificates, where applicable |

> The examples above are illustrative — the master list is to be maintained by HPSEDC through the admin configuration.

---

## Tracking summary

| Status | Count |
|--------|-------|
| ✅ Done | 19 (+ 21.1) |
| 🔄 In progress | 0 |
| ☐ Open | 2 — items 1 and 2 |
| ⛔ Out of scope | 0 |
| ⏳ Deferred | 0 |

**Remaining work (items 1 and 2)**

- **Item 1 — email verification at registration.** The OTP service and the
  `/send-otp` + `/verify-otp` routes already exist and work; what is missing is
  gating registration on them. This is wiring, not new machinery.
- **Item 2 — login lands on the profile form.** A candidate currently lands on
  the dashboard (`App.tsx` `DashboardContent`). Needs a completion check that
  redirects an incomplete profile to `/register`. Note this interacts with item
  9: the dashboard is also where a shortlisted candidate is told what to upload,
  so the redirect must not trap someone who has documents owed.

**Open with HPSEDC**

- Estimated implementation timeline to be shared (requested in the 16-07-2026 email).
- Item 9 — built to reveal at BOTH shortlisted and selected (PCC/medical themselves attach at the deploy stage). Confirm this matches intent.
- Item 20 — confirm what replaces the pipeline view for HPSEDC/agency users, who still need stage tracking internally.
- Item 21 — confirm the initial profession master list HPSEDC wants seeded before go-live.
