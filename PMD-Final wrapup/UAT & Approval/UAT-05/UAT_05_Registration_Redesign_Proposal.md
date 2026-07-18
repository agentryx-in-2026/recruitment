# HireStream-HP · Registration Redesign Proposal

**Portal:** HireStream-HP (HPSEDC Overseas Placement)
**Raised by:** UAT-05 (demonstration 16-07-2026) — items 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15, 16, 17, 21
**Status:** Proposal for HPSEDC approval — no code changed yet
**Date:** 16-07-2026

---

## 1. The problem, in one number

> *"We get 20,000 applications and only 500 are selected. Why collect 20,000 applicants' documents when they are not needed until the candidate is selected?"* — HPSEDC, 16-07-2026

That ratio — **40 : 1** — is the single most important fact about this portal, and the current registration flow ignores it completely. Today every applicant is pushed toward the same finish line: a 100% profile that **requires an ID scan and a passport scan** before it will ever read "ready".

The cost of that decision, at 20,000 applicants:

| What we ask everyone for | Cost to 20,000 applicants | Cost if asked of 500 only |
|---|---|---|
| Document uploads (~5 files each) | ~100,000 files, ~200 GB | ~2,500 files, ~5 GB |
| HPSEDC verification actions (each file is manually verified) | ~100,000 staff actions | ~2,500 staff actions |
| **PCC** (Police Clearance) — ~₹500 + weeks of waiting | **₹1.0 crore of citizens' money** | ₹2.5 lakh |
| **Medical fitness** (GAMCA/approved centre) — ~₹1,500–3,000 | **₹3.0–6.0 crore of citizens' money** | ₹7.5–15 lakh |

**And here is the part that makes it worse than merely wasteful: PCC and medical fitness certificates expire.** A Gulf medical is typically valid ~3 months; a PCC ~6 months. A certificate collected at registration is *already stale* by the time that candidate is selected — so we would have to ask for it a second time anyway. We would be spending four to six crore rupees of applicants' money to collect paper that we then throw away.

This is why UAT-05 item 9 is right, and why it does not go far enough. The principle underneath it generalises.

---

## 2. The design principle

> **Ask for a piece of information at the stage where it first pays for itself — never earlier.**

Applied to this portal, that produces three distinct populations, each with a different appetite for effort:

| Stage | Who | Roughly | What they will tolerate | What we may ask for |
|---|---|---|---|---|
| **1 · Apply** | Anyone in Himachal who wants overseas work | 20,000 | ~4 minutes, on a phone, one-handed | **Typed claims only. Zero uploads.** |
| **2 · Verify** | Shortlisted against a real vacancy | ~2,000 | Real effort — there is a named job on the table | **Proof of the claims** (certificates, licence, passport scan) |
| **3 · Deploy** | Selected by the employer | 500 | Significant effort + money — they have the job | **PCC, medical, PDO, insurance** |

At stage 1 the candidate is a stranger with no job in prospect, so every field we add costs us applicants. At stage 3 the candidate has an overseas job in hand and will happily spend a day and ₹3,000 — the certificate has become *worth it to them*. Same request, completely different economics, purely because of when we make it.

The corollary matters just as much: **effort we spend on a candidate before shortlisting is effort spent 40 times over for every one placement.** That applies to HPSEDC's staff time as much as the candidate's money.

---

## 3. The proposed shape

### Stage 1 — Apply · 5 pages · ~4 minutes · no uploads

Everyone completes these. Nothing here needs a scanner, a fee, or a trip to an office.

**Page 1 — Who you are**
| Field | Note |
|---|---|
| **Passport number** | **First field, mandatory** — UAT-05 item 4. See §6 for the escape hatch we recommend. |
| Full name (as printed on passport) | |
| Date of birth | |
| Gender | |
| **Mobile number** | UAT-05 item 5 |
| **WhatsApp number** | with a "same as mobile" tick — item 5 |
| **Email ID + verification** | UAT-05 item 1 — verify before the candidate proceeds |

**Page 2 — Where you are from**
| Field | Note |
|---|---|
| **Home Town** | renamed from "Your Town" — item 16 |
| Permanent address: line 1, line 2, **District, State**, PIN | **District + State added** — item 13 |
| Correspondence address | with "same as permanent" tick — collapses to one tap for most |
| **Disability: Yes / No** → if Yes, *type of disability* | item 12 |

**Page 3 — What you can do**
| Field | Note |
|---|---|
| **"What skills do you have?"** — **multi-select** professions | items 14 + 15. Expanded list incl. Nurse, Driver, Caregiver, Welder, Electrician… — item 18 |
| Experience, in months, per selected profession | |
| Languages + proficiency | **"Other Languages"** free-text added (item 6); **"Pahari" removed** (item 7) |

