#!/usr/bin/env node
/**
 * LLM-assisted error triage.
 *
 * Reads logs/digest-latest.json (produced by tools/log-analyzer/digest.mjs),
 * sends each error cluster to an OpenAI-compatible LLM endpoint, and writes
 * logs/triage-latest.json with the model's proposed root-cause hypotheses.
 *
 * The endpoint is operator-configurable so this can target:
 *   - https://nexus.osipl.dev/v1                       (HPSEDC DEV self-hosted Mistral 7B)
 *   - http://10.126.104.88/v1                          (HPSEDC PROD self-hosted Mistral — when firewall opens)
 *   - http://localhost:11434/v1                        (local Ollama for dev)
 *   - https://api.openai.com/v1                        (OpenAI, with LLM_API_KEY set)
 *   - any other OpenAI-compatible /v1/chat/completions endpoint
 *
 * The Phase 4 Operator Console will move all of these env vars into a
 * DB-backed system_config UI; env-var fallback stays in place for cron and CI
 * contexts where the DB isn't reachable.
 *
 * Modes:
 *   node tools/triage/triage.mjs                         # full triage run
 *   node tools/triage/triage.mjs --dry-run               # build prompts, print, no HTTP
 *   node tools/triage/triage.mjs --connectivity          # tiny ping prompt; report OK/FAIL + latency
 *
 * Master switch:
 *   TRIAGE_ENABLED=true   (default false — disabled even with everything else configured)
 *
 * Other env:
 *   LLM_BASE_URL          (default https://nexus.osipl.dev/v1)
 *   LLM_MODEL             (default mistral-7b-instruct-v0.2.Q4_K_M)
 *   LLM_API_KEY           (default empty — Nexus accepts; commercial APIs need it)
 *   LLM_TIMEOUT_MS        (default 45000 — CPU inference is slow)
 *   TRIAGE_MAX_TOKENS     (default 250)
 *   TRIAGE_TEMPERATURE    (default 0.2 — diagnostic, not creative)
 *   TRIAGE_INPUT          (default logs/digest-latest.json)
 *   TRIAGE_OUTPUT         (default logs/triage-latest.json)
 *   TRIAGE_MAX_CLUSTERS   (default 10 — cap per run to bound LLM time)
 */

import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getFeatureConfig } from "../../lib/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Config resolution: system_config DB row → env vars → hardcoded defaults.
// Mistral 7B Q4 on CPU runs ~3-4 tokens/sec; 90s timeout covers a 250-token
// response with headroom. GPU-backed endpoints are far faster on same defaults.
const cfg = await getFeatureConfig("llm_triage", {
  enabled: (process.env.TRIAGE_ENABLED || "false").toLowerCase() === "true",
  llmBaseUrl: process.env.LLM_BASE_URL || "https://nexus.osipl.dev/v1",
  llmModel: process.env.LLM_MODEL || "mistral-7b-instruct-v0.2.Q4_K_M",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || "90000", 10),
  maxTokens: parseInt(process.env.TRIAGE_MAX_TOKENS || "200", 10),
  temperature: parseFloat(process.env.TRIAGE_TEMPERATURE || "0.2"),
  maxClustersPerRun: parseInt(process.env.TRIAGE_MAX_CLUSTERS || "10", 10),
});

const TRIAGE_ENABLED = !!cfg.enabled;
const LLM_BASE_URL = String(cfg.llmBaseUrl).replace(/\/$/, "");
const LLM_MODEL = String(cfg.llmModel);
const LLM_API_KEY = String(cfg.llmApiKey || "");
const LLM_TIMEOUT_MS = Number(cfg.llmTimeoutMs) || 90000;
const TRIAGE_MAX_TOKENS = Number(cfg.maxTokens) || 200;
const TRIAGE_TEMPERATURE = Number.isFinite(cfg.temperature) ? Number(cfg.temperature) : 0.2;
const TRIAGE_INPUT = resolve(REPO_ROOT, process.env.TRIAGE_INPUT || "logs/digest-latest.json");
const TRIAGE_OUTPUT = resolve(REPO_ROOT, process.env.TRIAGE_OUTPUT || "logs/triage-latest.json");
const TRIAGE_MAX_CLUSTERS = Number(cfg.maxClustersPerRun) || 10;
const CONFIG_SOURCE = cfg.source;

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isConnectivity = args.has("--connectivity");

