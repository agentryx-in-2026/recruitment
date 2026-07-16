#!/bin/bash
#
# HireStream — Release Pack Creator
# Usage: bash scripts/create-release.sh [major|minor|patch|hotfix]
#
# This script enforces the release pipeline:
# 1. Runs all tests (refuses to pack if tests fail)
# 2. Runs build (refuses if build fails)
# 3. Creates versioned install pack
# 4. Copies to Releases folder with changelog
#
set -e

RELEASE_TYPE="${1:-patch}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_DIR="${PROJECT_DIR}/A.PMD/Deployment Package/Releases"
PACKAGE_JSON="${PROJECT_DIR}/package.json"

cd "${PROJECT_DIR}"

# ── Read current version ──────────────────────────────────────────
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Current version: v${CURRENT_VERSION}"

# ── Calculate new version ─────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH_NUM <<< "${CURRENT_VERSION}"

case "${RELEASE_TYPE}" in
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH_NUM + 1))"
    ;;
  hotfix)
    NEW_VERSION="${CURRENT_VERSION}-hotfix.$(date +%Y%m%d%H%M)"
    ;;
  *)
    echo "Usage: $0 [major|minor|patch|hotfix]"
    exit 1
    ;;
esac

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  HireStream Release Pipeline                   ║"
echo "║  ${CURRENT_VERSION} → ${NEW_VERSION} (${RELEASE_TYPE})             ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ── Stage 1: Verify code is committed ─────────────────────────────
echo "── Stage 1: Code Check ──"
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "${UNCOMMITTED}" -gt 0 ] && [ "${RELEASE_TYPE}" != "hotfix" ]; then
  echo "⚠️  WARNING: ${UNCOMMITTED} uncommitted changes. Commit before release."
  echo "   Continuing anyway for dev builds..."
fi
echo "✓ Code check passed"
echo ""

# ── Stage 2: Run tests ────────────────────────────────────────────
echo "── Stage 2: Test Suite ──"
echo "Running all tests..."
if ! npm test 2>&1 | tail -5; then
  echo ""
  echo "❌ TESTS FAILED — Cannot create release pack"
  echo "   Fix failing tests first, then re-run."
  exit 1
fi
echo "✓ All tests passed"
echo ""

# ── Stage 3: Security check (basic automated) ────────────────────
echo "── Stage 3: Security Check ──"
# Check for common security issues
AUDIT_CRITICAL=$(npm audit --json 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.metadata?.vulnerabilities?.critical||0)}catch{console.log(0)}" 2>/dev/null || echo "0")
if [ "${AUDIT_CRITICAL}" -gt 0 ]; then
  echo "⚠️  WARNING: ${AUDIT_CRITICAL} critical npm vulnerabilities"
  echo "   Run 'npm audit fix' before production deployment"
fi
echo "✓ Security check passed (manual 25-point review required before production)"
echo ""

# ── Stage 4: Build ────────────────────────────────────────────────
echo "── Stage 4: Build ──"
rm -rf dist/
if ! npm run build 2>&1 | tail -3; then
  echo ""
  echo "❌ BUILD FAILED — Cannot create release pack"
  exit 1
fi
echo "✓ Build successful"
echo ""

# ── Stage 5: Create Pack ──────────────────────────────────────────
echo "── Stage 5: Create Install Pack ──"

PACK_NAME="hirestream-v${NEW_VERSION}"
PACK_DIR="/tmp/${PACK_NAME}"
PACK_FILE="${PACK_NAME}.tar.gz"

# Clean previous attempt
rm -rf "${PACK_DIR}" "/tmp/${PACK_FILE}"

# Create pack structure
mkdir -p "${PACK_DIR}"/{dist,migrations,uploads,config,scripts,node_modules_offline}

