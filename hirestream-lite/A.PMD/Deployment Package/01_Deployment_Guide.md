# HireStream — Deployment & Install Package Guide

**Project:** Overseas Placement Portal (HPSEDC)  
**Created:** 13 Apr 2026  
**Audience:** DevOps, System Admin, Deployment Team  
**Scenario:** Air-gapped or restricted-network government VMs

---

## 1. Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DEVELOPMENT VM (GCP)                   │
│                  hirestream.osipl.dev                     │
│                                                           │
│  Git repo → Build → Test → Create Install Pack            │
│                      ↓                                    │
│              install-pack-v1.5.0.tar.gz                   │
│                      ↓ (SCP / USB / secure transfer)      │
└──────────────────────┼───────────────────────────────────┘
                       ↓
┌──────────────────────┼───────────────────────────────────┐
│               PRODUCTION VM (HPSEDC Data Center)          │
│                  Air-gapped / restricted network          │
│                                                           │
│  Unpack → Run install.sh → PM2 starts → Nginx proxies    │
│                                                           │
│  Nginx (443) → PM2 Cluster (5000) → PostgreSQL (5432)    │
│                                     → Redis (6379)        │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Version Control Strategy

### Branch Model

```
main              ← production-ready, tagged releases only
  ↑ merge
develop           ← active development, tested code
  ↑ merge
feature/*         ← individual features (feature/profile-wizard)
hotfix/*          ← urgent production fixes (hotfix/apply-crash)
```

### Tagging Convention

```
v1.0.0            ← Major release (FRS complete)
v1.1.0            ← Minor release (new features — frontend overhaul)
v1.1.1            ← Patch (bug fixes)
v1.5.0            ← Significant update (Ops Console)
v2.0.0            ← Major milestone (Phase 5 exceed)
```

### Release Process

```
1. All tests pass on develop           → npm test (168+ tests green)
2. Merge develop → main                → git merge develop
3. Tag the release                      → git tag -a v1.1.0 -m "Frontend overhaul"
4. Build the install pack               → npm run build:pack
5. Transfer to production VM            → scp / USB
6. Run install script on target         → ./install.sh
7. Verify health                        → curl https://portal/api/v1/admin/health
```

---

## 3. Install Pack Structure

### What's in the Pack

```
hirestream-v1.1.0/
├── dist/                          # Pre-built production bundle
│   ├── index.js                   # Server bundle (esbuild output)
│   └── public/                    # Vite-built React SPA
│       ├── index.html
│       └── assets/
│           ├── index-*.js         # App JS bundle
│           └── index-*.css        # App CSS bundle
│
├── node_modules_offline/          # Pre-packed npm dependencies (for air-gap)
│   └── node_modules.tar.gz       # Full node_modules compressed
│
├── migrations/                    # Database migration files
│   ├── 0000_narrow_bloodscream.sql
│   └── 0001_true_kylun.sql
│
├── uploads/                       # Empty uploads directory (create on target)
│   └── .gitkeep
│
├── config/                        # Configuration templates
│   ├── .env.template              # Environment variables template
│   ├── nginx-hirestream.conf      # Nginx site config
│   ├── ecosystem.config.js        # PM2 cluster config
│   └── pg-backup-cron.sh          # Database backup script
│
├── scripts/                       # Deployment scripts
│   ├── install.sh                 # Full install (first time)
│   ├── upgrade.sh                 # Upgrade existing installation
│   ├── hotfix.sh                  # Apply hotfix (minimal restart)
│   ├── rollback.sh                # Rollback to previous version
│   ├── health-check.sh            # Verify deployment
│   └── seed-data.sh               # Seed initial data (FAQs, admin account)
│
├── package.json                   # For reference (not used in prod)
├── CHANGELOG.md                   # What changed in this release
├── INSTALL.md                     # Step-by-step install guide
└── VERSION                        # Just the version string: 1.1.0
```

### How to Create the Pack (on Dev VM)

