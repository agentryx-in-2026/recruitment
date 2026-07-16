import { test, type Page } from "@playwright/test";
import fs from "fs";
import { installCursor, beat, showChapterCard, showIssue, clearIssue, showOutro } from "./_overlay";

/**
 * EMPLOYER film — full lifecycle in one reliable recording (against live
 * staging). Narration drives pacing (durations pre-computed → each stage
 * stays >= its narration, no voice overlap). Post-process muxes narration
 * onto the full film AND splits it into per-stage clips.
 *   1 register & verify (#1) · 2 post + matching profile (#8,#2) ·
 *   3 pipeline · 4 review & schedule (#2) · 5 selection & placement · 6 notifications
 * Stage 1 uses a fresh employer (to show verification); stages 2-6 use
 * demo_employer, which has real pipeline data.
 */
const STAMP = Date.now().toString().slice(-5);
const JOB_TITLE = `Senior Plant Technician ${STAMP}`;
const NEW_EMP_EMAIL = `qa.employer.${STAMP}@example.com`;
const PASS = "Test@1234";

const NARR = JSON.parse(fs.readFileSync("tests/video/narration.json", "utf8")).employer as
  { key: string; title: string; issue: number; text: string }[];
const DUR: Record<string, number> = (() => {
  try { return JSON.parse(fs.readFileSync("/tmp/vbuild/durations.json", "utf8")); } catch { return {}; }
})();