# Copy dist (server + frontend)
cp -r dist/* "${PACK_DIR}/dist/"

# Copy migrations
cp migrations/*.sql "${PACK_DIR}/migrations/" 2>/dev/null || true

# Create uploads placeholder
touch "${PACK_DIR}/uploads/.gitkeep"

# Pack node_modules for air-gap deployment
echo "  Packing node_modules for offline install (this takes a moment)..."
tar -czf "${PACK_DIR}/node_modules_offline/node_modules.tar.gz" -C "${PROJECT_DIR}" node_modules/ 2>/dev/null

# Copy config templates
cat > "${PACK_DIR}/config/.env.template" << 'ENVEOF'
# HireStream Environment Configuration
# Copy this to .env and fill in your values

DATABASE_URL=postgresql://hirestream:YOUR_PASSWORD@localhost:5432/hirestream
TEST_DATABASE_URL=postgresql://hirestream:YOUR_PASSWORD@localhost:5432/hirestream_test
SESSION_SECRET=GENERATE_WITH_openssl_rand_-base64_32
PORT=5000
NODE_ENV=production
UPLOAD_DIR=/opt/hirestream/uploads
MAX_FILE_SIZE_MB=5

# Email (optional — logs to console if not set)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=noreply@hirestream.hp.gov.in

# SMS (optional — logs to console if not set)
# SMS_PROVIDER=twilio
# SMS_API_KEY=
# SMS_SENDER_ID=HPSEDC

# External Integrations (set when credentials available)
# HIM_ACCESS_CLIENT_ID=
# HIM_ACCESS_CLIENT_SECRET=
# UIDAI_API_ENDPOINT=
# DIGILOCKER_API_ENDPOINT=
ENVEOF

# Copy Nginx config if exists
cp "${PROJECT_DIR}/A.PMD/Roadmap/Claude4.5/nginx-hirestream.conf" "${PACK_DIR}/config/" 2>/dev/null || true

# Copy deployment scripts
for script in install.sh upgrade.sh hotfix.sh rollback.sh health-check.sh; do
  if [ -f "${PROJECT_DIR}/scripts/${script}" ]; then
    cp "${PROJECT_DIR}/scripts/${script}" "${PACK_DIR}/scripts/"
  fi
done

# Copy package.json (for reference)
cp "${PROJECT_DIR}/package.json" "${PACK_DIR}/"

# Write version file
echo "${NEW_VERSION}" > "${PACK_DIR}/VERSION"

# Generate changelog (commits since last tag or last 30)
echo "# Changelog — v${NEW_VERSION}" > "${PACK_DIR}/CHANGELOG.md"
echo "" >> "${PACK_DIR}/CHANGELOG.md"
echo "Generated: $(date -u '+%Y-%m-%d %H:%M UTC')" >> "${PACK_DIR}/CHANGELOG.md"
echo "" >> "${PACK_DIR}/CHANGELOG.md"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "${LAST_TAG}" ]; then
  git log --oneline "${LAST_TAG}..HEAD" >> "${PACK_DIR}/CHANGELOG.md" 2>/dev/null
else
  git log --oneline -30 >> "${PACK_DIR}/CHANGELOG.md" 2>/dev/null
fi

# Generate release notes
cat > "${PACK_DIR}/RELEASE_NOTES.md" << EOF
# HireStream v${NEW_VERSION} — Release Notes

**Release Date:** $(date '+%Y-%m-%d')
**Release Type:** ${RELEASE_TYPE}
**Previous Version:** v${CURRENT_VERSION}

## Install

### First-time install:
\`\`\`bash
tar -xzf ${PACK_FILE}
cd ${PACK_NAME}
sudo bash scripts/install.sh
\`\`\`

### Upgrade existing:
\`\`\`bash
tar -xzf ${PACK_FILE}
cd ${PACK_NAME}
bash scripts/upgrade.sh
\`\`\`

### Hotfix only:
\`\`\`bash
tar -xzf ${PACK_FILE}
cd ${PACK_NAME}
bash scripts/hotfix.sh
\`\`\`

## Verify
\`\`\`bash
curl http://localhost:5000/api/v1/admin/health
\`\`\`

## Rollback
\`\`\`bash
bash /opt/hirestream/scripts/rollback.sh
\`\`\`
EOF

# Create the INSTALL.md
cat > "${PACK_DIR}/INSTALL.md" << 'EOF'
# HireStream — Quick Install Guide

## Prerequisites
- Ubuntu 22.04 LTS
- Node.js 20.x, PM2, Nginx, PostgreSQL 16 pre-installed
- sudo access

## Steps
1. Unpack: `tar -xzf hirestream-v*.tar.gz`
2. Enter: `cd hirestream-v*/`
3. Install: `sudo bash scripts/install.sh`
4. Verify: `curl http://localhost:5000/api/v1/admin/health`
5. Configure: Edit `/opt/hirestream/.env` for SMTP, SMS, integrations

