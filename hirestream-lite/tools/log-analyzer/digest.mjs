import fs from 'fs';
import readline from 'readline';
import { resolve } from 'path';
import { getFeatureConfig } from '../../lib/config.mjs';

// Config resolution: system_config DB row → env vars → hardcoded defaults.
const cfg = await getFeatureConfig('daily_digest', {
  enabled: (process.env.DIGEST_ENABLED || "true").toLowerCase() === "true",
  logPath: process.env.LOG_PATH || resolve(process.cwd(), 'logs', 'app.log'),
  windowHours: parseInt(process.env.WINDOW_HOURS || "24", 10),
  baselineDays: parseInt(process.env.BASELINE_DAYS || "7", 10),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
});

if (!cfg.enabled) {
  console.log(`[digest] disabled in system_config (source=${cfg.source}); exiting cleanly.`);
  process.exit(0);
}

const LOG_PATH = String(cfg.logPath);
const SLACK_WEBHOOK_URL = String(cfg.slackWebhookUrl || "");
const WINDOW_HOURS = Number(cfg.windowHours) || 24;
const BASELINE_DAYS = Number(cfg.baselineDays) || 7;

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    const match = line.match(/(\{.*\})$/);
    if (match) {
      try { return JSON.parse(match[1]); } catch(e) {}
    }
  }
  return null;
}

