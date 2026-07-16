#!/usr/bin/env bash
#
# restore-snapshot.sh — restore a full-system snapshot produced by the
# Backup module's createSnapshot().
#
# A snapshot bundle (snapshot-<ts>.tar.gz) contains:
#   manifest.json
#   hirestream.sql              — pg_dump of HireStream DB
#   agentryx_verify.sql         — pg_dump of Verify DB (optional)
#   uploads-hirestream.tar      — tar of hirestream/uploads/
#   uploads-verify.tar          — tar of agentryx-verify/uploads/ (optional)
#
# This script:
#   1. Extracts the bundle to /tmp
#   2. Reads the manifest, shows the user what's in it
#   3. Prompts for confirmation (TTY-only — won't auto-run from cron)
#   4. Drops + restores HireStream DB
#   5. Drops + restores Verify DB (if present in bundle)
#   6. Replaces uploads dirs from the tarballs
#
# Usage:
#   scripts/restore-snapshot.sh /path/to/snapshot-2026-05-24T17-32-08.tar.gz
#
# Env:
#   DATABASE_URL          — HireStream DB (postgres://user:pass@host:5432/hirestream)
#   VERIFY_DATABASE_URL   — Verify DB     (defaults to same host, /agentryx_verify)
#   HS_UPLOADS_DIR        — defaults to ./uploads (relative to the hirestream app dir)
#   VERIFY_UPLOADS_DIR    — defaults to ../agentryx-verify/uploads

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <snapshot.tar.gz>" >&2
  exit 2
fi

BUNDLE="$1"
if [[ ! -f "$BUNDLE" ]]; then
  echo "error: $BUNDLE not found" >&2
  exit 1
fi

# Refuse to run if not attached to a terminal — restore is destructive and the
# operator has to consciously confirm. Cron / pm2 will see exit 1.
if [[ ! -t 0 ]]; then
  echo "error: stdin is not a TTY — restore requires interactive confirmation." >&2
  exit 1
fi

# Resolve config — DATABASE_URL is mandatory.
DATABASE_URL="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "error: DATABASE_URL not set" >&2
  exit 1
fi

# Derive Verify URL by swapping database name unless caller overrode it.
VERIFY_DATABASE_URL="${VERIFY_DATABASE_URL:-${DATABASE_URL/\/hirestream/\/agentryx_verify}}"

# Upload dirs — default to common layout under the hirestream app cwd.
HS_UPLOADS_DIR="${HS_UPLOADS_DIR:-$PWD/uploads}"
VERIFY_UPLOADS_DIR="${VERIFY_UPLOADS_DIR:-$PWD/../agentryx-verify/uploads}"

STAGE_DIR="/tmp/hs-restore-$(date +%s)"
mkdir -p "$STAGE_DIR"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "→ Extracting $BUNDLE …"
tar -xzf "$BUNDLE" -C "$STAGE_DIR"

# Show the manifest so the operator can sanity-check what they're about to do.
if [[ -f "$STAGE_DIR/manifest.json" ]]; then
  echo ""
  echo "─── Snapshot manifest ───"
  cat "$STAGE_DIR/manifest.json"
  echo "─────────────────────────"
  echo ""
fi

echo "→ Targets:"
echo "    HireStream DB:        $(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo "    Verify DB:            $(echo "$VERIFY_DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo "    HireStream uploads:   $HS_UPLOADS_DIR"
echo "    Verify uploads:       $VERIFY_UPLOADS_DIR"
echo ""

read -r -p "This will DROP and re-create both DBs and REPLACE uploads dirs. Type 'YES RESTORE' to proceed: " CONFIRM
if [[ "$CONFIRM" != "YES RESTORE" ]]; then
  echo "Aborted — no changes made."
  exit 1
fi

echo ""
echo "→ Restoring HireStream DB …"
if [[ -f "$STAGE_DIR/hirestream.sql" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$STAGE_DIR/hirestream.sql" >/dev/null
  echo "  ✓ HireStream DB restored"
else
  echo "  ⚠ hirestream.sql missing from bundle — skipping"
fi

echo "→ Restoring Verify DB …"
if [[ -f "$STAGE_DIR/agentryx_verify.sql" ]]; then
  psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$STAGE_DIR/agentryx_verify.sql" >/dev/null
  echo "  ✓ Verify DB restored"
else
  echo "  ⚠ agentryx_verify.sql missing from bundle — skipping"
fi

# Uploads — extract the tar's contents into the parent of the uploads dir so
# the existing "uploads/" directory structure inside the tar lands at the
# right path. We rename the live dir to *.bak-<ts> first so a botched restore
# is recoverable.
restore_uploads() {
  local tar="$1"
  local target="$2"
  if [[ ! -f "$tar" ]]; then
    echo "  ⚠ $(basename "$tar") missing from bundle — skipping"
    return
  fi
  local parent backup_name
  parent="$(dirname "$target")"
  backup_name="$(basename "$target").bak-$(date +%s)"
  if [[ -d "$target" ]]; then
    mv "$target" "$parent/$backup_name"
    echo "  • Existing dir moved to $parent/$backup_name (kept as backup)"
  fi
  mkdir -p "$parent"
  tar -xf "$tar" -C "$parent"
  echo "  ✓ $(basename "$target") restored from $(basename "$tar")"
}

echo "→ Restoring HireStream uploads …"
restore_uploads "$STAGE_DIR/uploads-hirestream.tar" "$HS_UPLOADS_DIR"

echo "→ Restoring Verify uploads …"
restore_uploads "$STAGE_DIR/uploads-verify.tar" "$VERIFY_UPLOADS_DIR"

echo ""
echo "✓ Restore complete."
echo ""
echo "Next steps:"
echo "  1. Restart both apps:"
echo "       pm2 restart hirestream agentryx-verify"
echo "  2. Sanity-check the apps in the browser."
echo "  3. Once verified, you can delete the .bak-* dirs in $HS_UPLOADS_DIR's parent."
