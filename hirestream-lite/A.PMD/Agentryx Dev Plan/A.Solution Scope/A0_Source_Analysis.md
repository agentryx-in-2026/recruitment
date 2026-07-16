# A0: Source Analysis & Gap Report — {Project Name}
> **Template Version:** 1.0 | **Created By:** Solution Architect
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Input Document:** {FRS / SRS / TOR / BRD / Client Brief}

---

## 1. Source Document Register

> *What did the customer give us? Log every input document received.*

| # | Document Name | Type | Version | Pages | Received Date | Format |
|---|--------------|------|---------|-------|--------------|--------|
| 1 | {e.g. Functional Requirements Specification} | FRS | {1.0} | {12} | {YYYY-MM-DD} | {PDF / Word / Email} |
| 2 | {e.g. Scope of Work} | SOW | {1.0} | {5} | {YYYY-MM-DD} | {PDF} |
| 3 | {e.g. Meeting Notes / Verbal Brief} | Notes | {-} | {2} | {YYYY-MM-DD} | {Text} |

### Source Quality Assessment
| Criteria | Rating (1-5) | Notes |
|----------|-------------|-------|
| **Clarity** | {X/5} | {Are requirements unambiguous?} |
| **Completeness** | {X/5} | {Are all features described? Any gaps?} |
| **Consistency** | {X/5} | {Do sections contradict each other?} |
| **Testability** | {X/5} | {Can we write pass/fail tests from these requirements?} |
| **Technical Depth** | {X/5} | {Does it specify or constrain technology choices?} |

---

## 2. Requirements Extraction

> *Translate the customer's document into structured requirements. Every feature they mentioned, explicitly or implicitly.*

### 2.1 Functional Requirements (Extracted)
| # | Req ID | Requirement | Source Section | Priority | Ambiguity? |
|---|--------|------------|----------------|----------|-----------|
| 1 | FR-001 | {e.g. User registration with email verification} | {§2.2} | {P0 / P1 / P2} | {Clear / Needs Clarification} |
| 2 | FR-002 | {e.g. Role-based access control for 4 roles} | {§2.2} | {P0} | {Clear} |
| 3 | FR-003 | | | | |

### 2.2 Non-Functional Requirements (Extracted)
| # | Req ID | Requirement | Source Section | Target |
|---|--------|------------|----------------|--------|
| 1 | NFR-001 | {e.g. Page load time} | {§3.2} | {< 3 seconds} |
| 2 | NFR-002 | {e.g. Concurrent users} | {§3.2} | {5,000} |
| 3 | NFR-003 | {e.g. Uptime SLA} | {§3.2} | {99.9%} |
| 4 | NFR-004 | {e.g. Compliance standard} | {§2.9} | {ISO 27001, GIGW} |

### 2.3 Integration Requirements (Extracted)
| # | Req ID | External System | Purpose | Source Section | API Available? |
|---|--------|----------------|---------|----------------|---------------|
| 1 | IR-001 | {e.g. Aadhaar/UIDAI} | {Identity verification} | {§2.3} | {Yes / Unknown / No} |
| 2 | IR-002 | {e.g. SMS Gateway} | {OTP delivery} | {§2.2} | {Yes} |

---

## 3. Gap Analysis

> *What's missing, vague, or contradictory in the source document?*

### 3.1 Missing Requirements
| # | Gap ID | What's Missing | Impact | Our Recommendation | Customer Decision Needed? |
|---|--------|---------------|--------|-------------------|--------------------------|
| 1 | GAP-001 | {e.g. No mention of password reset flow} | {Users locked out if they forget password} | {Add forgot password with email OTP} | {No — standard feature, just add} |
| 2 | GAP-002 | {e.g. No data backup strategy specified} | {Data loss risk} | {Implement 6-hourly automated backups} | {Yes — confirm retention period} |
| 3 | GAP-003 | {e.g. No audit trail mentioned} | {Compliance gap for ISO 27001} | {Add audit_log table for admin actions} | {No — required by their own NFR} |

### 3.2 Ambiguous Requirements
| # | Amb ID | Ambiguous Statement | Our Interpretation | Alternative Interpretation | Resolution Required? |
|---|--------|--------------------|--------------------|--------------------------|---------------------|
| 1 | AMB-001 | {e.g. "iOS and Android applications"} | {PWA with install capability} | {Native App Store apps} | {Yes — confirm with customer} |
| 2 | AMB-002 | {e.g. "SSO login"} | {OAuth2 redirect flow} | {SAML federation} | {Yes — need API docs} |

