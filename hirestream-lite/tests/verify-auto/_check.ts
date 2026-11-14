import type { Page } from "@playwright/test";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * check(page, "L2.6", "what it proves", async () => {...}) — runs one Verify
 * case. Failures are caught and recorded (with a screenshot) so the rest of
 * the flow still runs; the step's own assertions decide pass/fail.
 */
const RESULTS = process.env.AUTO_RESULTS || "/tmp/verify-auto-results.jsonl";
const SHOTS = process.env.AUTO_SHOTS || "/tmp/verify-auto-shots";
fs.mkdirSync(SHOTS, { recursive: true });

export async function check(page: Page, ref: string, what: string, fn: () => Promise<string | void>) {
  const shot = path.join(SHOTS, `${ref}.png`);
  let status: "passed" | "failed" = "passed";
  let detail = what;
  try {
    const note = await fn();
    if (note) detail = `${what} — ${note}`;
  } catch (e: any) {
    status = "failed";
    detail = `${what} — ${String(e?.message ?? e).replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !/^Call log|^-|^at |waiting for/.test(l)).slice(0, 3).join(" · ").slice(0, 500)}`;
  }
  await page.screenshot({ path: shot }).catch(() => {});
  fs.appendFileSync(RESULTS, JSON.stringify({ ref, status, detail, screenshot: shot }) + "\n");
  console.log(`▸ ${status === "passed" ? "✓" : "✘"} ${ref} ${what}${status === "failed" ? ` — ${detail.split(" — ").slice(1).join(" — ")}` : ""}`);
}

/** Read a single value from the disposable test database. */
export function sql(q: string): string {
  return execFileSync("psql", ["-h", "localhost", "-U", "hirestream", "-d", process.env.AUTO_DB || "hirestream_lite_autotest", "-At", "-c", q],
    { env: { ...process.env, PGPASSWORD: "hirestream" } }).toString().trim();
}

export async function waitIdle(page: Page, ms = 800) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
