# HireStream — API Reference

**Base URL (production):** https://hirestream.osipl.dev/api/v1
**Base URL (local):** http://localhost:5000/api/v1
**Last updated:** 2026-04-14 (v1.4.0 — 127+ endpoints)

All endpoints return `{ success: boolean, data?: any, error?: { code, message } }`.
Authentication is session-based (cookie). RBAC enforced per route.

---

## Auth (`/auth/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create candidate/agent/employer account |
| POST | `/auth/login` | Public | Username + password (single-session enforced) |
| POST | `/auth/logout` | Authed | Destroy session |
| GET | `/auth/me` | Authed | Get current user info |
| POST | `/auth/send-otp` | Public | Send OTP via email/SMS (rate-limited 5/15min) |
| POST | `/auth/verify-otp` | Public | Verify 6-digit OTP |
| POST | `/auth/request-password-reset` | Public | Email password reset link (rate-limited 5/15min) |
| POST | `/auth/reset-password` | Public | Reset via emailed token |
| POST | `/auth/sso/himaccess` | Public | HIM Access SSO (stub, returns 501) |
| POST | `/auth/verify-aadhaar` | Authed | Aadhaar eKYC (stub, returns 501) |

## Two-Factor Auth (`/2fa/*`) — v1.4

| Method | Path | Description |
|--------|------|-------------|
| POST | `/2fa/setup` | Generate TOTP secret + QR code |
| POST | `/2fa/verify-and-enable` | Verify code + activate + return recovery codes |
| POST | `/2fa/disable` | Disable (requires current TOTP) |
| GET | `/2fa/status` | Check if 2FA enabled for current user |
| POST | `/2fa/verify-login` | Verify TOTP during login challenge |

## Candidates (`/candidates/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/candidates/profile` | Candidate | Own profile |
| PATCH | `/candidates/profile` | Candidate | Update profile fields |
| GET | `/candidates/profile/completion` | Candidate | Profile % + checklist |
| GET | `/candidates/applications` | Candidate | List own applications |
| GET | `/candidates/education` | Candidate | List records |
| POST/PUT/DELETE | `/candidates/education[/:id]` | Candidate | CRUD |
| GET | `/candidates/experience` | Candidate | List records |
| POST/PUT/DELETE | `/candidates/experience[/:id]` | Candidate | CRUD |
| GET | `/candidates/documents` | Candidate | Own documents |
| POST | `/candidates/documents` | Candidate | Upload (PDF/JPG/PNG ≤5MB, magic-byte verified) |
| GET | `/candidates/documents/:id/download` | Candidate | Stream file |
| DELETE | `/candidates/documents/:id` | Candidate | Delete |
| GET | `/candidates/profile/export.pdf` | Candidate | PDF resume export |

## Jobs (`/jobs/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/jobs` | Public | Search + filter + pagination |
| GET | `/jobs/:id` | Public | Detail |
| POST | `/jobs` | Agent/Employer | Create |
| PUT | `/jobs/:id` | Owner | Edit |
| PATCH | `/jobs/:id/status` | Owner | Activate/deactivate |
| GET | `/jobs/:id/applicants` | Owner/Admin | List applicants |
| POST | `/jobs/:id/save` | Candidate | Toggle bookmark |
| GET | `/jobs/saved/my` | Candidate | List saved jobs |
| POST | `/jobs/:id/apply` | Candidate | Apply (computes match score) |

## Applications (`/applications/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/applications/:id` | Owner | Detail with match breakdown |
| PATCH | `/applications/:id/status` | Agent/Employer | Update status |
| POST | `/applications/bulk-status` | Agent/Employer | Bulk update (max 50) |
| GET | `/applications/recommendations/for-me` | Candidate | Top 10 matched jobs |

## Agencies (`/agencies/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/agencies` | Public | List verified agencies |
| GET | `/agencies/leaderboard/top` | Public | **v1.4** Top 50 by composite score (placements + rating) |
| GET | `/agencies/me` | Agent | Own agency |
| POST | `/agencies/register` | Agent | Create agency |
| GET | `/agencies/candidates?skill=` | Agent/Employer/Admin | Search candidate pool |
| GET | `/agencies/:id/reviews` | Public | List reviews + average rating |
| POST | `/agencies/:id/reviews` | Candidate | Submit 1-5 rating + optional title/text |

## Drives (`/drives/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/drives` | Public | List active drives |
| GET | `/drives/my` | Agent | Own drives |
| GET | `/drives/:id` | Public | Detail |
| POST | `/drives` | Agent (verified) | Create |
| PATCH | `/drives/:id/approve` | Admin | Approve |
| PATCH | `/drives/:id/reject` | Admin | Reject with reason |
| POST | `/drives/:id/cancel` | Owner | Cancel |
| POST | `/drives/:id/interviews` | Agent | Schedule interview |
| GET | `/drives/:id/interviews` | Authed | List |
| PATCH | `/drives/:id/interviews/:iid` | Agent | Record result (auto-updates app status) |

## Placements (`/placements/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/placements` | Agent | Create from selected application |
| GET | `/placements/:id` | Owner | Detail |
| POST | `/placements/:id/accept` | Candidate | Accept offer |
| POST | `/placements/:id/decline` | Candidate | Decline with reason |

