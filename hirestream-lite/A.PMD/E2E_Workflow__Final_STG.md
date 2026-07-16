# End-to-End Workflow — Final Staging Specification

**Version:** 1.0
**Status:** Authoritative — supersedes any earlier prose description of the pipeline
**Binding source:** `A.PMD/FRS/FRS.txt` §2.2, §2.4, §2.5, §2.6, §2.7 (summarized inline)
**Audience:** HPSEDC / HTIS reviewers, Agentryx engineers, support team

---

## 0 · Why this document exists

Over the last few sprints we've accumulated small workflow assumptions that weren't all written down. This is the single source of truth. If any code, endpoint, or UI behaves differently from what's on this page, **the code is wrong and this page wins** — either by fixing the code or by updating this page in the same commit after explicit sign-off.

Nothing in this doc contradicts the FRS. Where the FRS is ambiguous (e.g. "who conducts the interview"), this doc picks a default and marks it as **configurable**.

---

## 1 · FRS cross-reference (what the contract actually says)

> **FRS §2.2 — User Roles and Modules**
> Recruiting Agencies are responsible for: *"Scrutiny of candidates and scheduling of recruitment drives and interviews. Entry of placement details and issuing of appointment letters."*

> **FRS §2.4 — Job Application Workflow**
> *"Candidate will browse available job openings → use advanced search filters → view detailed job descriptions → submit job applications → track application status → receive notifications."*

> **FRS §2.5 — Recruiting Agency Workflow**
> *"Recruiting agency registration with company details → license verification and admin approval → job posting with specific criteria → manage postings → view and manage applicants → analytics."*

> **FRS §2.6 — HPSEDC Admin Workflow**
> *"Authorities review recruiting agencies' registrations → verify uploaded documents → approve or reject agency registrations → monitor system activities → generate reports → handle grievances."*

> **FRS §2.7 — Recruitment Process Workflow**
> *"Recruitment agencies organize recruitment. Employer reviews applications → shortlists candidates → schedules interviews → conducts interviews and records results → makes final selection decisions → issues appointment letters to selected candidates."*

> **FRS §2.7 — Overall Workflow**
> *"User registration and verification → Job posting and searching → Recruitment Drives by agencies → Application and matching process → Interview and selection → Placement and follow-up → Reporting and monitoring."*

**Synthesis** (used throughout this doc): the **agency scrutinizes + organizes + issues placement paperwork**; the **employer reviews + decides**. Interviews can be conducted by either role depending on deployment convention — we expose a config for this (§6).

---

## 2 · Role responsibility matrix

| Action | Candidate | Agent | Employer | Admin |
|---|---|---|---|---|
| Register self | ✅ | ✅ (agency license required) | ✅ | — |
| Get verified | Aadhaar / OTP | **HPSEDC approval required before posting** | Email + org details | — |
| Post a requisition (`agents_only`) | — | — | ✅ | — |
| Post a public job | — | ✅ (when agent-led) or after pickup | — | — |
| Pick up employer requisition | — | ✅ (if verified) | — | — |
| Browse + apply for public jobs | ✅ | — | — | — |
| See applicants on a job | — | ✅ (their jobs) | ✅ (shortlisted onwards, for their reqs + derivatives) | ✅ (all) |
| Screen / scrutinize candidates | — | **✅ primary** (FRS §2.2) | — | — |
| Shortlist candidates | — | ✅ (status → `shortlisted`) | — | — |
| Approve shortlisted candidates for interview | — | — | **✅ primary** (FRS §2.7) | override |
| Schedule interview | — | **✅ primary** (FRS §2.2) | ✅ (if employer-conducted) | — |
| Conduct interview | — | ✅ *(pre-screen, configurable)* | **✅ primary** (FRS §2.7) | — |
| Record scorecard | — | ✅ | ✅ | — |
| Final selection decision | — | — | **✅ primary** (FRS §2.7) | override |
| Issue offer / appointment letter | — | **✅ primary** (FRS §2.2) | — | — |
| Accept / decline offer | ✅ | — | — | — |
| Post-placement welfare check-ins | candidate replies | **✅ primary** | ✅ (observer note) | reports |
| Verify agencies, handle grievances | — | — | — | ✅ |

**Rule:** every row in this matrix is enforced by the relevant endpoint's authorization. If you find an endpoint that allows the wrong role, file a bug citing this row.

---

## 3 · Flow A — Employer-led (the default pattern)

Employer posts a requisition; one or more verified agencies pick it up; each agency sources candidates.

