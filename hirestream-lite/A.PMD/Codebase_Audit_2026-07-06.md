# HireStream-HP — Codebase Audit (Fable, 2026-07-06)

> **STATUS (2026-07-07): REMEDIATED — portal frozen at v0.9.22 for UAT.**
> Batch 1 authz/IDOR → v0.9.10 · Batch 2 correctness C2–C17 → v0.9.12 · Batch 3
> i18n/a11y/dead-code → v0.9.13 · Batch 4 domain features (Smart Job Importer +
> compliance) → v0.9.14–v0.9.16. Dedicated security/VAPT pass (deps + OWASP) →
> v0.9.17–v0.9.18 (see `Security_Audit_OWASP_2026-07-07.md`). Every batch verified
> live on staging. Some Batch-4 items held by product decision (fee tracking dropped
> — no payments on portal; offer-letter QR + multi-slot interviews parked).


Read-only audit of `hirestream-hp` across three dimensions (backend/security/data-layer,
frontend/UX/i18n/a11y, product/domain). Findings are code-cited; **CONFIRMED** = the
auditor read the exact offending code, **PLAUSIBLE** = strong pattern evidence not fully traced.

Fix mode: confirmed bugs + safe quick-wins get fixed in reviewed batches with smoke+UI
testing; features are held for explicit approval. Nothing is pushed without OK.

---

## BATCH 1 — Security / authorization (do first)

| # | Sev | Finding | File | Fix |
|---|-----|---------|------|-----|
| S1 | **CRITICAL** | IDOR: any agent/employer can change ANY application's status (role-gated, no ownership check). The sibling `application.routes.ts:45` has the guard; this duplicate route missed it. | `server/routes/candidate.routes.ts:190-227` | Add job-ownership check (agent→job.agentId, employer→job.employerId) or delete route + point client at `PATCH /applications/:id/status`. |
| S2 | **HIGH** | Internal applicant notes readable by any authenticated user (GET has no role/ownership check; only `router.use(protect)`). | `server/routes/agent-productivity.routes.ts:37-49` | Gate to staff roles + verify job ownership. |
| S3 | **HIGH** | IDOR: any agent/employer can overwrite ANY candidate's compliance/passport data, skipping expiry validation. | `server/routes/agent-productivity.routes.ts:864-885` | Scope to caller's applicants (or admin-only) + reuse expiry validation. |
| S4 | **HIGH** | Mobile `/register` bypasses the self-registration capability gate the web route enforces → attacker self-registers as agent/employer on single-agency deployment. | `server/routes/mobile-auth.routes.ts:173-192` | Apply `SELF_REGISTER_CAPABILITY` gate. |
| S5 | **MEDIUM** | Public status `/check` OTP is `Math.random()`, no attempt cap, token not burned on wrong guess → brute-forceable PII. | `server/routes/public-status.routes.ts:21-91` | crypto OTP + cap failed attempts + burn token + rate-limit. |
| S6 | **MEDIUM** | Full candidate profiles incl. documents exposed to unrelated (foreign-company) employers. | `server/routes/agency.routes.ts:141-222` | Scope employer view to their applicants; strip document/passport fields. |
| S7 | LOW | Notes POST lacks application ownership (any agent/employer can note + @mention on any app). | `server/routes/agent-productivity.routes.ts:51-88` | Same ownership helper as S1/S3. |
| S8 | LOW | Profile PATCH writes `username` outside Zod validation (mass-assignment, no uniqueness/format check). | `server/routes/candidate.routes.ts:89-92` | Validate username (length + uniqueness) or move into schema. |

**Notably solid (checked, no issue):** session/cookie config, bcrypt-12, single-use reset
tokens, magic-byte upload checks, path-traversal guard, employer `employerOwnsJob` helper,
grievance thread access control, SQL-console allow-list. The known drizzle `= ANY(array)`
landmine is worked around (`inArray` used); no remaining array-template usages found.

---

## BATCH 2 — Correctness bugs & broken flows (frontend + backend)

