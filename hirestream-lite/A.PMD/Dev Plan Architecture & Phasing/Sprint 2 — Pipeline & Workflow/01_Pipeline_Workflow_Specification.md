# HireStream — Pipeline & Workflow Specification (PWS)

**Document ID:** PWS-HS-2026-001
**Sprint:** Sprint 2 — Pipeline & Workflow
**Owner:** Agentryx Engineering
**Status:** Draft for implementation
**Created:** 17 April 2026
**Supersedes:** inline decisions in `03_Claude_Code_Agent_Brief.md`

This is the single source of truth for how candidates, agents, and employers interact on HireStream. Every new feature must map to these rules or extend them intentionally — not bypass them.

## 1. Actors & roles

| Role | Who | Primary responsibility |
|---|---|---|
| **Candidate** | Job seeker (usually Himachali) | Register, build profile, apply to agent-posted jobs, accept/decline placements |
| **Agent** | Licensed recruitment agency (HPOPA-verified) | Post jobs, shortlist candidates, schedule interviews, issue placements, act as sole liaison between candidate and employer |
| **Employer** | Overseas hiring company | Post requisitions (to agents, not candidates), review shortlists from agents, approve for interview, make selections, issue appointment letters |
| **Admin** | HPSEDC officer | Approve agencies, oversee compliance, audit pipelines, manage grievances |
| **Super Admin** | HPSEDC / Agentryx operator | Configure runtime settings, full-lockdown override, pipeline pauses |

**Non-relationship:** candidate ↔ employer has no direct channel. Every communication goes through an agent.

## 2. Core data model

Two distinct entity types, one table:

| Entity | Owned by | `visibility` | `parentRequisitionId` |
|---|---|---|---|
| **Agent-posted job** | Agent | `public` | NULL (standalone) OR set (derivative of a requisition) |
| **Employer requisition** | Employer | `agents_only` | NULL |

### New columns on `jobs` table

| Column | Type | Default | Purpose |
|---|---|---|---|
| `visibility` | enum(`public`, `agents_only`) | `public` | Gates who can see this job in search |
| `parent_requisition_id` | varchar FK→jobs(id) | NULL | Links an agent job to the employer req it was sourced from |
| `pinned_agent_id` | varchar FK→users(id) | NULL | Employer requisitions only: if set, only this agent can pick it up |

### New column on `candidates` table

| Column | Type | Default | Purpose |
|---|---|---|---|
| `open_to_outreach` | boolean | controlled by system setting | Does the candidate allow agents to invite them to jobs they didn't apply to? |

### New system settings (admin-editable)

| Key | Default | Flexible? | Purpose |
|---|---|---|---|
| `requisition.pairing_mode` | `open` (all agents) | Yes | Can be `open` or `pinned_only` |
| `candidate.default_open_to_outreach` | `true` (UAT) / `false` (prod checklist) | Yes | Default for new candidates |
| `requisition.cascade_close_derivatives` | `true` | Yes | On employer close, auto-close derivative agent jobs |
| `notifications.hide_employer_in_negatives` | `true` | Yes | Candidate never sees employer name when rejected |
| `job.auto_expire_days` | `60` | Yes | Days before jobs without explicit deadline auto-close |
| `job.auto_close_nudge_days_before_deadline` | `3` | Yes | Notify agent this many days before deadline |

All settings live in the existing `system_settings` table and are editable from Admin → System Config.

## 3. Visibility rules (LOCKED)

| Who is viewing | Sees public agent jobs | Sees employer requisitions | Sees derivative agent jobs (linked to a req) |
|---|---|---|---|
| **Anonymous visitor** | Yes (read-only) | No | Yes (read-only, appears as agent job) |
| **Candidate** | Yes | **No — never** | Yes (appears as agent job) |
| **Agent (own)** | Yes | Own only | Own only |
| **Agent (other)** | Yes | Yes (if open) / only if pinned | Yes |
| **Employer (own)** | N/A | Own only | Own requisition's derivatives |
| **Employer (other)** | N/A | No | No |
| **Admin / Super Admin** | All | All | All |

Enforcement: server-side filter at `/api/v1/jobs` endpoint using the `visibility` column + role + ownership. Never relies on client-side filtering.

## 4. Pipeline states

### 4.1 Job / Requisition states

```
draft ──publish──▶ active ──close──▶ closed
                     │              ▲
                     └──auto-expire─┘  (cron: deadline < now OR age > auto_expire_days)

closed ──reopen──▶ active   (within 7 days; admin override for older)
```

### 4.2 Application states

```
submitted ──review──▶ reviewed ──shortlist──▶ shortlisted ──schedule──▶ interview_scheduled
                                      │                                         │
                                      │                                         ▼
                                      │                                    selected ──offer──▶ offer_issued
                                      │                                                            │
                                      └────────reject───▶ rejected ◀─────reject──────┐            │
                                                                                                   ▼
                                                                                        placed / declined
```

