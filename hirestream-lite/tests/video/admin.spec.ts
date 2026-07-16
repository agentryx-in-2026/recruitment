import { test } from "@playwright/test";
import fs from "fs";
import { installCursor, beat, showChapterCard } from "./_overlay";

/**
 * ADMIN film — HPSEDC authority / oversight console, recorded against live staging.
 * Same framework as the employer/agent/candidate films (narration-driven pacing,
 * stage cards). Logs in as demo_admin (role=admin → dashboard renders at "/").
 *   1 verification gate (agencies + employers) · 2 system-wide overview
 *   · 3 compliance & welfare · 4 audit trail
 * Output muxed + exported by recordings/postprocess-admin.mjs.
 */
const PASS = "test123";
const BEST = { timeout: 3500 } as const;

const NARR = JSON.parse(fs.readFileSync("tests/video/narration.json", "utf8")).admin as
  { key: string; title: string; issue: number; text: string }[];
const DUR: Record<string, number> = (() => {
  try { return JSON.parse(fs.readFileSync("/tmp/vbuild/durations.json", "utf8")); } catch { return {}; }
})();

test("Admin", async ({ page }) => {
  if (!DUR["admin-verify"]) throw new Error("Run `node tests/video/gen-narration.mjs admin` first (durations missing).");
  const ctx: any = { role: "admin", t0: Date.now(), chapters: [], curStart: 0, curMs: 0 };
  let i = 0;

  async function endChapter() {
    if (!ctx.curStart) return;
    const target = ctx.curMs + 900, elapsed = Date.now() - ctx.curStart;
    if (elapsed < target) await page.waitForTimeout(target - elapsed);
  }
  async function chapter() {
    await endChapter();
    const m = NARR[i];
    ctx.chapters.push({ n: i + 1, key: m.key, title: m.title, offsetMs: Date.now() - ctx.t0, narration: m.text });
    ctx.curStart = Date.now();
    ctx.curMs = DUR[`admin-${m.key}`] || 9000;
    await showChapterCard(page, i + 1, m.title);
    i++;
  }
  async function navTo(label: string) {
    const b = page.getByRole("button", { name: label, exact: true }).first();
    if (await b.isVisible().catch(() => false)) { await b.click(BEST).catch(() => {}); await beat(page, 1200); }
  }
  async function settle(px = 320, ms = 1800) {
    await page.mouse.wheel(0, px); await beat(page, ms); await page.mouse.wheel(0, -px); await beat(page, 500);
  }

  await installCursor(page);

  // ── Login as the HPSEDC authority (admin) ──
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await page.locator('input[name="username"]').first().fill("demo_admin");
  await page.locator('input[name="password"]').first().fill(PASS);
  await page.locator("text=I'm not a robot").click(BEST).catch(() => {});
  await beat(page, 300);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 }).catch(() => {});
  await page.getByText("Admin Console", { exact: false }).first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await beat(page, 1200);

  // ── Stage 1 · Verification gate (agencies + employers) ──
  await chapter();
  await navTo("Agencies");
  await settle(300, 2600);
  await navTo("Employers");
  await settle(300, 2400);

  // ── Stage 2 · System-wide overview ──
  await chapter();
  await navTo("Overview");
  await beat(page, 1500);
  await settle(360, 2600);   // stat cards
  await settle(520, 2600);   // funnel / charts

  // ── Stage 3 · Compliance & welfare ──
  await chapter();
  await navTo("Compliance");
  await settle(340, 3000);
  await navTo("Welfare SLA");
  await settle(340, 2800);

  // ── Stage 4 · The audit trail ──
  await chapter();
  await navTo("Audit Log");
  await beat(page, 1500);
  await settle(360, 3200);

  await endChapter();
  await beat(page, 600);

  fs.mkdirSync("test-results/video", { recursive: true });
  fs.writeFileSync("test-results/video/timing-admin.json", JSON.stringify(ctx, null, 2));
});