```bash
# Script: npm run build:pack (add to package.json)

#!/bin/bash
set -e

VERSION=$(node -e "console.log(require('./package.json').version)")
PACK_DIR="hirestream-v${VERSION}"
PACK_FILE="${PACK_DIR}.tar.gz"

echo "Building install pack v${VERSION}..."

# 1. Clean build
rm -rf dist/
npm run build

# 2. Create pack directory
rm -rf ${PACK_DIR}
mkdir -p ${PACK_DIR}/{dist,migrations,uploads,config,scripts}

# 3. Copy built assets
cp -r dist/* ${PACK_DIR}/dist/

# 4. Copy migrations
cp migrations/*.sql ${PACK_DIR}/migrations/

# 5. Pack node_modules for air-gap
tar -czf ${PACK_DIR}/node_modules_offline/node_modules.tar.gz node_modules/

# 6. Copy configs
cp .env.example ${PACK_DIR}/config/.env.template 2>/dev/null || true
cp A.PMD/Roadmap/Claude4.5/nginx-hirestream.conf ${PACK_DIR}/config/
cp scripts/*.sh ${PACK_DIR}/scripts/ 2>/dev/null || true

# 7. Copy package.json (for reference)
cp package.json ${PACK_DIR}/

# 8. Write version file
echo ${VERSION} > ${PACK_DIR}/VERSION

# 9. Create changelog
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD > ${PACK_DIR}/CHANGELOG.md

# 10. Compress
tar -czf ${PACK_FILE} ${PACK_DIR}/
rm -rf ${PACK_DIR}

echo "Install pack created: ${PACK_FILE} ($(du -h ${PACK_FILE} | cut -f1))"
```

---

## 4. Install Script (First Time — Air-Gapped VM)

```bash
#!/bin/bash
# install.sh — First-time installation on a clean VM
set -e

PACK_DIR="$(dirname $0)"
APP_DIR="/opt/hirestream"
DB_NAME="hirestream"
DB_USER="hirestream"
DB_PASS="$(openssl rand -base64 24)"

echo "========================================="
echo " HireStream — First Time Installation"
echo " Version: $(cat ${PACK_DIR}/VERSION)"
echo "========================================="

# 1. Create app directory
sudo mkdir -p ${APP_DIR}
sudo chown $(whoami):$(whoami) ${APP_DIR}

# 2. Copy application files
cp -r ${PACK_DIR}/dist ${APP_DIR}/
cp ${PACK_DIR}/package.json ${APP_DIR}/
mkdir -p ${APP_DIR}/uploads ${APP_DIR}/logs

# 3. Unpack node_modules (air-gap — no npm install needed)
cd ${APP_DIR}
tar -xzf ${PACK_DIR}/node_modules_offline/node_modules.tar.gz

# 4. Setup PostgreSQL
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME}_test OWNER ${DB_USER};" 2>/dev/null || true

# 5. Run migrations
for sql_file in ${PACK_DIR}/migrations/*.sql; do
  echo "Running migration: $(basename $sql_file)"
  PGPASSWORD=${DB_PASS} psql -U ${DB_USER} -d ${DB_NAME} -h localhost -f "$sql_file"
done

# 6. Create .env file
cat > ${APP_DIR}/.env << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
TEST_DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}_test
SESSION_SECRET=$(openssl rand -base64 32)
PORT=5000
NODE_ENV=production
UPLOAD_DIR=${APP_DIR}/uploads
EOF

echo "⚠️  Edit ${APP_DIR}/.env to add SMTP, SMS, and integration credentials"

# 7. Setup Nginx
sudo cp ${PACK_DIR}/config/nginx-hirestream.conf /etc/nginx/sites-available/hirestream
sudo ln -sf /etc/nginx/sites-available/hirestream /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 8. Setup PM2
cd ${APP_DIR}
pm2 start dist/index.js --name hirestream --env production \
  --instances 4 --exec-mode cluster \
  --max-memory-restart 300M \
  --log-date-format "YYYY-MM-DD HH:mm:ss"
pm2 save
pm2 startup | tail -1 | bash  # Enable auto-start on boot

# 9. Setup backup cron (every 6 hours)
cp ${PACK_DIR}/config/pg-backup-cron.sh ${APP_DIR}/scripts/
chmod +x ${APP_DIR}/scripts/pg-backup-cron.sh
(crontab -l 2>/dev/null; echo "0 */6 * * * ${APP_DIR}/scripts/pg-backup-cron.sh") | crontab -

# 10. Health check
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/v1/admin/health)
if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "✅ Installation successful!"
  echo "   App: http://localhost:5000"
  echo "   DB:  ${DB_NAME} (user: ${DB_USER})"
  echo "   ENV: ${APP_DIR}/.env"
  echo "   Logs: pm2 logs hirestream"
else
  echo "❌ Health check failed (HTTP ${HTTP_STATUS})"
  echo "   Check: pm2 logs hirestream"
  exit 1
fi
```