```
┌──────────┐                                      ┌─────────────┐
│ EMPLOYER │  posts requisition (visibility =     │  jobs table │
│          │  agents_only, pinnedAgentId?=null)   │   row A     │
└────┬─────┘                                      └──────┬──────┘
     │                                                   │
     │ [1] visible to verified agents in Open Requisitions
     │     (and ONLY verified agents — see §5)
     ▼
┌──────────┐                                      ┌─────────────┐
│  AGENT   │  POST /agent/requisitions/:id/pickup │  jobs table │
│          │  creates a "derivative" job with     │   row B     │
│          │  parentRequisitionId=A, agentId=self │  (child of  │
│          │  visibility=public                   │   row A)    │
└────┬─────┘                                      └──────┬──────┘
     │                                                   │
     │ [2] derivative becomes candidate-visible on /jobs
     ▼
┌──────────┐
│CANDIDATE │  applies → application row, status = submitted
└────┬─────┘
     │
     │ [3] agent sees new applicant + "Viewed" badge fires on status=reviewed
     ▼
┌──────────┐
│  AGENT   │  screens / scrutinizes (FRS §2.2)
│          │  status:  submitted → reviewed → shortlisted
└────┬─────┘
     │
     │ [4] shortlisted app shows in EMPLOYER Review Queue
     │     (queue spans row A + all its derivatives B,B',B''...)
     ▼
┌──────────┐
│ EMPLOYER │  reviews shortlist (FRS §2.7)
│          │  decision: approved_for_interview | request_replacement | reject
└────┬─────┘
     │
     │ [5] on approval → notification to agent
     ▼
┌──────────┐
│  AGENT   │  schedules interview with candidate (FRS §2.2)
│          │  status = interview_scheduled, writes interview row
└────┬─────┘
     │
     │ [6] interview happens — conducted by agent OR employer (config §6)
     │     scorecard filled by whoever attends
     ▼
┌──────────┐
│ EMPLOYER │  marks selected (FRS §2.7)
│          │  status = selected
└────┬─────┘
     │
     │ [7] agent creates placement, agent issues appointment letter (FRS §2.2)
     ▼
┌──────────┐
│CANDIDATE │  accepts offer → placement.status = accepted
└────┬─────┘
     │
     ▼
 Welfare check-ins 30 / 60 / 90 day  (agent-driven, employer-observable)
```

### 3.1 Multi-agent pickup (default `open` pairing mode)

- Same employer requisition A can be picked up by **multiple** verified agents → B, B', B''.
- Each derivative is independent: B has its own candidate pool, B' has its own.
- **Employer's Review Queue aggregates shortlisted apps across A + B + B' + B''** — the employer sees one unified list, knows which agent shortlisted each candidate.
- When the employer "approves for interview" on one derivative's candidate, only that derivative's agent is notified.
- When a requisition is filled (target hires reached, or deadline passes, or employer closes it), **ALL derivatives cascade-close** (existing cron: `job-lifecycle.service.ts`).

### 3.2 Pinned agent (employer's preferred agency)

- Employer can set `jobs.pinnedAgentId` at post time.
- In `pairing_mode = pinned_only`: ONLY the pinned agent can pick up. Other agents don't see the requisition.
- In `pairing_mode = open` (default): any verified agent can pick up, pinned agent simply gets a "pinned to you" badge for priority visibility.

---

## 4 · Flow B — Agent-led (pre-existing off-platform relationship)

Some agencies have direct mandates from foreign employers outside the portal. In that case, the agent posts directly and acts as both scrutinizer and employer-proxy for the review step.

```
┌──────────┐
│  AGENT   │  posts job directly
│          │  visibility = public, agentId = self, employerId = null,
│          │  parentRequisitionId = null
└────┬─────┘
     │
     ▼
┌──────────┐
│CANDIDATE │  applies → status = submitted
└────┬─────┘
     │
     ▼
┌──────────┐
│  AGENT   │  scrutinizes → reviewed → shortlisted → interview_scheduled
│          │  → selected → placement → offer_letter
└──────────┘
```

**Difference from Flow A:** no `employerDecision` handoff step. The agent does everything. The Review Queue is empty for this job (no platform-resident employer to review). Interview scorecard is agent-only.

**When to use:** small agencies with direct foreign-employer mandates who don't want the employer to register on the portal. HPSEDC still gets full audit trail via the agency's actions.

---

## 5 · State machine (every status transition)