## Notifications (`/notifications/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications?limit=` | Paginated, filter by type/unread |
| GET | `/notifications/preferences` | User notification prefs |
| PATCH | `/notifications/preferences` | Update prefs |
| DELETE | `/notifications/:id` | Delete |

## Grievances (`/grievances/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/grievances` | Authed | Submit |
| GET | `/grievances` | Owner/Admin | List |
| GET | `/grievances/:id` | Owner/Admin | Detail |
| PATCH | `/grievances/:id` | Admin | Update status / add resolution notes |

## Resume Parser (`/resume/*`) — v1.2

| Method | Path | Description |
|--------|------|-------------|
| POST | `/resume/parse` | Heuristic extraction from text — name, email, phone, experience years, 200+ canonical skills, degrees, country prefs |

## Content (`/content/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/content/faq` | Public | List FAQ |
| GET | `/content/announcements` | Public | List time-bound announcements |
| GET | `/content/training` | Public | Upcoming events |

## Admin (`/admin/*`) — admin or superadmin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/health` | System health JSON |
| GET | `/admin/logs` | Last 100 Winston entries |
| GET | `/admin/config` | Env summary |
| GET | `/admin/agencies` | All agencies for approval queue |
| PATCH | `/admin/agencies/:id/verify` | Approve/reject agency |
| GET | `/admin/audit` | Audit log viewer |
| GET | `/admin/reports/dashboard` | Aggregated metrics |
| GET | `/admin/reports/by-district` | District breakdown |
| GET | `/admin/reports/by-agency` | Agency performance |
| GET | `/admin/reports/by-skill` | Skill demand vs supply |
| GET | `/admin/reports/by-placement-status` | Funnel |
| GET | `/admin/reports/by-country` | Destination breakdown |
| GET | `/admin/reports/by-sector` | Sector breakdown |
| GET | `/admin/reports/export/:entity.csv` | CSV download (candidates, jobs, applications, agencies, employers, drives, placements, grievances, users) |

## Super Admin (`/superadmin/*`) — superadmin only

| Method | Path | Description |
|--------|------|-------------|
| GET | `/superadmin/users` | List all users (filterable by role) |
| POST | `/superadmin/users` | Create user (any role) |
| PATCH | `/superadmin/users/:id/role` | Change role |
| PATCH | `/superadmin/users/:id/active` | Enable/disable |
| GET | `/superadmin/stats` | System-wide stats |
| POST | `/superadmin/reset` | Wipe DB (requires confirmation) |
| POST | `/superadmin/reseed` | Wipe + reseed demo data |
| GET | `/superadmin/flags` | Feature flags + maintenance settings |
| PATCH | `/superadmin/flags/:key` | Update flag value |
| GET | `/superadmin/logs` | Winston log tail with filters |
| GET | `/superadmin/integrations` | Integration health |
| POST | `/superadmin/integrations/smtp/test` | Send test email |
| GET | `/superadmin/settings` | Env snapshot (secrets redacted) |
| GET | `/superadmin/audit?userId=&action=&resourceType=` | Filtered audit log |

## Super Admin Ops (`/superadmin/ops/*`) — v1.2.2 + v1.3

| Method | Path | Description |
|--------|------|-------------|
| GET | `/superadmin/ops/overview` | Health score + process + deps + DB pool |
| GET | `/superadmin/ops/signals` | 16 smart alerts |
| GET | `/superadmin/ops/pipeline` | 7-stage placement funnel + bottleneck |
| GET | `/superadmin/ops/lookup?q=` | Cross-entity search |
| GET | `/superadmin/ops/reports` | List 8 pre-built reports |
| GET | `/superadmin/ops/reports/:name` | Run a report |
| GET | `/superadmin/ops/resources` | CPU/RAM/disk + sparkline history |
| GET | `/superadmin/ops/system` | Process list + ports + TCP |
| POST | `/superadmin/ops/sql/execute` | SQL sandbox (SELECT/WITH/EXPLAIN only) |
| GET | `/superadmin/ops/backups` | List backup files |
| POST | `/superadmin/ops/backups/create` | Trigger pg_dump |
| GET | `/superadmin/ops/backups/:filename/download` | Stream backup |
| DELETE | `/superadmin/ops/backups/:filename` | Delete backup |
| POST | `/superadmin/ops/process/restart` | Graceful restart (PM2-aware) |
| GET | `/superadmin/ops/trends` | 30-day daily aggregates |

---

## Rate Limits

| Limiter | Scope | Limit |
|---------|-------|-------|
| `apiLimiter` | All `/api/*` per IP | 100 req / 15 min (prod) |
| `authLimiter` | `/auth/*` per IP | 20 req / 15 min (prod) |
| `sensitiveLimiter` | `/auth/send-otp`, `/auth/request-password-reset` per IP | 5 req / 15 min (prod) |
| SQL Sandbox | per superadmin | 30 queries / 5 min |

## Error codes

| HTTP | Meaning |
|------|---------|
| 400 | Bad request (validation failed) |
| 401 | Not authenticated |
| 403 | Authenticated but lacks permission for this action |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate apply) |
| 413 | Payload too large (1MB body limit) |
| 429 | Rate limit exceeded |
| 500 | Server error |
| 503 | Maintenance mode active |

---

## Webhooks / Push

Web Push notifications (T2.2) are not yet implemented. Service worker scaffold is in place at `/sw.js`; integration with VAPID keys + push subscription backend is on the v1.5+ roadmap.
