# Sprint 2 — Agentryx Verify Module Additions

**Target project:** `hirestream-v1.5-extras` (Beyond-FRS Enhancements) in the Agentryx Verify portal.
**Purpose:** Every PWS rule appears as a reviewable requirement with how-to-test steps and expected outcome, so HTIS / HPSEDC reviewers can sign off per stage.

## 1. New section in Verify matrix

Add one new section to the beyond-FRS project:

**Section 7 — Pipeline & Workflow Governance** (new)

Each item below becomes a row in the `requirements` table in the Verify DB with:
- `itemRef` = section.number (e.g. `7.1`)
- `section` = 7
- `sectionTitle` = "Pipeline & Workflow Governance"
- `description` = the rule in one sentence
- `status` = `delivered` / `partial` / `not_delivered` / `deferred` per actual implementation
- `testSteps` = step-by-step reproducible test
- `expectedResult` = what the reviewer should see
- `evidence` = code path reference

## 2. Section 7 requirements

### 7.1 — Employer requisitions invisible to candidates
- **Rule:** Candidates cannot see employer-posted requisitions (`visibility=agents_only`) in job search
- **Test:** Log in as `demo_candidate`. Go to Browse Jobs. Confirm no job with `company="Private Employer"` appears. Then call `GET /api/v1/jobs` directly — response must exclude all jobs with `visibility=agents_only`.
- **Expected:** Zero employer-only jobs in candidate response.

### 7.2 — Agents see open requisitions pool
- **Rule:** Agents see employer requisitions via `/api/v1/agent/requisitions` endpoint per pairing mode
- **Test:** Log in as `demo_agent`. Navigate to Open Requisitions tab. Confirm at least one employer requisition appears. Note: if `pairing_mode=pinned_only` and no pin, list should be empty.
- **Expected:** Requisitions listed if `pairing_mode=open` OR pinned to this agent.

### 7.3 — Agent pick-up creates derivative job
- **Rule:** When agent picks up requisition, a new agent-owned job is created with `parent_requisition_id` set and `visibility=public`
- **Test:** As agent, click "Pick Up" on any requisition. Verify a new job appears in My Jobs list with the requisition's title, owner=agent, parent_requisition_id=<req.id>.
- **Expected:** New derivative job present, original requisition unchanged, candidates now see the derivative in browse.

### 7.4 — Pinned requisition rejects other agents
- **Rule:** When `pinned_agent_id` is set, only that agent can pick up the requisition
- **Test:** Employer pins requisition to Agent A. Log in as Agent B. Attempt to pick up — should return 403.
- **Expected:** 403 Forbidden for non-pinned agent.

### 7.5 — Cascading close from employer to derivatives
- **Rule:** Closing employer requisition auto-closes all derivative agent jobs
- **Test:** Create employer req R with 2 derivative jobs D1, D2 (via 2 different agents picking up). Employer closes R. Verify D1.status = closed, D2.status = closed within 2 seconds.
- **Expected:** All 3 jobs closed, audit log has 3 rows with action=cascade_close.

### 7.6 — Candidate notified neutrally on cascade
- **Rule:** Candidates on derivative jobs receive "Position filled" message without employer name
- **Test:** Candidate applies to D1. Employer closes R. Check candidate's notifications.
- **Expected:** One notification with text like "Position filled — thank you for applying". No mention of employer's `companyName`.

### 7.7 — Employer name scrubbed in candidate rejection
- **Rule:** When employer rejects a shortlisted candidate, the candidate's message says "Not selected this round" with zero employer branding
- **Test:** Shortlist a candidate. Employer rejects. Check candidate's notification.
- **Expected:** Notification body does not contain `companyName` of employer.

### 7.8 — Agent vs employer closure asymmetry
- **Rule:** Agent closing a derivative job does NOT cascade to the employer requisition
- **Test:** Create req + derivative. Agent closes derivative. Verify employer requisition still active.
- **Expected:** Employer req unchanged; other agents can still pick up the req.

### 7.9 — Candidate opt-in for agent outreach
- **Rule:** Candidate profile field `open_to_outreach` controls whether agents can see them in the candidate pool
- **Test:** Set candidate X's `open_to_outreach=false`. Log in as agent, search candidate pool. X should not appear.
- **Expected:** Candidate X not listed for any agent's search.

### 7.10 — Auto-close cron respects deadline
- **Rule:** Jobs with `hiring_deadline < today` auto-close at 02:00 IST nightly
- **Test:** Seed a job with `hiring_deadline=yesterday`. Trigger cron manually (admin dev tool). Check job status.
- **Expected:** Status changed to `closed`. Owner notification created with text "{{job.title}} auto-closed (deadline passed)".