// ─── PII scrubber ────────────────────────────────────────────────────────────
// Strings (sampleMsg, sampleRoute) may contain PII captured in error logs. We
// scrub them BEFORE sending to the LLM. Defence in depth even when the LLM is
// self-hosted on the internal network — keeps PII from leaking into model
// caches, request logs, or future training corpora.
const PII_PATTERNS = [
  { name: "email",    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,           tag: "[EMAIL]"    },
  { name: "phone_in", re: /\b(?:\+?91[- ]?)?[6-9]\d{9}\b/g,                                 tag: "[PHONE]"    },
  { name: "passport", re: /\b[A-PR-WY][1-9]\d{6}\b/g,                                       tag: "[PASSPORT]" },
  { name: "aadhaar",  re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,                                     tag: "[AADHAAR]"  },
  { name: "uuid",     re: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, tag: "[UUID]" },
  { name: "jwt",      re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, tag: "[JWT]"  },
];

export function scrubPII(input) {
  if (typeof input !== "string") return input;
  let out = input;
  for (const { re, tag } of PII_PATTERNS) {
    out = out.replace(re, tag);
  }
  return out;
}

// ─── Prompt construction ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an error triage assistant for the HireStream overseas-placement web portal.

Stack: Node.js 20 + Express + Drizzle ORM + PostgreSQL + React (wouter).
Roles: candidate, agent, employer, admin, superadmin.
Routes live under /api/v1/<area>/* (e.g. /api/v1/jobs/list, /api/v1/agencies/documents).

Given one error cluster, propose the most likely root cause in 2-3 sentences.
Be specific about the area (route, handler, schema, DB constraint, missing
validator, async race). Do NOT hallucinate file names you cannot infer from
the route. If the data is too thin to triage, say so explicitly.

Respond with ONLY the hypothesis paragraph — no JSON, no markdown headers.`;

function buildUserPrompt(cluster) {
  const route = scrubPII(cluster.sampleRoute || "unknown");
  const message = scrubPII(cluster.sampleMsg || "(no sample message)");
  return [
    `Error class: ${cluster.errorClass}`,
    `Occurrences in last window: ${cluster.count}`,
    `Sample route: ${route}`,
    `Sample message: ${message.substring(0, 300)}${message.length > 300 ? "…" : ""}`,
  ].join("\n");
}

// ─── LLM call ────────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userPrompt) {
  const url = `${LLM_BASE_URL}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (LLM_API_KEY) headers["Authorization"] = `Bearer ${LLM_API_KEY}`;

  const body = {
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: TRIAGE_MAX_TOKENS,
    temperature: TRIAGE_TEMPERATURE,
    stream: false,
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    const textBody = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, latencyMs, error: textBody.slice(0, 500) };
    }
    let parsed;
    try { parsed = JSON.parse(textBody); } catch { return { ok: false, status: res.status, latencyMs, error: `non-JSON response: ${textBody.slice(0, 200)}` }; }
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) return { ok: false, status: res.status, latencyMs, error: `no choices[0].message.content in response` };
    return {
      ok: true,
      status: res.status,
      latencyMs,
      content: content.trim(),
      usage: parsed.usage || null,
      model: parsed.model || LLM_MODEL,
    };
  } catch (e) {
    return { ok: false, status: -1, latencyMs: Date.now() - start, error: e.name === "AbortError" ? `timeout after ${LLM_TIMEOUT_MS}ms` : String(e) };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─── Connectivity test ───────────────────────────────────────────────────────
async function runConnectivity() {
  console.log(`[triage] connectivity test → ${LLM_BASE_URL}`);
  console.log(`         model: ${LLM_MODEL}`);
  const r = await callLLM(
    "You are a connectivity test target. Reply with exactly: OK",
    "Reply with exactly OK."
  );
  if (r.ok) {
    console.log(`         status: HTTP ${r.status}  latency: ${r.latencyMs}ms`);
    console.log(`         model returned: ${r.model}`);
    console.log(`         content: ${r.content}`);
    if (r.usage) console.log(`         usage: ${JSON.stringify(r.usage)}`);
    console.log(`         RESULT: OK`);
    process.exit(0);
  } else {
    console.log(`         status: HTTP ${r.status}  latency: ${r.latencyMs}ms`);
    console.log(`         error: ${r.error}`);
    console.log(`         RESULT: FAIL`);
    process.exit(1);
  }
}

// ─── Main triage flow ────────────────────────────────────────────────────────
async function readDigest() {
  try {
    const raw = await fs.readFile(TRIAGE_INPUT, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[triage] cannot read ${TRIAGE_INPUT}: ${e.message}`);
    console.error(`         hint: run \`npm run log:digest\` first`);
    process.exit(2);
  }
}

async function runTriage() {
  if (!TRIAGE_ENABLED && !isDryRun) {
    console.log(`[triage] disabled (source=${CONFIG_SOURCE}) — toggle Enabled on the LLM Triage card in the Operator Console (or set TRIAGE_ENABLED=true in env if no DB).`);
    process.exit(0);
  }

  const digest = await readDigest();
  const clusters = (digest.errorClasses || []).slice(0, TRIAGE_MAX_CLUSTERS);

  if (clusters.length === 0) {
    const record = {
      kind: "triage",
      version: "1",
      generatedAt: new Date().toISOString(),
      llm: { baseUrl: LLM_BASE_URL, model: LLM_MODEL },
      digestSourceAt: digest.generatedAt,
      clustersTriaged: 0,
      note: "no error clusters in the digest — nothing to triage",
      results: [],
    };
    await fs.writeFile(TRIAGE_OUTPUT, JSON.stringify(record, null, 2) + "\n");
    console.log(`[triage] no clusters in digest — wrote empty record to ${TRIAGE_OUTPUT}`);
    process.exit(0);
  }

  console.log(`[triage] ${isDryRun ? "DRY RUN — " : ""}triaging ${clusters.length} cluster(s) via ${LLM_BASE_URL} (model ${LLM_MODEL})`);

  const results = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let failures = 0;
  const overallStart = Date.now();

  for (const cluster of clusters) {
    const userPrompt = buildUserPrompt(cluster);
    if (isDryRun) {
      console.log(`\n--- cluster: ${cluster.errorClass} (${cluster.count}x) ---`);
      console.log(userPrompt);
      results.push({ errorClass: cluster.errorClass, count: cluster.count, sampleRoute: cluster.sampleRoute, dryRunPrompt: userPrompt, hypothesis: null });
      continue;
    }
    const r = await callLLM(SYSTEM_PROMPT, userPrompt);
    if (r.ok) {
      results.push({
        errorClass: cluster.errorClass,
        count: cluster.count,
        sampleRoute: cluster.sampleRoute,
        hypothesis: r.content,
        latencyMs: r.latencyMs,
        usage: r.usage,
        model: r.model,
      });
      if (r.usage?.prompt_tokens) totalInputTokens += r.usage.prompt_tokens;
      if (r.usage?.completion_tokens) totalOutputTokens += r.usage.completion_tokens;
      console.log(`  ok    ${cluster.errorClass}  ${r.latencyMs}ms`);
    } else {
      failures++;
      results.push({
        errorClass: cluster.errorClass,
        count: cluster.count,
        sampleRoute: cluster.sampleRoute,
        hypothesis: null,
        error: r.error,
        latencyMs: r.latencyMs,
      });
      console.log(`  FAIL  ${cluster.errorClass}  ${r.latencyMs}ms  ${r.error?.slice(0, 80)}`);
    }
  }

  const record = {
    kind: "triage",
    version: "1",
    generatedAt: new Date().toISOString(),
    llm: { baseUrl: LLM_BASE_URL, model: LLM_MODEL },
    digestSourceAt: digest.generatedAt,
    clustersTriaged: results.length,
    failureCount: failures,
    totalLatencyMs: Date.now() - overallStart,
    usage: { totalInputTokens, totalOutputTokens },
    results,
  };

  await fs.writeFile(TRIAGE_OUTPUT, JSON.stringify(record, null, 2) + "\n");
  console.log(`[triage] wrote ${TRIAGE_OUTPUT}  (${results.length} clusters, ${failures} failures, ${record.totalLatencyMs}ms total)`);
  process.exit(failures === clusters.length && clusters.length > 0 ? 1 : 0);
}

// ─── Entry ───────────────────────────────────────────────────────────────────
if (isConnectivity) {
  await runConnectivity();
} else {
  await runTriage();
}
