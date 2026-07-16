# P4: Change Request Log — {Project Name}
> **Template Version:** 1.0 | **Created By:** Project Manager
> **Status:** Living Document | **Last Updated:** {YYYY-MM-DD}
> **Purpose:** Track ALL scope changes — requested, approved, rejected, or deferred. Prevents scope creep and provides audit trail.

---

## 1. Change Request Process

```
Change Identified
    │
    ▼
PM logs in P4 with status "Requested"
    │
    ▼
Solution Architect assesses impact (effort, risk, timeline)
    │
    ▼
PM presents to Client / Steering Committee
    │
    ├── APPROVED → Update A3 (modules), A4 (phasing), timeline
    ├── REJECTED → Document reason, close CR
    └── DEFERRED → Move to future phase/version, close for now
```

---

## 2. Change Request Register

| CR # | Date | Requested By | Description | Modules Affected | Impact Assessment | Effort Impact | Timeline Impact | Priority | Status | Decision By | Decision Date |
|------|------|-------------|-------------|-----------------|-------------------|---------------|-----------------|----------|--------|------------|--------------|
| CR-001 | {Date} | {Name/Role} | {What is being requested — concise description} | {M2, M5} | {Brief impact analysis} | {+X days} | {+X days / No change} | {High/Med/Low} | {Requested / Approved / Rejected / Deferred} | {Name} | {Date} |
| CR-002 | | | | | | | | | | | |
| CR-003 | | | | | | | | | | | |

---

## 3. Change Request Detail Template

> *For each significant CR, document the full analysis below.*

### CR-{XXX}: {Title}

| Field | Value |
|-------|-------|
| **CR Number** | CR-{XXX} |
| **Date Raised** | {YYYY-MM-DD} |
| **Raised By** | {Name — Client / Internal} |
| **Category** | {New Feature / Modification / Bug / Enhancement / Removal} |
| **Priority** | {Critical / High / Medium / Low} |

**Description:**
{What is being requested? Be specific.}

**Business Justification:**
{Why is this change needed? What problem does it solve?}

**Impact Analysis:**

| Area | Current State | After Change | Impact |
|------|-------------|-------------|--------|
| **Scope** | {X modules} | {X+1 modules} | {New module or modified module} |
| **Effort** | {X days} | {X+Y days} | {+Y days} |
| **Timeline** | {Go-live: Date} | {Go-live: Date+Y} | {Y days delay / no delay if parallel} |
| **Cost** | {X person-days} | {X+Y person-days} | {Additional effort} |
| **Risk** | {Current risk level} | {New risk level} | {Any new risks introduced} |
| **Architecture** | {Current design} | {Any changes needed?} | {DB schema / API changes / UI changes} |

**Decision:**
| Decision | Approved / Rejected / Deferred |
|----------|------|
| **Decided By** | {Name, Role} |
| **Date** | {YYYY-MM-DD} |
| **Reason** | {Why approved / why rejected} |
| **Phase** | {Which phase this will be implemented in, if approved} |

**Documents Updated (if approved):**
- [ ] A3 — Module Breakdown updated
- [ ] A4 — Phasing updated
- [ ] A5 — PRD updated
- [ ] P0 — Executive Summary updated (if scope changed significantly)
- [ ] P2 — Noted in next status report

---

## 4. Summary Statistics

| Metric | Count |
|--------|-------|
| **Total CRs Raised** | {0} |
| **Approved** | {0} |
| **Rejected** | {0} |
| **Deferred** | {0} |
| **Pending** | {0} |
| **Total Effort Impact** | {+0 days} |
| **Total Timeline Impact** | {+0 days} |

---

> *Every scope change — no matter how small — gets a CR number. This protects both the client and the development team. "It was just a small change" is how projects go over budget. Track everything.*
