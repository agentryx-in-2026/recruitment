# HireStream-HP · Registration Field Spec

**Companion to:** `UAT_05_Registration_Redesign_Proposal.md` (the *why*) — this document is the *what*
**Status:** Draft v3 for HPSEDC approval — no code changed yet
**Date:** 16-07-2026

---

## 1. The structural idea

Every candidate answers the same **generic core**. Each profession they select adds a small **add-on block** on top. Pick two professions, get two blocks. Pick a profession with no block configured, get the generic fields only.

```
        ┌─────────────────────────────────────────┐
        │  GENERIC CORE — every candidate         │
        │  identity · address · education         │
        └─────────────────────────────────────────┘
                          +
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │  Nurse    │ │  Driver   │ │ Welder    │   ← only for professions
        │  add-on   │ │  add-on   │ │ add-on    │     actually selected
        └───────────┘ └───────────┘ └───────────┘
```

The union repeats at the document stage: a Nurse+Driver candidate is asked for a nursing certificate, a Council registration **and** a driving licence — automatically, because both blocks were selected.

This is UAT-05 item 21, and it is a table lookup. No rules, no conditionals, no AI.

---

## 2. What we ask for, and when

**The test is cost, not field count.** A PCC costs ₹500 and three weeks; a medical costs ₹3,000 and a trip to an approved centre. An Aadhaar number costs nothing — the candidate knows it by heart. Both are "not needed to shortlist", but they are not the same class of thing, and only the expensive ones are worth deferring.

| | Cost to candidate | Asked at |
|---|---|---|
| Name, DOB, address, Aadhaar, passport details | **Zero** — it is in their pocket | **Page 1** |
| Skills, experience, qualifications | Zero — they know it | Pages 2–3 |
| Certificates, licences, experience letters | Real — finding and scanning paper | **Page 5** (shortlisted) |
| PCC, medical fitness | **₹500–3,000 + weeks, and they expire** | **Page 6** (selected) |

**Passport-or-Aadhaar is the identity key.** Across 20,000 applications people will register twice; phone and email both change. With the passport escape hatch some candidates have no passport number — so between the two, we always hold one stable key for de-duplication.

---

## 3. How many professions?

Two separate questions that should not share an answer.

**The picker — 19 tiles.** Long enough that a real HP applicant finds themselves rather than falling into "Other". Too short and "Other" swallows the list and we cannot match anyone to a vacancy.

**The add-on blocks — 5.** Exactly the professions HPSEDC named. Everything else uses the generic core, which is *fine* — a mason has no mandatory certificate to check.

**Specific skills — all 19.** Every profession gets an optional skills multi-select. Cheap, optional, and it is where the matching value lives.

| # | Profession | Add-on block | Specific skills (optional) |
|---|---|---|---|
| 1 | **Nurse** | ★ | ICU · OT · Emergency · Paediatric · Dialysis · Geriatric · Ward |
| 2 | **Caregiver** | ★ | Elderly · Children · Disabled · Post-surgical · Dementia · Bedridden |
| 3 | **Driver** | ★ | School bus · Tanker · Trailer · Forklift · Crane · Taxi · Delivery van |
| 4 | **Electrician** | ★ | Domestic wiring · Industrial · Panel wiring · HVAC · Motor winding |
| 5 | **Welder** | ★ | Arc/SMAW · MIG/GMAW · TIG/GTAW · Gas · **6G pipe** · Structural |
| 6 | Mason | generic | Block work · Plastering · Tiling · Shuttering · Stone |
| 7 | Carpenter | generic | Shuttering · Furniture · Finishing · Formwork |
| 8 | Plumber | generic | Pipe fitting · Sanitary · Drainage · PPR/PVC |
| 9 | Painter | generic | Interior · Exterior · Spray · Industrial coating |
| 10 | AC & Refrigeration Technician | generic | Split · Central · Chiller · Ducting · Refrigeration |
| 11 | Mechanic / Fitter | generic | Diesel · Petrol · Heavy vehicle · Pipe fitting |
| 12 | Cook | generic | Indian · Continental · Arabic · Chinese · Tandoor · Bakery |
| 13 | Waiter / Steward | generic | Fine dining · Banquet · Bar · Barista |
| 14 | Housekeeping / Cleaner | generic | Hotel · Hospital · Industrial · Laundry |
| 15 | Security Guard | generic | CCTV · Access control · Fire safety · Patrol |
| 16 | Tailor | generic | Gents · Ladies · Alteration · Embroidery |
| 17 | Farm Worker | generic | Greenhouse · Dairy · Orchard · Machinery |
| 18 | Helper / General Labour | generic | — |
| 19 | **Other** (type it in) | generic | — |

