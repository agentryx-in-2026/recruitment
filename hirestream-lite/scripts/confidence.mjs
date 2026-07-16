#!/usr/bin/env node
/**
 * Confidence Score — Phase 3 P3.3
 *
 * Computes a 0-100 score per PR/commit by aggregating three signal sources
 * available in CI:
 *   L2 (coverage) — Jest --coverage % from coverage/coverage-summary.json
 *   L3 (fuzz)     — schema-fuzz NEW findings beyond documented baseline
 *   L4 (smoke)    — deep-smoke NEW failures beyond documented baseline
 *
 * Reporter-only by design (continue-on-error in pr-check.yml). The companion
 * P3.4 pre-merge gate is a separate workflow step that enforces a threshold.
 *
 * Why "beyond baseline" rather than absolute counts:
 *   HireStream's smoke + fuzz baselines have known intentional findings —
 *   80 handler-scoped LEAKs (data isolation by-design) and ~70 /auth/register
 *   validateRequest gap findings (P2.1, deferred). If we counted those, every
 *   PR would score ~30/100. The baseline file lets us calibrate so the score
 *   reflects *delta* from the known state.
 *
 * Outputs:
 *   logs/confidence-latest.json — structured record (consumed by Operator Console)
 *   confidence-summary.md       — markdown body for PR comment (one-screen)
 *
 * Exits:
 *   0 on success regardless of score (reporter-only; P3.4 gates separately)
 *   1 only on internal error (missing input, can't write output)
 */

import fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ── Inputs (paths) ─────────────────────────────────────────────────────────
const COVERAGE_PATH = resolve(REPO_ROOT, "coverage", "coverage-summary.json");
const BASELINE_PATH = resolve(REPO_ROOT, "confidence", "baseline.json");
const OUTPUT_JSON = resolve(REPO_ROOT, "logs", "confidence-latest.json");
const OUTPUT_MD = resolve(REPO_ROOT, "confidence-summary.md");
const SMOKE_OUTPUT = process.env.CONFIDENCE_SMOKE_OUTPUT || "";
const FUZZ_OUTPUT = process.env.CONFIDENCE_FUZZ_OUTPUT || "";

// ── Baseline (calibration anchor) ──────────────────────────────────────────
function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    // No baseline file → treat all findings as new (conservative, high penalty)
    return { smokeExpectedFail: 0, fuzzExpectedFindings: 0, source: "missing-baseline" };
  }
}

// ── Coverage signal ────────────────────────────────────────────────────────
function readCoverage() {
  try {
    const data = JSON.parse(fs.readFileSync(COVERAGE_PATH, "utf8"));
    const total = data.total || {};
    const lines = total.lines?.pct ?? null;
    const branches = total.branches?.pct ?? null;
    const functions = total.functions?.pct ?? null;
    const statements = total.statements?.pct ?? null;
    // Composite: average of the four percentages, weighting lines highest
    const composite = [lines, branches, functions, statements].filter((n) => typeof n === "number");
    const avg = composite.length ? composite.reduce((a, b) => a + b, 0) / composite.length : null;
    return { available: composite.length > 0, lines, branches, functions, statements, composite: avg };
  } catch {
    return { available: false };
  }
}

// ── Smoke signal ───────────────────────────────────────────────────────────
function readSmoke() {
  if (!SMOKE_OUTPUT) return { available: false, reason: "CONFIDENCE_SMOKE_OUTPUT env not set" };
  try {
    const txt = fs.readFileSync(SMOKE_OUTPUT, "utf8");
    const m = txt.match(/SUMMARY\s+pass=(\d+)\s+warn=(\d+)\s+FAIL=(\d+)/);
    if (!m) return { available: false, reason: "no SUMMARY line found in smoke output" };
    return { available: true, pass: +m[1], warn: +m[2], fail: +m[3] };
  } catch (e) {
    return { available: false, reason: `cannot read ${SMOKE_OUTPUT}: ${e.message}` };
  }
}

// ── Fuzz signal ────────────────────────────────────────────────────────────
function readFuzz() {
  if (!FUZZ_OUTPUT) return { available: false, reason: "CONFIDENCE_FUZZ_OUTPUT env not set" };
  try {
    const txt = fs.readFileSync(FUZZ_OUTPUT, "utf8");
    // schema-fuzz output: each finding is "  - <description> -> <status>"
    // We count lines matching the pattern after "server accepted malformed input"
    const findings = (txt.match(/server accepted malformed input/g) || []).length;
    const more = txt.match(/and (\d+) more/);
    const total = findings + (more ? +more[1] : 0);
    return { available: true, total };
  } catch (e) {
    return { available: false, reason: `cannot read ${FUZZ_OUTPUT}: ${e.message}` };
  }
}

