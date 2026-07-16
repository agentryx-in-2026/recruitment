# LLM Triage Runbook

The `log:triage` script reads `logs/digest-latest.json` (produced by `tools/log-analyzer/digest.mjs`), sends each error cluster to an OpenAI-compatible LLM endpoint, and writes `logs/triage-latest.json` with the model's proposed root-cause hypotheses. The Phase 4 Operator Console reads that file to surface diagnostic suggestions next to each cluster.

**Default: disabled.** Set `TRIAGE_ENABLED=true` to run. This protects PROD from accidentally calling an LLM endpoint before the customer's IT team has approved the channel.

## Quick start

```bash
# Connectivity test (recommended first run; tiny prompt, reports latency)
npm run test:llm

# Dry-run — show the prompts that would be sent; no network call
node tools/triage/triage.mjs --dry-run

# Real triage run (requires TRIAGE_ENABLED=true)
TRIAGE_ENABLED=true npm run log:triage
```

## Environment configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRIAGE_ENABLED` | `false` | Master switch. Even when fully configured, the script no-ops without this |
| `LLM_BASE_URL` | `https://nexus.osipl.dev/v1` | OpenAI-compatible base URL — `/chat/completions` is appended |
| `LLM_MODEL` | `mistral-7b-instruct-v0.2.Q4_K_M` | Model identifier sent in the request body |
| `LLM_API_KEY` | `""` | Bearer token. Empty for self-hosted Mistral; required for commercial APIs |
| `LLM_TIMEOUT_MS` | `90000` (90s) | Per-call timeout. Mistral 7B Q4 on CPU is ~3-4 tokens/sec |
| `TRIAGE_MAX_TOKENS` | `200` | Output cap per cluster |
| `TRIAGE_TEMPERATURE` | `0.2` | Low — diagnostic, not creative |
| `TRIAGE_MAX_CLUSTERS` | `10` | Cap clusters per run to bound total runtime |
| `TRIAGE_INPUT` | `logs/digest-latest.json` | Input source (digest output) |
| `TRIAGE_OUTPUT` | `logs/triage-latest.json` | Output target |

## Endpoint targets

| Environment | URL | Notes |
|---|---|---|
| **HireStream DEV** | `https://nexus.osipl.dev/v1` | HPSEDC dev Mistral. Publicly reachable HTTPS. Same model as PROD |
| **HireStream PROD** | `http://10.126.104.88/v1` | Internal IP. Currently firewalled — IT team must open access before flipping `TRIAGE_ENABLED=true` |
| Local development | `http://localhost:11434/v1` | Local Ollama (`ollama pull mistral`) — useful when offline |
| Commercial fallback | `https://api.openai.com/v1` | Requires `LLM_API_KEY`. Not recommended for govt PII workloads |

## What gets sent to the LLM

For each error cluster the model receives:

```
System: You are an error triage assistant for the HireStream overseas-placement web portal.
        [stack details, role list, route patterns]

User:   Error class: <X>
        Occurrences in last window: <N>
        Sample route: <route, PII-scrubbed>
        Sample message: <up to 300 chars, PII-scrubbed>
```

The PII scrubber redacts in-place:

| Pattern | Tag |
|---|---|
| Emails | `[EMAIL]` |
| Indian phone numbers (10-digit, optional +91 prefix) | `[PHONE]` |
| Indian passport numbers (1 letter + 7 digits, e.g. `K1234567`) | `[PASSPORT]` |
| Aadhaar numbers (12 digits, optional spaces) | `[AADHAAR]` |
| UUIDs | `[UUID]` |
| JWT tokens | `[JWT]` |

The model never sees raw user content even when the LLM is self-hosted — defence in depth against future cache/log leakage.

## Output shape (`logs/triage-latest.json`)

```json
{
  "kind": "triage",
  "version": "1",
  "generatedAt": "2026-06-03T16:35:41.097Z",
  "llm": { "baseUrl": "https://nexus.osipl.dev/v1", "model": "mistral-7b-instruct-v0.2.Q4_K_M" },
  "digestSourceAt": "2026-06-03T16:31:56.427Z",
  "clustersTriaged": 1,
  "failureCount": 0,
  "totalLatencyMs": 54314,
  "usage": { "totalInputTokens": 331, "totalOutputTokens": 116 },
  "results": [
    {
      "errorClass": "UnknownError",
      "count": 20,
      "sampleRoute": "/sso/himaccess",
      "hypothesis": "Based on the error class … likely a missing middleware in /api/v1/auth/sso …",
      "latencyMs": 54308,
      "usage": { "prompt_tokens": 331, "completion_tokens": 116, "total_tokens": 447 },
      "model": "mistral-7b-instruct-v0.2.Q4_K_M"
    }
  ]
}
```

## Scheduling via pm2 cron

```bash
# Daily at 09:05 — runs AFTER the digest cron at 09:00
pm2 start tools/triage/triage.mjs --name hirestream-triage --cron "5 9 * * *" --no-autorestart

# Use an ecosystem file to set TRIAGE_ENABLED + LLM config
# (see synthetic-monitor-runbook.md for the ecosystem.config.cjs pattern)
pm2 save
```

## Disabling

```bash
# Per-run disable
TRIAGE_ENABLED=false npm run log:triage   # exits 0 immediately

# pm2 disable
pm2 stop hirestream-triage
```

The Phase 4 Operator Console (planned) will replace env-var-based config with a UI: per-feature toggle, URL + credential fields, "Test connection" button — same pattern as the DMS Admin Console at `dms.osipl.dev/ask/admin`.

## Calibration notes

- Mistral 7B Q4 hallucinates domain terms it hasn't seen (e.g. "HIM" → "Health Information Management" rather than "Himachal Information Management"). The hypothesis text should always be treated as a *starting point*, not authoritative — the dashboard surfaces it as suggestion, not fact.
- First-run latency on a cold model is higher (CPU caches). Expect ~50-70s per cluster initially, settling to ~40-50s once warm.
- The dev Nexus appears to have a default system prompt for OCR/document tasks (visible in connectivity test responses). Our explicit system prompt steers the model to triage mode, but occasional preamble may leak. For production, prefer a Nexus deployment with no default system prompt, or a tighter system prompt override.