### 3.3 Contradictions Found
| # | Con ID | Statement 1 | Statement 2 | Conflict | Resolution |
|---|--------|------------|------------|----------|-----------|
| 1 | CON-001 | {Text from section X} | {Text from section Y} | {They contradict on...} | {We go with X because...} |

### 3.4 Scope Creep Risks
| # | Risk | Source Statement | Why It Could Expand | Boundary We'll Set |
|---|------|-----------------|--------------------|--------------------|
| 1 | {e.g. "Integration with DigiLocker"} | {§2.8} | {DigiLocker API approval takes 3-6 months} | {Manual upload first, DigiLocker as Phase 2 enhancement} |

---

## 4. Our Additions (Beyond Customer Scope)

> *What are we adding that the customer didn't ask for?*

### 4.1 Standard Inclusions (Every Project Gets These)
| # | Addition | Category | Rationale |
|---|---------|----------|-----------|
| 1 | Admin Operations Module (config, logs, monitoring) | Operations | Standard for production-readiness — see B7 template |
| 2 | Security hardening (helmet, rate limiting, CORS) | Security | Industry standard — customer shouldn't have to ask |
| 3 | Structured logging with log level control | DevOps | Essential for debugging and monitoring |
| 4 | Health check endpoint | DevOps | Required for uptime monitoring |
| 5 | Error tracking and centralized error handling | Quality | Professional-grade error management |
| 6 | Responsive mobile layout | UX | Modern web standard |

### 4.2 Project-Specific Additions
| # | Addition | Why | Effort | Customer Approval Needed? |
|---|---------|-----|--------|--------------------------|
| 1 | {e.g. AI Resume Parsing} | {Differentiator — auto-fill profiles from CV upload} | {2 days} | {No — value-add} |
| 2 | {e.g. Candidate Journey Timeline} | {Visual engagement feature} | {1 day} | {No — value-add} |

---

## 5. Technology Decisions Forced by Source

> *Does the customer's document constrain our technology choices?*

| # | Constraint | Source | Impact on Our Stack | Compliant? |
|---|-----------|--------|-------------------|-----------|
| 1 | {e.g. Must use PostgreSQL} | {Client IT policy} | {Aligns with our standard stack} | ✅ |
| 2 | {e.g. Must comply with GIGW guidelines} | {§2.9} | {Adds accessibility requirements} | ✅ |
| 3 | {e.g. Bilingual (English + Hindi)} | {§1.2} | {Adds i18n module} | ✅ |
| 4 | {e.g. No cloud — on-premise only} | {Client IT policy} | {Local PostgreSQL, no Neon/AWS} | ✅ |

---

## 6. Questions for Customer

> *Anything we need answered before starting A1 (Solution Brief).*

| # | Question | Context | Impact if Unanswered | Default Assumption |
|---|---------|---------|---------------------|-------------------|
| 1 | {e.g. Will you provide HIM Access SSO API credentials?} | {Required for §2.2 SSO login} | {Cannot implement SSO — will use email/OTP only} | {Email/OTP auth as fallback} |
| 2 | {e.g. What is the expected user volume in Year 1?} | {Affects infrastructure sizing} | {Over/under-provision hardware} | {5,000-10,000 users} |
| 3 | | | | |

---

## 7. Effort Impact Analysis

> *How does the gap analysis affect our effort estimates?*

| Category | Items from Source | Gaps We're Filling | Our Additions | Total |
|----------|------------------|-------------------|---------------|-------|
| **Functional Requirements** | {X} | {+Y gaps} | {+Z additions} | {Total} |
| **Non-Functional Requirements** | {X} | {+Y gaps} | {+Z additions} | {Total} |
| **Integrations** | {X} | {+Y gaps} | {+Z additions} | {Total} |

### Effort Adjustment
| Factor | Estimated Impact |
|--------|-----------------|
| Gaps to fill | {+X days} |
| Ambiguities (assume worst case) | {+X days buffer} |
| Our additions (110%) | {+X days} |
| Integration uncertainty | {+X days buffer} |
| **Total adjustment** | **{+X days over naive estimate}** |

---

## 8. Approval

| Role | Name | Approved? | Date |
|------|------|-----------|------|
| Solution Architect | | ☐ | |
| Project Manager | | ☐ | |
| Customer (if shared) | | ☐ | |

---

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial analysis |

---

> *This document is the FIRST step in the pipeline. It bridges the customer's raw input to our standardized A1-A6 planning documents. Nothing proceeds until A0 is reviewed and gaps are either resolved or documented with assumptions.*
