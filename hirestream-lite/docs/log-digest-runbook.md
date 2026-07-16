# Log Digest Runbook

The `log:digest` script reads the latest structured logs and generates an opinionated morning summary, clustering errors and surfacing latency anomalies.

## Running Manually

To run the script manually and print the output to `stdout`:
```bash
# Uses default logs/app.log and 24h window
npm run log:digest

# Point to specific PM2 logs or alter the window
LOG_PATH=~/.pm2/logs/hirestream-out.log WINDOW_HOURS=12 npm run log:digest
```

To send the output directly to Slack:
```bash
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." npm run log:digest
```

## Scheduling via PM2 Cron

This should be registered by operators on the production and staging VMs. A typical daily 9:00 AM run would be scheduled as:
```bash
pm2 start tools/log-analyzer/digest.mjs --name hirestream-digest --cron "0 9 * * *"
```

## Investigating "Novel Error Classes"

A **Novel Error Class** (flagged with ⚠) means an error type (e.g., `ZodValidationError`, `DatabaseConstraintError`, or a custom name like `AgencyDocsNotFound`) appeared in the past `WINDOW_HOURS` but was **not seen at all** during the preceding `BASELINE_DAYS` (default 7 days).

If you see a novel error:
1. Search the full logs for that `errorClass` or `route` to get the full stack trace and request details.
2. Determine if it correlates with a recent deployment (the summary will help you isolate when it started).

You can tune the baseline memory by setting the `BASELINE_DAYS` env variable (e.g., `BASELINE_DAYS=14`).