Terminal states (configurable via `pipeline.terminal_states`): `placed`, `offer_accepted` (locked in prod, unlocked in UAT).

## 5. Event → notification matrix (LOCKED rules, FLEXIBLE wording)

| Trigger event | Candidate sees | Agent sees | Employer sees | Channel(s) |
|---|---|---|---|---|
| Candidate applies | "Application submitted · you'll hear from your agent" | "New applicant for {{job.title}}" | — | in-app |
| Agent marks reviewed | "Application reviewed" | — | — | in-app |
| Agent shortlists | "You're being considered by the agency" | — | "New candidate for review" | in-app + email to employer |
| Employer approves shortlist | "The agency has arranged for interview" | "Employer approved: schedule interview" | — | in-app |
| Employer rejects | "Not selected this round — keep applying to other roles" | "Employer rejected {{candidate.name}} — substitute if needed" | — | in-app |
| Agent schedules interview | "Interview scheduled: {{date}} · {{mode}}" | — | "Interview scheduled for {{candidate.name}}" | in-app + SMS/email to candidate |
| Interview completed | "Decision pending" | "Record outcome" | "Record decision" | in-app |
| Employer selects | "Selected — offer letter coming" | "Issue offer letter to {{candidate.name}}" | — | in-app |
| Appointment letter issued | "Offer available — review and accept" | "Offer sent" | "Letter issued" | in-app + email to candidate |
| Candidate accepts | "Placement confirmed. Begin welfare check-ins on departure day." | "Placement confirmed" | "Candidate accepted" | in-app + email to all |
| Candidate declines | "You declined. No further action." | "Candidate declined. Substitute needed." | "Candidate declined — agent will submit substitute" | in-app |
| Job/req closed (any reason) | "Position filled · thank you for applying" | "Requisition closed" | "Closed" | in-app |
| Auto-close 3 days before deadline | — | "⚠ {{job.title}} closes in 3 days" | — | in-app |

**Key rule (LOCKED):** in any candidate-facing message tied to a negative event, the employer's name is NEVER included. The agency is the sole visible entity to the candidate.

## 6. Cascading closure (LOCKED)

```
Employer closes requisition
   └─▶ setting requisition.cascade_close_derivatives = true
         └─▶ all derivative agent jobs (parent_requisition_id = <req.id>) auto-close
               └─▶ all candidates with active applications get "Position filled · thank you"
               └─▶ all involved agents get "Requisition closed by employer"
```

Agent closing their derivative job **does NOT** cascade upward. The requisition stays open, and other agents (if pairing mode = open) can continue picking it up.

## 7. Agent-employer pairing (FLEXIBLE)

Two modes, controlled by `requisition.pairing_mode`:

| Mode | Behavior |
|---|---|
| `open` (default) | Any verified agent can pick up an employer's requisition and create a derivative job. Employer sees shortlists from all participating agents in one unified view. |
| `pinned_only` | Only the agent set in `pinned_agent_id` can pick up. Empty pin means no agent can pick it up — requisition sits idle until employer assigns one. |

Per-requisition override: employer can pin a specific agent regardless of system mode.

## 8. Audit logging (LOCKED)

Every transition below writes one row to `audit_log`:

- Job/requisition: `draft → active`, `active → closed`, `closed → active`, delete
- Application: any state change
- Placement: offer issued, accept, decline
- Agency: verify, reject
- Notification: sent (role, template, event)

Row fields: `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `from_state`, `to_state`, `reason` (free-text, optional), `ip`, `timestamp`, `request_id`.

Admin can filter by date, actor, entity type, state. Retention: 7 years (MEA compliance norm).

## 9. Out of scope (for Sprint 2)

- Direct candidate ↔ employer messaging (never, by design)
- Automated screening via AI (separate sprint)
- Payment flows (separate sprint)
- Multi-agency bidding / counter-offers (separate sprint)

## 10. Glossary

| Term | Meaning |
|---|---|
| **Requisition** | Employer-posted job that is invisible to candidates |
| **Agent job** | A job posting owned by an agent; visible to candidates |
| **Derivative job** | An agent job linked to an employer requisition via `parent_requisition_id` |
| **Standalone job** | An agent job with no parent requisition (agency-sourced demand) |
| **Pick up** | The action an agent takes to convert a requisition into a derivative agent job |
| **Pinned** | An agent exclusively assigned to a specific requisition |
| **Cascade** | An event at the parent that automatically fires at derivatives |

---

**Document governs all downstream implementation, tests, and Verify module requirements. Any deviation must be documented as a PWS amendment in this folder.**