### 7.11 — Auto-close warning at 3 days
- **Rule:** 3 days before deadline, owner gets a nudge notification
- **Test:** Seed job with `hiring_deadline = today + 3 days`. Run cron. Owner should have a "⚠ closes in 3 days" notification.
- **Expected:** Warning notification created exactly once.

### 7.12 — Audit log per state transition
- **Rule:** Every application state change writes to `audit_log` with actor/from/to/reason
- **Test:** Walk through applicant states: submitted → reviewed → shortlisted → rejected. Inspect audit_log.
- **Expected:** 3 rows, each with actor_role, from_state, to_state, timestamp.

### 7.13 — Admin configurable settings round-trip
- **Rule:** All 6 flexible settings in PWS (pairing_mode, cascade_close, hide_employer_in_negatives, auto_expire_days, nudge_days, default_open_to_outreach) are admin-editable without restart
- **Test:** Admin → System Config → change pairing_mode from open to pinned_only. Save. Immediately try agent pick-up on an unpinned req.
- **Expected:** Agent blocked with 403 immediately (no restart needed).

### 7.14 — Notification templates editable
- **Rule:** Admin can edit notification wording in Admin → Notifications Templates without code change
- **Test:** Admin edits "shortlist approval" template to a custom message. Employer approves a shortlist. Candidate receives the new custom message.
- **Expected:** Updated template reflects in the very next notification.

### 7.15 — Clone job creates draft
- **Rule:** Cloning an existing job creates a new draft with all fields copied except applicants
- **Test:** From My Jobs, click "Clone" on any active job. Check new draft.
- **Expected:** New draft exists with identical fields (title, description, skills, etc.). Applicants are not copied. Status = draft.

### 7.16 — Preview as candidate
- **Rule:** Detail page "Preview as candidate" opens the candidate-facing view in new tab
- **Test:** On job detail page, click "Preview". New tab opens at `/jobs/public/:slug`.
- **Expected:** Candidate-facing job card rendered without agent admin controls.

### 7.17 — Shareable public link
- **Rule:** `/jobs/public/:slug` is shareable; candidates click through to apply after login
- **Test:** Copy share link. Open in incognito. Login gate triggers. After login, Apply button works.
- **Expected:** Public link resolves to job, login redirect preserves destination.

### 7.18 — Draft cap enforced
- **Rule:** Server enforces max N drafts per user (N from setting `jobs.max_drafts_per_user`, default 20)
- **Test:** As agent, create 20 drafts. Try to save 21st. Server returns 403.
- **Expected:** 21st draft blocked with clear error message.

### 7.19 — Job analytics panel
- **Rule:** Detail page shows views, application rate, avg match score, time-to-first-applicant
- **Test:** View any active job with applicants. Scroll to Analytics panel.
- **Expected:** 4 metrics displayed with non-zero values where data exists.

### 7.20 — Auto-match notification to candidates
- **Rule:** When a public job is posted, candidates with matching skills and preferred country get a notification (throttled once per candidate per day)
- **Test:** Seed candidate C with skills=[Nursing], preferred_countries=[UK]. Agent posts a new Nursing job in UK. C should receive a notification.
- **Expected:** Notification "Job matching your profile" in C's list.

## 3. Seed script

Add to `agentryx-verify/scripts/seed-v15-extras.ts`:

```typescript
const SECTION_7 = {
  section: 7,
  sectionTitle: "Pipeline & Workflow Governance",
  items: [
    { itemRef: "7.1", description: "...", status: "delivered", testSteps: "...", expectedResult: "...", evidence: "PWS §3; server/routes/job.routes.ts:105–115" },
    // ... 20 items total
  ]
};
```

The seeder idempotently upserts — rerunning won't duplicate.

## 4. Reviewer sign-off workflow

Once seeded, the Verify portal will show Section 7 alongside existing sections (Candidate, Agency, Employer, Officer, Cross-cutting). Each reviewer (HTIS, HPSEDC Staging, HPSEDC Final) can sign off each of the 20 items as Pass / Partial / Fail with comments and screenshots (the attachment feature we added).

## 5. Acceptance for Phase 7

- [ ] All 20 Section 7 items inserted in Verify DB
- [ ] Visible in Verify UI under beyond-FRS project
- [ ] Each item has non-empty testSteps and expectedResult
- [ ] Seeder is idempotent (rerun doesn't duplicate)
- [ ] Screenshot documented in deployment package