---

## 5. Upgrade Script (Apply New Version)

```bash
#!/bin/bash
# upgrade.sh — Upgrade to a new version (zero-downtime)
set -e

PACK_DIR="$(dirname $0)"
APP_DIR="/opt/hirestream"
NEW_VERSION=$(cat ${PACK_DIR}/VERSION)
BACKUP_DIR="${APP_DIR}/backups/pre-upgrade-$(date +%Y%m%d_%H%M%S)"

echo "========================================="
echo " HireStream — Upgrade to v${NEW_VERSION}"
echo "========================================="

# 1. Backup current version
mkdir -p ${BACKUP_DIR}
cp -r ${APP_DIR}/dist ${BACKUP_DIR}/
cp ${APP_DIR}/.env ${BACKUP_DIR}/
cp ${APP_DIR}/VERSION ${BACKUP_DIR}/ 2>/dev/null || true
echo "Backup saved to: ${BACKUP_DIR}"

# 2. Database backup before migration
PGPASSWORD=$(grep DATABASE_URL ${APP_DIR}/.env | cut -d: -f3 | cut -d@ -f1)
pg_dump -U hirestream -h localhost hirestream > ${BACKUP_DIR}/db_backup.sql
echo "Database backed up"

# 3. Copy new dist
rm -rf ${APP_DIR}/dist
cp -r ${PACK_DIR}/dist ${APP_DIR}/

# 4. Update node_modules if included
if [ -f ${PACK_DIR}/node_modules_offline/node_modules.tar.gz ]; then
  rm -rf ${APP_DIR}/node_modules
  cd ${APP_DIR}
  tar -xzf ${PACK_DIR}/node_modules_offline/node_modules.tar.gz
fi

# 5. Run new migrations (safe — Drizzle handles idempotency)
for sql_file in ${PACK_DIR}/migrations/*.sql; do
  echo "Running migration: $(basename $sql_file)"
  PGPASSWORD=$(grep DATABASE_URL ${APP_DIR}/.env | cut -d: -f3 | cut -d@ -f1) \
    psql -U hirestream -d hirestream -h localhost -f "$sql_file" 2>/dev/null || true
done

# 6. Update version file
cp ${PACK_DIR}/VERSION ${APP_DIR}/

# 7. Restart application (zero-downtime with PM2 reload)
pm2 reload hirestream
sleep 3

# 8. Health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/v1/admin/health)
if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "✅ Upgrade to v${NEW_VERSION} successful!"
  echo "   Rollback available at: ${BACKUP_DIR}"
else
  echo "❌ Health check failed — rolling back..."
  rm -rf ${APP_DIR}/dist
  cp -r ${BACKUP_DIR}/dist ${APP_DIR}/
  pm2 reload hirestream
  echo "⚠️  Rolled back to previous version"
  exit 1
fi
```

---

## 6. Hotfix Script (Minimal Change, Fast Deploy)