**Selection cap: 3**, exposed as an admin setting (`registration.max_professions`) so HPSEDC can tune it without a release.

> ⚠️ **This list is reasoned, not sourced.** Built from the portal's existing 18 trades plus the gaps HPSEDC flagged in item 18. It has **not** been validated against real HP→Gulf deployment data or the eMigrate occupation taxonomy — that research was started and stopped. Worth closing before we seed. See §9.

---

## 4. Stage 1 — the four public pages

Everyone. ~4 minutes. **Zero uploads.**

### Page 0 — Entry & routing (item 2)

UAT-05 item 2: *"Upon successful login, the Candidate Dashboard should open directly to the Profile Completion Form, enabling candidates to conveniently enter and complete their personal, educational, and professional details **before accessing other portal features**."*

**Routing rule on login:**

| Candidate state | Lands on |
|---|---|
| No application started | **Page 1** |
| Application part-filled | **The furthest incomplete page** — resumable, server-derived (no localStorage) |
| Application submitted | The dashboard |
| Shortlisted with page 5 outstanding | **Page 5**, with a banner explaining why |
| Selected with page 6 outstanding | **Page 6**, with the SLA deadline shown |

Today's equivalent is a tier chooser at `/start` — the candidate's first act on the portal is choosing *how* to register. That page is deleted; login goes straight to the form.

**"Before accessing other portal features" — the interpretation, which needs confirming.**

Read literally, this hard-gates the whole portal behind a completed profile. **Recommend against**, and read it by its own stated intent instead — *"enabling candidates to conveniently"* is about making the form the default landing, not about punishing people who look around first. A candidate who cannot see a single vacancy until they have finished a form has no reason to start the form. Browsing is the thing that motivates registering.

**Proposed:** land on the form by default · **allow** browsing jobs · **block applying** until the application is submitted. That satisfies the intent — you complete your profile before you use the portal *for real* — without gating the shop window. Flagged in §9 for HPSEDC.

### Page 1 — About you

> **Instruction to the candidate:** *"Keep your passport and Aadhaar card in front of you."*
> Everything on this page is printed on a document already in their hand — which is what makes ~18 fields tolerable. This is UAT-05 item 3 ("consolidate related information into a single section") applied literally: identity, contact and address are one section, not three pages.

**1a · Identity documents**

| Field | Type | Req. | Notes |
|---|---|---|---|
| **Passport number** | text | **Yes*** | item 4 — first field. *See escape hatch |
| ↳ *"I don't have a passport yet"* | checkbox | — | Records status, lets them continue, blocks **selection** not **application**. Policy call — proposal §6① |
| Date of issue | date | if passport | on the bio page |
| Date of expiry | date | if passport | on the bio page |
| Place of issue | text | if passport | on the bio page |
| ECR / ECNR status | select + help | No | *"Check your passport — does it say 'Emigration Check Required'?"* Drives whether PoE clearance is needed later |
| **Aadhaar number** | text (12) | Yes | Verhoeff checksum validated. Identity key when there is no passport |

**1b · Personal details**

| Field | Type | Req. | Notes |
|---|---|---|---|
| Full name | text | Yes | *"exactly as printed on your passport"* |
| Date of birth | date | Yes | |
| Gender | male / female / other | Yes | |
| Father's name | text | Yes | on the passport |
| Mother's name | text | Yes | on the passport |
| **Disability** | Yes / No | Yes | item 12 |
| ↳ Type of disability | text | if Yes | item 12 |