| # | Sev | Finding | File | Fix |
|---|-----|---------|------|-----|
| C1 | HIGH | "Report fraud" footer link on all 10 apply screens 404s: `/grievance?type=fraud` vs route `/grievances`. | `client/.../simple-apply/QuestionShell.tsx:81` | Fix href + use wouter nav. |
| C2 | HIGH | Hard refresh mid-registration kicks logged-in users out (redirect fires before `isLoading` resolves). | `register-start.tsx:61`, `simple-apply.tsx:66`, `simple-apply-pro.tsx:98` | Guard `if (!isLoading && !user)`. |
| C3 | HIGH | Profile wizard silently discards typed data on step-pill nav (AnimatePresence unmounts unsaved local state). | `pages/profile-wizard.tsx:152,173` | Auto-save/confirm before pill nav, or lift state to draft. |
| C4 | MEDIUM | Duplicate applications race: read-then-insert, no DB unique constraint on `(candidateId, jobId)`. | `server/routes/job.routes.ts:948-986` + schema | Add unique index + handle conflict. |
| C5 | MEDIUM | Drive broadcast notifies EVERY applicant incl. rejected (dead filter `String(a.appId ? "" : "")`). | `server/routes/drive.routes.ts:303-322` | Add real status predicate, remove dead block. |
| C6 | MEDIUM | Document delete reports success even on server failure; icon-only, no confirm, no aria-label. | `pages/documents.tsx:60-66,123` | Check `res.ok`, add confirm + aria-label. |
| C7 | MEDIUM | `fetchJson` swallows all errors → transient 500 renders as permanent empty state (staleTime Infinity, retry false). | `candidate-dashboard.tsx:28`, `grievance-page.tsx:16`, `help.tsx:15` | Throw on !ok, render retry state. |
| C8 | MEDIUM | Reschedule modal reads response body twice (`(await r.json())…||(await r.json())`) → "body already read". | `components/shared/RescheduleResponseModal.tsx:49` | Read once into a variable. |
| C9 | MEDIUM | Virtual interview schedulable with no meeting link despite required marker. | `components/shared/ScheduleInterviewModal.tsx:119,146` | Include link in disabled condition. |
| C10 | MEDIUM | Stale caches after mutations: agent funnel key never invalidated; drive reject doesn't invalidate dashboard; `invalidateQueries({})` refetches whole cache. | `agent-dashboard.tsx:1222`, `admin-dashboard.tsx:2701`, `agent-candidate-detail.tsx:437+` | Invalidate specific keys. |
| C11 | MEDIUM | Simple-apply prefill effect can overwrite in-progress answers after each save (PLAUSIBLE). | `pages/simple-apply.tsx:70-87` | One-shot prefill via ref guard. |
| C12 | MEDIUM | Language add/remove in simple-apply fails silently (no `res.ok` check) → hard stall on language step. | `pages/simple-apply.tsx:253-264` | Check `res.ok` + toast. |
| C13 | MEDIUM | Fake CAPTCHA is a `div onClick` — keyboard users can't check it, so can't sign in (submit gated on it). | `pages/auth-page.tsx:257-276` | Real `<button role="checkbox">` (or real CAPTCHA if T6 needs). |
| C14 | MEDIUM | SQL-console statement-timeout is a no-op (SET LOCAL outside a txn). | `server/routes/superadmin-ops-system.routes.ts:250` | Wrap set-timeout + query in one transaction. |
| C15 | LOW | Forgot-password gives no feedback on 429/500. | `pages/auth-page.tsx:306-309` | Add else branch surfacing error. |
| C16 | LOW | Superadmin "View audit log" opens raw JSON in a new tab. | `pages/superadmin-dashboard.tsx:568` | Navigate to in-app Audit tab pre-filtered. |
| C17 | LOW | Unbounded/relationship-free agency reviews → rating manipulation. | `server/routes/agency.routes.ts:246-278` | One review per candidate/agency + require prior relationship. |