| From → To | Actor | Trigger | Notifies | Audit event | Config gate |
|---|---|---|---|---|---|
| *(none)* → `submitted` | Candidate | POST `/jobs/:id/apply` | agent (new applicant), candidate (submitted) | `application.status_change` | — |
| `submitted` → `reviewed` | Agent | PATCH status | candidate ("Viewed" badge) | `application.status_change` | `pipeline.allow_backward_transitions` false blocks reverse |
| `reviewed` → `shortlisted` | Agent | PATCH status | candidate (positive), employer (new to review) | ↑ | ↑ |
| `shortlisted` → `interview_scheduled` | Agent | PATCH status + interview row | candidate (positive, auto-saved), employer (positive) | ↑ | — |
| `interview_scheduled` → `selected` | Employer (or Agent in flow B) | PATCH status | candidate (positive, auto-saved), agent (positive) | ↑ | — |
| `submitted|reviewed|shortlisted|interview_scheduled` → `rejected` | Agent | PATCH status + reason | candidate (warning, **employer name scrubbed**) | ↑ | `rejection.require_reason` |
| `shortlisted` → `rejected` (by employer) | Employer | PATCH status | candidate (urgent, name scrubbed), agent | `application.employer_rejected` | ↑ |
| `selected` → `placed` | Agent | POST placement → PATCH placement.status=active after acceptance | candidate, employer | `placement.created`, `placement.active` | — |
| Any terminal (`placed`, `rejected`) → change | **Admin only** | override | all parties | — | `pipeline.terminal_states` |

**Rule:** every transition goes through `PATCH /api/v1/applications/:id/status` (or the sibling `/bulk-status`). Every transition writes one row to `audit_log` with `action=application.status_change`, `from`, `to`, `actorRole`, `reason` in the `details` JSONB. No backchannel updates.

### 5.1 Pipeline-visibility rule (how notifications and queues are scoped)

| Data | Candidate sees | Agent sees | Employer sees | Admin sees |
|---|---|---|---|---|
| Application `submitted` | own | their job | — | all |
| Application `reviewed` | own (+ "Viewed" badge) | their job | — | all |
| Application `shortlisted` | own (employer name hidden) | their job | **their req + all derivatives of it** | all |
| Application `interview_scheduled` | own (full detail) | their job | their req + derivatives | all |
| Application `selected` | own (full detail, employer revealed) | their job | their req + derivatives | all |
| Application `rejected` (agent-driven) | own (employer name scrubbed per FRS) | their job | — | all |
| Application `rejected` (employer-driven) | own (employer name scrubbed) | their job (reason visible) | their req | all |
| Interview scorecards | — | own job | own req + derivatives | all |
| Placement / offer letter | own | own job | own req | all |
| Welfare check-ins | own (survey) | own job | own req (read-only) | all |

---

## 6 · Configuration matrix

All of these are live today as keys in `system_settings` (admin can flip them from **Admin → System Config**). Defaults chosen for a production HPSEDC deployment.

### 6.1 Already shipped (active)

| Key | Category | Default | Effect |
|---|---|---|---|
| `requisition.pairing_mode` | pipeline | `open` | `open` (multi-agent pickup) vs `pinned_only` |
| `agency.require_verification_to_post` | access | `true` | Unverified agencies blocked from posting |
| `agency.max_active_jobs` | access | `50` | Per-agency cap on concurrent live jobs |
| `pipeline.allow_backward_transitions` | pipeline | `true` | Can recruiters move an app backward? (set `false` in prod) |
| `pipeline.require_reason_on_backward` | pipeline | `false` | Force a note on backward moves |
| `pipeline.terminal_states` | pipeline | `[]` | States only admin can change (production: `["placed","rejected"]`) |
| `pipeline.undo_window_minutes` | pipeline | `15` | How long an undo toast is available |
| `rejection.require_reason` | rejection | `false` | Force feedback on rejection (set `true` in prod) |
| `rejection.allow_revert` | rejection | `true` | Can a rejection be reversed within undo window |
| `notifications.auto_on_status_change` | notifications | `true` | Status changes fire template-driven notifications |
| `notifications.hide_employer_in_negatives` | notifications | `true` | FRS-required employer-name scrubbing on rejection |
| `matching.min_skill_overlap` | matching | `2` | Auto-match threshold |
| `lifecycle.*` | lifecycle | various | Auto-close cron rules (deadline, staleness) |
| `auth.session_timeout_minutes` | security | `30` | HTIS T5 compliance |
| `auth.single_session_per_user` | security | `false` | **ON** kills other devices on login (HTIS T4 strict); default **OFF** allows multi-device |
| `ratelimit.*` | security | various | Per-IP caps |

### 6.2 New knobs being added in this sprint

| Key | Category | Default | Effect |
|---|---|---|---|
| `interview.conducted_by` | pipeline | `either` | `agent_only` \| `employer_only` \| `either` — who can fill scorecard |
| `employer.can_override_agent_rejection` | pipeline | `false` | Does the employer get a "rescue" path if the agent rejected a candidate? |
| `pinned_agent.priority_badge_in_open_mode` | pipeline | `true` | In `open` mode, show "pinned to you" badge on requisitions with priority visibility |

Once these are wired in, they'll appear in Admin → System Config alongside the existing ones.

---

## 7 · Gaps vs. this doc — what we're shipping to close them

Updated from a code audit on 2026-04-18. Each item is either **FIX**, **VERIFY** (already correct, add tests), or **ADD** (new capability).