// ── Score formula ──────────────────────────────────────────────────────────
function computeScore(coverage, smoke, fuzz, baseline) {
  let score = 100;
  const breakdown = [];

  // L2 coverage — full credit at ≥80%, scaled down to 60% (linearly), 0 below 40%
  if (coverage.available) {
    const c = coverage.composite ?? 0;
    let penalty = 0;
    if (c < 80) penalty = Math.min(40, (80 - c) * 1.0);
    score -= penalty;
    breakdown.push({
      layer: "L2 coverage",
      value: `${c.toFixed(1)}%`,
      penalty: -penalty.toFixed(1),
      detail: `lines=${coverage.lines}% branches=${coverage.branches}% funcs=${coverage.functions}%`,
    });
  } else {
    score -= 10;
    breakdown.push({ layer: "L2 coverage", value: "n/a", penalty: -10, detail: "coverage-summary.json missing — Jest --coverage not run" });
  }

  // L3 fuzz — 2 points off per NEW finding beyond baseline
  if (fuzz.available) {
    const newFindings = Math.max(0, fuzz.total - baseline.fuzzExpectedFindings);
    const penalty = Math.min(30, newFindings * 2);
    score -= penalty;
    breakdown.push({
      layer: "L3 schema-fuzz",
      value: `${fuzz.total} findings (${newFindings} new vs baseline ${baseline.fuzzExpectedFindings})`,
      penalty: -penalty,
      detail: penalty > 0 ? "PR introduced new fuzz findings beyond documented baseline" : "no new fuzz findings",
    });
  } else {
    breakdown.push({ layer: "L3 schema-fuzz", value: "skipped", penalty: 0, detail: fuzz.reason });
  }

  // L4 smoke — 1 point off per NEW failure beyond baseline (cap 30)
  if (smoke.available) {
    const newFails = Math.max(0, smoke.fail - baseline.smokeExpectedFail);
    const penalty = Math.min(30, newFails * 1);
    score -= penalty;
    breakdown.push({
      layer: "L4 smoke",
      value: `${smoke.pass} pass · ${smoke.warn} warn · ${smoke.fail} fail (${newFails} new vs baseline ${baseline.smokeExpectedFail})`,
      penalty: -penalty,
      detail: penalty > 0 ? "PR introduced new smoke failures beyond documented baseline" : "no new smoke failures",
    });
  } else {
    breakdown.push({ layer: "L4 smoke", value: "skipped", penalty: 0, detail: smoke.reason });
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, breakdown };
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderMarkdown(score, breakdown, coverage, smoke, fuzz, baseline) {
  const verdict =
    score >= 85 ? "🟢 strong" :
    score >= 70 ? "🟡 acceptable" :
    score >= 50 ? "🟠 risky" :
                   "🔴 weak";
  const lines = [
    `### Confidence Score: ${score}/100 — ${verdict}`,
    "",
    "| Layer | Value | Penalty | Notes |",
    "|---|---|---:|---|",
    ...breakdown.map(b => `| ${b.layer} | ${b.value} | ${b.penalty} | ${b.detail} |`),
    "",
    `_Baseline used: smoke expects ≤${baseline.smokeExpectedFail} fail, fuzz expects ≤${baseline.fuzzExpectedFindings} findings_${baseline.source === "missing-baseline" ? "  ⚠️ baseline file missing — treating all findings as new" : ""}`,
    "",
    "Reporter-only — does not block merge. The P3.4 pre-merge gate enforces the threshold separately.",
  ];
  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const baseline = readBaseline();
  const coverage = readCoverage();
  const smoke = readSmoke();
  const fuzz = readFuzz();

  const { score, breakdown } = computeScore(coverage, smoke, fuzz, baseline);

  const record = {
    kind: "confidence-score",
    version: "1",
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || null,
    prNumber: process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//)?.[1] || null,
    score,
    verdict: score >= 85 ? "strong" : score >= 70 ? "acceptable" : score >= 50 ? "risky" : "weak",
    breakdown,
    baseline,
    signals: { coverage, smoke, fuzz },
  };

  // logs/confidence-latest.json (Operator Console reads this)
  await fs.promises.mkdir(resolve(REPO_ROOT, "logs"), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(record, null, 2) + "\n");

  // confidence-summary.md (PR comment body)
  const md = renderMarkdown(score, breakdown, coverage, smoke, fuzz, baseline);
  fs.writeFileSync(OUTPUT_MD, md + "\n");

  // Console stdout = the same markdown (useful for action logs)
  console.log(md);
  console.log(`\nWrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_MD}`);

  // Exit 0 always (reporter-only); P3.4 gate is a separate step
  process.exit(0);
}

main().catch((e) => {
  console.error(`[confidence] fatal: ${e.stack || e.message}`);
  process.exit(1);
});
