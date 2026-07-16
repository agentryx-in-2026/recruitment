# HireStream — Technical Reference Manual

**Project:** Overseas Placement Portal (HPSEDC)  
**Version:** Beta 0.5 (API v1)  
**Date:** 13 Apr 2026  
**Audience:** Developers, System Administrators, Technical Staff

---

## 1. System Architecture

```
Client (React SPA)          Server (Express.js)              Database
─────────────────          ───────────────────              ────────────
React 18 + TypeScript       Express 4.x                     PostgreSQL 16
Tailwind CSS + shadcn/ui    Passport.js (auth)               Drizzle ORM
React Query (state)         Winston (logging)                20 tables
Wouter (routing)            Multer (file upload)             connect-pg-simple (sessions)
Zod (validation)            Nodemailer (email)
                            bcrypt (password hashing)
                            
         ↕ HTTP/JSON                    ↕ SQL
         
Nginx (SSL termination, reverse proxy)
PM2 (process manager, auto-restart)
```

**Deployment:** Single VM, PM2 cluster mode, Nginx reverse proxy, Let's Encrypt SSL

---

## 2. API Reference

**Base URL:** `https://hirestream.osipl.dev/api/v1`  
**Content-Type:** `application/json`  
**Authentication:** Session-based (cookie)

### 2.1 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login with email/password |
| POST | `/auth/logout` | Authenticated | Destroy session |
| GET | `/auth/me` | Authenticated | Get current user |
| POST | `/auth/send-otp` | Public | Send OTP to email |
| POST | `/auth/verify-otp` | Public | Verify OTP code |
| POST | `/auth/request-password-reset` | Public | Request password reset email |
| POST | `/auth/reset-password` | Public | Reset password with token |
| GET | `/auth/sso/himaccess` | Public | HIM Access SSO (stub — 501) |
| POST | `/auth/verify-aadhaar` | Public | Aadhaar verification (stub — 501) |

**Register — POST /auth/register**
```json
Request:  { "email": "user@example.com", "password": "min6chars", "role": "candidate|agent|employer" }
Response: { "success": true, "data": { "id": "uuid", "email": "...", "role": "..." } }
Errors:   400 (validation), 409 (duplicate email)
```

**Login — POST /auth/login**
```json
Request:  { "username": "email@example.com", "password": "..." }
Response: { "success": true, "data": { "id": "uuid", "email": "...", "role": "..." } }
Errors:   400 (validation), 401 (wrong credentials)
```

### 2.2 Candidates

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/candidates/profile` | Yes | candidate | Get own profile |
| PATCH | `/candidates/profile` | Yes | candidate | Update profile |
| GET | `/candidates/profile/completion` | Yes | candidate | Get completion % |
| GET | `/candidates/profile/pdf` | Yes | candidate | Export HTML profile |
| GET | `/candidates/applications` | Yes | candidate | List own applications |
| PUT | `/candidates/applications/:id/status` | Yes | agent/employer/admin | Update application status |
| POST | `/candidates/education` | Yes | candidate | Add education |
| GET | `/candidates/education` | Yes | candidate | List education |
| PUT | `/candidates/education/:id` | Yes | candidate | Update education |
| DELETE | `/candidates/education/:id` | Yes | candidate | Delete education |
| POST | `/candidates/experience` | Yes | candidate | Add experience |
| GET | `/candidates/experience` | Yes | candidate | List experience |
| PUT | `/candidates/experience/:id` | Yes | candidate | Update experience |
| DELETE | `/candidates/experience/:id` | Yes | candidate | Delete experience |

**Profile Completion — GET /candidates/profile/completion**
```json
Response: {
  "success": true,
  "data": {
    "percentage": 63,
    "completed": 5,
    "total": 8,
    "missing": ["education", "experience", "documents"],
    "checks": [
      { "name": "fullName", "done": true },
      { "name": "email", "done": true },
      ...
    ]
  }
}
```

### 2.3 Documents

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/candidates/documents` | Yes | candidate | Upload file (multipart/form-data) |
| GET | `/candidates/documents` | Yes | candidate | List own documents |
| GET | `/candidates/documents/:id/download` | Yes | candidate/agent/admin | Download file |
| DELETE | `/candidates/documents/:id` | Yes | candidate/admin | Delete document |

**Upload — POST /candidates/documents**
```
Content-Type: multipart/form-data
Fields: file (binary), type (cv|passport|certificate|other)
Max Size: 5 MB
Allowed: PDF, JPG, PNG
```

