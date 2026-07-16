# Sprint 2 — Pipeline & Workflow Execution Plan

**Scope anchor:** `01_Pipeline_Workflow_Specification.md` (PWS) is the source of truth.
**Sprint window:** 17–21 April 2026
**Release target:** HireStream v0.8.0 (UAT drop)
**Methodology:** Phase-gated. Each phase has build + E2E test + Verify seed **before** moving to next.

## Guiding principle

**One configurable flow, not two parallel modes.** Every decision in the PWS lives as either hard-coded logic (LOCK) or a single setting in `system_settings` (FLEXIBLE). No branching code paths for "mode A vs mode B."

## Phases

### Phase 1 — Data model foundation
*What:* migrate `jobs` and `candidates` tables, add 3 new system settings, wire the `visibility`/`parent_requisition_id`/`pinned_agent_id` columns end-to-end. No UX yet.
*Exit criteria:*
- Drizzle schema pushed, DB columns exist with defaults backfilled (`visibility=public` for agent jobs, `visibility=agents_only` for any job where `employer_id IS NOT NULL AND agent_id IS NULL`).
- Settings show in Admin → System Config.
- API tests confirm existing routes still work (no regression).

### Phase 2 — Visibility & Listing enforcement
*What:* enforce PWS §3 visibility matrix. Candidates stop seeing employer requisitions. Agents get a new "Open Requisitions" page. Agent "Pick up" action creates a derivative job.
*Exit criteria:*
- Candidate logged in: `GET /api/v1/jobs` returns zero rows with `visibility=agents_only`.
- Agent logged in: `GET /api/v1/agent/requisitions` returns open employer reqs respecting pairing mode.
- Pick-up creates a derivative `jobs` row with `parent_requisition_id` set, `visibility=public`, inheriting employer title/location/salary but with agent ownership.
- E2E test: post requisition → pick up as agent → verify candidate sees only the derivative, not the original.

### Phase 3 — Central notification engine
*What:* one `NotificationService` that accepts an event + actor context and dispatches the right message to candidate/agent/employer per the PWS §5 matrix. Templates stored in DB, editable by admin.
*Exit criteria:*
- New table `notification_templates` seeded with default wording from PWS §5.
- All 14 events in §5 wired and tested.
- Candidate never receives a message containing the employer's name when the trigger is negative (validated by integration test).
- Admin can edit template wording without code change.

### Phase 4 — Cascading close + Audit
*What:* when an employer closes a requisition, all derivative jobs auto-close and candidates get the neutral message. Every state transition writes to `audit_log`.
*Exit criteria:*
- Employer close → N derivatives close → M candidates notified (verified in integration test with N=2, M=5).
- Agent closing a derivative does NOT cascade upward.
- Audit log shows actor, entity, from/to, reason, timestamp for each transition.
- Admin → Audit Log UI can filter by entity type, date range, actor role.

### Phase 5 — UX completions (Tier 1 + 2 + 3)
Sub-tasks, each with its own exit criteria:

**5.1 Auto-close cron**
- `node-cron` daily 02:00 IST job scans active jobs, closes those past deadline OR past `job.auto_expire_days`.
- 3-day warning notification to owner before deadline.
- Test: seed a job with deadline = yesterday, run cron manually, confirm it's closed and owner notified.

**5.2 Employer dashboard — edit/delete/close/reopen parity**
- Same AgentJobCard treatment applied to employer RequisitionCard.
- Same DELETE endpoint rules (applicant-count gate).

**5.3 Employer form — RHF + Zod + edit mode**
- Refactor employer `job-creation-form.tsx` to use `react-hook-form` + existing `insertJobSchema`/`draftJobSchema`.
- Accept `editJob` prop.
- Support Save-as-Draft and edit-draft flows identically to agent form.

**5.4 Add 4 domain fields to agent form**
- Priority selector, Hiring deadline, Target hires, Internal notes — reuse components from employer form (extract shared `<JobDomainFields />`).

**5.5 Clone / Duplicate Job**
- Dashboard menu → "Clone" creates a draft with all fields copied except applicants.

**5.6 Preview as Candidate**
- Button on detail page → opens the candidate-facing job view in a new tab.

**5.7 Show closed jobs with Reopen**
- Dashboard "Closed (7)" filter chip; closed jobs show a Reopen button within 7 days, admin override beyond.

**5.8 Job analytics panel**
- Views, application rate, avg match score, time-to-first-applicant.
- Lightweight — compute from existing tables, no new instrumentation.

**5.9 Auto-match notifications**
- When a new agent job is published with `visibility=public`, notify candidates whose `skills ∩ job.skills ≥ 2` AND preferred country matches. Throttled to once per candidate per day.

**5.10 Shareable public link**
- `/jobs/public/:slug` renders a candidate-facing card with Apply CTA behind the standard login gate. Agent can share via WhatsApp/LinkedIn.

**5.11 Draft cap**
- Setting `jobs.max_drafts_per_user` (default 20). Server-side enforced on create.

### Phase 6 — Tests
Comprehensive test suite update. See `03_Test_Strategy.md`.

### Phase 7 — Verify module updates
Seed new requirements into the Agentryx Verify beyond-FRS project covering every PWS rule. See `04_Verify_Additions.md`.

## Phase dependencies

```
Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4 ─▶ Phase 5 ─▶ Phase 6 ─▶ Phase 7
(schema)   (visibility) (notify)  (cascade)  (UX)      (tests)    (verify)
```

Phase 5 sub-tasks 5.1, 5.5–5.11 can run in parallel with Phase 3–4 because they don't depend on the notification engine or cascading logic. 5.2–5.4 (UX parity) depend on Phase 1 schema.

## Risk register

| Risk | Mitigation |
|---|---|
| Existing jobs have no `visibility` → candidates suddenly stop seeing them | Backfill `visibility='public'` for all rows in Phase 1 migration; default column value is `public` |
| Breaking notifications cron during template migration | Run Phase 3 in shadow mode first (log-only, no send) for 24h, then flip |
| Cascading close orphans running interviews | Interviews table is untouched; applications move to `rejected` with `reason: 'position_filled'`; agents can schedule follow-up independently |
| Performance hit from visibility filter on large job lists | Index on `(visibility, status)` added in Phase 1 |

## Acceptance criteria for sprint

- [ ] All 11 PWS §2–§8 rules enforced and testable via curl or UI
- [ ] All 14 events in §5 trigger the correct notification(s)
- [ ] Cascading close verified with 3 derivative jobs and 10 candidates
- [ ] Audit log has row per transition; admin can filter
- [ ] Zero code changes needed to flip any of the 6 flexible settings
- [ ] Test suite green (unit + integration + E2E)
- [ ] Verify module shows all new requirements seeded with how-to-test + expected results
- [ ] Release notes updated with behavioral changes and migration notes

## Rollback plan

If Phase 2 visibility enforcement breaks staging:
- Flip setting `candidate.search.show_employer_requisitions = true` (emergency escape hatch, not in default settings list)
- Restore pre-migration DB snapshot (taken immediately before Phase 1 deploy)
- Re-deploy last known good build (git tag `v0.7.x`)

## Sign-off

- Engineering (Agentryx): _________________
- Product (HPSEDC contact): _________________
- Security (WASA sign-off, pre-production): _________________
