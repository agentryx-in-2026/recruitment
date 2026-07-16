# P1: Stakeholder Register & RACI Matrix — {Project Name}
> **Template Version:** 1.0 | **Created By:** Project Manager
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Purpose:** Identify all stakeholders and define clear accountability for decisions, approvals, and deliverables.

---

## 1. Stakeholder Register

| # | Name | Organization | Role | Interest Level | Influence Level | Communication Preference | Frequency |
|---|------|-------------|------|---------------|----------------|------------------------|-----------|
| 1 | {Name} | {Client Org} | Project Sponsor | High | High | Email + Meetings | Weekly |
| 2 | {Name} | {Client Org} | Client IT Lead | High | Medium | Email + Chat | As needed |
| 3 | {Name} | {Client Org} | End User Representative | Medium | Low | Demo sessions | Per milestone |
| 4 | {Name} | {OSIPL} | Project Manager | High | High | Daily standup | Daily |
| 5 | {Name} | {OSIPL} | Solution Architect | High | High | Email + Chat | Daily |
| 6 | {Name} | {OSIPL} | Lead Developer | High | Medium | Chat | Daily |

---

## 2. RACI Matrix

> **R** = Responsible (does the work) | **A** = Accountable (final decision) | **C** = Consulted (input before decision) | **I** = Informed (told after decision)

| Activity | Client Sponsor | Client IT | Client Users | PM (OSIPL) | Architect | Dev Team |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Scope Approval** | **A** | C | C | R | C | I |
| **Architecture Decisions** | I | C | — | C | **A** | R |
| **Infrastructure Provisioning** | I | **A** | — | R | C | I |
| **Sprint Planning** | I | — | — | **A** | R | R |
| **Code Development** | — | — | — | I | C | **A**/R |
| **Testing & QA** | — | — | C | C | C | **A**/R |
| **UAT Sign-off** | **A** | C | R | R | I | I |
| **Deployment to Production** | I | R | — | **A** | R | R |
| **Status Reporting** | I | I | I | **A**/R | C | C |
| **Change Requests** | **A** | C | C | R | C | I |
| **Risk Escalation** | I | I | — | R | R | **A** |
| **Go-Live Approval** | **A** | C | C | R | C | I |
| **Post-Launch Support** | I | C | I | **A** | C | R |

---

## 3. Communication Plan

| Communication | Audience | Format | Frequency | Owner |
|--------------|----------|--------|-----------|-------|
| Status Report (P2) | All stakeholders | Email + Document | {Weekly / Biweekly} | PM |
| Sprint Demo | Client + PM + Architect | Video call / In-person | Per phase milestone | Dev Team |
| Technical Review | Architect + Dev Team | Meeting | As needed | Architect |
| Steering Committee | Client Sponsor + PM | Presentation | Monthly | PM |
| Issue Escalation | PM + Client IT | Email / Call | As needed | PM |
| Meeting Minutes (P3) | All attendees | Email + Document | After each meeting | PM |

---

## 4. Escalation Path

```
Level 1: Developer → Lead Developer (Technical issues)
    │
Level 2: Lead Developer → Solution Architect (Architecture/design issues)
    │
Level 3: Solution Architect → Project Manager (Resource/schedule issues)
    │
Level 4: Project Manager → Client Sponsor (Scope/budget/timeline issues)
```

---

## 5. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial stakeholder register |

---

> *Update this document whenever stakeholders change. Review RACI at the start of each phase.*
