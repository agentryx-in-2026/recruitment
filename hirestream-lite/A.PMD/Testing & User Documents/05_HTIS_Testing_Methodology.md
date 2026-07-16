# HireStream — HTIS Testing Methodology

**For:** HTIS Testing Team
**Project:** HPSEDC Overseas Placement Portal
**Build under test:** v0.9.7
**Prepared:** 2026-04-22

---

## 1 · Scope and objective

HTIS is asked to validate the **main FRS scope** (Sections 1 – 10 of the signed FRS) against the live staging deployment. Beyond-FRS enhancements (v1.5 Extras project on Verify) are out of scope for this pass and should be flagged only if they obstruct a core FRS flow.

Two coupled web portals are involved:

| Portal | Purpose | URL |
|---|---|---|
| **HireStream** | The application under test — the HPSEDC Overseas Placement Portal itself. | https://hirestream-stg.agentryx.dev |
| **Agentryx Verify** | The compliance matrix portal where you record pass / partial / fail against each FRS item. | https://verify-stg.agentryx.dev |

Test every flow in HireStream first, then record the verdict in Verify. One FRS requirement → one signoff row. No separate spreadsheet.

---

## 2 · Testing environment

- **Database**: fresh staging data, seeded with 6 candidates, 4 agents, 1 employer, 1 admin, 1 superadmin, 15 countries and ~20 jobs. Safe to click Reset / Delete on seeded rows — the DB is reseedable.
- **Email gateway**: SMTP2GO (free tier, 1,000 mails / month). Real emails are delivered. Use an inbox you can check for OTP / reset / notification mails.
- **SMS gateway**: Twilio trial. SMS is sent only to numbers pre-verified on the Twilio account. For non-verified numbers the SMS is logged but not delivered — this is expected.
- **Browser support**: Chrome 120+, Safari 17+, Firefox 120+, Edge 120+. Test on desktop and mobile viewport (Chrome DevTools → Toggle device toolbar).
- **Uploads**: 10 MB per file. JPG / PNG / PDF only. Magic-byte verified server-side — renaming `virus.exe` to `photo.jpg` will be rejected.

---

## 3 · What you can test without logging in

The home page and a handful of public pages are reachable without an account. Start here to verify the portal is reachable before signing in.

| Feature | URL |
|---|---|
| Landing page + FRS summary | `/` |
| FAQ | `/faq` |
| Public grievance filing (PGRS) | `/grievances` |
| Public job listings | `/jobs` |
| Job detail (read-only preview) | `/jobs/:id` |
| Agency public page | `/agencies/:id` |
| Case / status check (by reference) | `/status-check` |
| Login / Register page | `/auth` |

Everything beyond — applying for a job, uploading documents, scheduling an interview, approving an agency — requires an authenticated role.

---

## 4 · Seeded test accounts

All seeded users share password **`test123`** except the superadmin.

| Role | Username | Notes |
|---|---|---|
| Superadmin | `superadmin` | password **`hpsedc@super2026`**. Use rarely. |
| Admin | `demo_admin` | Admin dashboard, integrations, audit log. |
| Employer | `demo_employer` | Post requisitions, review applicants, approve placements. |
| Agent | `europe_careers` | **Verified** agent. Use this for most agent flows. |
| Agent | `demo_agent`, `gulf_jobs_direct`, `japan_pathways` | Additional agents for multi-agency flows. |
| Candidate | `priya_verma` | 100 % complete profile + accepted placement. |
| Candidate | `meera_iyer` | 88 % profile, missing documents. Use for "profile gaps" tests. |
| Candidate | `demo_candidate`, `rohan_mehta`, `vikram_negi`, `ananya_bhatt` | Additional candidates. |

Sign in at `https://hirestream-stg.agentryx.dev/auth`.

---

## 5 · Creating your own accounts

Some FRS items (registration flow, OTP, first-time onboarding) require a fresh account. You can create them yourself — no admin request needed for candidate or employer self-signup.

**Candidate self-registration** — `/auth` → Register tab → Role = *Candidate*. OTP is delivered to the email you enter. Free to create as many test candidates as you need; use `+` addressing (e.g. `htis+test1@yourdomain.com`) so they route to one inbox.

