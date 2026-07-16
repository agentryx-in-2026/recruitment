# HireStream — Production Runbook

**Audience:** HPSEDC sysadmins, on-call engineers
**Last updated:** 2026-04-14 (v1.4.0)

---

## 1. Service Overview

| Component | Tech | Port | Health endpoint |
|-----------|------|------|-----------------|
| API + SPA | Node 20 + Express + Vite | 5000 | `GET /api/v1/admin/health` |
| Database | PostgreSQL 16 | 5432 | `pg_isready` |
| Reverse proxy | Nginx | 80/443 | `nginx -t` |
| Process manager | PM2 | — | `pm2 list` |

**Production URL:** https://hirestream.osipl.dev

---

## 2. Common Operations

### Restart application
```bash
# Preferred (zero-downtime via PM2)
pm2 reload hirestream

# Or via Super Admin Console
# Login as superadmin → Backups tab → "Restart Process" (Danger Zone)
```

### Check logs
```bash
# Live tail
pm2 logs hirestream --lines 100

# Or via Super Admin
# Super Admin → Logs Viewer (filter by level/search/userId)
```

### Run database backup
```bash
# Manual via CLI
pg_dump --no-owner --no-acl --clean --if-exists \
  -f /var/backups/hirestream/$(date +%Y%m%d-%H%M%S).sql \
  $DATABASE_URL

# Or via Super Admin → Backups → "Create Backup" button
```

### Restore from backup
```bash
psql $DATABASE_URL < /var/backups/hirestream/backup-2026-04-14.sql
```

### Reset DB to clean demo state (DESTRUCTIVE)
Available via Super Admin Console → System Health → Danger Zone → "Reset + Reseed".
Two-step confirmation required. Super Admin users are always preserved.

---

## 3. Deployment

### Standard deploy
```bash
cd /var/www/hirestream
git fetch origin
git checkout main
git pull
npm ci --production=false
npm run build
pm2 reload hirestream
```

### Database migrations
```bash
# Apply schema changes (drizzle-kit)
npm run db:push

# Verify
psql $DATABASE_URL -c "\dt"
```

### Rollback
```bash
git log --oneline -10
git checkout <previous-tag>
npm ci
npm run build
pm2 reload hirestream
```

---

## 4. Health & Monitoring

### Quick health check
```bash
curl -s https://hirestream.osipl.dev/api/v1/admin/health | jq
```

### Super Admin Ops Console (visual)
Login as `superadmin` → **Ops Overview** tab. Shows:
- Health Score (0-100)
- Active alerts count + click-through to Signals
- Process info (PID, uptime, restarts, Node version)
- Memory (heap used, RSS)
- External dependency status (DB, SMTP, SMS, Aadhaar, etc.)
- DB connection pool stats

### Resources sparklines
Super Admin → **Resources** tab. Live CPU/RAM area charts (5-second refresh, 60-sample buffer). Plus disk usage per mount.

---

## 5. Security Operations

### Enable maintenance mode
Super Admin → Feature Flags → Toggle "Maintenance Mode". Non-superadmin API requests will receive 503 with the configured message until disabled.

### Force-disable a user
Super Admin → User Management → find user → Actions menu → "Disable User". User loses access immediately on next request.

### View audit trail per user
Super Admin → User Management → Actions menu → "View Audit Trail". Opens filtered audit log JSON.

### Enable 2FA
Any user can opt in via Profile → Security Settings → Enable 2FA. Recommended (not yet enforced) for admin/superadmin accounts.

### Rotate session secret
1. Generate new: `openssl rand -hex 32`
2. Update `SESSION_SECRET` in `.env`
3. `pm2 reload hirestream`
4. All existing sessions invalidated; users will need to re-login.

---

## 6. Incident Response

### Symptom: 5xx errors spiking
1. Check `pm2 logs hirestream --err --lines 200`
2. Check Super Admin → Signals for active alerts
3. Check DB connectivity: `psql $DATABASE_URL -c "SELECT 1"`
4. Check disk: Super Admin → Resources → Disk Mounts
5. If memory exhausted: `pm2 reload hirestream`

### Symptom: Database slow
1. Super Admin → Ops Overview → DB latency badge
2. Super Admin → SQL Sandbox: `SELECT * FROM pg_stat_activity WHERE state = 'active'`
3. Check long-running queries; consider `SELECT pg_terminate_backend(pid)` (CLI only, not via sandbox)
4. Check connection pool: Super Admin → Ops Overview → DB Pool stats

### Symptom: User cannot log in
1. Check Super Admin → User Management — is user disabled?
2. Check rate limit: 5 failed attempts in 15min triggers temp block
3. Check 2FA: if user has 2FA enabled, they must complete TOTP step
4. Last resort: Super Admin → User Management → reset password (CLI: `npx tsx scripts/reset-password.ts <email>`)

### Symptom: Deployment broke production
1. Quick rollback: `git checkout <previous-tag> && npm run build && pm2 reload hirestream`
2. Check bundle hash in `dist/public/index.html` matches deployed version
3. If service worker cache issue: bump `CACHE_VERSION` in `client/public/sw.js` and rebuild

---

## 7. Periodic Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| Database backup | Daily | Cron: `0 2 * * * /usr/local/bin/hirestream-backup.sh` |
| Backup verification | Weekly | Restore latest to staging DB and run smoke test |
| Log rotation | Auto | Winston + logrotate config |
| Dependency updates | Monthly | `npm audit fix` then test suite |
| SSL cert renewal | Auto | Let's Encrypt + certbot cron |
| Disk usage check | Weekly | Super Admin → Resources |
| Unverified agency review | Weekly | Admin Console → Agencies tab |
| Open grievance review | Daily | Admin Console → Grievances tab |
| Drive approval review | Daily | Admin Console → Drives tab |

---

## 8. Demo / Test Credentials

| Username | Password | Role |
|----------|----------|------|
| demo_candidate | test123 | Candidate |
| demo_agent | test123 | Recruitment Agency |
| demo_employer | test123 | Employer |
| demo_admin | test123 | Admin (HPSEDC officer) |
| demo_superadmin | test123 | Super Admin (full access) |

⚠️ **Change all `test123` passwords before production launch.**

---

## 9. Useful CLI Commands

```bash
# Run full test suite
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run E2E (Playwright)
npm run test:e2e

# Watch mode (dev)
npm run test:watch

# Coverage report
npm run test:coverage

# Database push (apply schema)
npm run db:push

# Seed demo data
npx tsx scripts/seed.ts

# Type check
npx tsc --noEmit

# Production build
npm run build

# Start production server
NODE_ENV=production node dist/index.js
```

---

## 10. Key Files & Locations

| Purpose | Path |
|---------|------|
| Application source | `/var/www/hirestream/` |
| Logs | `./logs/app.log`, `./logs/error.log` |
| Backups | `./backups/*.sql` |
| Uploads (CV, docs) | `./uploads/` |
| PM2 config | `~/.pm2/dump.pm2` |
| Nginx site | `/etc/nginx/sites-enabled/hirestream` |
| SSL certs | `/etc/letsencrypt/live/hirestream.osipl.dev/` |

---

## 11. Contacts

- **HPSEDC IT lead:** [contact via portal grievance system]
- **Project lead:** Subhash Thakur
- **Out-of-band escalation:** see internal contact sheet (not in repo)

---

For per-feature details, see [API_Reference.md](02_API_Reference.md) and [05_DEV_TASK_Monitor.md](../Dev%20Plan%20Architecture%20%26%20Phasing/05_DEV_TASK_Monitor.md).