### 2.4 Jobs

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/jobs` | Yes | agent/employer | Create job |
| GET | `/jobs` | Public | — | Search jobs (with filters + pagination) |
| GET | `/jobs/:id` | Public | — | Get single job |
| PUT | `/jobs/:id` | Yes | owner/admin | Edit job |
| PATCH | `/jobs/:id/status` | Yes | owner/admin | Activate/deactivate/close |
| GET | `/jobs/:id/applicants` | Yes | owner/admin | List applicants with details |
| POST | `/jobs/:id/apply` | Yes | candidate | Apply to job |

**Search — GET /jobs?q=&country=&location=&sector=&minExp=&maxExp=&page=&limit=&sort=&order=**
```json
Response: {
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
}
Headers: X-Total-Count: 45
```

**Match Score Algorithm (on apply):**
```
Skill Match:      (overlapping_skills / required_skills) × 50 points
Experience Match: min(candidate_years / required_years, 1) × 30 points
Country Match:    job_country in candidate_preferred_countries → 20 points
Total:            0–100 (clamped)
```

### 2.5 Applications

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| PATCH | `/applications/bulk-status` | Yes | agent/employer/admin | Bulk status update (max 50) |
| GET | `/applications/:id` | Yes | authenticated | Detail with score breakdown |
| GET | `/applications/recommendations/for-me` | Yes | candidate | Top 10 recommended jobs |

**Score Breakdown — GET /applications/:id**
```json
Response: {
  "data": {
    "matchScore": 85,
    "scoreBreakdown": {
      "total": 85,
      "skill": { "score": 50, "max": 50, "detail": "2/2 skills match (react, node.js)" },
      "experience": { "score": 15, "max": 30, "detail": "1/2 years (below requirement)" },
      "country": { "score": 20, "max": 20, "detail": "UAE is in preferred countries" }
    },
    "job": { ... },
    "candidate": { ... }
  }
}
```

### 2.6 Recruitment Drives, Interviews & Placements

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/drives` | Yes | agent (verified) | Create recruitment drive |
| GET | `/drives` | Public | — | List drives (default: approved only, ?status= filter) |
| GET | `/drives/my` | Yes | agent | Agent's own drives |
| GET | `/drives/:id` | Public | — | Single drive detail |
| PATCH | `/drives/:id` | Yes | owning agent | Edit drive (pending only) |
| DELETE | `/drives/:id` | Yes | owning agent/admin | Cancel drive |
| PATCH | `/drives/:id/approve` | Yes | admin | Approve drive (notifies agency) |
| PATCH | `/drives/:id/reject` | Yes | admin | Reject drive with reason |
| POST | `/drives/:driveId/interviews` | Yes | agent/admin | Schedule interview |
| GET | `/drives/:driveId/interviews` | Yes | agent/admin | List interviews for drive |
| GET | `/drives/interviews/my` | Yes | candidate | Candidate's own interviews |
| PATCH | `/drives/interviews/:id/result` | Yes | agent/admin | Record result (selected/rejected/hold) |
| POST | `/drives/placements` | Yes | agent/admin | Create placement for selected app |
| GET | `/drives/placements/:id` | Yes | authenticated | Placement detail |
| PATCH | `/drives/placements/:id/accept` | Yes | candidate | Accept placement offer |
| PATCH | `/drives/placements/:id/decline` | Yes | candidate | Decline placement with reason |

**Placement Pipeline:**
```
Drive Created (pending) → Admin Approves → Interview Scheduled → Result Recorded
  → Selected → Placement Offered → Candidate Accepts/Declines → Placed
```

### 2.7 Agencies

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/agencies/register` | Yes | agent | Register agency |
| GET | `/agencies/me` | Yes | agent | Get own agency |
| GET | `/agencies/candidates` | Yes | agent/employer/admin | Search candidates |

### 2.7 Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications?type=&unreadOnly=&page=&limit=` | Yes | List with filters |
| PATCH | `/notifications/:id/read` | Yes | Mark as read |
| POST | `/notifications/mark-all-read` | Yes | Mark all as read |
| DELETE | `/notifications/:id` | Yes | Delete notification |
| GET | `/notifications/preferences` | Yes | Get email/sms/inApp prefs |
| PATCH | `/notifications/preferences` | Yes | Update preferences |