**1c · Contact**

| Field | Type | Req. | Notes |
|---|---|---|---|
| **Mobile number** | tel | Yes | item 5 |
| **WhatsApp number** | tel | Yes | item 5 — **"same as mobile"** tick, one tap for most |
| **Email ID** | email | Yes | item 5 |
| ↳ **verification** | — | Yes | item 1 — see note |

**Email verification, done right:** send the mail and **let them keep going**. Gate only the final submit. Hard-blocking here sends the candidate out to an inbox and a real share never come back.

**1d · Address**

| Field | Type | Req. | Notes |
|---|---|---|---|
| **Home Town** | text | Yes | item 16 — renamed from "Your Town" |
| **Permanent address** — line 1 | text | Yes | |
| — line 2 | text | No | |
| — **District** | select | Yes | item 13. HP districts when State = HP, else free text |
| — **State** | select | Yes | item 13. Defaults to Himachal Pradesh |
| — PIN code | text (6) | Yes | |
| **Correspondence address** | — | — | **"same as permanent"** tick → collapses the whole block |
| — line 1 / line 2 / District / State / PIN | | if different | Same shape as permanent — *one* address structure everywhere |

**One address shape, everywhere.** Today the candidate's addresses have no District and no State on either address, while an *agency*'s registered address has State. That inconsistency is exactly what produced item 13.

**Deliberately NOT here:** emergency contact — it is not printed on any document, so it breaks the page's one instruction. Deferred to page 5.

> **Page length — the one trade-off.** This page carries ~18 fields, though the two "same as" ticks mean most candidates fill about 13. On desktop, two-column, that is ~7 rows and comfortable. On a phone it is a scroll of roughly three screens with four clear sub-headings. That is acceptable — a scroll with visible sections beats four gated pages — **but it is the first thing to watch in UAT.** If it reads as heavy, address (1d) splits back out to its own page and we are at five. Easy to reverse; hard to know without real users.

### Page 2 — What skills do you have?

> **Settled (16-07-2026):** item 14's exact wording. This is a *capability* question, not a preference one; item 8 removed *"Where do you want to work?"*, so HPSEDC are deliberately moving from preference to capability. A welder willing to take helper work answers those two questions differently, and it is the capability answer that matches him to a vacancy.

| Field | Type | Req. | Notes |
|---|---|---|---|
| **"What skills do you have?"** | multi-select tiles, **max 3** | Yes | items 14, 15, 18 — the 19 tiles from §3 |
| ↳ *Other — type it in* | text | if Other | |
| **Languages** | chips × proficiency | Yes | |
| ↳ **"Other language"** | text | No | item 6 — *added* |
| ↳ ~~Pahari~~ | | | item 7 — *removed* |

Page 2 is purely "pick your trades". Everything *about* those trades is page 3.

**Deliberately NOT here:** *"Where do you want to work?"* — removed entirely (item 8). HPSEDC matches candidates to vacancies; the vacancy carries the country.

### Page 3 — Your Qualifications and Experience

**3a — Generic education** (everyone)

| Field | Type | Req. | Notes |
|---|---|---|---|
| Highest qualification | select | Yes | No schooling → 5th → 8th → 10th → 12th → ITI → Diploma → Degree |
| Board / University | select + *Other* | if applicable | **HPBOSE** — item 17, corrected from HPBSE |
| Institution | text | No | |
| Year of passing | number | No | |
| Passed? | checkbox | Yes | default true |

**3b — One card per selected profession.** Each card holds that profession's qualification, experience and specific skills together — everything about that trade in one place.

> **Every qualification field is a dropdown, never free text.** That is what keeps matching exact and removes any need for fuzzy matching. Let someone type "B.Sc Nursing (Hons.)" and we have created a problem only AI can solve; give them a list and the problem never exists.

**Common to every card** (generic professions get *only* these):

