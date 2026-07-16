#!/usr/bin/env bash
set -euo pipefail

trap 'exit 130' INT TERM

if [ "$#" -eq 0 ] || [ -z "$1" ]; then
    echo "Usage: ./scripts/deploy-gate.sh <target-url> [--force]"
    exit 2
fi

TARGET_URL="$1"
FORCE=0

if [ "$#" -ge 2 ] && [ "$2" == "--force" ]; then
    FORCE=1
fi

echo "=== Deploy gate: probing $TARGET_URL ==="

set +e
DEEP_URL="$TARGET_URL" npm run smoke
SMOKE_EXIT=$?
set -e

RED=''
NC=''
if [ -t 1 ]; then
    RED='\033[0;31m'
    NC='\033[0m'
fi

if [ "$SMOKE_EXIT" -eq 0 ]; then
    echo "=== Deploy gate: PASS ==="
    set +e
    pm2 restart hirestream
    PM2_EXIT=$?
    set -e
    if [ "$PM2_EXIT" -eq 0 ]; then
        echo "=== Restart complete ==="
    fi
    exit "$PM2_EXIT"
else
    if [ "$FORCE" -eq 1 ]; then
        echo -e "${RED}WARNING: Deploy gate failed (smoke returned $SMOKE_EXIT).${NC}"
        echo -e "${RED}Proceeding with restart because --force was passed.${NC}"
        set +e
        pm2 restart hirestream
        PM2_EXIT=$?
        set -e
        if [ "$PM2_EXIT" -eq 0 ]; then
            echo "=== Restart complete ==="
        fi
        exit "$PM2_EXIT"
    else
        echo -e "${RED}=== Deploy gate: FAIL — aborting restart ===${NC}"
        echo -e "${RED}Reason: smoke harness returned non-zero ($SMOKE_EXIT)${NC}"
        exit 1
    fi
fi
