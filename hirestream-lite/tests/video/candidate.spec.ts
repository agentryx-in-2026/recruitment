import { test, type Page } from "@playwright/test";
import fs from "fs";
import { installCursor, beat, showChapterCard, showIssue, clearIssue, showOutro } from "./_overlay";

/**
 * CANDIDATE (job seeker) film — the applicant's end-to-end journey, recorded
 * against live staging. Same framework as the employer/agent films
 * (narration-driven pacing, stage cards, issue badges, clip splitting in
 * _postprocess.mjs candidate).
 *   1 sign up · 2 personal & passport (#4) · 3 education (#5) · 4 experience (#6)
 *   · 5 documents (#7) · 6 find jobs & match score (#2) · 7 apply & track
 *   · 8 offer, visa & welfare
 * Stage 1 uses a FRESH job seeker (to show sign-up); stages 2-8 use
 * demo_candidate (Arjun Sharma — richest profile + pipeline data). The Issue #4
 * personal fields aren't seeded, so stage 2 fills them live to show the fix.
 */
const STAMP = Date.now().toString().slice(-5);
const NEW_CAND_EMAIL = `qa.seeker.${STAMP}@example.com`;
const PASS = "Test@1234";
// Best-effort actions: fail in 3s instead of burning the 25s actionTimeout.
const BEST = { timeout: 3000 } as const;

const NARR = JSON.parse(fs.readFileSync("tests/video/narration.json", "utf8")).candidate as
  { key: string; title: string; issue: number; text: string }[];
const DUR: Record<string, number> = (() => {
  try { return JSON.parse(fs.readFileSync("/tmp/vbuild/durations.json", "utf8")); } catch { return {}; }
})();

