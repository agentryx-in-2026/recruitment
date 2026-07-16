# Operator Console Runbook

Phase 4 deliverable. The Operator Console is the single internal page where superadmin sees framework health and toggles every observability feature.

URL: `https://hirestream-stg.agentryx.dev/admin/operator-console` (superadmin login required).

## What's on the page

**Status tab:**
- **Synthetic Monitor** card — latest result (PASS/FAIL/TIMEOUT/SKIP), target URL, pass/warn/FAIL counts, first 5 failures. Refreshes every 30s.
- **Daily Digest** card — errors in the last window, top error classes, latency regressions, novel error classes.
- **LLM Triage** card — hypotheses for each clustered error (when triage is enabled and last ran).
- **Log Search (Loki)** — type a LogQL query, see matching log lines. Available labels: `job`, `level`, `service`, `method`, `status_code`. Use `| json` to parse JSON fields (e.g. `{job="hirestream"} | json | path=~"/auth.*"`).

**System Config tab:**
- One card per feature: `synthetic_monitor`, `llm_triage`, `daily_digest`, `loki`, `notifications`.
- Per card: enable/disable switch, current config (secrets shown as `***`), Edit Config button, Test Connection button.
- Connection test returns `ok / latency / details` (e.g. for LLM Triage: HTTP 200 + 2s latency + first 80 chars of model reply).

## How features map to running infrastructure on `hirestream-stg`

| Feature | What controls it | Default | What runs it |
|---|---|---|---|
| `synthetic_monitor` | `system_config.synthetic_monitor` | disabled | `pm2 cron */10` running `tools/synthetic/run-prod-smoke.mjs` writes `logs/synthetic-latest.json` |
| `llm_triage` | `system_config.llm_triage` | disabled | `tools/triage/triage.mjs` (cron or manual) writes `logs/triage-latest.json`. Hits `LLM_BASE_URL` (default `https://nexus.osipl.dev/v1`) |
| `daily_digest` | `system_config.daily_digest` | enabled | `tools/log-analyzer/digest.mjs` (daily cron) writes `logs/digest-latest.json` |
| `loki` | `system_config.loki` | disabled | Docker stack at `infra/loki/`; turn on the feature flag once stack is up |
| `notifications` | `system_config.notifications` | disabled | Currently env-gated `SLACK_WEBHOOK_URL` in synthetic monitor + digest |

## Editing a feature's config

1. Click **Edit config** on the feature card.
2. Modal opens with the JSON shown for editing.
3. Replace `***` placeholders with the real value (the API masks secrets in GET responses; the PUT merges your edit into the stored config).
4. Save.
5. Optional: click **Test** to confirm reachability.

Changes take effect on the **next script run** (scripts read the DB row at startup via `lib/config` helper — Phase 4.3 deferred for now; current scripts still use env vars, so set env on the cron host until P4.3 lands).

## How to enable LLM Triage

Today the script reads env vars, not the DB row (P4.3 deferred). To turn triage on:

```bash
# On the staging host (which is where you are):
cd /home/subhash.thakur.india/Projects/Recruitment/hirestream
TRIAGE_ENABLED=true npm run log:triage
# or wire it into the daily cron with that env set
```

The UI's toggle currently only updates the DB row — wiring scripts to read DB-first is P4.3 (deferred).

## How to enable Loki search in the page

1. Bring up the Loki stack (one-time):
   ```bash
   cd hirestream/infra/loki
   sudo docker compose up -d loki promtail
   ```
2. In the Operator Console → System Config tab → Loki card, click the enable switch.
3. Optionally **Test** — should return `HTTP 200 ready`.
4. Go to Status tab → use the Log Search box. Default query is `{job="hirestream"} |= ""`.

## What "Test connection" actually does per feature

| Feature | Test action |
|---|---|
| `synthetic_monitor` | POST to `${targetUrl}/api/v1/auth/login` with junk creds; expects any 1xx-4xx (target is reachable). |
| `llm_triage` | POST a 5-token "Reply with exactly OK" prompt to `${llmBaseUrl}/chat/completions`. Returns model name + reply preview. |
| `loki` | GET `${lokiUrl}/ready`. Expects "ready". |
| `notifications` | POST a test message to `slackWebhookUrl`. |
| `daily_digest` | No remote service; returns a placeholder. |

## API endpoints (for scripting / curl)

All require superadmin session cookie.

```bash
# List all 6 features
GET /api/v1/admin/system-config

# Get one feature; ?reveal=true returns unmasked secrets + logs a warning
GET /api/v1/admin/system-config/llm_triage

# Update enabled flag and/or merge a config patch
PUT /api/v1/admin/system-config/llm_triage
Body: {"enabled": true, "config": {"llmTimeoutMs": 120000}}

# Run a connectivity test
POST /api/v1/admin/system-config/llm_triage/test

# Status tab data (all three JSON status files in one round trip)
GET /api/v1/admin/operator-console/status

# Proxied LogQL query (Loki must be enabled in system_config)
GET /api/v1/admin/operator-console/logs?q={job=%22hirestream%22}&lookback=60&limit=50
```

## When something looks broken

- **Status cards show "No … data yet"** → the corresponding JSON file (`logs/synthetic-latest.json`, `logs/digest-latest.json`, `logs/triage-latest.json`) doesn't exist. Either the cron hasn't run yet, or it failed. Check `pm2 logs hirestream-synthetic --lines 50` for the synthetic monitor.
- **Log Search shows "Loki disabled"** → the `loki` feature toggle is off. Turn it on in System Config.
- **Log Search shows "Loki error"** → docker stack isn't up, or `lokiUrl` is wrong in the config. Try `curl http://localhost:3100/ready` from the host.
- **LLM Test returns `ok: false`** → check `llmBaseUrl` + `llmModel`. Common: network can't reach `nexus.osipl.dev` (PROD firewall scenario), API key required by a commercial endpoint, model name mismatch.
- **Operator Console page is blank / errors on load** → check browser console; most likely `pm2 logs hirestream` shows a 5xx on `/api/v1/admin/...`. The most recent regression: `__dirname is not defined` (ESM mistake) — fixed in v0.7.0.0 via `process.cwd()`.

## Disabling the whole feature

The page itself can be removed by deleting the route `/admin/operator-console` from `App.tsx` and rebuilding. The DB table and seed remain harmless — no script consults them yet (P4.3 deferred).

To wipe the table:
```sql
DROP TABLE IF EXISTS system_config;
```
…then restart hirestream; the seed will recreate it with defaults on next boot.
