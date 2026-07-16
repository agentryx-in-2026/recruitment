# Synthetic Monitor Runbook

The `smoke:prod` script runs the deep-smoke harness against a target URL on a schedule (operator-wired pm2 cron) and writes the result to a JSON status file. The operator dashboard reads that file.

Push notifications (Slack) are **optional, env-gated, default OFF**. Set `SLACK_WEBHOOK_URL` on a DEV monitor to get FAIL alerts; leave unset on PROD until the customer has opened a notification channel. The Phase 4 Operator Console will move this configuration into a DB-backed system-config UI.

## Running Manually

```bash
# Defaults to staging
npm run smoke:prod

# Point at a different target
DEEP_URL=http://localhost:5001 npm run smoke:prod

# Bypass the min-interval throttle (useful when iterating)
MIN_INTERVAL_SECONDS=0 npm run smoke:prod
```

## Output

| Path | Purpose |
|---|---|
| `logs/synthetic-latest.json` | Most recent run record (read by the dashboard) |
| `logs/synthetic-previous.json` | Prior run record — trivial trend; auto-rotated |
| `/tmp/hirestream-synthetic-state.json` | State file used by the min-interval throttle. Volatile by design — reboot clears it |

### Status record shape

```json
{
  "kind": "synthetic-smoke",
  "version": "1",
  "generatedAt": "2026-06-03T15:49:47.691Z",
  "target": "https://hirestream-stg.agentryx.dev",
  "result": "PASS|FAIL|SKIP|TIMEOUT",
  "exitCode": 0,
  "durationMs": 21968,
  "summary": { "pass": 381, "warn": 11, "fail": 80 },
  "failures": ["…first 10 FAILURES lines from smoke output…"],
  "timedOut": false,
  "stderrTail": "",
  "spawnError": null
}
```

`SKIP` records (throttled re-runs) include `reason`, `lastResult`, `lastRunAt` instead of the summary block.

## Scheduling via pm2 cron

```bash
# 10-minute interval against the configured target. The cron does NOT auto-restart;
# a synthetic monitor that crashes is the dashboard's signal, not pm2's job to retry.
pm2 start tools/synthetic/run-prod-smoke.mjs \
  --name hirestream-synthetic \
  --cron "*/10 * * * *" \
  --no-autorestart

# Persist across daemon restarts
pm2 save
```

For environment variables (target URL, token), use an ecosystem file:

```js
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "hirestream-synthetic",
    script: "tools/synthetic/run-prod-smoke.mjs",
    cron_restart: "*/10 * * * *",
    autorestart: false,
    env: {
      DEEP_URL: "https://hirestream-stg.agentryx.dev",
      DEEP_SMOKE_TOKEN: "...set per env...",
      MIN_INTERVAL_SECONDS: "480"
    }
  }]
};
```

Then `pm2 start ecosystem.config.cjs && pm2 save`.

## Tunables (env vars)

| Variable | Default | Purpose |
|---|---|---|
| `DEEP_URL` | `https://hirestream-stg.agentryx.dev` | Target portal to smoke. **Set to the prod URL on the prod monitor host.** |
| `DEEP_SMOKE_TOKEN` | `test123` | Passed through to deep-smoke for the `/__routes` diagnostic endpoint |
| `MIN_INTERVAL_SECONDS` | `480` (8 min) | Below this elapsed-time, the run SKIPs without spawning smoke |
| `SMOKE_TIMEOUT_MS` | `240000` (4 min) | Hard timeout on the smoke child process. On timeout, status is `TIMEOUT` and exit is 124 |
| `SYNTHETIC_STATE_FILE` | `/tmp/hirestream-synthetic-state.json` | Throttle state. `/tmp` is intentional — reboot resets it |
| `SLACK_WEBHOOK_URL` | unset | Optional. If set, posts a message on `FAIL` or `TIMEOUT` (not on `PASS`). Leave unset on PROD until a notification channel is approved |

## Disabling

```bash
pm2 stop hirestream-synthetic
pm2 save
```

The app itself is unaffected — smoke:prod is observation only.

## What "result: FAIL" actually means

`FAIL` mirrors deep-smoke's exit code. Against staging today, that includes ~80 calibration-noise LEAKs from handler-level data scoping (see `tests/integration/data-isolation.test.ts` for the proper content-level check). Reading the `failures` array tells you which:

- `authz LEAK: <role> reached <route> -> 200` against routes already in the staging baseline → calibration noise, ignore
- `<role> GET <route> -> 5xx` → real regression, investigate
- `<role> GET <route> -> 0/-1/no envelope` → network/dns/cert problem at the target URL

Against production (once a prod monitor is wired), the calibration baseline will differ. Expect to spend the first week tuning what counts as signal vs. noise.

## Defence-in-depth notes

The wrapper deletes `SLACK_WEBHOOK_URL` from the spawned child's env so that a future regression that re-adds Slack code in `deep-smoke.mjs` cannot accidentally double-post. The current `deep-smoke.mjs` has no Slack hook; this is a guardrail, not a fix.
