# HireStream — Notifications & Communications Test Plan

**Document purpose**  Test checklist for HTIS reviewers to verify every in-app / email / SMS notification the portal currently sends. Maps to FRS §1.20 – §1.28, §9.1 – §9.7, §10.x, §13.10.

**Build ref**  v0.9.7 · **Portal**  https://hirestream-stg.agentryx.dev · **Verify**  https://verify-stg.agentryx.dev · **Generated**  2026-04-22

---

## 1. Architecture at a glance

```
   business event
         │
         ▼
   notify()            ← single entry point (server/services/notification.service.ts)
         │
         ├── in-app row in  notifications  table  (bell icon + drawer)
         ├── email via SMTP2GO  (if user.notifyEmail ≠ false AND user.email set)
         └── SMS  via Twilio    (if user.notifySms   ≠ false AND user.phone set)
```

- **Single dispatcher**. Each business event calls `notify()` once; fan-out to channels is decided by user preference, not by event type.
- **34 templates** live in `notification-templates.seed.ts`. Admin can edit wording and add Hindi translations at runtime via **Admin → Notification Templates** without a deploy.
- **OTP** (`POST /auth/send-otp`) and **password reset** (`POST /auth/request-password-reset`) bypass `notify()` and call `sendEmail()` / `sendSms()` directly — they aren't stored as in-app rows.

### Gateway status at time of test plan

| Gateway | Provider | Configured | Last tested |
|---|---|---|---|
| SMTP | SMTP2GO (1 000 / month free) | ✅ | Real send verified to external inbox |
| SMS  | Twilio (trial)               | ✅ | Handshake passed |

**Toggle gate**  Enabling or disabling either gateway requires the admin's password; every flip writes an `audit_log` row. Tested from `Admin → Integrations`.

---

## 2. How to run this test plan

1. Sign in with the credential row from the role section you want to test (§5–§8 below).
2. Perform the **Trigger action**.
3. Within 10 seconds, check each expected channel:
   - **In-app**  bell icon badge increments; notification drawer shows it
   - **Email**  arrives in the inbox of the logged-in user's `email` field
   - **SMS**  arrives on the logged-in user's `phone` field (must be a Twilio-verified number during trial)
4. Tick ✅ or ✗ in the right-most column.
5. On ✗, capture a screenshot and attach via the Verify sign-off screen for that FRS item.

**User preferences**  Every user row has `notifyInApp / notifyEmail / notifySms` boolean columns (default all `true`). A user can suppress any channel from their profile. **Tests assume defaults — don't disable anything before running.**

---

## 3. Test accounts

| Role | Username | Password | Notes |
|---|---|---|---|
| Admin | `demo_admin` | `test123` | |
| Superadmin | `superadmin` | `hpsedc@super2026` | |
| Employer | `demo_employer` | `test123` | |
| Agent (verified) | `europe_careers` | `test123` | Picked up demo requisitions |
| Agent (other) | `gulf_jobs_direct` | `test123` | For multi-agent scenarios |
| Candidate (100 %) | `priya_verma` | `test123` | Has placement + offer pending |
| Candidate (88 %) | `meera_iyer` | `test123` | Missing docs, ECR incomplete |
| Candidate (misc) | `rohan_mehta` / `vikram_negi` / `ananya_bhatt` / `arjun_sharma` | `test123` | |

**Important for SMS**  Twilio is on a trial account. SMS will only deliver to phone numbers added to **Phone Numbers → Verified Caller IDs** in the Twilio Console. Add the tester's mobile there before running §5 SMS rows.

---

## 4. Test channel legend

| Symbol | Meaning |
|---|---|
| 📱 | In-app notification (bell drawer) |
| ✉ | Email via SMTP2GO |
| 💬 | SMS via Twilio |
| 🔑 | Bypasses `notify()` — sent directly |
| — | Channel not used for this event |

---

\pagebreak

## 5. Candidate role — 15 events