| Field | Type | Req. |
|---|---|---|
| Months of experience | number (0–600) | Yes — shown as "≈ N years" |
| **Specific skills** | multi-select — per-profession list from §3 | **No — optional** |
| Last employer — name | text | No |
| Last employer — country | select | No |

**★ Nurse** — adds:

| Field | Type | Req. |
|---|---|---|
| Nursing qualification | **GNM** / **B.Sc. Nursing** / **Post Basic B.Sc. Nursing** / Other | Yes |
| College / institution | text | Yes |
| Year of passing | number | Yes |
| **Nursing Council registration number** | text | Yes |
| Issuing Council | select (HP Nursing Registration Council / other state / other) | Yes |
| Registration valid until | date | No |

**★ Caregiver** — adds:

| Field | Type | Req. |
|---|---|---|
| Training certificate | **General Duty Assistant (GDA)** / **Caregiver training** / **Home health aide** / None yet | Yes |
| Training institution | text | if certificate |
| Year | number | if certificate |
| Course duration (months) | number | No |

*Caregiver is a separate block from Nurse, not a slash.* Nurse is a licensed profession (3–4 year qualification + Council registration); caregiver is a 3–6 month certificate with no licence. Merging them either destroys the caregiver funnel or lets unlicensed nurses reach an employer. HPSEDC's "Caregiver/Nurse" bullet describes the caregiver requirements — the slash was drafting shorthand.

**★ Driver** — adds:

| Field | Type | Req. |
|---|---|---|
| Driving licence number | text | Yes |
| **Licence class** | LMV / LMV-TR / HMV / HGMV / HPMV / Trailer / Bus | Yes |
| Licence valid until | date | Yes |
| Badge / PSV badge held? | Yes / No | Yes |
| Driven abroad before? | Yes / No + country | No |

*Licence class is a field, not a separate profession.* "Appropriate vehicle class" tempts us into per-class rows or conditional rules — but the **required document is the same** (a licence) whatever the class. One row, one dropdown.

**★ Electrician** — adds:

| Field | Type | Req. |
|---|---|---|
| Trade qualification | **ITI — Electrician** / **Diploma — Electrical Engineering** / Other recognised | Yes |
| ITI / institution name | text | Yes |
| Year | number | Yes |
| Certificate body | NCVT / SCVT / Other | No |

**★ Welder** — adds:

| Field | Type | Req. |
|---|---|---|
| Trade qualification | **ITI — Welder** / Other trade certificate | Yes |
| ITI / institution name | text | Yes |
| Year | number | Yes |
| Trade test passed? | Yes / No | No |

**Layout:** cards are collapsible, open one at a time. With the cap at 3, worst case is generic education + 3 cards; if that runs long it paginates 3a → 3b → 3c rather than becoming one endless scroll.

### Page 4 — Review, print & attest

Not just a summary screen — **a printable A4 application form**, because a government application needs a paper artefact the candidate can keep and HPSEDC can file.

**Layout:** A4 portrait, print stylesheet (`@page { size: A4; margin: 15mm }`), pages 1–3 rendered as one continuous form:

| Section | Contents |
|---|---|
| **Header** | HPSEDC / Govt of Himachal Pradesh mark · *"Application for Overseas Employment"* · **application reference number** · date |
| **1. Personal & identity** | page 1a + 1b · blank photo box (top right, for the paper copy) |
| **2. Contact & address** | page 1c + 1d |
| **3. Skills & languages** | page 2 |
| **4. Qualifications & experience** | page 3a + one sub-section per profession card |
| **Declaration** | *"I confirm the above is true. I understand I will be asked to prove it if I am shortlisted."* · place · date · signature line |
| **Footer** | page *n* of *m* · reference number repeated |

**Controls:** each section has an **Edit** link (screen only, hidden in print) · **Print** button · **Download PDF** button.

**How to build it:** print CSS + `window.print()` gives both Print and the browser's native *Save as PDF* free — roughly a day, and it covers the demo and the candidate's own copy. Server-side PDF generation (a stored artefact that can be emailed or attached to the application record) is a later add if HPSEDC wants it on file — see §9.

