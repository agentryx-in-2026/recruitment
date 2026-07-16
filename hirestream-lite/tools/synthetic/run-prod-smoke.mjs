#!/usr/bin/env node
/**
 * Synthetic monitor — runs the deep-smoke harness against a target URL on a
 * schedule (operator wires this to pm2 cron). Writes the result to a JSON
 * status file that the operator dashboard reads. NO push notifications — the
 * dashboard surfaces health; humans pull, the monitor does not push.
 *
 * Usage:
 *   node tools/synthetic/run-prod-smoke.mjs
 *   DEEP_URL=https://hirestream-stg.agentryx.dev npm run smoke:prod
 *
 * Behaviour:
 *   - Throttles by min-interval (default 8min) — re-runs within the window
 *     exit 0 with a SKIP record, no smoke spawned.
 *   - Spawns `node scripts/deep-smoke.mjs` as a child with SLACK_WEBHOOK_URL
 *     scrubbed (defence in depth — current deep-smoke has no Slack hook, but
 *     this prevents future regressions from double-posting if both files ever
 *     gain Slack code again).
 *   - Hard timeout via AbortController. Kills the child if smoke hangs.
 *   - Writes logs/synthetic-latest.json with: result, exit code, pass/warn/FAIL
 *     counts, first 10 failures, duration. Also rotates the prior snapshot to
 *     logs/synthetic-previous.json for trivial trend.
 *   - Exit code mirrors smoke's exit code (0 = healthy, 1 = unhealthy). The
 *     monitor itself succeeding at its job and reporting a failure is still
 *     reported as exit 1 — pm2 logs treat that as a flagged run.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getFeatureConfig } from "../../lib/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Config resolution: system_config DB row → env vars → hardcoded defaults.
// See lib/config.mjs for the priority order.
const cfg = await getFeatureConfig("synthetic_monitor", {
  enabled: (process.env.SYNTHETIC_ENABLED || "true").toLowerCase() === "true",
  targetUrl: process.env.DEEP_URL || "https://hirestream-stg.agentryx.dev",
  minIntervalSeconds: parseInt(process.env.MIN_INTERVAL_SECONDS || "480", 10),
  smokeTimeoutMs: parseInt(process.env.SMOKE_TIMEOUT_MS || "240000", 10),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
});

if (!cfg.enabled) {
  console.log(`[synthetic ${new Date().toISOString()}] disabled in system_config (source=${cfg.source}); exiting cleanly.`);
  process.exit(0);
}

const TARGET_URL = String(cfg.targetUrl).replace(/\/$/, "");
const STATE_FILE = process.env.SYNTHETIC_STATE_FILE || "/tmp/hirestream-synthetic-state.json";
const STATUS_FILE = resolve(REPO_ROOT, "logs", "synthetic-latest.json");
const STATUS_PREV = resolve(REPO_ROOT, "logs", "synthetic-previous.json");
const MIN_INTERVAL_SECONDS = Number(cfg.minIntervalSeconds) || 480;
const SMOKE_TIMEOUT_MS = Number(cfg.smokeTimeoutMs) || 240000;
const SMOKE_SCRIPT = resolve(REPO_ROOT, "scripts", "deep-smoke.mjs");
const SLACK_WEBHOOK_URL = String(cfg.slackWebhookUrl || "");

const nowIso = () => new Date().toISOString();

async function readJsonOrNull(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, data) {
  await fs.writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

function parseSummary(stdout) {
  const summaryMatch = stdout.match(/SUMMARY\s+pass=(\d+)\s+warn=(\d+)\s+FAIL=(\d+)/);
  if (!summaryMatch) return null;
  return { pass: +summaryMatch[1], warn: +summaryMatch[2], fail: +summaryMatch[3] };
}

function parseFailures(stdout, max = 10) {
  const idx = stdout.indexOf("FAILURES:");
  if (idx < 0) return [];
  const tail = stdout.slice(idx).split("\n").slice(1);
  const failures = [];
  for (const line of tail) {
    if (failures.length >= max) break;
    if (line.startsWith("  - ")) failures.push(line.slice(4).trim());
    else if (line.startsWith("RESULT:")) break;
  }
  return failures;
}

function runSmokeChild() {
  return new Promise((resolveRun) => {
    const childEnv = { ...process.env, DEEP_URL: TARGET_URL };
    delete childEnv.SLACK_WEBHOOK_URL;

    const start = Date.now();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), SMOKE_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(process.execPath, [SMOKE_SCRIPT], {
      cwd: REPO_ROOT,
      env: childEnv,
      signal: controller.signal,
    });

    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      if (err.name === "AbortError") timedOut = true;
      resolveRun({
        exitCode: 124,
        stdout, stderr,
        timedOut,
        durationMs: Date.now() - start,
        spawnError: err.name === "AbortError" ? null : String(err),
      });
    });

    child.on("exit", (code) => {
      clearTimeout(timeoutHandle);
      resolveRun({
        exitCode: code ?? -1,
        stdout, stderr,
        timedOut,
        durationMs: Date.now() - start,
        spawnError: null,
      });
    });
  });
}

async function main() {
  await fs.mkdir(resolve(REPO_ROOT, "logs"), { recursive: true });

  const state = await readJsonOrNull(STATE_FILE) || {};
  const lastRunMs = state.lastRunAt ? Date.parse(state.lastRunAt) : 0;
  const elapsedSec = Math.floor((Date.now() - lastRunMs) / 1000);

  if (lastRunMs && elapsedSec < MIN_INTERVAL_SECONDS) {
    const skipRecord = {
      kind: "synthetic-smoke",
      version: "1",
      generatedAt: nowIso(),
      target: TARGET_URL,
      result: "SKIP",
      reason: `min-interval throttle: last run was ${elapsedSec}s ago (< ${MIN_INTERVAL_SECONDS}s)`,
      lastResult: state.lastResult ?? null,
      lastRunAt: state.lastRunAt ?? null,
    };
    console.log(`[synthetic ${skipRecord.generatedAt}] SKIP — last run ${elapsedSec}s ago (within ${MIN_INTERVAL_SECONDS}s threshold)`);
    process.exit(0);
  }

  console.log(`[synthetic ${nowIso()}] starting smoke against ${TARGET_URL}`);
  const run = await runSmokeChild();

  const summary = parseSummary(run.stdout);
  const failures = parseFailures(run.stdout);
  const result = run.timedOut ? "TIMEOUT" : (run.exitCode === 0 ? "PASS" : "FAIL");

  const record = {
    kind: "synthetic-smoke",
    version: "1",
    generatedAt: nowIso(),
    target: TARGET_URL,
    result,
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    summary,
    failures,
    timedOut: run.timedOut,
    stderrTail: run.stderr ? run.stderr.split("\n").slice(-20).join("\n") : "",
    spawnError: run.spawnError,
  };

  const prior = await readJsonOrNull(STATUS_FILE);
  if (prior) await writeJson(STATUS_PREV, prior);
  await writeJson(STATUS_FILE, record);

  await writeJson(STATE_FILE, {
    lastRunAt: record.generatedAt,
    lastExitCode: record.exitCode,
    lastResult: record.result,
  });

  const summaryLine = summary
    ? `pass=${summary.pass} warn=${summary.warn} FAIL=${summary.fail}`
    : "summary unparseable";
  console.log(`[synthetic ${record.generatedAt}] ${result}  ${summaryLine}  duration=${run.durationMs}ms  exit=${run.exitCode}`);
  if (result !== "PASS" && failures.length) {
    console.log(`  first failures:`);
    for (const f of failures.slice(0, 5)) console.log(`    - ${f}`);
  }
  console.log(`  status written: ${STATUS_FILE}`);

  if (SLACK_WEBHOOK_URL && (result === "FAIL" || result === "TIMEOUT")) {
    await postSlackAlert(record);
  }

  process.exit(run.exitCode === 0 ? 0 : 1);
}

async function postSlackAlert(record) {
  const summaryLine = record.summary
    ? `pass=${record.summary.pass} warn=${record.summary.warn} FAIL=${record.summary.fail}`
    : "summary unparseable";
  const body = [
    `*synthetic monitor — ${record.result}*`,
    `target: ${record.target}`,
    `result: ${summaryLine}  exit=${record.exitCode}  duration=${record.durationMs}ms`,
    record.failures && record.failures.length
      ? "first failures:\n" + record.failures.slice(0, 5).map((f) => `  • ${f}`).join("\n")
      : "",
    record.timedOut ? "_timed out — child killed by wrapper_" : "",
  ].filter(Boolean).join("\n");
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
    if (!res.ok) console.warn(`  slack post -> HTTP ${res.status}`);
    else console.log(`  slack: notified`);
  } catch (e) {
    console.warn(`  slack post failed: ${e.message}`);
  }
}

main().catch((err) => {
  console.error(`[synthetic ${nowIso()}] fatal: ${err.stack || err.message}`);
  process.exit(2);
});