| # | Event | Trigger action | 📱 | ✉ | 💬 | FRS | Pass |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| C-01 | Registration welcome | Sign up a new candidate via `/auth` | ✓ | ✓ | ✓ | 1.19 | ☐ |
| C-02 | OTP for login (email + SMS) | `/auth/send-otp` with phone filled | — 🔑 | ✓ | ✓ | 1.20 / 1.21 / 13.10 | ☐ |
| C-03 | Password reset link | Click "Forgot password" on login | — 🔑 | ✓ | — | 1.20 / 8.x | ☐ |
| C-04 | Application submitted | Apply to any public job as `priya_verma` | ✓ | ✓ | ✓ | 1.24 | ☐ |
| C-05 | Application reviewed | Agent moves it to `reviewed` status | ✓ | ✓ | — | 1.24 | ☐ |
| C-06 | Application shortlisted | Agent moves it to `shortlisted` | ✓ | ✓ | — | 1.24 | ☐ |
| C-07 | Employer approved for interview | Employer clicks "Approve for interview" in Review Queue | ✓ | ✓ | — | 1.24 | ☐ |
| C-08 | Interview scheduled | Agent schedules interview on a shortlisted app | ✓ | ✓ | ✓ | **1.23** | ☐ |
| C-09 | Interview completed (decision pending) | Agent records interview result | ✓ | — | — | 1.24 | ☐ |
| C-10 | Selected (offer coming) | Employer marks candidate `selected` | ✓ | ✓ | — | 1.24 | ☐ |
| C-11 | Offer issued (appointment letter) | Agent creates placement → issues appointment letter | ✓ | ✓ | ✓ | **1.26 / 1.28** | ☐ |
| C-12 | Offer accepted confirmation | Candidate clicks Accept on offer banner | ✓ | ✓ | — | 1.26 | ☐ |
| C-13 | Offer declined ack | Candidate clicks Decline with reason | ✓ | — | — | 1.27 | ☐ |
| C-14 | Application rejected (employer-name scrubbed) | Agent or employer rejects candidate | ✓ | ✓ | — | **5.x (scrub)** / 1.24 | ☐ |
| C-15 | Drive announcement | Agent clicks "Notify candidates" on approved drive | ✓ | ✓ | ✓ | **1.22** | ☐ |
| C-16 | Saved-search digest (daily cron) | Trigger `/admin/lifecycle/run` or wait for 07:30 UTC | ✓ | ✓ | — | **1.20** | ☐ |
| C-17 | Grievance status update | Admin changes grievance to `resolved` | ✓ | ✓ | — | 10.x | ☐ |

**Scrubbing test (C-14)**  Open the notification body — the employer's company name **must not** appear. Copy expected: *"Your application was not selected this round."* — never *"Rejected by Tech Solutions Canada Inc."*

---

## 6. Agent role — 11 events

| # | Event | Trigger action | 📱 | ✉ | 💬 | FRS | Pass |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| A-01 | New applicant on my job | A candidate applies to a job the agent picked up | ✓ | ✓ | ✓ | 2.12 | ☐ |
| A-02 | Employer approved my shortlist | Login as employer → Approve for Interview | ✓ | ✓ | — | 2.12 | ☐ |
| A-03 | Employer requested replacement | Employer clicks "Request replacement" | ✓ | ✓ | — | 2.12 | ☐ |
| A-04 | Employer requesting more candidates | Employer clicks "Request more candidates" | ✓ | ✓ | — | 2.12 | ☐ |
| A-05 | Drive approved | Admin approves a pending drive | ✓ | ✓ | — | 2.13 | ☐ |
| A-06 | Drive rejected | Admin rejects with reason | ✓ | ✓ | — | 2.13 | ☐ |
| A-07 | Candidate accepted offer | Candidate accepts placement | ✓ | ✓ | — | 2.14 | ☐ |
| A-08 | Candidate declined offer | Candidate declines placement | ✓ | — | — | 2.14 | ☐ |
| A-09 | Auto-close nudge | Trigger `/admin/lifecycle/run` with a job 3 days before deadline | ✓ | — | — | 7.11 (PWS) | ☐ |
| A-10 | Agency registration rejected | Admin rejects via Agencies tab | ✓ | ✓ | — | 2.1 | ☐ |
| A-11 | @Mention on candidate note | Agent A adds `@AgentB` in a note | ✓ | — | — | — | ☐ |

---

## 7. Employer role — 7 events

