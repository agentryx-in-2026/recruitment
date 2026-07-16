# HireStream — Release Pipeline

**Purpose:** Standard process for creating installable release packs after every feature, fix, or hotfix.  
**Location:** All releases stored in `A.PMD/Deployment Package/Releases/`  
**Created:** 13 Apr 2026

---

## Folder Structure

```
Releases/
├── RELEASE_PIPELINE.md        ← This document
├── RELEASE_LOG.md             ← History of all releases
├── latest/                    ← Always contains the most recent release pack
│   └── hirestream-v*.tar.gz
├── v1.0.0/                    ← Major releases (one folder per version)
│   ├── hirestream-v1.0.0.tar.gz
│   ├── CHANGELOG.md
│   └── RELEASE_NOTES.md
├── v1.1.0/                    ← Next major/minor release
├── hotfixes/                  ← Hotfix packs (small, fast)
│   ├── hotfix-v1.0.1.tar.gz
│   └── hotfix-v1.0.2.tar.gz
└── archive/                   ← Old releases moved here after 3+ versions
```

---

## Release Types

| Type | Version Bump | When | What's Included | Downtime |
|------|-------------|------|-----------------|----------|
| **Major** | v1.0.0 → v2.0.0 | Breaking changes, architecture shifts | Full pack (dist + node_modules + migrations + configs) | Minutes (migration) |
| **Minor** | v1.0.0 → v1.1.0 | New features, UI overhaul | Full pack (dist + node_modules + migrations) | Seconds (PM2 reload) |
| **Patch** | v1.0.0 → v1.0.1 | Bug fixes, small changes | Full pack (dist + migrations if any) | Seconds (PM2 reload) |
| **Hotfix** | v1.0.0-hotfix.1 | Urgent production fix | Dist only (no node_modules, no migrations) | Seconds (PM2 reload) |

---

## Pipeline Stages

Every release goes through these stages in order. **No stage can be skipped.**

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  1. CODE  │──▶│ 2. TEST  │──▶│ 3. SECURE│──▶│ 4. BUILD │──▶│ 5. PACK  │
│           │   │          │   │          │   │          │   │          │
│ Feature/  │   │ npm test │   │ Security │   │ npm run  │   │ Create   │
│ Fix done  │   │ All pass │   │ checklist│   │ build    │   │ tar.gz   │
│ Code      │   │ No       │   │ 25-point │   │ Clean    │   │ + notes  │
│ reviewed  │   │ regrssn  │   │ verified │   │ compile  │   │ + log    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                                   │
                                                                   ▼
┌──────────┐   ┌──────────┐   ┌──────────┐                 ┌──────────┐
│ 8. LOG   │◀──│ 7.VERIFY │◀──│ 6. STAGE │◀────────────────│          │
│          │   │          │   │          │                  │  Pack    │
│ Update   │   │ Health   │   │ Deploy   │                  │ ready in │
│ release  │   │ check    │   │ to stag- │                  │ Releases/│
│ log +    │   │ Smoke    │   │ ing VM   │                  │          │
│ monitor  │   │ test     │   │ first    │                  └──────────┘
└──────────┘   └──────────┘   └──────────┘
```

### Stage Details

**Stage 1: CODE**
- Feature/fix code is complete
- All new endpoints have integration tests
- Security check passed (Step 2 in DEV Protocol)
- Code committed to `develop` branch

**Stage 2: TEST**
- `npm test` — all tests pass (168+ currently)
- No regressions in existing tests
- New tests written for new code
- Coverage has not decreased

**Stage 3: SECURE**
- Review against Security Master Checklist (25-point matrix)
- No new endpoints without input validation
- No new endpoints without RBAC
- `npm audit` — no critical vulnerabilities
- Strong password enforcement verified
- Session/cookie flags verified

**Stage 4: BUILD**
- `npm run build` — clean compile, no errors
- Frontend bundle < 1MB
- Server bundle compiles successfully
- No TypeScript errors

**Stage 5: PACK**
- Run `scripts/create-release.sh` (see below)
- Creates versioned tar.gz in Releases folder
- Includes CHANGELOG and RELEASE_NOTES
- Copies to `latest/` folder

**Stage 6: STAGE**
- Deploy to staging VM first (never straight to production)
- Run install.sh or upgrade.sh on staging
- Verify all pages load
- Run smoke tests

**Stage 7: VERIFY**
- Health check: `curl /api/v1/admin/health` → 200
- Login with test accounts (all roles)
- Execute manual test scenarios (priority scenarios from Test_Scenarios doc)
- Performance spot check: page load < 3s

**Stage 8: LOG**
- Update RELEASE_LOG.md
- Update 05_DEV_TASK_Monitor.md
- Update 01_Test_Scope_Report.md
- Notify stakeholders

---

## Automated: `create-release.sh`

This is the script that creates the install pack. It enforces the pipeline — **refuses to create a pack if tests fail or build fails.**

---

## Integration with DEV Protocol

The release pipeline is the **final step** of the DEV Protocol. After:
1. BUILD feature
2. SECURITY CHECK
3. TEST
4. VERIFY no regression
5. COMMIT
6. UPDATE all docs
7. **→ CREATE RELEASE PACK (this pipeline)**

For hotfixes, stages 1-4 are compressed (fix → test affected area → build → pack → deploy).

---

## When to Create a Release

| Trigger | Release Type |
|---------|-------------|
| Phase gate passed (end of Sprint A, Sprint B, Phase 5) | Minor (v1.1.0, v1.2.0) |
| Bug fix that affects users | Patch (v1.0.1) |
| Critical production issue | Hotfix (v1.0.0-hotfix.1) |
| All FRS requirements met + tested | Major (v1.0.0) |
| Exceed features complete | Major (v2.0.0) |

---

*This pipeline is mandatory for every release. No exceptions.*