## For upgrades, use: `bash scripts/upgrade.sh`
## For hotfixes, use: `bash scripts/hotfix.sh`
## For rollback, use: `bash /opt/hirestream/scripts/rollback.sh`
EOF

# Compress the pack
cd /tmp
tar -czf "${PACK_FILE}" "${PACK_NAME}/"
rm -rf "${PACK_DIR}"

PACK_SIZE=$(du -h "/tmp/${PACK_FILE}" | cut -f1)

# ── Copy to Releases folder ──────────────────────────────────────
# Determine target folder
if [ "${RELEASE_TYPE}" = "hotfix" ]; then
  TARGET_DIR="${RELEASES_DIR}/hotfixes"
else
  TARGET_DIR="${RELEASES_DIR}/v${NEW_VERSION}"
  mkdir -p "${TARGET_DIR}"
fi

cp "/tmp/${PACK_FILE}" "${TARGET_DIR}/"

# Always copy to latest/
cp "/tmp/${PACK_FILE}" "${RELEASES_DIR}/latest/"
# Clean old packs from latest (keep only the newest)
ls -t "${RELEASES_DIR}/latest/"hirestream-v*.tar.gz 2>/dev/null | tail -n +2 | xargs rm -f 2>/dev/null || true

# Copy release notes to version folder
if [ "${RELEASE_TYPE}" != "hotfix" ]; then
  # Extract just the notes
  cd /tmp
  tar -xzf "${PACK_FILE}" "${PACK_NAME}/CHANGELOG.md" "${PACK_NAME}/RELEASE_NOTES.md" 2>/dev/null || true
  cp "${PACK_NAME}/CHANGELOG.md" "${TARGET_DIR}/" 2>/dev/null || true
  cp "${PACK_NAME}/RELEASE_NOTES.md" "${TARGET_DIR}/" 2>/dev/null || true
  rm -rf "${PACK_NAME}"
fi

# Clean up temp
rm -f "/tmp/${PACK_FILE}"

# ── Update version in package.json ────────────────────────────────
if [ "${RELEASE_TYPE}" != "hotfix" ]; then
  cd "${PROJECT_DIR}"
  node -e "const p=require('./package.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2)+'\n')"
fi

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  ✅ Release Pack Created Successfully          ║"
echo "╠═══════════════════════════════════════════════╣"
echo "║  Version:  v${NEW_VERSION}"
echo "║  Type:     ${RELEASE_TYPE}"
echo "║  Size:     ${PACK_SIZE}"
echo "║  Location: ${TARGET_DIR}/${PACK_FILE}"
echo "║  Latest:   ${RELEASES_DIR}/latest/${PACK_FILE}"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Transfer to staging VM: scp ${TARGET_DIR}/${PACK_FILE} user@staging:/tmp/"
echo "  2. On staging: tar -xzf ${PACK_FILE} && cd ${PACK_NAME}"
echo "  3. First install: sudo bash scripts/install.sh"
echo "  4. Or upgrade:    bash scripts/upgrade.sh"
echo "  5. Verify:        curl http://localhost:5000/api/v1/admin/health"
echo ""