---

## BATCH 3 — i18n coverage (bilingual mandate) & accessibility

- **en/hi structural parity is PERFECT** (739 keys each, zero missing either way). The gap is **coverage**: keys that exist in both locales but are bypassed by hardcoded English.
- **Free re-wires (translations already written):** grievance form (`grievance-page.tsx` — `grievance.submitGrievance/category/subject/…`) and auth page (`auth-page.tsx` — `auth.email/password/forgotPassword/…`).
- **New namespaces needed (citizen-facing first):** profile-wizard, public status-check (rural families, zero i18n), notifications drawer (incl. "just now"/"m ago"), job/application detail, 404 page, maintenance/lockdown presets (`system-controls.tsx:35-53`, shown portal-wide), advanced candidate-dashboard chrome. Admin/agent/employer consoles last.
- **Global mutation-error toast** (`lib/queryClient.ts:69-74`) hardcoded English → `i18n.t(...)`.
- **a11y batch:** unlabeled icon-only controls (hamburger `header.tsx:211`, star ratings `agent-drive-detail.tsx:488`, password toggles `auth-page.tsx:244,506`, dismiss `superadmin-dashboard.tsx:909`, doc delete, lang-chip remove) + unassociated Create-User labels (`superadmin-dashboard.tsx:639-658`).
- **Browse Jobs / My Applications** are desktop-only two-pane (`candidate-dashboard.tsx:972,1549`, fixed `w-[400px]`, no breakpoints) — blue-collar minimal-mode users are routed here; broken on phones + hardcoded English.

**Quick-win dead code to delete:** `candidate-dashboard-simple.tsx` (295 lines, unused),
`components/candidate/candidate-profile-form.tsx` (639, unused), `notifications-popover.tsx`
(128, superseded), `lib/draft-storage.ts` (unwired), dead imports `ApplicantManager`,
`AgencyApprovalList`, unused `InitialsAvatar`; "Salary" sort comparator returns 0 (`job-search-board.tsx:72`).

---

## BATCH 4 — Domain features (HELD for approval — overseas-placement / MEA)

**Top 5 recommended:**
1. **Document/credential expiry alerting** (passport/PCC/medical/MEA-license crons). Fields exist; no cron. #1 cause of visa-stage collapse. — M
2. **Enforce expired MEA RA license** — an agency whose license lapsed can still post jobs/issue offers (illegal under Emigration Act). Gate `POST /jobs` + requisition pickup. — S
3. **Candidate document verification workflow** — `documents.verified/verifiedBy` are dead schema (zero writers); agents shortlist unattested passports. Add PATCH verify + badges. — S/M
4. **Emigration-clearance (eMigrate/PoE) step for ECR candidates** — `ecrStatus` captured, never consumed; ECR worker to ECR country without PoE is unlawful. Add `isEcrCountry` + checklist item. — M
5. **Grievance SLA-aging cron + real escalation** — `slaDaysForCategory()` exists ("future cron"); "escalated" is a dead status string. Copy welfare-SLA monitor template. — S

**Backlog:** agent service-fee declaration/receipts/refund tracking (fee-fraud #1 abuse, Emigration-Act fee cap); emergency contact / next-of-kin (PBBY nominee); public offer-letter authenticity verifier (QR on status-check chassis); language-aware notifications/SMS (`preferredLanguage` ignored); enforce `rejectedCountries` at apply time; offer-acceptance deadline / stale-offer expiry; passport 6-month-validity rule; placement `active`/`completed` lifecycle tail (unreachable); PDO/PBBY gating for ECR; block accept with no appointment letter; proactive 30/60/90 welfare prompts to worker; eMigrate-aligned MEA reporting export; multi-slot interview offers.

**Verified present (not missing):** pre-departure tracker, country cards w/ embassy contacts,
public family status check, fraud-report grievance routing, welfare SLA monitor, employer+agency
KYB, drives, withdraw, offer-decline, 2FA, audit log on transitions, config knobs.