**Page 4 — What you have studied**
| Field | Note |
|---|---|
| Highest qualification (+ board — **HPBOSE**, corrected from HPBSE — item 17) | |
| **Profession-specific qualifications** — shown *dynamically* based on page 3 | item 21, **declared as typed claims here**; proof comes at stage 2 |

This page is where item 21 first appears, and it is the highest-value screen in the flow. The moment a candidate ticks "Nurse" on page 3, page 4 tells them: *"For nursing jobs you will need a GNM / B.Sc. Nursing qualification and a Nursing Council registration. Do you have these?"* A candidate who does not have them now **self-selects out at page 4, for free**, instead of consuming a shortlisting slot and an HPSEDC review. This is how the 20,000 shrinks to a *qualified* 20,000 without us rejecting anyone by hand.

**Page 5 — Review & submit**
Plain-language summary of everything claimed, with edit links, plus an attestation: *"I confirm the above is true. I understand I will be asked to prove it if I am shortlisted."*

**Removed from stage 1 entirely:** *"Where do you want to work?"* (item 8). HPSEDC matches candidates to vacancies; the candidate applies to a specific job that already carries its country. Asking up front was a page that bought us nothing.

### Stage 2 — Verify · page 6 · unlocked on `shortlisted`

Appears only when HPSEDC shortlists the candidate against a vacancy. Now — and only now — we ask them to **prove the claims from pages 3 and 4**, and we ask for exactly what *this profession and this country* require (item 21):

- Passport scan (bio page)
- Qualification certificates for the claimed profession — e.g. **Nurse:** nursing diploma/degree **+ Nursing Council registration**; **Driver:** driving licence of the right class (+ badge/commercial licence); **Electrician:** ITI/Diploma in Electrician Trade; **Welder:** ITI welding certificate
- Experience certificates
- Identity proof

Deliberately placed at *shortlist*, **before** the employer interview — so a false claim is caught before it wastes an employer's interview slot, not after.

### Stage 3 — Deploy · page 7 · unlocked on `selected`

- **PCC (Police Clearance Certificate)** — item 9
- **Medical fitness certificate** — item 9
- PDO completion, PBBY insurance, emigration clearance

500 people, each holding a job offer, each with a live reason to move fast. Certificates are collected *fresh*, inside their validity window, exactly once.

---

## 4. What gets deleted

The flow is not just re-ordered — most of it goes away. This is the substance of UAT-05 item 3.

| Today | Proposed |
|---|---|
| `/start` — a tier chooser page (Standard / Professional / Assisted) | **Deleted.** Choosing how to register is not the candidate's problem to solve. |
| `/apply` — 10 screens (blue-collar) | **Merged** into the single 5-page flow |
| `/apply/pro` — 14 screens (professional) | **Merged.** One flow that adapts to the selected profession |
| `/profile` — 5-step legacy wizard, the only place with in-flow uploads | **Demoted** to an edit-only surface for an existing profile |
| `/documents` — 5 upload slots, shown to everyone | **Stage-gated** to pages 6 and 7 |
| **4 parallel flows, up to 14 screens + 6 uploads, ~25 min** | **1 flow, 5 pages, 0 uploads, ~4 min** |

**Why the tiers must go, specifically.** Two flows writing to one schema is where the defects breed — the Standard flow never asks for email, yet email is one of the ten completion checkpoints, so a blue-collar candidate who finishes `/apply` perfectly is mathematically incapable of reaching 100%. Only the Pro flow sets `profileComplete`. The two flows disagree on which languages exist. Every future change has to be made twice, and the second one is where it gets forgotten. One flow, with page 3's profession selection driving what pages 4–6 ask for, does everything the tiers did and cannot drift out of sync with itself.

**"Assisted" survives, but not as a tier.** The callback request ("I can't fill this in — call me") is a genuine lifeline for applicants who cannot use a form, and it stays — as a permanent *"Need help? Request a callback"* button on every page, not as a fork in the road at page zero.

---

## 5. What has to change underneath

Honest accounting — this is a rebuild, not a re-skin.