| # | Event | Trigger action | 📱 | ✉ | 💬 | FRS | Pass |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| E-01 | Shortlisted candidate arrived in Review Queue | Agent shortlists a candidate on a derivative of employer's requisition | ✓ | ✓ | — | 3.2 | ☐ |
| E-02 | Interview scheduled by agent | Agent schedules interview | ✓ | — | — | 3.3 | ☐ |
| E-03 | Interview completed — your decision pending | Agent marks interview result | ✓ | — | — | 3.4 | ☐ |
| E-04 | Offer issued copy | Agent issues appointment letter | ✓ | — | — | 3.5 | ☐ |
| E-05 | Offer accepted by candidate | Candidate clicks Accept | ✓ | ✓ | — | 3.6 | ☐ |
| E-06 | Offer declined by candidate | Candidate clicks Decline | ✓ | — | — | 3.6 | ☐ |
| E-07 | Agent picked up your requisition | Any verified agent clicks Pick Up on the requisition | ✓ | — | — | 3.1 | ☐ |

---

## 8. Admin / Officer role — 4 events

| # | Event | Trigger action | 📱 | ✉ | 💬 | FRS | Pass |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| O-01 | Integration toggled (audit) | Toggle SMS / Email gateway enabled flag | — | — | — | 6.x | ☐ |
| O-02 | Pending verifications count | Register a new agency → count increments on Overview | ✓ | — | — | 4.11 | ☐ |
| O-03 | Open grievances count | Candidate submits grievance → count increments | ✓ | — | — | 4.16 | ☐ |
| O-04 | Drive approval queue | Agent creates a drive → "Drive Approvals" widget fires | ✓ | — | — | 4.x | ☐ |

**Note**  Admin role is intentionally light on notifications — the dashboard widgets (Pending Verifications, Drive Approvals, Open Grievances) surface items visually rather than via inbox. Confirm the counts update live — no page refresh required.

---

\pagebreak

## 9. OTP & password-reset deep dive (FRS 1.20 / 1.21 / 13.10)

### 9.1 OTP for registration / login

**Route**  `POST /api/v1/auth/send-otp` body `{ email, phone?, purpose: "register"|"login"|"password_reset" }`

| Input scenario | Email sent | SMS sent | Response |
|---|---|---|---|
| `email` only | ✓ SMTP2GO | — | 200 OK |
| `email` + `phone` | ✓ SMTP2GO | ✓ Twilio | 200 OK |
| `phone` only | — | ✓ Twilio | 200 OK |
| Invalid email | — | — | 400 "Invalid email" |
| Rate-limited (> 3 per 10 min) | — | — | 429 |

**OTP format**  6-digit numeric, expires in 10 minutes. Single-use. Stored hashed in `otp_codes` table — raw value never persisted. Email subject: *"HireStream - Your verification code is <OTP>"*. SMS body: *"HireStream OTP: <OTP>. Valid 10 min."*

### 9.2 Password reset

**Route**  `POST /api/v1/auth/request-password-reset` body `{ email }`

- Generates a signed reset token (crypto.randomBytes(32), stored in `password_reset_tokens`)
- Sends email only via SMTP2GO with a link: `https://hirestream-stg.agentryx.dev/reset-password?token=<token>`
- Token expires in 60 minutes. Single-use.
- **Does not send SMS** — FRS-intended behaviour (reset links via SMS are anti-pattern).

**Reset completion**  `POST /api/v1/auth/reset-password` body `{ token, password }`

- After successful reset: all OTHER sessions for the user are killed (CWE-613). A user-facing audit-log row is written.
- **No follow-up notification is sent today.** Consider adding one if HTIS flags it.

### 9.3 Password change while logged in

**Route**  `POST /api/v1/auth/change-password` body `{ currentPassword, newPassword }`

- Verifies current password, updates hash, regenerates session (CWE-384), kills other sessions.
- **No notification sent.** Audit-log only.

---

## 10. Template catalogue (admin-editable)

All 34 templates are stored in `notification_templates` (DB) and seeded from `notification-templates.seed.ts`. Admin → Notification Templates lists them all. Edit any template's `title` / `body` and the change takes effect on the **next** notification — no restart. Hindi translations go in the same row.

| Template key | Role | Channel default |
|---|---|:-:|
| `application.submitted` | candidate, agent | 📱 |
| `application.reviewed` | candidate | 📱 |
| `application.shortlisted` | candidate, employer | 📱 ✉ (emp) |
| `application.employer_approved` | candidate, agent | 📱 |
| `application.rejected` | candidate | 📱 |
| `application.employer_rejected` | candidate, agent | 📱 |
| `interview.scheduled` | candidate, employer | 📱 ✉ (cand) |
| `interview.completed` | candidate, agent, employer | 📱 |
| `application.selected` | candidate, agent | 📱 ✉ (cand) |
| `offer.issued` | candidate, agent, employer | 📱 ✉ (cand) |
| `offer.accepted` | candidate, agent, employer | 📱 ✉ all |
| `offer.declined` | candidate, agent, employer | 📱 |
| `job.closed` | candidate, agent, employer | 📱 |
| `job.auto_close_nudge` | agent, employer | 📱 |
| `requisition.picked_up` | employer | 📱 |
| `job.matches_your_profile` | candidate | 📱 (digest email separate) |
| `drive.announcement` | candidate | 📱 ✉ 💬 |