Submit → application status `submitted`.

---

## 5. Applicant-side surfaces the rebuild does *not* touch (item 19)

The redesign replaces registration — but three candidate-facing surfaces survive it, and UAT-05 items land on them. They need an explicit pass or they will be reported again.

| Surface | What is wrong | Item |
|---|---|---|
| **References section** — [candidate-dashboard.tsx:3533](../../../hirestream-hp/client/src/pages/candidate-dashboard.tsx#L3533) | Placeholder reads *"Relationship (e.g. Manager at Infosys)"*. Registration never had a references section, so the rebuild does not clean this up | **19** |
| **Candidate dashboard pipeline** | The detailed recruitment pipeline shown to candidates | **20** |
| **Profile edit surface** (`/profile`, demoted from wizard) | Still renders every field; must inherit the new address shape, the HPBOSE fix, and the profession cards, or the portal has two disagreeing versions of the same data | 13, 17, 15 |

**Item 19 is half-fixed by accident.** Deleting the experience employer table removes the `"TCS, Infosys..."` placeholder at [profile-wizard.tsx:1128](../../../hirestream-hp/client/src/pages/profile-wizard.tsx#L1128) as a side effect of the redesign — but the references placeholder above is untouched by it. Item 19 says *"wherever they appear"*, so it needs the content sweep (proposal R1), not the rebuild.

---

## 6. Layout & screen width

The current flow caps every screen at **576px** (`max-w-xl`, [QuestionShell.tsx:34](../../../hirestream-hp/client/src/pages/simple-apply/QuestionShell.tsx#L34)). On a phone that is correct — a deliberate mobile-first, one-question-per-screen design. On the 1920px screen the portal was demonstrated on, it uses 30% of the width and leaves 70% white. Nobody made it responsive.

**The fix is responsive, not simply "wider"** — the narrow column must survive on a phone, because that is what 20,000 HP applicants will actually use.

| Breakpoint | Max width | Layout |
|---|---|---|
| Mobile (< 640px) | 576px (unchanged) | Single column — one field per row |
| Tablet (640–1024px) | ~768px | Single column, roomier |
| Desktop (> 1024px) | ~1100px | **Two-column** fields on page 1 · tile grid 4–5 across on page 2 · profession cards side by side on page 3 |

This matters beyond aesthetics: the demo, HPSEDC's own staff, and assisted registration at a facilitation centre are all desktop. The candidate is on a phone. One responsive shell serves both; today's serves one.

---

## 7. Stage 2 — page 5 · unlocked on `shortlisted`

Now there is a named vacancy. Prove pages 2 and 3.

### 7.1 Why conditionality lives *here*, not in registration

There are three dimensions on which a document requirement can depend:

| Dimension | Example | Known at registration? |
|---|---|---|
| **Profession** | Nurse → Council registration | ✅ yes — the candidate picked it on page 2 |
| **Country** | UK → IELTS · Saudi → trade test | ❌ no — item 8 removed the country question |
| **Vacancy** | *this* employer wants a 6G trade test | ❌ no — there is no job yet |

**Registration cannot be job-conditional, because at registration there is no job.** Pages 1–4 happen before the candidate has seen a vacancy, so profession-conditional is the only kind of conditionality they can have — and that is correct, not a gap.

Page 5 is different: it unlocks on shortlist, against a *named* vacancy. All three dimensions are known. So:

> **page 5 documents = generic ∪ profession ∪ country ∪ vacancy**

### 7.2 Generic (everyone shortlisted)

| Document | Notes |
|---|---|
| Passport scan (bio page) | |
| Identity proof | Aadhaar / Voter ID / Driving Licence |
| Experience certificate(s) | proves the months claimed on page 3 |
| Education certificate | proves page 3a |

**Also collected here:** emergency contact (deferred from page 1 — not printed on any document).

### 7.3 Profession dimension — from the config table

| Profession | Required documents |
|---|---|
| ★ Nurse | Nursing degree/diploma certificate · **Nursing Council registration certificate** |
| ★ Caregiver | Training certificate (if declared) · experience certificate |
| ★ Driver | **Driving licence scan** · badge/commercial licence (if declared) |
| ★ Electrician | **ITI / Diploma trade certificate** |
| ★ Welder | **ITI welding certificate** |

### 7.4 Country dimension — wiring up code that already exists

`COUNTRY_DOC_REQUIREMENTS` ([reference-data.ts:355](../../../hirestream-hp/client/src/lib/reference-data.ts#L355)) already encodes that the UK needs IELTS and CV, Saudi needs a trade test, the Gulf states need an education certificate. **It is dead code** — its only consumer is [job-detail.tsx:174](../../../hirestream-hp/client/src/pages/job-detail.tsx#L174), which *displays* the list. The server has never read it and nothing enforces it.

This dimension needs no new design, only wiring: move the table server-side into the same vocabulary as the profession config, and union it in.

### 7.5 Vacancy dimension — one new column

The `jobs` table today has matching criteria (`qualificationRequired`, `languagesRequired`, `requiredIeltsBand`, `requirements[]`, `skills[]`, `experience`) but **no required-documents column**. A vacancy cannot ask for anything.

Deliberately kept small: a job already carries `category` and `country`, so **most of its requirements derive** — `professionDocs(category) ∪ countryDocs(country)`. The new column only carries the genuine exception.

```
jobs
└── additional_required_docs[]    ["trade_test"]    ← optional, for exceptions only
```

One column, one multi-select on the Job Posting form, no rule engine. An employer who wants a 6G trade test on *this* welder vacancy ticks it; every other welder vacancy inherits the profession default.

Placed at **shortlist — before the employer interview** — so a false claim is caught before it burns an interview slot.

---

## 8. Stage 3 — page 6 · unlocked on `selected`

500 people, each holding an offer.

| Document | Notes |
|---|---|
| **PCC (Police Clearance Certificate)** | item 9 |
| **Medical fitness certificate** | item 9 |
| PDO completion | |
| PBBY insurance | |
| Emigration clearance (ECR) | |

Collected **fresh**, inside their validity window, once. This is the whole 20K:500 argument in one page.

---

## 9. What the config table looks like

The five add-on blocks are five rows. That is the entire "engine".

```
profession_requirements
├── profession_key          "nurse"
├── label                   "Nurse"
├── has_addon_block         true
├── qualifications[]        ["GNM", "B.Sc. Nursing", "Post Basic B.Sc. Nursing"]   ← any one of
├── addon_fields            (the block definition — §4, page 3b)
├── skills_enabled          true                                    ← admin toggle
├── skills_options[]        ["ICU", "OT", "Emergency", "Paediatric", ...]
├── required_docs[]         ["nursing_certificate", "nursing_council_registration"]
├── optional_docs[]         []
└── candidate_note          "You will need a valid Nursing Council registration."
```

The other 14 professions are rows with `has_addon_block = false`, `skills_enabled = true`, and their own `skills_options`.

**Admin screen:** a list of professions; click one; edit the qualification list, the skills list and its toggle, the document lists, and the note. No rule builder, no conditionals, no versioning. HPSEDC adds profession #20, or turns on a block for Mason, without a release — which is what their "Recommendation" line asked for.

---

## 10. UAT-05 coverage

**18 of the 21 items are applicant-side. All 18 are now spec'd here.**

| Item | Covered at |
|---|---|
| 1 · Email verification | §4 page 1c |
| 2 · Login → Profile Completion Form | **§4 page 0** ⚠️ interpretation to confirm |
| 3 · Simplify / consolidate | The whole design — 4 flows → 1, 14 screens → 4 pages |
| 4 · Passport mandatory + first | §4 page 1a ⚠️ escape hatch to confirm |
| 5 · Email + WhatsApp + Contact | §4 page 1c |
| 6 · "Other Languages" | §4 page 2 |
| 7 · Remove Pahari | §4 page 2 |
| 8 · Remove "Where do you want to work?" | §4 page 2 — deleted |
| 9 · PCC/Medical hidden until shortlist | §8 ⚠️ timing to confirm |
| 12 · Disability | §4 page 1b |
| 13 · District + State | §4 page 1d |
| 14 · "What skills do you have?" | §4 page 2 — settled |
| 15 · Multiple professions | §4 page 2, max 3 |
| 16 · "Home Town" | §4 page 1d |
| 17 · HPBOSE | §4 page 3a |
| 18 · Expand roles list | §3 ⚠️ list unsourced |
| 19 · Remove Infosys/TCS | **§5** — half by construction, half needs the content sweep |
| 21 · Profession-specific quals + docs | §3 · §4 page 3b · §7 · §9 |

**The 3 not covered here are not applicant-side:**

| Item | Why not here |
|---|---|
| 10 · Job Posting: fixed salary | Job Posting module — proposal R1 |
| 11 · Placed → vacancy hidden | Job listing logic — proposal R1 |
| 20 · Remove pipeline | **Straddles both.** Its Candidate Dashboard half is §5; its Job Posting half is proposal R1/R2 |

Items 10, 11 and 20 are scheduled in the proposal but have **no field-level spec** — the equivalent of this document for the Job Posting module does not exist yet. That is a gap in the paperwork, and item 20's scope question (§11.4) has to be answered before it can be written.

---

## 11. Open questions

1. ~~**Page 3 naming**~~ — **settled 16-07-2026:** item 14's wording, "What skills do you have?" (capability, not preference).
2. ~~**Aadhaar deferral**~~ — **settled 16-07-2026:** Aadhaar is on page 1. It costs the candidate nothing and is the identity key when there is no passport. The deferral principle is about *cost*, not field count.
3. ~~**Page count**~~ — **settled 16-07-2026:** four pages, identity+contact+address consolidated onto page 1 per item 3. Watch page-1 length in UAT; splitting address back out returns us to five.
4. **Item 2 — "before accessing other portal features"** (§4 page 0). Read literally it hard-gates the portal behind a completed profile. **Recommend the softer reading:** land on the form, allow browsing, block *applying*. A candidate who cannot see a vacancy has no reason to fill the form. HPSEDC to confirm.
5. **Item 20 — scope.** Candidate-facing only, we assume; HPSEDC and agency users still need pipeline tracking or shortlisting becomes impossible. **This blocks writing the Job Posting spec** (§10).
6. **Passport-first escape hatch** (proposal §6①) — hard-mandatory, or "I don't have one yet" with selection blocked? Policy call for HPSEDC.
5. **The 19-tile list needs validating** against real HP→Gulf deployment data and the eMigrate occupation taxonomy. Reasoned, not sourced.
6. **eMigrate interoperability** — if the official MEA system expects a specific occupation code, our profession keys must map to it. Unverified.
7. **ECR/ECNR on page 1** — proposed as optional with help text. Alternative: infer it from education (ECR applies below 10th pass) rather than ask. Inference is friendlier but risks being wrong on an emigration-critical field. Recommend asking.
8. **PDF export** — print CSS (~1 day, covers print + Save-as-PDF) now; server-side generated PDF stored against the application record if HPSEDC wants it on file. Which?
9. **Selection cap of 3** — confirm. Exposed as a setting either way.
10. ~~**Per-country requirements**~~ — **settled 16-07-2026:** in scope, at page 5. All three dimensions (profession ∪ country ∪ vacancy) union there, because that is the first point at which a vacancy exists. See §6.1. The country table already exists as dead client-side code and needs wiring, not designing.
11. **Item 9 timing** — proof at `shortlisted`, PCC/medical at `selected`. Confirm with HPSEDC.
12. **`jobs.additional_required_docs[]`** — new column + a multi-select on the Job Posting form (§6.5). Small, but it touches the job posting module, which items 10 and 20 are already changing. Worth doing in the same pass.
