import { test, type Page } from "@playwright/test";
import fs from "fs";
import { installCursor, beat, showChapterCard, showIssue, clearIssue, showOutro } from "./_overlay";

/**
 * AGENT film — recruitment-agency lifecycle, recorded against live staging.
 * Same framework as the employer film (narration-driven pacing, stage cards,
 * issue badges, clip splitting in _postprocess.mjs agent).
 *   1 register + 9 MEA docs (#3) · 2 pick up requisition · 3 source/screen (#2)
 *   · 4 schedule interview · 5 placement, visa & welfare
 * Stage 1 uses a FRESH agency (to show the verification form); stages 2-5 use
 * demo_agent (verified, richest pipeline data).
 */
const STAMP = Date.now().toString().slice(-5);
const NEW_AGENCY_EMAIL = `qa.agency.${STAMP}@example.com`;
const PASS = "Test@1234";
// Best-effort actions (optional clicks / scrolls): fail in 3s instead of
// burning the 25s actionTimeout when a selector legitimately isn't there.
const BEST = { timeout: 3000 } as const;

const NARR = JSON.parse(fs.readFileSync("tests/video/narration.json", "utf8")).agent as
  { key: string; title: string; issue: number; text: string }[];
const DUR: Record<string, number> = (() => {
  try { return JSON.parse(fs.readFileSync("/tmp/vbuild/durations.json", "utf8")); } catch { return {}; }
})();

test("Agent", async ({ page }) => {
  if (!DUR["agent-register"]) throw new Error("Run `node tests/video/gen-narration.mjs agent` first (durations missing).");
  const ctx: any = { role: "agent", t0: Date.now(), chapters: [], curStart: 0, curMs: 0 };
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
    ctx.curMs = DUR[`agent-${m.key}`] || 9000;
    await showChapterCard(page, i + 1, m.title);
    i++;
  }
  async function login(user: string, pass: string) {
    await page.locator('input[name="username"]').first().fill(user);
    await page.locator('input[name="password"]').first().fill(pass);
    await page.locator("text=I'm not a robot").click(BEST).catch(() => {});
    await beat(page, 300);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 }).catch(() => {});
  }
  async function navTo(label: string) {
    const b = page.getByRole("button", { name: label, exact: false }).first();
    if (await b.isVisible().catch(() => false)) await b.click(BEST).catch(() => {});
  }

  await installCursor(page);

  // ── Stage 1 · Agency registration & MEA documents (Issue #3) ──
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  // (a) Create the agent account — the register tab has NO captcha.
  await page.getByRole("tab", { name: /create account/i }).click();
  await page.locator('button[role="combobox"]').first().click(BEST).catch(() => {});
  await page.getByRole("option", { name: /agency|agent|recruit/i }).first().click(BEST).catch(() => {});
  await page.getByPlaceholder(/Enter your full name/).fill(`QA Agency ${STAMP}`);
  await page.getByPlaceholder(/name@example\.com/).first().fill(NEW_AGENCY_EMAIL);
  await page.getByPlaceholder(/At least 8 characters/).fill(PASS);
  await beat(page, 400);
  await page.getByRole("button", { name: /create account/i }).click();

  // (b) Fresh agents land on a "Register Your Agency" gate — register the
  //     agency (name + MEA licence + specialisations) before verification.
  const registerBtn = page.getByRole("button", { name: /register agency/i }).first();
  await registerBtn.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await showIssue(page, 3, "Agency registration + 9 MEA documents");
  await beat(page, 1000);
  await registerBtn.click(BEST).catch(() => {});
  await page.locator("#agencyName").waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await page.locator("#agencyName").fill(`QA Agency ${STAMP}`).catch(() => {});
  await page.locator("#licenseNumber").fill(`B-${STAMP}/MUM/PER/1000+/5/2024`).catch(() => {});
  await page.locator("#specializations").fill("Healthcare, Construction, Hospitality").catch(() => {});
  await beat(page, 800);
  await page.getByRole("button", { name: /submit application/i }).first().click(BEST).catch(() => {});

  // (c) Now verified=false but registered → "Complete verification" banner.
  const completeBtn = page.getByRole("button", { name: /complete verification/i }).first();
  await completeBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await beat(page, 800);
  await completeBtn.click(BEST).catch(() => {});
  // Hold on the 9 mandated MEA documents inside the verification dialog.
  await page.getByText("Verification documents", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 3500);
  await page.getByText("Experience / Work Orders", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 3000);

  // ── Stage 2 · Pick up a requisition ──
  await page.context().clearCookies();
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  await clearIssue(page);
  await login("demo_agent", "test123");
  await beat(page, 1200);
  await navTo("Open Requisitions");
  await beat(page, 2000);
  const pick = page.getByRole("button", { name: /^\s*Pick Up\s*$/i }).first();
  if (await pick.isVisible().catch(() => false)) { await pick.scrollIntoViewIfNeeded(BEST).catch(() => {}); await beat(page, 800); await pick.click(BEST).catch(() => {}); await page.waitForTimeout(2500); }
  else await beat(page, 1500);

  // ── Stage 3 · Source & screen candidates (Issue #2) ──
  await chapter();
  await page.goto("/agent/applicants").catch(() => {});
  await beat(page, 3000);
  await showIssue(page, 2, "Candidate match scores");
  await page.mouse.wheel(0, 320); await beat(page, 1800);
  await page.mouse.wheel(0, -320); await beat(page, 800);

  // ── Stage 4 · Schedule interviews ──
  await chapter();
  await clearIssue(page);
  await page.locator('button:has-text("Shortlisted")').first().click(BEST).catch(() => {});
  await beat(page, 1500);
  await page.getByRole("button", { name: /^\s*Schedule\s*$/i }).first().click(BEST).catch(() => {});
  await beat(page, 1500);
  await page.getByPlaceholder(/Sarah Mitchell|interviewer/i).first().fill("Priya Verma, Senior Recruiter", BEST).catch(() => {});
  await beat(page, 2200);
  await page.getByRole("button", { name: /^Cancel$/i }).first().click(BEST).catch(() => {});
  await beat(page, 700);

  // ── Stage 5 · Placement, visa & welfare (agency-driven deployment) ──
  await chapter();
  const candId = await page.evaluate(async () => {
    const r = await fetch("/api/v1/agent/placements").then((x) => x.json()).catch(() => null);
    const rows = r?.data || [];
    const placed = rows.find((x: any) => ["placed", "accepted", "active", "selected"].includes(x.placement?.status));
    return (placed || rows[0])?.candidate?.id ?? null;
  });
  if (candId) {
    await page.goto(`/agent/candidates/${candId}`).catch(() => {});
    await beat(page, 2500);
    await page.getByText("Visa / passport assistance", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
    await beat(page, 2600);
    await page.getByText("Appointment & travel", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
    await beat(page, 2400);
    await page.getByText("Post-placement welfare check-ins", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
    // Push the heading up so the 30/60/90-day check-in cards are fully visible,
    // not just the section title at the bottom edge.
    await page.mouse.wheel(0, 340);
    await beat(page, 3200);
  } else {
    await beat(page, 2000);
  }

  await endChapter();

  // Closing card — the HPSEDC test-report issues this agency walkthrough resolved.
  await clearIssue(page);
  await showOutro(page, "Recruitment Agency Workflow", [
    { num: 2, label: "Candidate match scores (matching engine)" },
    { num: 3, label: "Agency registration + 9 MEA documents" },
  ]);

  fs.mkdirSync("test-results/video", { recursive: true });
  fs.writeFileSync("test-results/video/timing-agent.json", JSON.stringify(ctx, null, 2));
});
