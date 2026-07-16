# Loki Stack — HireStream Log Mining

Self-hosted log search and (optionally) alerting infrastructure for HireStream. The Phase 4 Operator Console queries Loki via its HTTP API; Grafana and Alertmanager are optional power-user / operator add-ons.

## What this gives you

- **Loki** (port 3100): log database. NDJSON lines from `logs/app*.log` and `logs/error.log` are ingested, indexed, and retained for 90 days.
- **Promtail**: agent that tails the log files and ships them to Loki.
- **Grafana** (optional, port 3000): browser UI for ad-hoc queries. The Operator Console covers everyday use; Grafana is for power users.
- **Alertmanager** (optional, port 9093): pushes alerts to a configured channel. PARKED — only enable once the customer has approved a notification channel.

## Deploy — base stack (always-on)

On the deployment host:

```bash
cd hirestream/infra/loki

# The promtail bind-mount is a relative path (../../logs) that resolves to
# the hirestream/logs/ directory from the compose file's location — works
# regardless of where HireStream is installed (no env override needed).
docker compose up -d loki promtail

# Verify
docker compose ps                                   # both should be "healthy"
curl http://localhost:3100/ready                    # → "ready"
curl 'http://localhost:3100/loki/api/v1/labels'     # → list of labels (level, service, method, status_code, job)
```

After Promtail has been running ~30s, tail-back the most recent log lines via the API:

```bash
curl -G 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query={job="hirestream"}' \
  --data-urlencode "start=$(date -d '5 minutes ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" | jq '.data.result | length'
```

If that returns `>0`, Loki is ingesting correctly.

## Deploy — Grafana (optional, on demand)

```bash
GRAFANA_ADMIN_PASSWORD='your-strong-pw' docker compose --profile grafana up -d grafana
# → browse to http://<host>:3000  (login admin / GRAFANA_ADMIN_PASSWORD)
# Loki datasource is pre-provisioned. Explore tab → pick "Loki" → run queries.
```

## Deploy — Alertmanager (PARKED until channel approved)

1. Edit `alertmanager-config.yml`: replace the placeholder webhook block with the customer-approved channel (Slack / Mattermost / email / webhook).
2. `docker compose --profile alerts up -d alertmanager`
3. Write Loki rule files in `/loki/rules/` (mount or copy) — see "Authoring alert rules" below.
4. **Do NOT enable until the customer has confirmed the channel**.

## Common LogQL queries

Use these in Grafana Explore or the Operator Console search box (or via `curl`):

```logql
# All errors in the last hour
{level="error"}

# 5xx responses per route (path lives inside JSON — parse at query time)
{job="hirestream",status_code=~"5.."} | json | line_format "{{.method}} {{.path}}"

# 95th-percentile duration per method
quantile_over_time(0.95, {job="hirestream"} | json | unwrap duration [5m]) by (method)

# Error rate per HTTP method, 5-minute windows
sum by (method) (rate({job="hirestream",level="error"}[5m]))

# Count of HireStream HIM-Access SSO 501s (the case P3.2 triages)
count_over_time({job="hirestream"} | json | path=~"/sso/himaccess.*" | statusCode="501" [24h])
```

## Labels vs JSON fields

| In the index (low cardinality, fast filter) | Parsed at query time (high cardinality, full JSON) |
|---|---|
| `job` (constant: `hirestream` or `hirestream-error`) | `path` — raw URL with UUIDs (289+ distinct values; not labeled to avoid cardinality explosion) |
| `level` (info / warn / error / debug / fatal) | `duration` (numeric ms) |
| `service` (constant: `hirestream-api`) | `message` (free text) |
| `method` (GET / POST / PUT / DELETE / PATCH / OPTIONS / HEAD) | `errorClass` (does NOT exist in raw logs — digest.mjs derives it at read time) |
| `status_code` (~30 distinct values) | `route` (does NOT exist in raw logs — Winston emits `path` only) |

## Authoring alert rules (when Alertmanager is enabled)

Put YAML files under `loki/rules/` (mounted into the Loki container). Example:

```yaml
groups:
  - name: hirestream-prod
    rules:
      - alert: ErrorRateSpike
        expr: |
          sum(rate({job="hirestream",level="error"}[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "HireStream error rate >1/s for 5+ min"
      - alert: P95LatencyRegression
        expr: |
          quantile_over_time(0.95, {job="hirestream"} | json | unwrap duration [5m]) > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "HireStream p95 latency >1s for 10+ min"
```

Reload Loki to pick up rule changes: `docker compose restart loki`.

## Operational notes

- **Disk**: `loki-data` volume grows with retention. Plan ~50-100 MB/day per million log lines. 90 days = ~5-10 GB depending on traffic.
- **Position file**: Promtail writes byte offsets to `promtail-positions` volume. Wiping it forces re-ingest of all log lines (creates duplicates).
- **HireStream log rotation**: Winston rotates `app.log` → `app1.log` → `app2.log` etc. up to `maxFiles`. Promtail's glob `app*.log` follows them automatically; no rotated-history loss.
- **Restart safety**: `restart: unless-stopped` on the services. After a host reboot, `docker compose up -d` brings everything back without re-config.

## Disabling

```bash
docker compose down                # stop the base stack
docker compose --profile grafana down
docker compose --profile alerts  down
```

App itself is unaffected — Loki is observation infrastructure, not in the request path.

## Phase 4 plan

The Operator Console will provide:
- A log search box on the Status tab (calls Loki HTTP API; UX similar to Grafana Explore but inside the app and behind superadmin auth).
- A System Config tab where the Loki URL is one configurable field (replacing this README's hardcoded `http://loki:3100`).
- Per-feature toggles (enable Loki ingest, enable triage, enable synthetic monitor, etc.) — DB-backed, no env-var editing needed for routine ops.