| # | Area | Item | Status |
|---|---|---|---|
| 1 | §3 employer-led | Employer Review Queue spans derivative jobs (not just direct `employerId` match) | **SHIPPED v0.8.0** |
| 2 | §3 employer-led | `approve-for-interview` accepts derivative jobs | **SHIPPED v0.8.0** |
| 3 | §3 employer-led | `request-replacement` + `request-more` accept derivatives | **SHIPPED v0.8.0** |
| 4 | §3 employer-led | Welfare notes endpoint accepts derivatives | **SHIPPED v0.8.0** |
| 5 | §3.1 multi-agent | Already-picked-up requisitions show state on agent side | **SHIPPED v0.8.4** |
| 6 | §5 state machine | Applicants list endpoint returns stable data (was crashing silently) | **SHIPPED v0.8.4** |
| 7 | §5 state machine | Applicants sortable by newest / oldest / match | **SHIPPED v0.8.4** |
| 8 | §5 audit | Every status change writes `audit_log.details.{from,to,actorRole,reason}` | SHIPPED (legacy) |
| 9 | §5 notifications | Duplicate notifications on status change | **SHIPPED v0.8.0** |
| 10 | §5 notifications | Rejection severity = warning, not info | **SHIPPED v0.8.0** |
| 11 | §6 config | `interview.conducted_by` setting + scorecard authorization | **ADD — next** |
| 12 | §6 config | `employer.can_override_agent_rejection` + rescue endpoint | **ADD — next** |
| 13 | §6 config | `pinned_agent.priority_badge_in_open_mode` + UI badge | **ADD — next** |
| 14 | §5 state | Admin override dialog for terminal-state corrections | **VERIFY** (exists but needs UI test pass) |
| 15 | §3 end-to-end | Full 3-candidate walkthrough automated test — exercises Flow A start-to-finish | **ADD — next** |

Items #11-#13 come out of this doc being written (ambiguities the FRS left open). Item #15 is the regression net that would have caught the applicants-list crash before the customer did. Items #11-#15 are the scope of **v0.8.5**.

---

## 8 · Smoke-test discipline (engineering non-negotiables)

Written down to stop this from happening again.

### 8.1 Backend feature is NOT "done" until

- [ ] Every new/changed endpoint is `curl`-hit with the exact payload shape the UI sends (including empties, nulls, edit-mode carry-over fields)
- [ ] **Every sibling endpoint that reads from the same table** is `curl`-hit with a pre-existing row that wasn't created for the feature — catches drizzle `sql`-template breakage, missing NOT-NULL columns, new joins that exclude valid rows
- [ ] If the pipeline test suite covers the changed area, run it. If it doesn't, **add one test**.
- [ ] Build logs (`pm2 logs hirestream --err`) checked for new warnings / errors in the 30 seconds following the test run

### 8.2 Frontend feature is NOT "done" until

- [ ] Open the live page as the exact user role
- [ ] Click the primary action
- [ ] Test the empty-data path (new user / no history)
- [ ] Test the error path (disconnect network, or hit an endpoint that 500s)
- [ ] If the session is closed and can't be reopened in-session, **say so explicitly** rather than claim success

### 8.3 Release ritual

Before every `npm run build` + `pm2 restart`:

```
npx tsc --noEmit            # must pass
npm test -- --testPathPatterns=pipeline    # must pass
curl -sk <sibling-endpoint-1>               # manual smoke
curl -sk <sibling-endpoint-2>               # manual smoke
```

No exceptions.

---

## 9 · How this doc stays current

- **Any PR that changes pipeline behavior must update this doc in the same PR.** If it doesn't, PR is blocked.
- **Any ambiguity the FRS leaves open must be resolved here, not in a chat thread.** If there's no answer in this doc, write one.
- **Every new `system_settings` key must be listed in §6** with its default and effect.
- **Every new audit event or state transition must be listed in §5.**

Reviewers: treat §1-§5 as binding contract, §6 as knobs you can flip, §7 as the live punch-list, §8 as how we promise it won't happen again.

---

## Appendix A — File references

- FRS source: `A.PMD/FRS/FRS.txt`
- Application routes: `hirestream/server/routes/application.routes.ts`
- Job routes (list + applicants): `hirestream/server/routes/job.routes.ts`
- Agent routes (pickup): `hirestream/server/routes/agent-productivity.routes.ts`
- Employer routes (review queue, approve): `hirestream/server/routes/employer.routes.ts`
- Settings service: `hirestream/server/services/settings.service.ts`
- Notification engine: `hirestream/server/services/event-notifications.service.ts`
- Lifecycle cron: `hirestream/server/services/job-lifecycle.service.ts`
- Test suite: `hirestream/tests/integration/pipeline-phase*.test.ts`
