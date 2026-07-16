# HireStream

![PR Check](https://github.com/agentryx-ai-2025/recruitment/actions/workflows/pr-check.yml/badge.svg)

**HPSEDC Overseas Placement Portal** — a Government of Himachal Pradesh initiative for safe, regulated overseas employment placement.

Built by [Agentryx](https://agentryx.dev) · Production: https://hirestream.agentryx.dev

---

## What it is

A full-stack portal connecting four stakeholder roles in the overseas hiring workflow:

- **Candidate** (job seeker) — registers, completes profile + MEA/Emigration-Act compliance fields, applies to overseas jobs, tracks applications, accepts offers, downloads portfolio/offer PDFs, proactively updates welfare post-placement.
- **Agency** (licensed recruiter) — posts jobs on behalf of employers, screens + shortlists candidates, schedules interviews, records structured feedback, issues placements, runs recruitment drives, tracks reports + KPIs.
- **Employer** (overseas company) — reviews the agency's curated shortlist, approves for interview or requests replacements, conducts final interview, makes selection, issues the appointment letter. Decision-maker UX, not recruiter UX.
- **Admin** (HPSEDC regulator) — approves/rejects agencies, approves drives, handles grievances, monitors MEA compliance (ECR/PDO/PBBY/welfare SLAs), manages users, views audit log, tunes 21 runtime system-config settings.

And a **Super Admin** role with a dedicated System Controls page: full-site lockdown with bypass key + ETA, pause applications pipeline, pause job posting pipeline — all with confirmation-phrase gating.

## FRS compliance

- 144 FRS items — 123 ✅ fully delivered, 9 🟡 partial, 12 ⛔ blocked on external integrations (Aadhaar, HIM-SSO, SMS gateway, DigiLocker). External integrations are stubbed and architecturally ready.
- 62 beyond-FRS enhancements delivered (tracked separately in the Agentryx Verify portal — see the companion repo [agentryx-verify](https://github.com/microaistudio/agentryx-verify)).

Full traceability matrix: [`A.PMD/Dev Plan Architecture & Phasing/Verification & UAT/01_FRS_Compliance_Matrix.md`](A.PMD/Dev%20Plan%20Architecture%20%26%20Phasing/Verification%20%26%20UAT/01_FRS_Compliance_Matrix.md)

## Companion project: Agentryx Verify

[agentryx-verify](https://github.com/microaistudio/agentryx-verify) is the UAT sign-off portal used to track scope-to-delivery against HireStream. Kept as a **separate repo** because:
- Different ownership — HireStream is a deliverable to HPSEDC; Verify is Agentryx-owned tooling and a standalone product for other state placement boards.
- Different deploy cadence — changes to Verify don't rebuild HireStream.
- Clean handover — if HPSEDC ever takes ownership of HireStream, Verify stays with Agentryx.

Both run on the same VM today (one port each) but are fully independent.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + wouter + TanStack Query + Framer Motion + Recharts |
| Backend | Node.js 20 + Express + Passport (session auth) + Zod validation |
| Database | PostgreSQL 14+ via Drizzle ORM |
| PDF | PDFKit (offer letters, portfolio export) |
| Process | PM2 on the host; nginx reverse proxy with Let's Encrypt TLS |
| Internationalisation | react-i18next (EN + हिंदी) |
| PWA | Service worker + web manifest |

## Repository structure

```
HireStream/
├── client/                  React frontend
│   └── src/pages/           role dashboards + detail pages + system-controls
├── server/                  Express backend
│   ├── routes/              auth, candidate, agent-productivity, employer, admin-oversight, superadmin…
│   ├── services/            settings.service, system-controls.service, notification.service
│   └── middleware/          auth, rate-limit, maintenance, sanitize, upload
├── shared/
│   └── schema.ts            Drizzle ORM schema — single source of truth
├── scripts/
│   └── seed.ts              demo data seeder (16 users, 25 jobs, 23 applications, 4 drives, 2 placements)
├── A.PMD/                   all project documentation (FRS matrix, release notes, test scenarios, deployment guides)
├── dist/                    built output (generated)
├── uploads/                 runtime file storage (not tracked)
└── .env                     DATABASE_URL, SESSION_SECRET, etc. (not tracked — see .env.example below)
```

## Local development

```bash
# 1. Prerequisites: Node 20+, PostgreSQL 14+
# 2. Clone + install
git clone https://github.com/microaistudio/hirestream.git
cd hirestream
npm install

# 3. Create the database
sudo -u postgres psql <<'SQL'
CREATE USER hirestream WITH PASSWORD 'hirestream';
CREATE DATABASE hirestream OWNER hirestream;
CREATE DATABASE hirestream_test OWNER hirestream;
SQL

# 4. Environment
cat > .env <<'ENV'
DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream
NODE_ENV=development
PORT=5000
SESSION_SECRET=dev-only-change-me
TEST_DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream_test
APP_URL=http://localhost:5000
COOKIE_SECURE=false
ENV

# 5. Push schema + seed demo data
npx drizzle-kit push --force
npx tsx scripts/seed.ts

# 6. Start the dev server (Vite HMR + Express backend together)
npm run dev
```

Open http://localhost:5000

## Demo accounts (after `npx tsx scripts/seed.ts`)

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `hpsedc@super2026` |
| Admin (HPSEDC) | `demo_admin` | `test123` |
| Agency | `demo_agent` | `test123` |
| Employer | `demo_employer` | `test123` |
| Candidate | `demo_candidate` | `test123` |

Additional seeded accounts (all `test123`): `priya_verma`, `rohan_mehta`, `meera_iyer`, `vikram_negi`, `ananya_bhatt`, `gulf_jobs_direct`, `europe_careers`, `japan_pathways`, `aramco_hr`, `nhs_london_hr`, `siemens_hr`.

## Production deploy

Full staging/prod setup walkthrough: [`A.PMD/Deployment Package/02_Staging_VM_Setup.md`](A.PMD/Deployment%20Package/02_Staging_VM_Setup.md)

Updating after a git push:

```bash
git pull
npm install
npm run build
pm2 restart hirestream --update-env
```

For schema changes, add `npx drizzle-kit push --force` before the build.

## Runtime configuration (no-deploy tuning)

Admin Dashboard → **System Config** exposes 21 settings across 8 categories. Full reference: [`A.PMD/Dev Plan Architecture & Phasing/06_System_Configuration_Reference.md`](A.PMD/Dev%20Plan%20Architecture%20%26%20Phasing/06_System_Configuration_Reference.md)

Super Admin → **System Controls** (`/admin/system-controls`) has pipeline pauses + full lockdown with bypass key + ETA + preview.

## Documentation

All project docs live in [`A.PMD/`](A.PMD/). Highlights:

- [`Release Notes/`](A.PMD/Release%20Notes/) — v1.0.0 through v1.5.4 release notes
- [`Dev Plan Architecture & Phasing/`](A.PMD/Dev%20Plan%20Architecture%20%26%20Phasing/) — FRS traceability matrix, system config reference, verification & UAT
- [`Testing & User Documents/`](A.PMD/Testing%20%26%20User%20Documents/) — 95+ manual test scenarios, user guide, reference manual
- [`Deployment Package/`](A.PMD/Deployment%20Package/) — deployment guide, security audit, nginx configs, staging setup

## License

Private. © Agentryx. Developed under contract for HPSEDC (Himachal Pradesh State Electronics Development Corporation).

## Contact

Project lead: Subhash Thakur · `subhash.thakur2010@gmail.com` · [agentryx.dev](https://agentryx.dev)
