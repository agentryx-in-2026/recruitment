# A6: Acceptance Criteria — {Project Name}
> **Template Version:** 1.0 | **Created By:** Picard (Solution Architect)
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Depends On:** A1 (Solution Brief), A5 (Phase PRDs)

---

## 1. Functional Acceptance Criteria

> *Every feature the customer asked for, with a clear pass/fail test.*

| # | Feature | Criterion | Verified By | Priority | Pass? |
|---|---------|-----------|-------------|----------|-------|
| F1 | {User Registration} | {User can register with valid email/password and receive JWT} | Unit test T1 | P0 | ☐ |
| F2 | {User Login} | {User can login with correct credentials} | Unit test | P0 | ☐ |
| F3 | {Dashboard} | {Dashboard loads and displays user data within 2s} | Integration test | P0 | ☐ |
| F4 | {Admin Panel} | {Admin can view/edit all users} | Integration test | P1 | ☐ |
| F5 | {Reports} | {Reports generate accurate data in PDF/CSV} | Manual verify | P1 | ☐ |

---

## 2. Non-Functional Acceptance Criteria

| # | Category | Criterion | Target | Verified By | Pass? |
|---|----------|-----------|--------|-------------|-------|
| NF1 | **Performance** | API response time (p95) | < 200ms | Load test | ☐ |
| NF2 | **Performance** | Page load (First Contentful Paint) | < 1.5s | Lighthouse | ☐ |
| NF3 | **Reliability** | Uptime | 99.5% | Monitoring | ☐ |
| NF4 | **Security** | No critical vulnerabilities | 0 critical | OWASP scan | ☐ |
| NF5 | **Security** | Passwords hashed | bcrypt 12 rounds | Code review | ☐ |
| NF6 | **Quality** | Test coverage | > 80% | Jest report | ☐ |
| NF7 | **Quality** | Zero console errors | 0 errors | Browser test | ☐ |
| NF8 | **Scalability** | Concurrent user support | 100+ users | Load test | ☐ |

---

## 3. Documentation Acceptance Criteria

| # | Document | Criterion | Pass? |
|---|----------|-----------|-------|
| D1 | B1 — API Reference | All endpoints documented with examples | ☐ |
| D2 | B2 — Developer Docs | New dev can `npm install && npm start` in < 5 min | ☐ |
| D3 | B3 — Test Plan | All test scenarios documented with results | ☐ |
| D4 | B4 — AI Enhancement | AI opportunities identified and rated | ☐ |
| D5 | B5 — Training Guide | Per-feature guide for end users | ☐ |
| D6 | B6 — Quick Wins | 110% extras identified and implemented | ☐ |
| D7 | B7 — Factory Report | Full pipeline trace generated | ☐ |

---

## 4. Delivery Package Checklist

| # | Deliverable | Description | Included? |
|---|------------|-------------|----------|
| 1 | Source Code | Complete, working application | ☐ |
| 2 | Test Suite | Unit + Integration + Security tests | ☐ |
| 3 | package.json | `npm install && npm start` works | ☐ |
| 4 | Dockerfile | `docker build && docker run` works | ☐ |
| 5 | .env.example | All config vars documented | ☐ |
| 6 | PMD Folder | All 13 documents (A1-A6, B1-B7) | ☐ |
| 7 | .zip Package | Downloadable from dashboard | ☐ |
| 8 | GitHub Repo | Code pushed with proper README | ☐ |

---

## 5. Sign-Off

| Phase | Gate Status | Approved By | Date |
|-------|-----------|------------|------|
| Phase 1 | ☐ Pass / ☐ Fail | {Agent: Data} | |
| Phase 2 | ☐ Pass / ☐ Fail | {Agent: Data} | |
| Phase 3 | ☐ Pass / ☐ Fail | {Agent: Data} | |
| **Final Delivery** | ☐ Pass / ☐ Fail | {Human Reviewer} | |

---

## 6. Defect Tolerance

| Severity | Tolerance | Action |
|----------|----------|--------|
| **Critical** | 0 allowed | Must fix before delivery |
| **Major** | 0 allowed | Must fix before delivery |
| **Minor** | Up to 3 | Document in known-issues, fix in next version |
| **Cosmetic** | Up to 5 | Document, low priority |

---

> *This is the FINAL checklist. If every box is checked, the project is complete.
> No box = no delivery.*
