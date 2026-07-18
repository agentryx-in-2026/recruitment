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
| 3 | **Simplify the registration workflow** — minimise the number of steps; consolidate related information into a single section wherever possible. | Registration | ☐ | |
| 4 | Make **Passport Number mandatory** and place it at the **beginning** of registration. | Registration | ☐ | |
| 5 | Capture **Email ID, WhatsApp Number and Contact Number** during registration. | Registration | ☐ | |

## B. Field-level changes

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 6 | Add an **"Other Languages"** option under the Languages section. | Profile · Languages | ☐ | |
| 7 | **Remove "Pahari"** from the list of available languages. | Profile · Languages | ☐ | |
| 8 | **Remove** the field **"Where do you want to work?"** from candidate registration. | Registration | ☐ | |
| 12 | Add a **Disability** field (Yes/No); if **Yes**, show an additional field to specify the **type of disability**. | Profile · Personal | ☐ | |
| 13 | Include **District** and **State** fields in the **Permanent Address** section. | Profile · Address | ☐ | |
| 14 | Change label **"What work do you do?" → "What skills do you have?"** | Profile · Skills | ☐ | |
| 15 | Allow candidates to select **multiple professions / skills**, wherever applicable. | Profile · Skills | ☐ | |
| 16 | Rename **"Your Town" → "Home Town"**. | Profile · Address | ☐ | |
| 17 | Update **HPBSE → HPBOSE** in the Education Record section. | Profile · Education | ☐ | |
| 18 | **Expand the Experience / Roles list** with additional professions — e.g. **Nurse, Driver** and other relevant occupations. | Profile · Experience · Masters | ☐ | |
| 19 | **Remove predefined company names** such as *Infosys*, *TCS* wherever they appear in the portal. | Global (seed/demo data) | ☐ | |

## C. Workflow & visibility rules

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 9 | **PCC (Police Clearance Certificate)** and **Medical Fitness Certificate** sections stay **hidden initially**, becoming visible **only after the candidate is shortlisted/selected** in the HPSEDC dashboard panel. | Documents · HPSEDC panel | ☐ | |
| 11 | Once a candidate is **successfully placed**, the corresponding **job vacancy is no longer visible to candidates**. | Jobs · Placement | ☐ | |

## D. Job posting & simplification

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 10 | In **Job Posting**, replace the **salary range** with a **fixed salary amount** field. | Job Posting | ☐ | |
| 20 | **Simplify Job Posting and Candidate Dashboard** by removing the detailed recruitment pipeline. | Job Posting · Candidate Dashboard | ☐ | |

## E. Profession-specific eligibility (item 21)

| # | Change request | Module / area | Status | Notes |
|---|----------------|---------------|--------|-------|
| 21 | The portal must enforce **profession-specific mandatory educational qualifications and supporting documents** based on the profession(s)/skill(s) the candidate selects. On selecting a profession, the system **dynamically displays and enforces** the relevant qualification and document requirements. | Profile · Documents · Admin | ☐ | See sub-items below |
| 21.1 | **Admin-configurable** — HPSEDC can add, modify or update profession-specific eligibility criteria **without application changes**. *(HPSEDC recommendation)* | Admin console | ☐ | |

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
| ✅ Done | 0 |
| 🔄 In progress | 0 |
| ☐ Open | 21 |
| ⛔ Out of scope | 0 |
| ⏳ Deferred | 0 |

**Open with HPSEDC**

- Estimated implementation timeline to be shared (requested in the 16-07-2026 email).
- Item 9 — confirm the exact trigger stage ("shortlisted" vs "selected") that reveals PCC / Medical Fitness.
- Item 20 — confirm what replaces the pipeline view for HPSEDC/agency users, who still need stage tracking internally.
- Item 21 — confirm the initial profession master list HPSEDC wants seeded before go-live.
