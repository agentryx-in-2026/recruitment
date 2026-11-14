#!/usr/bin/env bash
# Automated E2E run for Agentryx Verify.
#   run.sh <scope: all|admin|agency|applicant> <runId>
# Tests the CURRENT Lite build (dist/) against a disposable copy of the live
# Lite database, so UAT data is never touched and every run starts from the
# same states. Writes out/<runId>.json: [{ref, status, detail, screenshot}].
set -uo pipefail
SCOPE="${1:-all}"; RUN="${2:-manual}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DB=hirestream_lite_autotest
PORT=5098
WORK="$HERE/out/work-$RUN"
export PGPASSWORD=hirestream
PSQL="psql -h localhost -U hirestream -q"
mkdir -p "$WORK"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null
  $PSQL -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
  rm -rf "$WORK/uploads"
}
trap cleanup EXIT

echo "▶ Copying the live Lite database…"
$PSQL -d postgres -c "drop database if exists $DB" >/dev/null
$PSQL -d postgres -c "create database $DB" >/dev/null
pg_dump -h localhost -U hirestream hirestream_lite | $PSQL -d "$DB" >/dev/null 2>&1

echo "▶ Preparing test states…"
$PSQL -d "$DB" -f "$HERE/prepare.sql" >/dev/null

echo "▶ Starting a private copy of the portal on :$PORT (build $(cat "$REPO/VERSION"))…"
mkdir -p "$WORK/uploads"; cp "$REPO/VERSION" "$WORK/VERSION"
( cd "$WORK" && NODE_ENV=production PORT=$PORT DATABASE_URL="postgresql://hirestream:hirestream@localhost:5432/$DB" \
    SESSION_SECRET="autotest-session-secret-for-disposable-copy-$RUN" exec node "$REPO/dist/index.js" ) > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do curl -s "localhost:$PORT/api/v1/version" >/dev/null && break; sleep 1; done
curl -s "localhost:$PORT/api/v1/version" >/dev/null || { echo "✗ Portal copy did not start"; tail -20 "$WORK/server.log"; exit 1; }

case "$SCOPE" in
  all) PATTERN="auto" ;;
  admin|agency|applicant) PATTERN="$SCOPE.auto" ;;
  *) echo "Unknown scope $SCOPE"; exit 2 ;;
esac

echo "▶ Running $SCOPE checks…"
export AUTO_BASE_URL="http://localhost:$PORT" AUTO_RESULTS="$WORK/results.jsonl" AUTO_SHOTS="$WORK/shots" AUTO_DB="$DB"
mkdir -p "$AUTO_SHOTS"; : > "$AUTO_RESULTS"
cd "$REPO" && npx playwright test -c tests/verify-auto/playwright.config.ts "$PATTERN" 2>&1 | grep -vE "npm notice|^\s*$" | grep -E "▸|✓|✘|passed|failed|Error" | tail -80

node -e '
const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l));
const last={};for(const r of lines) last[r.ref]=r;            // a ref checked twice keeps its last result
fs.writeFileSync(process.argv[2],JSON.stringify(Object.values(last),null,1));
const p=Object.values(last).filter(r=>r.status==="passed").length;console.log(`▶ Done: ${p} passed, ${Object.keys(last).length-p} failed`);
' "$AUTO_RESULTS" "$HERE/out/$RUN.json"
