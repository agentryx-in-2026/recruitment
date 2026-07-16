# A5: Phase-wise PRD — HireStream — Phase 2
> **Template Version:** 2.0 | **Created By:** Agent
> **Status:** Final | **Date:** 2026-04-02
> **Depends On:** A3 (Module Breakdown), A4 (Dev Plan)

---

## 1. Phase Summary

| Field | Value |
|-------|-------|
| **Phase** | 2 |
| **Phase Name** | Core Features |
| **Modules Included** | M1 (Candidate Profiles), M2 (Agency Management), M3 (Job Management) |
| **Duration** | Sprint 2 |
| **Milestone** | Feature Complete Job Board |

---

## 2. Module Execution Specs

### Module: M1 — Candidate Profiles & Reg

#### 2.1 Endpoint: `PATCH /api/v1/candidates/profile`

| Field | Specification |
|-------|--------------|
| **Method** | PATCH |
| **Endpoint** | `/api/v1/candidates/profile` |
| **Description** | Update the candidate profile information. |
| **Auth Required** | Yes — session |
| **Allowed Roles** | candidate |

**Input Schema:**
```json
{
  "skills": "array of strings — optional",
  "education": "string — optional",
  "experience": "string — optional"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "skills": ["react", "node"],
    "updatedAt": "ISO-8601"
  }
}
```

---

### Module: M2 — Agency Management

#### 2.2 Endpoint: `POST /api/v1/agencies/register`

| Field | Specification |
|-------|--------------|
| **Method** | POST |
| **Endpoint** | `/api/v1/agencies/register` |
| **Description** | Submit agency details and license number for platform verification. |
| **Auth Required** | Yes — session |
| **Allowed Roles** | agent |

**Input Schema:**
```json
{
  "companyName": "string — required",
  "licenseNo": "string — required"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "agencyId": "uuid",
    "status": "pending_approval"
  }
}
```

---

### Module: M3 — Job Management

#### 2.3 Endpoint: `POST /api/v1/jobs`

| Field | Specification |
|-------|--------------|
| **Method** | POST |
| **Endpoint** | `/api/v1/jobs` |
| **Description** | Post a new job listing as an approved agency |
| **Auth Required** | Yes — session |
| **Allowed Roles** | agent |

**Input Schema:**
```json
{
  "title": "string — required",
  "description": "string — required",
  "location": "string — required",
  "salary": "number — optional"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "active"
  }
}
```

---

## 3. Database Migrations (This Phase)

| Migration | Description | Reversible? |
|-----------|------------|------------|
| `create_candidates` | Create candidates table linking to `users` | Yes |
| `create_agencies` | Create agencies table linking to `users` | Yes |
| `create_jobs` | Create jobs table linking to `agencies` | Yes |

---

## 4. Phase Gate Criteria

| # | Criterion | How Verified | Pass? |
|---|-----------|-------------|-------|
| 1 | M1, M2, M3 Endpoints pass tests | `npm test` | ☐ |
| 2 | Candidates can update profile and upload docs | Manual | ☐ |
| 3 | Admin can approve/reject an agency | Manual | ☐ |
| 4 | Approved agents can post jobs | Manual | ☐ |

---

## 5. Demo Script (This Phase)

1. Candidate logs in -> updates their skills and education on dashboard.
2. Agency logs in -> submits license details for HPSEDC registration.
3. Administrator logs in -> clicks Verify New Agents -> Approves the agency.
4. Agency posts a new job listing with location "Dubai" and required skills "Nursing".
5. Candidate searches jobs -> sees the "Dubai Nursing" job list.
