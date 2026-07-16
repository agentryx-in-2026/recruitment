# HireStream — Future Enhancements

**Purpose:** Backlog of features and improvements beyond v1.2.0 GA.
**Source:** Distilled from Phase 5 master plan, session roadmap discussions, and post-v1.2 opportunities.
**Created:** 2026-04-14
**Owner:** Subhash Thakur
**Status:** Post-GA backlog — not blocking v1.2 deployment.

---

## How This Doc Is Organized

- **Tier 2** — v1.3 candidates. High-value enhancements that round out Phase 5 ambitions. Ship incrementally after UAT.
- **Tier 3** — v1.4+ bonus features. "Wow" items that differentiate the portal nationally.
- **Tier 4 — Operational & Infrastructure.** Non-product work that matters for long-term reliability.

Each item has: **scope · effort estimate · dependencies · business value**.

---

## Tier 2 — v1.3 Roadmap (Post-UAT enhancements)

### T2.1 — PDF Resume Parsing

**Scope:** Extend the AI Resume Parser to accept PDF uploads (currently text-paste only).
**Implementation:**
- Add `pdf-parse` or `pdfjs-dist` dependency
- New endpoint: `POST /api/v1/resume/parse-pdf` (multipart upload)
- Reuse existing `resume-parser.routes.ts` heuristics
- Frontend: add PDF file upload option in `ResumeParseWidget`
**Effort:** 30-60 min
**Dependencies:** None (heuristic parser already built)
**Business value:** Removes friction — candidates can upload their actual CV file instead of copy-pasting text

---

### T2.2 — Web-Push Notifications

**Scope:** Real-time push notifications via service worker for job matches, status changes, messages.
**Implementation:**
- Generate VAPID key pair
- New table: `push_subscriptions` (userId, endpoint, p256dh, auth)
- `POST /api/v1/notifications/subscribe` — save subscription
- Extend `notify()` service to send push via `web-push` library
- Service worker: `self.addEventListener("push", ...)` handler
- Permission prompt in candidate dashboard
**Effort:** 2-3 hours
**Dependencies:** HPSEDC provides VAPID key for their domain
**Business value:** Candidates get instant alerts on shortlist/interview without checking the portal

---

### T2.3 — Branded HPSEDC Email Templates