**Agent registration** — `/auth` → Register → Role = *Agent*. Agent accounts are created **unverified**. Sign in as `demo_admin` → Agencies → Verify to mark them verified before they can pick up requisitions.

**Employer registration** — `/auth` → Register → Role = *Employer*. Employer accounts are usable immediately.

**Admin / superadmin accounts cannot be self-created.** If HTIS needs an additional admin account, raise it via the escalation path (§8) and Agentryx will seed one.

---

## 6 · Recommended test order — main FRS scope

Follow this sequence. Each block is self-contained and builds on data created in the previous block.

1. **Auth & profile (FRS §1.1 – §1.10)** — register candidate → verify email OTP → complete profile → upload passport + CV → check profile completion bar moves to 100 %.
2. **Agent verification (FRS §2.1 – §2.3)** — register agent → log in as `demo_admin` → Agencies → Verify → confirm the agent now shows as verified.
3. **Employer → requisition (FRS §3.1 – §3.4)** — log in as `demo_employer` → Post requisition → save as draft → publish → confirm it appears in the agent "Available requisitions" list, **not** in the candidate "Jobs" list.
4. **Agent pickup + derivative job (FRS §2.4 – §2.6)** — log in as `europe_careers` → pick up the requisition → confirm a new derivative job appears under "My Jobs" and in the candidate public `/jobs` list.
5. **Candidate apply → shortlist → interview → placement (FRS §1.11 – §1.19, §2.7 – §2.10)** — apply as candidate → agent reviews → shortlist → schedule interview → employer approves → agent creates placement → candidate accepts offer.
6. **Welfare & post-placement (FRS §2.11 – §2.15)** — check welfare tab, grievance raise, status check by reference.
7. **Notifications (FRS §1.20 – §1.28, §9.x)** — see companion document `Notifications_Test_Plan_for_HTIS.html` for the full 34-template test matrix.
8. **Admin & audit (FRS §4.x, §10.x)** — log in as `demo_admin` → Dashboard metrics, System Controls, Audit Log, Integrations toggle (requires password re-auth).

Skip Section 11+ (Beyond-FRS) for this pass.

---

## 7 · Recording results in the Verify module

Agentryx Verify is the compliance matrix portal — the single source of truth for what has been tested and by whom.

**Login** — go to https://verify-stg.agentryx.dev/login, username **`htis`**, password **`test123`**.

**Pick the right project** — two projects are listed:

- `hirestream-v1.4` — **HPSEDC Overseas Placement Portal** (144 items, main FRS). **This is the only project HTIS needs to review for this pass.**
- `hirestream-v1.5-extras` — Beyond-FRS enhancements. Ignore for now.

**How a signoff works** — each FRS requirement is one row. Click the row to expand. You will see:

- **Description / expected result / test steps** — what to test.
- **Evidence** — what the Agentryx team has delivered and how to find it in the portal.
- **Your signoff cell (HTIS column)** — click **Pass / Partial / Fail / Waived**, add a comment, attach a screenshot if needed (clipboard paste or drag-drop both work, up to 10 MB).

Partial and Fail require a comment. Pass doesn't, but a one-line confirmation ("verified as priya_verma — offer acceptance email received") is appreciated.

**Re-verify badges** — if a row shows a 🔁 *re-verify* chip in your signoff cell, a fix has shipped since you last rejected the item. Re-test against the new build (shown in the project header) and update the signoff.

**Ideas & Feedback** — enhancement requests and UX suggestions go into the **"💡 Suggest an idea"** inbox on the project view. These are triaged separately and do not block signoffs.

---

## 8 · Escalation path

- **Blocker bug (test cannot proceed)** — mark the Verify row **Fail**, include reproduction steps, and email Agentryx delivery at the address on file. Same-day turnaround.
- **Portal is unreachable / 500 errors** — contact Agentryx delivery directly; do not log it as a per-item failure.
- **Question about FRS interpretation** — leave a comment on the Verify row and flag as **Partial** with "awaiting interpretation". Delivery will respond in thread.
- **Ideas / enhancements out of FRS scope** — use the Verify *Ideas & Feedback* inbox, not the signoff cell.

---

**End of methodology.** Read the companion document `Notifications_Test_Plan_for_HTIS.html` for the full notification test matrix.