test("Candidate", async ({ page }) => {
  if (!DUR["candidate-register"]) throw new Error("Run `node tests/video/gen-narration.mjs candidate` first (durations missing).");
  const ctx: any = { role: "candidate", t0: Date.now(), chapters: [], curStart: 0, curMs: 0 };
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
    ctx.curMs = DUR[`candidate-${m.key}`] || 9000;
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

  await installCursor(page);

  // ── Stage 1 · Sign up as a job seeker ──
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  await page.getByRole("tab", { name: /create account/i }).click();
  await page.locator('button[role="combobox"]').first().click(BEST).catch(() => {});
  await page.getByRole("option", { name: /job seeker|candidate/i }).first().click(BEST).catch(() => {});
  await page.getByPlaceholder(/Enter your full name/).fill(`QA Seeker ${STAMP}`);
  await page.getByPlaceholder(/name@example\.com/).first().fill(NEW_CAND_EMAIL);
  await page.getByPlaceholder(/At least 8 characters/).fill(PASS);
  await beat(page, 400);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 }).catch(() => {});
  await beat(page, 2500);

  // ── Stage 2 · Personal & passport details (Issue #4) ──
  await page.context().clearCookies();
  await page.goto("/auth");
  await page.locator('input[name="username"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await chapter();
  await login("demo_candidate", "test123");
  await beat(page, 800);
  await page.goto("/profile?step=1");
  await page.getByPlaceholder(/Father's full name/i).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await showIssue(page, 4, "Personal details: father / mother, passport, ECR, IELTS");
  await beat(page, 800);
  // Fill the MEA-mandated personal fields live (not seeded) to show the fix.
  await page.getByPlaceholder(/Father's full name/i).first().fill("Rajesh Sharma").catch(() => {});
  await beat(page, 700);
  await page.getByPlaceholder(/Mother's full name/i).first().fill("Sunita Sharma").catch(() => {});
  await beat(page, 900);
  await page.getByPlaceholder(/e\.g\. M1234567/i).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await page.getByPlaceholder(/e\.g\. M1234567/i).first().fill("M1234567", BEST).catch(() => {});
  await beat(page, 1200);
  await page.getByText("IELTS Overall Band", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 2200);

  // ── Stage 3 · Education & qualifications (Issue #5) ──
  await chapter();
  await clearIssue(page);
  await page.goto("/profile?step=2");
  await page.getByText("Add Education Record", { exact: false }).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  await showIssue(page, 5, "Education: multiple qualifications, year, board, %");
  await beat(page, 800);
  // Bring the seeded qualification records into view and hold on them (the
  // records sit below the intro banner; scrolling to the Add button reveals them).
  await page.getByText("Add Education Record", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 5500);

  // ── Stage 4 · Work experience (Issue #6) ──
  await chapter();
  await clearIssue(page);
  await page.goto("/profile?step=3");
  await page.getByText("Add Experience Record", { exact: false }).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  await showIssue(page, 6, "Work experience — every applicant matched fairly");
  await beat(page, 800);
  await page.getByText("Add Experience Record", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 5500);

  // ── Stage 5 · Your documents (Issue #7) ──
  await chapter();
  await clearIssue(page);
  await page.goto("/profile?step=5");
  await page.getByText("CV / Resume", { exact: false }).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  await showIssue(page, 7, "Documents: CV & Passport as separate, verified types");
  await beat(page, 2400);
  await page.getByText("Passport", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 2200);
  await page.evaluate(() => window.scrollBy(0, 280)); await beat(page, 1800);

  // ── Stage 6 · Find jobs & your match score (Issue #2) ──
  await chapter();
  await clearIssue(page);
  await page.goto("/?view=jobs");
  await page.getByPlaceholder(/Search by title, company, or skill/i).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  await showIssue(page, 2, "Personalised match score");
  await beat(page, 1500);
  await page.getByPlaceholder(/Search by title, company, or skill/i).first().fill("Engineer", BEST).catch(() => {});
  await beat(page, 1800);
  await page.getByPlaceholder(/Search by title, company, or skill/i).first().fill("", BEST).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, 320)); await beat(page, 1800);
  await page.evaluate(() => window.scrollTo(0, 0)); await beat(page, 600);
  // Open one application to show the match score in context + the skills the role needs.
  const appId = await page.evaluate(async () => {
    const r = await fetch("/api/v1/candidates/applications").then((x) => x.json()).catch(() => null);
    const rows = r?.data || [];
    const best = [...rows].sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0))[0];
    return best?.id ?? null;
  });
  if (appId) {
    await page.goto(`/applications/${appId}`);
    await beat(page, 2800);                          // pipeline + match score
    await page.getByText(/skills for this role/i).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
    await beat(page, 2600);
  } else {
    await beat(page, 2500);
  }

  // ── Stage 7 · Apply & track your application ──
  await chapter();
  await clearIssue(page);
  await page.goto("/?view=applications");
  await page.getByText("Software Developer", { exact: false }).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  // The list auto-filters to "awaiting your action" when an offer is pending —
  // turn it off so the full pipeline (incl. the interview application) is shown.
  await page.getByRole("button", { name: /awaiting your action/i }).first().click(BEST).catch(() => {});
  await beat(page, 2000);                         // full list of applications across stages
  await page.getByText("Full Stack Developer", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await page.getByText("Full Stack Developer", { exact: false }).first().click(BEST).catch(() => {});
  await beat(page, 2500);                          // right panel: 6-stage pipeline at "Interview"
  await page.getByText("Confirm attendance", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 3500);                           // confirm / reschedule / decline actions

  // ── Stage 8 · Offer, visa & welfare ──
  await chapter();
  await page.getByText("Software Developer", { exact: false }).first().click(BEST).catch(() => {});
  await beat(page, 2400);                           // "Offer received" — Accept / Decline
  await page.getByRole("button", { name: /accept offer/i }).first().click(BEST).catch(() => {});
  await beat(page, 2500);
  // Idempotent safety net: ensure the placement is accepted so the deployment
  // tracker (visa / passport + welfare check-ins) renders even on re-runs.
  await page.evaluate(async () => {
    const r = await fetch("/api/v1/candidates/applications").then((x) => x.json()).catch(() => null);
    const rows = r?.data || [];
    const off = rows.find((a: any) => a.placement && a.placement.status === "offered");
    if (off) await fetch(`/api/v1/drives/placements/${off.placement.id}/accept`, { method: "PATCH" }).catch(() => {});
  });
  await page.goto("/?view=applications");
  await page.getByText("Software Developer", { exact: false }).first().click(BEST).catch(() => {});
  await beat(page, 2400);                            // "Offer accepted" + pre-departure tracker
  await page.getByText("Visa / passport", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await beat(page, 2600);
  await page.getByText("Welfare check-ins", { exact: false }).first().scrollIntoViewIfNeeded(BEST).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, 240));
  await beat(page, 3000);

  await endChapter();

  // Closing card — the HPSEDC test-report issues this job-seeker walkthrough resolved.
  await clearIssue(page);
  await showOutro(page, "Job Seeker Workflow", [
    { num: 2, label: "Candidate match scores (matching engine)" },
    { num: 4, label: "Personal details: father / mother, passport, ECR, IELTS" },
    { num: 5, label: "Education — multiple qualifications" },
    { num: 6, label: "Experience — every applicant matched fairly" },
    { num: 7, label: "Documents — CV & Passport separate, verified" },
  ]);

  fs.mkdirSync("test-results/video", { recursive: true });
  fs.writeFileSync("test-results/video/timing-candidate.json", JSON.stringify(ctx, null, 2));
});
