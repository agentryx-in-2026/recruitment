/**
 * PM2 ecosystem file — persists process config + environment across pm2
 * daemon restarts and server reboots.
 *
 * Usage on the deployment host:
 *   cd hirestream/
 *   pm2 startOrReload ecosystem.config.cjs        # apply
 *   pm2 save                                       # persist for daemon restart
 *
 * Only includes background cron processes. The main `hirestream` web server
 * is intentionally NOT listed here because its deploy path is via
 * `scripts/deploy-gate.sh` (which runs deep-smoke before pm2 restart). Adding
 * it here would create two control planes for the same process — bad. Keep
 * the deploy gate as the sole entry point for the web server.
 */

module.exports = {
  apps: [
    {
      // P3.5 — runs scripts/deep-smoke.mjs against the target URL every 10 min
      // and writes logs/synthetic-latest.json. Env survives daemon restarts.
      // See docs/synthetic-monitor-runbook.md for the full operational story.
      name: "hirestream-lite-synthetic",
      script: "tools/synthetic/run-prod-smoke.mjs",
      cwd: __dirname,
      cron_restart: "*/10 * * * *",
      autorestart: false,                            // cron-driven; don't respawn on exit
      max_memory_restart: "200M",                    // defensive ceiling
      env: {
        // Default to staging — operator changes this on the PROD host's
        // copy of the file (or via env vars in the cron host shell).
        DEEP_URL: "https://hirestream-lite.agentryx.dev",
        // Token expected by the /__routes diagnostic endpoint. The default
        // on staging is "test123" (see scripts/deep-smoke.mjs:138). Override
        // here when the operator rotates it.
        DEEP_SMOKE_TOKEN: "test123",
        // Throttle protection — refuses to spawn smoke if last run was
        // less than this many seconds ago. Defends against rapid cron
        // re-triggers on pm2 reload.
        MIN_INTERVAL_SECONDS: "480",
        // Optional: set this on hosts where you want FAIL/TIMEOUT to post
        // a Slack message. Leave empty here; operator sets it via
        //   pm2 set hirestream-synthetic:env.SLACK_WEBHOOK_URL <url>
        // or by editing this file on the deployment host.
        SLACK_WEBHOOK_URL: "",
      },
    },
  ],
};