test("Employer", async ({ page }) => {
  if (!DUR["employer-register"]) throw new Error("Run `node tests/video/gen-narration.mjs employer` first (durations missing).");
  const ctx: any = { role: "employer", t0: Date.now(), chapters: [], curStart: 0, curMs: 0 };
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
    ctx.curMs = DUR[`employer-${m.key}`] || 9000;
    await showChapterCard(page, i + 1, m.title);
    i++;
  }
  async function login(user: string, pass: string) {
    await page.locator('input[name="username"]').first().fill(user);
    await page.locator('input[name="password"]').first().fill(pass);
    await page.locator("text=I'm not a robot").click().catch(() => {});
    await beat(page, 300);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 }).catch(() => {});
  }
  async function selectFirst(ph: string) {
    await page.locator(`button[role="combobox"]:has-text("${ph}")`).first().click();
    await page.getByRole("option").first().click();
    await beat(page, 450);
  }

  await installCursor(page);

  // ── Stage 1 · Register & get verified (Issue #1) ──
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  await page.getByRole("tab", { name: /create account/i }).click();
  await page.locator('button[role="combobox"]').first().click().catch(() => {});
  await page.getByRole("option", { name: /employer|hire/i }).first().click().catch(() => {});
  await page.getByPlaceholder(/Enter your full name/).fill(`QA Employer ${STAMP}`);
  await page.getByPlaceholder(/name@example\.com/).first().fill(NEW_EMP_EMAIL);
  await page.getByPlaceholder(/At least 8 characters/).fill(PASS);
  await page.locator("text=I'm not a robot").click().catch(() => {});
  await beat(page, 300);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForTimeout(2500);
  await showIssue(page, 1, "Employer verification + company documents");
  await page.getByRole("button", { name: /complete verification|get verified|verification/i }).first().click().catch(() => {});
  await beat(page, 1200);
  // Country of operation — a dropdown of overseas destinations (no "India" default)
  await page.locator('button[role="combobox"]:has-text("Select country")').first().click().catch(() => {});
  await beat(page, 1000);
  await page.getByRole("option", { name: /UAE|United Arab/i }).first().click().catch(() => {});
  await beat(page, 1200);
  // Scroll the DIALOG (its own scrollbar) to the required-documents section and
  // hold on it so the viewer sees the documents the employer must submit.
  await page.getByText("Verification documents", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 2800);
  await page.getByText("Power of Attorney", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 2600);
  await page.getByText("Authorised Signatory Passport", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 2600);
  // leave the dialog open showing the docs — Stage 2 navigates away

  // ── Stage 2 · Post a requisition + the matching profile (Issue #8, #2) ──
  await page.context().clearCookies();
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  await clearIssue(page);
  await login("demo_employer", "test123");
  await beat(page, 1200);
  await page.getByTestId("button-post-job").first().click();
  await beat(page, 1000);
  await page.getByPlaceholder(/Senior Welder/).fill(JOB_TITLE);
  await beat(page, 600);
  await page.getByPlaceholder(/Saudi Aramco/).fill("Gulf Engineering Co.");
  await beat(page, 600);
  await selectFirst("Select destination");
  await selectFirst("Select city");
  await showIssue(page, 8, "Overseas job categories");
  await selectFirst("Select category");
  await beat(page, 900);
  await clearIssue(page);
  // Walk the matching profile: requisition details → hiring criteria → skills.
  await page.getByText("Requisition details", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 2200);
  await showIssue(page, 2, "Hiring criteria feed the matching engine");
  await page.getByText("Hiring criteria", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 2800);
  await page.getByText("Description & skills", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 1400);
  await page.getByPlaceholder(/Describe the role/).fill("Operate and maintain plant equipment on an overseas assignment. Visa sponsorship and accommodation provided.").catch(() => {});
  await page.getByPlaceholder(/Type a skill and press Enter/).fill("Plant maintenance").catch(() => {});
  await page.getByRole("button", { name: "Add", exact: true }).first().click().catch(() => {});
  await beat(page, 800);
  await clearIssue(page);
  await page.getByTestId("button-submit-job").click();
  await page.waitForTimeout(2500);

  // ── Stage 3 · The applications pipeline ──
  await chapter();
  await page.goto("/employer/applicants").catch(() => {});
  await beat(page, 3000);            // show the 6-stage funnel + counts
  await page.mouse.wheel(0, 320); await beat(page, 1800);
  await page.mouse.wheel(0, -320); await beat(page, 800);

  // ── Stage 4 · Review shortlisted + schedule an interview (Issue #2) ──
  await chapter();
  await page.locator('button:has-text("Shortlisted")').first().click().catch(() => {});  // pipeline pill
  await beat(page, 1500);
  await showIssue(page, 2, "Candidate match scores");
  await beat(page, 1500);
  await page.getByRole("button", { name: /^\s*Schedule\s*$/i }).first().click().catch(() => {});  // open Schedule Interview modal
  await beat(page, 1500);
  await page.getByPlaceholder(/Sarah Mitchell|interviewer/i).first().fill("Ahmed Khan, Project Lead").catch(() => {});
  await beat(page, 2200);
  await page.getByRole("button", { name: /^Cancel$/i }).first().click().catch(() => {});         // non-destructive — just demonstrate
  await beat(page, 700);
  await clearIssue(page);

  // ── Stage 5 · Selection & placement (employer monitors; agency drives) ──
  await chapter();
  await page.locator('button:has-text("Interview")').first().click().catch(() => {}); await beat(page, 1400);
  await page.locator('button:has-text("Selected")').first().click().catch(() => {}); await beat(page, 1800);
  await page.locator('button:has-text("Placed")').first().click().catch(() => {}); await beat(page, 2200);

  // ── Stage 6 · Notifications ──
  await chapter();
  await page.getByRole("button", { name: /Notifications/i }).first().click().catch(() => {});
  await beat(page, 3200);            // notifications drawer open

  await endChapter();

  // Closing card — the HPSEDC test-report issues this employer walkthrough resolved.
  await clearIssue(page);
  await showOutro(page, "Employer Workflow", [
    { num: 1, label: "Employer verification (overseas company documents)" },
    { num: 2, label: "Candidate match scores (matching engine)" },
    { num: 8, label: "Overseas job categories + search / filters" },
  ]);

  fs.mkdirSync("test-results/video", { recursive: true });
  fs.writeFileSync("test-results/video/timing-employer.json", JSON.stringify(ctx, null, 2));
});