function p95(arr) {
  if (!arr || arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const idx = Math.floor(arr.length * 0.95);
  return arr[idx];
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

async function run() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`Error: Log file not found at ${LOG_PATH}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(LOG_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const now = Date.now();
  const windowStart = now - (WINDOW_HOURS * 3600 * 1000);
  const baselineStart = now - (BASELINE_DAYS * 24 * 3600 * 1000);

  const current = {
    totalErrors: 0,
    routes: {}, // { count, errCount, durations: [] }
    errorClasses: {}, // { class -> count, route }
  };

  const baseline = {
    totalErrors: 0,
    routes: {}, // { durations: [] }
    errorClasses: new Set(),
  };

  for await (const line of rl) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const ts = new Date(parsed.timestamp || parsed.t || parsed.time).getTime();
    if (isNaN(ts) || ts < baselineStart) continue;

    const route = parsed.route || parsed.path || "unknown_route";
    const status = parseInt(parsed.statusCode || parsed.status, 10) || 200;
    const duration = parseFloat(parsed.durationMs || parsed.duration) || 0;
    const level = (parsed.level || "").toLowerCase();
    const isError = status >= 500 || level === "error" || level === "fatal";
    
    let errorClass = parsed.errorClass;
    if (!errorClass && isError) {
      if (parsed.stack) errorClass = parsed.stack.split(":")[0];
      else if (parsed.message && parsed.message.includes("constraint")) errorClass = "DatabaseConstraintError";
      else errorClass = "UnknownError";
    }

    if (ts >= windowStart) {
      if (isError) current.totalErrors++;
      
      if (!current.routes[route]) current.routes[route] = { count: 0, errCount: 0, durations: [] };
      current.routes[route].count++;
      if (isError) current.routes[route].errCount++;
      if (duration > 0) current.routes[route].durations.push(duration);

      if (isError && errorClass) {
        if (!current.errorClasses[errorClass]) current.errorClasses[errorClass] = { count: 0, sampleRoute: route, sampleMsg: parsed.message || parsed.msg || "" };
        current.errorClasses[errorClass].count++;
      }
    } else {
      // Baseline
      if (isError) baseline.totalErrors++;
      if (duration > 0) {
        if (!baseline.routes[route]) baseline.routes[route] = { durations: [] };
        baseline.routes[route].durations.push(duration);
      }
      if (isError && errorClass) baseline.errorClasses.add(errorClass);
    }
  }

  // If no events at all in the current window
  const totalEvents = Object.values(current.routes).reduce((acc, val) => acc + val.count, 0);
  if (totalEvents === 0) {
    const noEventsMsg = `HireStream · digest · ${new Date().toISOString().split('T')[0]}\n─────────────────────────────────────────────\nNo events in last ${WINDOW_HOURS}h.`;
    console.log(noEventsMsg);
    const idlePath = resolve(process.cwd(), 'logs', 'digest-latest.json');
    try {
      fs.writeFileSync(idlePath, JSON.stringify({
        kind: "log-digest",
        version: "1",
        generatedAt: new Date().toISOString(),
        windowHours: WINDOW_HOURS,
        baselineDays: BASELINE_DAYS,
        totals: { currentWindowErrors: 0, baselineAvgErrorsPerWindow: 0, pctChangeVsBaseline: 0 },
        topErrors: [], slowestRoute: { route: "none", p95: 0 },
        novelClasses: [], regressions: [], errorClasses: [], routeCount: 0,
        idle: true,
      }, null, 2) + "\n");
    } catch (e) { console.warn(`Failed to write ${idlePath}: ${e.message}`); }
    process.exit(0);
  }

  // Calculate stats
  const baselineAvgErrors = baseline.totalErrors / (BASELINE_DAYS - (WINDOW_HOURS/24));
  const errDiff = baselineAvgErrors > 0 ? Math.round(((current.totalErrors - baselineAvgErrors) / baselineAvgErrors) * 100) : 0;
  const errTrend = errDiff >= 0 ? '▲' : '▼';

  const routeStats = Object.entries(current.routes)
    .filter(([_, data]) => data.count >= 10)
    .map(([route, data]) => ({
      route,
      errRate: data.errCount / data.count,
      p95: p95(data.durations),
      baseMedian: baseline.routes[route] ? median(baseline.routes[route].durations) : null
    }));

  routeStats.sort((a, b) => b.errRate - a.errRate);
  const topErrors = routeStats.slice(0, 3);

  routeStats.sort((a, b) => b.p95 - a.p95);
  const slowestRoute = routeStats[0] || { route: "none", p95: 0 };

  const novelClasses = [];
  for (const [eClass, data] of Object.entries(current.errorClasses)) {
    if (!baseline.errorClasses.has(eClass)) novelClasses.push({ eClass, ...data });
  }

  const regressions = routeStats.filter(r => r.baseMedian && r.p95 >= r.baseMedian * 1.5 && r.baseMedian > 10);

  let output = `HireStream · digest · ${new Date().toISOString().split('T')[0]}
─────────────────────────────────────────────
  Errors: ${current.totalErrors} (${errTrend} ${Math.abs(errDiff)}% vs ${BASELINE_DAYS}d avg)        Top routes by error rate:
  Slowest p95: ${slowestRoute.route} (${(slowestRoute.p95/1000).toFixed(1)}s)`;

  topErrors.forEach((r, i) => {
    output += `\n                                        ${i+1}. ${r.route}  ${(r.errRate*100).toFixed(1)}%`;
  });

  output += `\n  Novel error classes: ${novelClasses.length} (↑)\n`;

  if (novelClasses.length > 0) {
    novelClasses.forEach(nc => {
      const shortMsg = nc.sampleMsg.substring(0, 80) + (nc.sampleMsg.length > 80 ? "..." : "");
      output += `\n  ⚠ NOVEL ERROR SUSPECT  ${nc.sampleRoute} — ${nc.count} hits\n    ${shortMsg}\n`;
    });
  }

  if (regressions.length > 0) {
    output += `\n  Latency regressions vs ${BASELINE_DAYS}d:\n`;
    regressions.forEach(r => {
      const pct = Math.round(((r.p95 - r.baseMedian) / r.baseMedian) * 100);
      output += `    ${r.route}   p95 ${Math.round(r.p95)}ms ▲ from ${Math.round(r.baseMedian)}ms (+${pct}%)\n`;
    });
  }

  if (Object.keys(current.errorClasses).length > 0) {
    output += `\n  Error classes seen:\n`;
    let i = 1;
    for (const [eClass, data] of Object.entries(current.errorClasses).sort((a,b) => b[1].count - a[1].count).slice(0, 5)) {
      output += `    ${i++}. ${eClass}  (${data.count}x, ${data.sampleRoute})\n`;
    }
  }

  console.log(output);

  // Structured artefact for downstream consumers (P3.2 LLM triage, Phase 4
  // Operator Console). Always written; logs/ is gitignored. Schema is kept
  // stable across digest runs so consumers can pin to fields.
  const digestRecord = {
    kind: "log-digest",
    version: "1",
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,
    baselineDays: BASELINE_DAYS,
    totals: {
      currentWindowErrors: current.totalErrors,
      baselineAvgErrorsPerWindow: Math.round(baselineAvgErrors * 10) / 10,
      pctChangeVsBaseline: errDiff,
    },
    topErrors,
    slowestRoute,
    novelClasses: novelClasses.map(nc => ({
      errorClass: nc.eClass,
      count: nc.count,
      sampleRoute: nc.sampleRoute,
      sampleMsg: nc.sampleMsg,
    })),
    regressions: regressions.map(r => ({
      route: r.route,
      p95Ms: Math.round(r.p95),
      baselineMedianMs: Math.round(r.baseMedian),
      pctIncrease: Math.round(((r.p95 - r.baseMedian) / r.baseMedian) * 100),
    })),
    errorClasses: Object.entries(current.errorClasses)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([errorClass, data]) => ({
        errorClass,
        count: data.count,
        sampleRoute: data.sampleRoute,
        sampleMsg: data.sampleMsg,
      })),
    routeCount: Object.keys(current.routes).length,
  };

  const digestJsonPath = resolve(process.cwd(), 'logs', 'digest-latest.json');
  try {
    fs.writeFileSync(digestJsonPath, JSON.stringify(digestRecord, null, 2) + "\n");
  } catch (e) {
    console.warn(`Failed to write ${digestJsonPath}: ${e.message}`);
  }

  if (SLACK_WEBHOOK_URL) {
    try {
      await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "```\n" + output + "\n```" })
      });
    } catch (e) {
      console.warn("Failed to post to Slack:", e.message);
    }
  }
}

run().catch(e => {
  console.error("Script failed:", e);
  process.exit(1);
});