### 2.8 Admin

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/admin/health` | Public | — | System health check |
| GET | `/admin/logs` | Yes | admin | Application logs |
| GET | `/admin/config` | Yes | admin | System config |
| GET | `/admin/agencies` | Yes | admin | List all agencies |
| PATCH | `/admin/agencies/:id/verify` | Yes | admin | Approve/revoke agency |

### 2.9 Admin Reports

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/admin/reports/dashboard` | Yes | admin | Real aggregated dashboard (users, agencies, jobs, applications, placements, drives, grievances) |
| GET | `/admin/reports/by-district` | Yes | admin | Candidates + applications + placements by location |
| GET | `/admin/reports/by-agency` | Yes | admin | Agency performance (jobs, applications, selections, placements, avg score) |
| GET | `/admin/reports/by-skill` | Yes | admin | Skill demand (from jobs) vs supply (from candidates) |
| GET | `/admin/reports/by-placement-status` | Yes | admin | Application funnel (submitted→reviewed→...→placed) + summary |
| GET | `/admin/reports/by-country` | Yes | admin | Jobs, applications, placements by destination country |
| GET | `/admin/reports/by-sector` | Yes | admin | Jobs and placements grouped by company/sector |

---

### 2.10 Grievances

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/grievances` | Yes | any | Submit grievance (category, subject, description) |
| GET | `/grievances/my` | Yes | any | Own grievances |
| GET | `/grievances` | Yes | admin | All grievances (filter: ?status=&category=) |
| GET | `/grievances/:id` | Yes | owner/admin | Single grievance detail |
| PATCH | `/grievances/:id` | Yes | admin | Update status, admin notes, resolution |

**Grievance Status Flow:** `submitted → under_review → action_taken → resolved | escalated`

### 2.11 Content (FAQ, Announcements, Training)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/content/faq` | Public | — | Active FAQs grouped by category |
| POST | `/content/faq` | Yes | admin | Create FAQ (EN + HI, category, sort) |
| PUT | `/content/faq/:id` | Yes | admin | Update FAQ |
| DELETE | `/content/faq/:id` | Yes | admin | Delete FAQ |
| GET | `/content/announcements` | Public | — | Active announcements (time-bound, role-filtered) |
| POST | `/content/announcements` | Yes | admin | Create announcement (target role, dates, pin) |
| PUT | `/content/announcements/:id` | Yes | admin | Update announcement |
| DELETE | `/content/announcements/:id` | Yes | admin | Delete announcement |
| GET | `/content/training` | Public | — | Upcoming training events |
| POST | `/content/training` | Yes | admin | Create training event |
| PUT | `/content/training/:id` | Yes | admin | Update training event |
| DELETE | `/content/training/:id` | Yes | admin | Delete training event |

### 2.12 Audit Log

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/admin/audit` | Yes | admin | Paginated audit log (?action=&resourceType=&userId=&page=&limit=) |

---

### 2.13 Internationalization (i18n)

| Feature | Detail |
|---------|--------|
| Library | react-i18next + i18next |
| Languages | English (en), Hindi (hi) |
| Toggle | Header button (हिं / EN) |
| Persistence | localStorage key: `hirestream-lang` |
| Locale files | `client/src/locales/en.json`, `client/src/locales/hi.json` |
| Coverage | Header, footer, auth page, FAQ page, grievance page, navigation |
| Fallback | English |

---

## 3. Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Human-readable error description"
  }
}
```

| Code | Meaning |
|------|---------|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — not logged in |
| 403 | Forbidden — wrong role or not owner |
| 404 | Not Found — resource doesn't exist |
| 409 | Conflict — duplicate (e.g., email, application) |
| 429 | Rate Limited — too many requests |
| 500 | Server Error — unexpected failure |
| 501 | Not Implemented — stub for future integration |

---

## 4. Rate Limiting

| Route Group | Limit | Window |
|-------------|-------|--------|
| `/api/v1/auth/*` | 20 requests | 15 minutes |
| `/api/v1/*` (all others) | 100 requests | 15 minutes |

Exceeding the limit returns `429 Too Many Requests`.

---

## 5. Database Schema

**20 tables** across the following domains:

| Domain | Tables |
|--------|--------|
| Users & Auth | `users`, `otp_codes`, `password_reset_tokens` |
| Candidates | `candidates`, `candidate_education`, `candidate_experience`, `documents` |
| Jobs & Applications | `jobs`, `applications` |
| Agencies & Employers | `recruitment_agents`, `employers` |
| Recruitment | `recruitment_drives`, `interviews`, `placements` |
| Admin & Support | `grievances`, `audit_log`, `faq`, `announcements`, `training_events` |
| System | `notifications` |