**Scope:** Upgrade all transactional emails (OTP, password reset, notifications) with HPSEDC branding.
**Implementation:**
- HTML email template with Indian tricolor header + HPSEDC logo
- Reusable CTA button component
- Footer with govt compliance text + unsubscribe link
- Hindi + English versions (auto-switch based on user's `preferredLanguage`)
- Update `server/services/email.service.ts` to use templates
**Effort:** 1-2 hours
**Dependencies:** None
**Business value:** Professional communication, brand consistency, government trust signal

---

### T2.4 — Admin Analytics Expansion

**Scope:** Richer data visualizations in Admin Console beyond current counts.
**Implementation:**
- **Placement trend line** (monthly placements over last 12 months)
- **Geographic heatmap** of candidate origin by HP district (12 districts)
- **Skill demand vs supply** forecast (stacked bar: required in jobs vs available in candidates)
- **Application funnel** visualization (Registered → Applied → Shortlisted → Placed)
- **Agency performance** scatter plot (placements × rating)
- All charts powered by existing Recharts library; data from `/admin/reports/*` endpoints
**Effort:** 2-3 hours
**Dependencies:** None (Recharts already installed)
**Business value:** Better decision-making for HPSEDC leadership; data-driven reports for state assembly

---

### T2.5 — Public Agency Profiles with Reviews

**Scope:** Agency directory on landing page — browsable by candidates before registration.
**Implementation:**
- New route: `/agencies` (public)
- List + filter by specialization, location, verification status, rating
- Individual agency detail page: `/agencies/:id`
- Shows: agency info, specializations, placement count, average rating, individual reviews with dates
- "Apply to their openings" CTA linking to filtered jobs
**Effort:** 1-2 hours
**Dependencies:** Agency reviews backend (already done Day 17)
**Business value:** Transparency; candidates choose agencies based on real performance data

---

### T2.6 — Bulk Candidate Actions for Agencies

**Scope:** Agents can multi-select candidates and take bulk actions.
**Implementation:**
- Checkbox column in candidate list (agent dashboard)
- Bulk actions bar: "Shortlist Selected", "Email Selected", "Export Selected as CSV"
- Backend endpoint already exists (`POST /api/v1/applications/bulk-status`) — just needs UI wiring for candidate-level actions
- New endpoint: `POST /api/v1/agencies/candidates/bulk-contact` for mass email
**Effort:** 1-2 hours
**Dependencies:** None
**Business value:** Agencies processing 50+ applicants per drive save significant time

---

### T2.7 — Saved Searches + Email Alerts (Candidates)

**Scope:** Candidates save their job search criteria; get email when matching jobs are posted.
**Implementation:**
- New table: `saved_searches` (userId, name, filters JSON, alertFrequency, createdAt, lastNotifiedAt)
- "Save this search" button on candidate job browse
- Cron job (daily): check new jobs against saved searches, email digest
- Manage searches page: `/saved-searches`
**Effort:** 2 hours
**Dependencies:** Email service (already built)
**Business value:** Re-engagement driver; candidates return to portal without active prompting

---

### T2.8 — Interview Scheduler with Calendar Invite

**Scope:** When agencies schedule interviews, candidates receive `.ics` calendar invite.
**Implementation:**
- Install `ics` npm package
- Extend existing interview scheduling endpoint (`POST /api/v1/drives/:id/interviews`)
- Generate `.ics` on creation, attach to notification email
- Support Google Calendar, Apple Calendar, Outlook auto-add
**Effort:** 1 hour
**Dependencies:** Email service
**Business value:** Professional scheduling; candidates don't miss interviews

---

### ~~T2.9 — Ops Console Advanced Features~~ ✅ SHIPPED Day 22 (v1.3.0)

**Status:** Complete. All originally scoped items delivered:
- ✅ Process list (top 10 by CPU + top 10 by memory)
- ✅ TCP connection count + listening ports
- ✅ Log file tail viewer (was Day 19)
- ✅ Disk usage per mount with progress bars
- ✅ SQL sandbox (SELECT/WITH/EXPLAIN only, 5s timeout, 30 queries/5min rate limit, 500-row cap)
- ⚠️ PM2 process restart button — **deferred to v1.4** (security review needed; CLI-only for now)
- **BONUS shipped:** CPU + Memory sparklines (60-sample ring buffer, 5s polling)
- **BONUS shipped:** Backup management (create via pg_dump, list, download, delete)
- **BONUS shipped:** Activity trends (30-day bar charts for submissions/placements/logins)
**Dependency added:** `systeminformation` npm package
**Effort actual:** ~3 hours (within estimate)

---

### T2.10 — Print-Friendly Stylesheets

**Scope:** Candidate profiles, job postings, and admin reports print cleanly (for officers who print for records).
**Implementation:**
- `@media print` CSS rules across all pages
- Hide sidebars, headers, action buttons
- Page break controls on multi-page reports
- Black/white fallback for charts
- "Print" button on key pages
**Effort:** 1-2 hours
**Dependencies:** None
**Business value:** Govt offices still print; compliance with physical records requirement

---

### Tier 2 Summary

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| T2.1 PDF parsing | 30-60 min | High | 1 |
| T2.4 Admin analytics | 2-3 hr | High | 2 |
| T2.3 Branded emails | 1-2 hr | High | 3 |
| T2.5 Public agency profiles | 1-2 hr | Medium | 4 |
| T2.6 Bulk actions | 1-2 hr | Medium | 5 |
| T2.7 Saved searches | 2 hr | Medium | 6 |
| T2.8 Calendar invites | 1 hr | Medium | 7 |
| T2.2 Web-push | 2-3 hr | Medium | 8 |
| T2.9 Ops Console | 3-4 hr | Low | 9 |
| T2.10 Print styles | 1-2 hr | Low | 10 |
| **Total** | **~15-22 hr** | | |

**Suggested v1.3 bundle:** T2.1 + T2.3 + T2.4 + T2.5 + T2.8 (~8-10 hours total) — covers the highest-impact UX polish + visibility improvements.

---

## Tier 3 — v1.4+ Wow Features

### ~~T3.1 — Agency Performance Leaderboard~~ ✅ SHIPPED Day 23 (v1.4.0)

**Status:** Live on landing page below stakeholder cards.
- ✅ `GET /api/v1/agencies/leaderboard/top` — top 50 by composite score
- ✅ Score formula: `placements × 10 + averageRating × 5`
- ✅ 3 badges: top_placer (50+ placements), five_star (4.5+ rating w/ 5+ reviews), well_reviewed (20+ reviews)
- ✅ Public landing-page section with medal ranking
- ⏭️ Cron-based monthly update — current implementation computes live (acceptable for current data volume)

---

### T3.2 — Multi-Language (Regional Dialects)

**Scope:** Beyond EN/HI — add Pahari, Punjabi, Urdu for regional accessibility.
**Implementation:**
- Add locale files: `locales/pa.json`, `locales/ur.json`, `locales/pah.json`
- Professional translation service (govt-approved translators)
- Language selector in header
- Hindi fallback if translation missing
**Effort:** 8-10 hours (mostly translation time)
**Business value:** Inclusive access for non-Hindi speakers in HP border districts

---

### T3.3 — Offline PWA Mode with IndexedDB

**Scope:** Candidates can browse saved jobs + draft applications offline; sync when reconnected.
**Implementation:**
- Extend service worker with IndexedDB cache for jobs + profile
- Draft application saves to IndexedDB locally
- Background Sync API queues submissions for when online
- "You're offline" banner with last sync time
**Effort:** 6-8 hours
**Business value:** Works in low-connectivity areas (rural HP)

---

### T3.4 — Full WCAG AA Accessibility Audit

**Scope:** Formal accessibility compliance for GIGW and RPwD Act 2016.
**Implementation:**
- Screen reader testing (NVDA, JAWS)
- Keyboard-only navigation audit
- Color contrast ratios (4.5:1 text, 3:1 UI)
- Focus indicators, skip-to-content, ARIA labels
- Fix all violations flagged by axe-core
- Submit to GIGW certification
**Effort:** 12-16 hours
**Business value:** Legal compliance + serves visually impaired users

---

### T3.5 — Smart Match via Vector Embeddings

**Scope:** Replace heuristic matching with ML-powered similarity scoring.
**Implementation:**
- Install pgvector extension in Postgres
- Generate embeddings for candidate profiles + job descriptions (OpenAI or local sentence-transformers)
- Cosine similarity search for top-K matches
- Fallback to heuristic if embeddings unavailable
- "Why this match?" explainability tooltip
**Effort:** 10-14 hours
**Dependencies:** OpenAI API key OR self-hosted embedding model
**Business value:** Dramatically better match quality; differentiates HireStream from other job portals

---

### T3.6 — Video Interview Integration

**Scope:** Interview scheduling page embeds video call (Daily.co / Twilio Video / Jitsi).
**Implementation:**
- Integrate third-party SDK
- Interview detail page shows "Join Call" button 15 min before scheduled time
- Recording option (with candidate consent)
- Post-interview notes field for agents
**Effort:** 8-12 hours
**Dependencies:** Third-party service account
**Business value:** Eliminates need for separate Zoom/Meet links; unified experience

---

### T3.7 — Document E-Signature

**Scope:** Offer letters + acceptance forms signed digitally via DigiLocker / eSign.
**Implementation:**
- Integrate DigiLocker API for Aadhaar-based e-sign
- Contract template engine (HTMLgenerated PDF with merge fields)
- Signed document archive per placement
**Effort:** 12-16 hours
**Dependencies:** DigiLocker partnership with HPSEDC
**Business value:** Legal validity of overseas employment contracts; paperless workflow

---

### ~~T3.8 — Two-Factor Authentication~~ ✅ SHIPPED Day 23 (v1.4.0)

**Status:** Backend complete; UI for opt-in pending in v1.5.
- ✅ `POST /2fa/setup` — generates secret + QR code (otpauth:// URL)
- ✅ `POST /2fa/verify-and-enable` — verifies code, returns 10 single-use recovery codes
- ✅ `POST /2fa/disable` — requires current TOTP
- ✅ `GET /2fa/status` — check enabled state + recovery codes remaining
- ✅ `POST /2fa/verify-login` — TOTP or recovery code accepted; sets session flag
- ✅ Schema: `users.two_factor_enabled`, `two_factor_secret`, `two_factor_recovery_codes`
- ⏭️ **Pending v1.5:** Profile page UI for self-service enable/disable + login challenge step (currently API-only)
- ⏭️ **Pending v1.5:** Mandatory enforcement policy for admin/superadmin roles

---

### Tier 3 Summary

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| T3.8 Two-factor auth | 4-6 hr | High (compliance) | 1 |
| T3.5 Vector embeddings matching | 10-14 hr | High (differentiator) | 2 |
| T3.4 WCAG AA audit | 12-16 hr | High (compliance) | 3 |
| T3.1 Agency leaderboard | 3-4 hr | Medium | 4 |
| T3.3 Offline PWA | 6-8 hr | Medium | 5 |
| T3.7 E-signature | 12-16 hr | Medium | 6 |
| T3.6 Video interviews | 8-12 hr | Medium | 7 |
| T3.2 Regional languages | 8-10 hr | Low (translation-gated) | 8 |
| **Total** | **~60-85 hr** | | |

---

---

## ⛔ Blocked on External Dependencies

These items genuinely cannot be shipped without action from outside the codebase. Listed honestly so HPSEDC stakeholders know what they need to provision.

| Item | What's needed | Action owner |
|------|---------------|--------------|
| **T3.2 Regional languages** (Pahari, Punjabi, Urdu) | Professional translators with govt approval | HPSEDC + translator vendor |
| **T3.4 WCAG AA certification** | External accessibility auditor + GIGW certification body | HPSEDC procurement |
| **T3.6 Video interview integration** | Vendor account (Daily.co, Twilio Video, or self-hosted Jitsi) + security review | HPSEDC IT |
| **T3.7 Document e-signature** | DigiLocker partner ID for HPSEDC + integration credentials | HPSEDC + Govt of India MeitY |
| **CAPTCHA real key (security audit T6)** | reCAPTCHA or hCaptcha API account in HPSEDC name | HPSEDC IT |
| **Web-push notifications (T2.2)** | VAPID key generation + push subscription endpoint hosting | Internal but ~2hr |
| **HIM Access SSO** | Real HP Government SSO credentials | HPSEDC + HP Govt IT |
| **Aadhaar eKYC** | UIDAI partnership for real eKYC | HPSEDC + UIDAI |
| **SMS provider** | Govt-approved SMS gateway (NIC, MSG91 etc.) | HPSEDC IT |
| **Production monitoring (T4.1)** | UptimeRobot/Better Stack subscription OR self-hosted Uptime Kuma | HPSEDC IT |

**All 10 items have stub implementations** that will work seamlessly once credentials are provisioned — no code changes needed for most. They return appropriate "not configured" status via the Super Admin → Integrations dashboard so operators can see at a glance what's missing.

---

## Tier 4 — Operational & Infrastructure (Non-Product)

### T4.1 — Monitoring & Alerting

- Uptime monitoring (UptimeRobot, Better Stack, or self-hosted Uptime Kuma)
- Error rate alerts (Sentry or self-hosted GlitchTip)
- API latency tracking (p50/p95/p99)
- PagerDuty or email alerts on critical failures
- **Effort:** 2-4 hours

### T4.2 — Automated Backups

- pg_dump cron daily + weekly + monthly rotation
- Off-site backup storage (govt-approved cloud or physical)
- Restore runbook with verified test restores quarterly
- **Effort:** 2-3 hours

### ~~T4.3 — CI/CD Pipeline~~ ✅ SHIPPED Day 23 (v1.4.0)

**Status:** GitHub Actions workflow active.
- ✅ `.github/workflows/ci.yml` — 2 jobs (test+build, e2e on PR)
- ✅ Postgres service container per run
- ✅ TS check + unit + integration + build steps
- ✅ Build artifact upload on main branch
- ✅ Playwright runs on PR with seeded DB
- ⏭️ **Pending:** Auto-deploy step (needs deploy target + secret env vars)
- ⏭️ **Pending:** Staging environment (needs separate VM provisioning)

### T4.4 — Performance Optimization (Partial) ✅ Day 23

**Status:** Code splitting done. Other items pending.
- ✅ Code splitting via React.lazy for all dashboards + secondary pages
- ✅ Initial bundle reduced 1.24MB → 427kb + lazy chunks (chart code splits to its own 374kb chunk loaded only when needed)
- ⏭️ Image optimization + CDN — pending real production traffic data
- ⏭️ Database query profiling + index tuning — pending baseline measurements
- ⏭️ Redis cache layer — premature; current Postgres latency <50ms in tests

### T4.5 — Load Testing

- k6 or Artillery scripts for 1000+ concurrent users (per FRS target of 5000)
- Identify bottlenecks under load
- Database connection pool tuning
- **Effort:** 3-5 hours

### T4.6 — Documentation (Markdown) ✅ Day 23

**Status:** Markdown docs delivered. Hosted docs site deferred.
- ✅ `A.PMD/Operations/01_Production_Runbook.md` — deployment, restart, backup, restore, incident response
- ✅ `A.PMD/Operations/02_API_Reference.md` — all 134 endpoints with auth + descriptions + rate limits + error codes
- ✅ Existing `05_DEV_TASK_Monitor.md` serves as historical audit trail
- ✅ `v1.2.0_Release_Notes.md` (release notes infrastructure)
- ⏭️ Dedicated Docusaurus/mkdocs site — defer until repo is split or external publishing needed
- ⏭️ Video walkthroughs — needs screen recording + voiceover (HPSEDC content team)
- ⏭️ OpenAPI/Swagger auto-gen — pending (manual API ref is current source of truth)

---

## Rolling Roadmap Recommendation

### v1.3 — "Polish & Power" (Q3 2026)
Bundle high-impact Tier 2 items:
- T2.1 PDF parsing
- T2.3 Branded emails
- T2.4 Admin analytics expansion
- T2.5 Public agency profiles
- T2.8 Calendar invites
- T4.1 Monitoring setup
**Total: ~12-15 hours**

### v1.4 — "Compliance & Performance" (Q4 2026)
Focus on regulatory + infrastructure:
- T3.8 Two-factor auth
- T3.4 WCAG AA audit
- T4.2 Automated backups
- T4.4 Performance optimization
- T4.5 Load testing
**Total: ~25-35 hours**

### v2.0 — "Next Generation" (2027)
Transformational features:
- T3.5 Vector embeddings matching
- T3.3 Offline PWA
- T3.7 E-signature
- T3.6 Video interviews
- T3.1 Agency leaderboard
- T3.2 Regional languages
- T4.3 Full CI/CD pipeline
**Total: ~45-55 hours**

---

## How to Use This Document

- **Before starting any enhancement:** add to the "Current Sprint" section in [05_DEV_TASK_Monitor.md](05_DEV_TASK_Monitor.md)
- **On completion:** move the item here to a "Completed" table with ship date and version
- **Re-prioritize quarterly** based on user feedback + HPSEDC priorities
- **Don't skip Tier 4** — infrastructure debt compounds

---

## Open Questions for HPSEDC Stakeholders

1. **Web-push budget:** Is push notification infrastructure OK, or should we stick to email + in-app?
2. **Translation budget:** Official translators for Pahari/Punjabi/Urdu — is there a govt allocation?
3. **DigiLocker partnership:** Is HPSEDC willing to apply for a DigiLocker partner ID for e-sign?
4. **OpenAI API usage:** Is external AI API usage acceptable, or must we self-host embeddings?
5. **CAPTCHA provider:** reCAPTCHA (Google) vs hCaptcha (privacy-focused) — govt policy preference?
6. **Video interview vendor:** Self-hosted Jitsi vs SaaS (Daily.co/Twilio) — security/compliance review needed?

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2026-04-14 | Initial document — Tier 2/3/4 backlog from v1.2 GA closure session | Claude + Subhash |
