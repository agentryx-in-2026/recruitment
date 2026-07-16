# A5: Phase-wise PRD — {Project Name} — Phase {N}
> **Template Version:** 2.0 | **Created By:** Solution Architect / Project Planner
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Depends On:** A3 (Module Breakdown), A4 (Dev Plan)
> **Note:** Create ONE A5 document per phase (A5_PRD_Phase1.md, A5_PRD_Phase2.md, etc.)

---

## 1. Phase Summary

| Field | Value |
|-------|-------|
| **Phase** | {1 / 2 / 3} |
| **Phase Name** | {Foundation / Core Features / Advanced / Polish} |
| **Modules Included** | {M0, M-AUTH, M-ADMIN.1, M1 — reference A3} |
| **Duration** | {Sprint 1-2 / Week 1-3} |
| **Milestone** | {e.g. MVP Demo / Beta Release / Feature Complete / Go-Live} |

---

## 2. Module Execution Specs

> *For each module in this phase, provide the EXACT implementation specification. Refer to A3 for module overview — A5 adds the execution detail: precise schemas, validation rules, test scenarios.*

### Module: {Module ID} — {Module Name} (from A3)

#### 2.1 Endpoint: `{METHOD} /api/v1/{resource}`

| Field | Specification |
|-------|--------------|
| **Method** | {POST / GET / PUT / PATCH / DELETE} |
| **Endpoint** | {`/api/v1/resource`} |
| **Description** | {What this endpoint does — one sentence} |
| **Auth Required** | {Yes — session / No — public} |
| **Allowed Roles** | {admin, agent, candidate / all authenticated / public} |

**Input Schema:**
```json
{
  "field1": "string — required — description",
  "field2": "number — optional — description, default: 0",
  "field3": "boolean — required — description"
}
```

**Validation Rules:**
| Field | Rule | Error Message |
|-------|------|--------------|
| field1 | {min 3 chars, max 100} | {"field1 must be 3-100 characters"} |
| field2 | {integer, min 0, max 10000} | {"field2 must be between 0 and 10000"} |

**Success Response ({200/201}):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "field1": "value",
    "createdAt": "ISO-8601"
  }
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | VALIDATION_ERROR | Invalid input |
| 401 | UNAUTHORIZED | No/invalid session |
| 403 | FORBIDDEN | Wrong role |
| 404 | NOT_FOUND | Resource doesn't exist |
| 409 | CONFLICT | Duplicate |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Server error |

**Side Effects:**
- {e.g. Inserts row into `table_name`}
- {e.g. Queues email notification via BullMQ}
- {e.g. Logs event to audit trail}

**Test Scenarios:**
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| T1 | ✅ Happy path | {valid data} | {201 + created resource} |
| T2 | ❌ Missing required field | {omit field1} | {400 + validation error} |
| T3 | ❌ Invalid format | {bad data} | {400 + validation error} |
| T4 | ❌ Duplicate entry | {existing data} | {409 + conflict error} |
| T5 | ❌ Unauthorized | {no session} | {401 + unauthorized} |
| T6 | ❌ Forbidden role | {wrong role} | {403 + forbidden} |
| T7 | ⚡ Performance | {1000 requests} | {p95 < Xms} |

---

#### 2.2 Endpoint: `{Next Endpoint}`

> *Repeat section 2.1 for every endpoint implemented in this phase.*

---

### Module: {Next Module ID} — {Name}

> *Repeat section 2 for every module in this phase.*

---

## 3. UI Components (This Phase)

### Component: {Component Name}

| Field | Value |
|-------|-------|
| **Type** | {Page / Modal / Widget / Form} |
| **Route** | {`/route`} |
| **Module** | {M1 / M-ADMIN / etc.} |

**Data Flow:**
- On load: {fetch from GET /api/v1/...}
- On submit: {POST/PATCH to /api/v1/...}
- On error: {show inline error / toast}
- Loading state: {skeleton / spinner}

**Responsive Behavior:**
| Breakpoint | Layout |
|-----------|--------|
| Desktop (>1024px) | {Standard layout} |
| Tablet (768-1024px) | {Stacked} |
| Mobile (<768px) | {Single column, hamburger nav} |

---

## 4. Database Migrations (This Phase)

| Migration | Description | Reversible? |
|-----------|------------|------------|
| {001_create_table} | {Create X table with columns...} | {Yes / No} |

---

## 5. Configuration Items (This Phase)

> *Config settings from B7 that this phase introduces.*

| Key | Category | Default | Description |
|-----|----------|---------|------------|
| {e.g. feature.enable_registration} | feature_flag | true | Enable/disable user registration |
| {e.g. app.session_timeout_minutes} | security | 60 | Session timeout in minutes |

---

## 6. Phase Gate Criteria

| # | Criterion | How Verified | Pass? |
|---|-----------|-------------|-------|
| 1 | All test scenarios (T1-T7) pass for every endpoint | `npm test` | ☐ |
| 2 | API response time < Xms (p95) | Load test | ☐ |
| 3 | No security vulnerabilities | Security scan | ☐ |
| 4 | Code review approved | Peer review | ☐ |
| 5 | UI connected to real API (no mock data) | Manual verify | ☐ |
| 6 | Responsive on mobile (≥ 375px) | Browser test | ☐ |
| 7 | Test coverage > X% | Coverage report | ☐ |

---

## 7. Demo Script (This Phase)

> *Step-by-step walkthrough for milestone demo. Anyone should be able to follow this.*

1. {Open portal → landing page loads}
2. {Click "Register" → fill form → submit}
3. {Verify → redirected to dashboard}
4. {Perform key action → verify result}
5. {Check admin panel → data visible}
6. {Try unauthorized action → 403 forbidden}

---

## 8. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial phase PRD |

---

> *This PRD is the build contract for a specific phase. Developers implement EXACTLY what this document specifies. Testers test EXACTLY the scenarios listed. A3 provides the module overview — A5 provides the execution detail.*