**Schema.** Address gains `district` + `state` on *both* permanent and correspondence (today the candidate has neither, on either — while an *agency*'s address has State; that inconsistency is what produced item 13). Add `whatsappNumber`, `disabilityStatus` + `disabilityType`, and promote professions to a proper multi-value relation.

**One document vocabulary.** There are currently **three, and they disagree**: the server's upload whitelist (8 types, no medical, no PCC), a client-side rules engine the server never consults, and a compliance checker that ignores the documents table altogether and reads status columns instead. Item 21 cannot be built on top of three disagreeing lists. One server-enforced vocabulary, one rules engine.

**The requirements engine (item 21).** A `profession_requirements` table — profession → required qualifications + required documents — with an **admin CRUD screen** so HPSEDC edits eligibility without a release, exactly as recommended in the email. Evaluated **server-side**, surfaced at page 4 (as a claim) and page 6 (as a proof).

**Completion, rewritten.** The current calculation demands an ID scan and a passport scan for 100%. That rule is the thing being reversed, so it splits in two: **"Application complete"** = pages 1–5, no documents; **"Deployment ready"** = documents, and only ever evaluated for stage 2/3 candidates. There are presently two drifted copies of this calculation (a 10-check version and an 8-check version) — they collapse into one shared function.

**Stage-gated visibility.** Pages 6 and 7 unlock off the application status (`shortlisted` → page 6, `selected` → page 7), which is what item 9 is really asking for. The compliance service already models a candidate-level document milestone; it simply is not wired to the application pipeline yet.

---

## 6. Risks and decisions we need from HPSEDC

**① Passport-first will cost applicants (item 4) — please confirm the trade-off.**
Passport number as the mandatory first field is the one part of this proposal that pushes *against* the 20K:500 logic. A passport is not needed to be shortlisted — only to be deployed — and passport penetration among blue-collar workers in HP is low. Made hard-mandatory at page 1, it will turn away applicants who would gladly get a passport once they knew a real job existed.

**Recommendation:** keep it as field one and strongly mandatory, but with one escape — *"I don't have a passport yet"* — which records the status, lets the candidate continue, shows them how to apply for one, and **blocks selection (not application)** until a number is supplied. HPSEDC gets the data quality and the seriousness filter; we do not lose an applicant at field one of page one. **If HPSEDC wants it absolutely mandatory with no escape, say so and we will build that** — it is a policy call, not a technical one.

**② Item 9 — "shortlisted/selected": which one?** This proposal splits them deliberately (proof at shortlist, PCC/medical at selection). Please confirm.

**③ Item 20 — removing the pipeline:** candidate-facing only, we assume. HPSEDC and agency users still need stage tracking internally, or shortlisting itself becomes impossible. Please confirm.

**④ Response-time SLA at stage 3.** Deferring PCC/medical to selection means a selected candidate must produce them quickly or the placement slips. We propose an SLA (e.g. 21 days) with automated reminders. HPSEDC to set the number.

**⑤ The initial profession master list.** We need the professions HPSEDC wants seeded, with their qualifications and documents, before go-live. We can seed the five from the email (Nurse, Driver, Electrician, Welder, Caregiver) and hand HPSEDC the admin screen for the rest.

---

## 7. Indicative timeline

HPSEDC asked for an estimate. Phased so there is something to test early rather than one long silence.

| Release | Contents | Est. |
|---|---|---|
| **R1 — Quick corrections** | Items 6, 7, 14, 16, 17, 19 (labels, language list, HPBOSE, remove Infosys/TCS) + items 10, 11 (fixed salary, hide placed vacancies) + the content audit sweep | **~1.5 weeks** |
| **R2 — The registration rebuild** | Stage 1 (pages 1–5), email verification, one merged flow, tier removal, schema changes — items 1, 2, 3, 4, 5, 8, 12, 13, 15, 18, 20 | **~3–4 weeks** |
| **R3 — Staged documents + eligibility engine** | Pages 6–7, stage gating, document-vocabulary unification, item 21 + admin CRUD — items 9, 21 | **~3–4 weeks** |
| | **Total, including testing and Hindi localisation** | **~8–10 weeks** |

R1 can be in HPSEDC's hands for testing while R2 is being built. R3 is the largest single piece of work in the list — item 21 with admin configurability is effectively a small product of its own, and it is the item most worth doing properly.

*These are engineering estimates for the work as scoped above. Decisions ① and ⑤ in §6 are on the critical path for R2 and R3 respectively.*

---

## 8. Summary

The current portal asks 20,000 people to do 500 people's work. The redesign asks each of the three populations for exactly what their stage justifies: **20,000 people type for four minutes; 2,000 shortlisted people prove what they typed; 500 selected people produce fresh certificates that are actually still valid when they matter.**

It absorbs 13 of the 21 UAT-05 items as a by-product of the restructure rather than as 13 separate patches, and it removes the parallel-flow architecture that is generating this class of defect in the first place.