```bash
#!/bin/bash
# hotfix.sh — Apply a hotfix (just the dist bundle, no migrations)
set -e

PACK_DIR="$(dirname $0)"
APP_DIR="/opt/hirestream"

echo "Applying hotfix..."

# Backup current dist
cp -r ${APP_DIR}/dist ${APP_DIR}/dist.bak.$(date +%s)

# Copy new dist only
cp -r ${PACK_DIR}/dist ${APP_DIR}/

# Reload (zero-downtime)
pm2 reload hirestream

# Verify
sleep 2
curl -sf http://localhost:5000/api/v1/admin/health > /dev/null && echo "✅ Hotfix applied" || echo "❌ Failed — run rollback"
```

---

## 7. Rollback Script

```bash
#!/bin/bash
# rollback.sh — Rollback to previous version
set -e

APP_DIR="/opt/hirestream"
BACKUPS=$(ls -td ${APP_DIR}/backups/pre-upgrade-* 2>/dev/null | head -1)

if [ -z "$BACKUPS" ]; then
  echo "❌ No backup found to rollback to"
  exit 1
fi

echo "Rolling back to: ${BACKUPS}"
rm -rf ${APP_DIR}/dist
cp -r ${BACKUPS}/dist ${APP_DIR}/
pm2 reload hirestream

sleep 2
curl -sf http://localhost:5000/api/v1/admin/health > /dev/null && echo "✅ Rollback successful" || echo "❌ Rollback failed"
```

---

## 8. Air-Gapped Deployment — Step by Step

For VMs with **no internet access**:

### On Dev VM (has internet):

```bash
# 1. Build the install pack
npm run build:pack
# Creates: hirestream-v1.1.0.tar.gz (~150-200 MB)

# 2. Transfer to production VM
scp hirestream-v1.1.0.tar.gz user@production-vm:/tmp/
# OR: copy to USB drive if physically air-gapped
```

### On Production VM (air-gapped):

```bash
# 3. Unpack
cd /tmp
tar -xzf hirestream-v1.1.0.tar.gz
cd hirestream-v1.1.0

# 4. First time install
sudo bash scripts/install.sh

# 5. OR upgrade existing
bash scripts/upgrade.sh

# 6. OR apply hotfix only
bash scripts/hotfix.sh
```

### What Makes This Air-Gap Safe:

| Component | How It Works Offline |
|-----------|---------------------|
| **npm packages** | Pre-packed in `node_modules_offline/node_modules.tar.gz` — no `npm install` needed |
| **Frontend assets** | Pre-built by Vite — just static HTML/JS/CSS files |
| **Server bundle** | Pre-compiled by esbuild — single `dist/index.js` file |
| **Migrations** | Raw SQL files — run directly via `psql` |
| **SSL certificates** | Let's Encrypt needs internet — use CA-signed cert from HPSEDC for air-gap |

---

## 9. Release Checklist

Before creating any install pack:

```
□ All tests pass (npm test — 168+ green)
□ npm audit — no critical vulnerabilities
□ Build succeeds (npm run build)
□ Security checklist verified (25-point matrix)
□ CHANGELOG.md updated
□ VERSION file updated
□ Git tag created
□ Install pack created and tested on staging VM first
□ Rollback tested on staging
□ Pack transferred to production via approved channel
```

---

## 10. Database Backup Strategy (Production)

```bash
# pg-backup-cron.sh — Runs every 6 hours via cron
#!/bin/bash
BACKUP_DIR="/opt/hirestream/backups/db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="hirestream"

mkdir -p ${BACKUP_DIR}

# Create backup
pg_dump -U hirestream -h localhost -Fc ${DB_NAME} > ${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump

# Keep only last 28 backups (7 days × 4 per day)
ls -t ${BACKUP_DIR}/*.dump | tail -n +29 | xargs rm -f 2>/dev/null

# Log
echo "$(date): Backup created — ${DB_NAME}_${TIMESTAMP}.dump ($(du -h ${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump | cut -f1))"
```

---

*This guide is the single reference for all deployment operations. Every release, upgrade, hotfix, and rollback follows these scripts.*