**Employer-name scrubbing rule** — For any candidate-facing NEGATIVE event (`application.rejected`, `application.employer_rejected`, `job.closed`), the employer's company name must be substituted with *"the employer"* or *"this opportunity"*. Controlled by system setting `notifications.hide_employer_in_negatives` (default `true`, FRS §5).

---

\pagebreak

## 11. Expected wording — spot-check list

Test the exact subject lines + body snippets on these 5 high-visibility events. Copy deviations are admin-editable, so confirm what's currently seeded matches what HTIS expects:

| Event | Subject line | Key body phrases |
|---|---|---|
| C-01 Welcome | *"HireStream — welcome, &lt;name&gt;"* | "Complete your profile to get started" |
| C-02 OTP email | *"HireStream - Your verification code is &lt;OTP&gt;"* | "expires in 5 minutes" — wait, should be 10 min, confirm |
| C-08 Interview scheduled | *"Interview scheduled for &lt;job&gt; on &lt;date&gt;"* | Includes date, mode (in-person / video), location |
| C-11 Offer issued | *"Your appointment letter is ready"* | Link to download letter, acceptance deadline |
| C-14 Application rejected | *"Application not advancing"* | **No employer name** — flag as fail if present |

**OTP expiry mismatch**  If the email says 5 minutes but the backend actually honours 10 minutes (or vice versa), that's a copy-vs-code drift worth logging. Confirm on first OTP.

---

## 12. User-preference toggles (FRS §8)

Every user row carries:

- `notifyInApp` (default `true`) — can disable via self-profile → Notifications tab
- `notifyEmail` (default `true`) — same
- `notifySms`   (default `true`) — same

**Test**

| Step | Expected |
|---|---|
| Log in as `priya_verma`, Profile → Notifications → uncheck "Email notifications" | Preference saved |
| Trigger C-05 (application reviewed) | 📱 arrives, ✉ does **not** arrive |
| Re-enable email preference | Revert |

---

## 13. Known gaps / out-of-scope for this test

| Item | Note |
|---|---|
| Welfare check-in reminders (FRS §2.7) — 30 / 60 / 90 day | UI badge exists on placements; auto-fire notification **not wired yet**. Flag as gap, not fail. |
| SMS routing might be too chatty | Currently every candidate notification with user opted-in to SMS goes via SMS. FRS §1.21 intent is critical alerts only — we plan to filter to OTP / interview / offer / placement. If HTIS finds SMS noise, flag C-05/C-06/C-07 rows. |
| Password-reset follow-up notification | Not sent today. Confirm whether HTIS wants one. |
| DigiLocker delivery of appointment letter | PDF download works; DigiLocker API integration deferred (FRS 1.28 ⛔). |
| Aadhaar / HIM Access SSO triggered notifications | Framework shipped, credentials pending. Not testable on staging yet. |

---

## 14. Escalation / issue reporting

Any failing row in §5 – §8 — capture:

1. Screenshot of the expected channel showing nothing received
2. The notification's event ID from the "#" column (e.g. **C-11** / **A-03**)
3. Timestamp + user role used to trigger

Submit via Verify sign-off on the matching FRS item (e.g. C-11 → FRS 1.28). The Sprint 1 🔁 re-verify chips in Verify are tracking the existing fixes — unrelated to this test plan, but attach any notification failure as a fresh Verify comment on the relevant FRS row.

**Fast lane**  Any 401 / 535 / 5xx surfaced in the test-connection badge on Admin → Integrations → SMS or Email — screenshot + paste the error message. Both gateways now surface provider-native error text, so the message is diagnostic.

---

*End of test plan. Seventeen candidate events + 11 agent + 7 employer + 4 admin = **39 testable rows**, plus the OTP / password deep-dive, preference toggles, and wording spot-check. Expected full-cycle test time: ~4 hours with 2 testers working across the roles in parallel.*