Primary keys: UUID (`gen_random_uuid()`).  
Foreign keys: cascade-free (no cascade deletes).  
ORM: Drizzle ORM with TypeScript schema in `shared/schema.ts`.

---

## 6. File Upload

| Setting | Value |
|---------|-------|
| Max file size | 5 MB |
| Allowed types | PDF, JPG, PNG |
| Storage location | `uploads/` directory |
| Filename format | `{timestamp}-{random-hex}.{ext}` |
| MIME validation | Yes (multer fileFilter) |

---

## 7. Notification System

Notifications are dispatched via the central `notify()` service:

1. **In-App**: Always created in the `notifications` table
2. **Email**: Sent via nodemailer if `user.notifyEmail = true` and SMTP is configured
3. **SMS**: Sent via SMS service if `user.notifySms = true` and SMS gateway is configured

Events that trigger notifications:
- User registration (welcome)
- Application submitted (candidate + job owner)
- Application status change (candidate)
- Bulk status update (each affected candidate)
- Agency verification (agent)

---

## 8. Security

| Measure | Implementation |
|---------|---------------|
| Password hashing | bcrypt (12 rounds) |
| Session storage | connect-pg-simple (PostgreSQL) |
| Session cookie | httpOnly, secure (prod), sameSite=strict, 24h maxAge |
| Input validation | Zod schemas on all endpoints |
| Rate limiting | express-rate-limit (20/15min auth, 100/15min API) |
| Security headers | Helmet.js |
| File upload validation | MIME type + extension check |
| SQL injection | Parameterized queries via Drizzle ORM |
| RBAC | Middleware: `protect()` + `requireRole()` |
| OTP | Cryptographic random, DB-stored, 5-min TTL, max 5 attempts |
| Password reset | Random 32-byte token, 1-hour expiry, single-use |
| Anti-enumeration | Password reset always returns 200 |

---

## 9. Deployment

| Component | Detail |
|-----------|--------|
| **Runtime** | Node.js 20.x LTS |
| **Process Manager** | PM2 (auto-restart, boot persistence) |
| **Web Server** | Nginx (SSL termination, reverse proxy) |
| **SSL** | Let's Encrypt (auto-renew via certbot) |
| **Domain** | hirestream.osipl.dev |
| **IP** | 34.131.128.67 |
| **Database** | PostgreSQL 16 (localhost) |
| **Ports** | 80 (HTTP → 443), 443 (HTTPS → 5000), 5000 (app) |

### Deploy Process
```bash
npm run build           # Compile TypeScript + bundle React
npx pm2 restart hirestream   # Restart with new build
npx pm2 logs hirestream      # Verify startup
curl https://hirestream.osipl.dev/api/v1/admin/health  # Health check
```

---

## 10. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for session signing (min 10 chars) |
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | development / production / test |
| `TEST_DATABASE_URL` | No | Test database connection string |
| `SMTP_HOST` | No | Email server hostname |
| `SMTP_PORT` | No | Email server port (default: 587) |
| `SMTP_USER` | No | Email username |
| `SMTP_PASS` | No | Email password |
| `SMTP_FROM` | No | From address for emails |
| `SMS_PROVIDER` | No | twilio / nic / mock |
| `SMS_API_KEY` | No | SMS gateway API key |
| `UPLOAD_DIR` | No | File upload directory (default: /data/uploads) |
| `MAX_FILE_SIZE_MB` | No | Max upload size (default: 5) |
| `HIM_ACCESS_CLIENT_ID` | No | HIM Access SSO client ID |
| `UIDAI_API_ENDPOINT` | No | UIDAI Aadhaar verification URL |
| `DIGILOCKER_API_ENDPOINT` | No | DigiLocker integration URL |

---

## 11. Logging

| Setting | Value |
|---------|-------|
| Library | Winston |
| Format | JSON (file) / Colored text (console) |
| Log file | `logs/app.log` (10MB rotation, 14 files) |
| Error file | `logs/error.log` (5MB rotation, 14 files) |
| Levels | error, warn, info, debug |
| API logging | Every `/api/*` request logged with method, path, status, duration |

---

*This manual will be extended with Phase 3 features (drives, interviews, placements, reports, grievances) and Phase 5 features (Ops Console, Admin Console) as they are built.*
