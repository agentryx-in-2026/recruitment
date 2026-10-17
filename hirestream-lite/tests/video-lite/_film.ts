import type { Page, Locator } from "@playwright/test";
import fs from "fs";
import path from "path";
import { installCursor, beat, caption, showChapterCard, snap } from "./_overlay";

/**
 * Shared machinery for the three hirestream-lite films.
 *
 * Narration drives pacing: gen-narration.mjs renders every chapter's voice-over
 * FIRST and writes durations.json; each chapter here is then padded to at least
 * its narration length, so voice clips never overlap (the "two voices" bug).
 * Chapter start offsets go to timing-<role>.json for _postprocess.mjs.
 */
export const BUILD_DIR = process.env.VIDEO_BUILD_DIR || "/tmp/vbuild-lite";
export const GUIDE_IMG_DIR = process.env.GUIDE_IMG_DIR || path.join(BUILD_DIR, "guide-images");
export const TIMING_DIR = path.join(BUILD_DIR, "timing");
export const BRAND = "HireStream — HPSEDC Overseas Placement Portal";

type Chapter = { key: string; title: string; text: string };

export function film(page: Page, role: string) {
  const all = JSON.parse(fs.readFileSync(path.resolve("tests/video-lite/narration.json"), "utf8"));
  const NARR: Chapter[] = all[role];
  let DUR: Record<string, number> = {};
  try { DUR = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, "durations.json"), "utf8")); } catch { /* */ }
  // DRY=1: rehearse the script (selectors, data) without narration padding.
  const DRY = !!process.env.DRY;
  if (!DRY && !DUR[`${role}-${NARR[0].key}`]) throw new Error(`Run gen-narration.mjs ${role} first (durations missing)`);
  fs.mkdirSync(GUIDE_IMG_DIR, { recursive: true });
  fs.mkdirSync(TIMING_DIR, { recursive: true });

  const ctx = { t0: Date.now(), chapters: [] as any[], curStart: 0, curMs: 0, i: 0 };

  async function endChapter() {
    if (!ctx.curStart) return;
    const target = ctx.curMs + 900, elapsed = Date.now() - ctx.curStart;
    if (elapsed < target) await page.waitForTimeout(target - elapsed);
  }

  return {
    /** Start the next chapter (asserts the key so script and narration cannot drift). */
    async chapter(key: string) {
      await endChapter();
      const m = NARR[ctx.i];
      if (!m || m.key !== key) throw new Error(`chapter order: expected ${m?.key}, script says ${key}`);
      ctx.chapters.push({ n: ctx.i + 1, key: m.key, title: m.title, offsetMs: Date.now() - ctx.t0 });
      ctx.curStart = Date.now();
      // voice starts ~2.9 s in (after the chapter card) — see LEAD_MS in _postprocess
      ctx.curMs = DRY ? 0 : (DUR[`${role}-${m.key}`] || 9000) + 2900;
      console.log(`[${role}] chapter ${ctx.i + 1} ${m.key}`);
      await showChapterCard(page, ctx.i + 1, m.title, BRAND, DRY ? 300 : 2400);
      ctx.i++;
    },
    /** Pad the final chapter and write the timing file. */
    async finish() {
      await endChapter();
      fs.writeFileSync(path.join(TIMING_DIR, `timing-${role}.json`), JSON.stringify({ role, chapters: ctx.chapters }, null, 2));
    },
    /** No-op: t0 is film() creation ≈ video start (offsets must match the video timeline). */
    start() { /* intentionally empty */ },
    snap: (name: string, opts: { full?: boolean; locator?: string } = {}) => snap(page, GUIDE_IMG_DIR, `${role}-${name}`, opts),
    cap: (text: string, ms?: number) => caption(page, text, ms),
  };
}

export const BEST = { timeout: 4000 } as const;

export async function setup(page: Page) {
  await installCursor(page);
  // Launch material shows the production sign-in page: hide the UAT-only
  // "Enable test mode" link and the "Demo Mode" button (the latter is drawn
  // unconditionally today — reported as a pre-launch fix).
  await page.addInitScript(() => {
    const hide = () => document.querySelectorAll<HTMLElement>("button, a").forEach((el) => {
      const t = el.textContent || "";
      if (/Demo Mode|Hide demo logins|Enable test mode|Disable test mode/.test(t)) el.style.display = "none";
    });
    new MutationObserver(hide).observe(document, { childList: true, subtree: true });
  });
}

/** Visible login through the real form. */
export async function login(page: Page, user: string, pass = "test123") {
  if (!page.url().includes("/auth")) await page.goto("/auth");
  const id = page.getByPlaceholder("name@example.com").first();
  await id.waitFor({ state: "visible", timeout: 20000 });
  await id.click();
  await id.pressSequentially(user, { delay: 35 });
  const pw = page.getByPlaceholder(/Enter your password/i).first();
  await pw.click();
  await pw.pressSequentially(pass, { delay: 35 });
  await page.getByText("I'm not a robot").first().click(BEST).catch(() => {});
  await beat(page, 300);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 }).catch(() => {});
  await settle(page);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
  await page.goto("/auth");
  await settle(page);
}

export async function settle(page: Page, ms = 900) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** The wrapper div of a register-form Field, found by its visible label. */
export function field(scope: Page | Locator, label: string | RegExp): Locator {
  const re = typeof label === "string" ? new RegExp("^\\s*" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\*?\\s*$") : label;
  return scope.locator("label").filter({ hasText: re }).first().locator("xpath=..");
}

/** Type into the first text input inside a labelled field. */
export async function typeIn(scope: Page | Locator, label: string | RegExp, value: string, delay = 25) {
  const inp = field(scope, label).locator("input, textarea").first();
  await inp.scrollIntoViewIfNeeded().catch(() => {});
  await inp.click();
  await inp.fill("");
  await inp.pressSequentially(value, { delay });
}

/** Set a date input directly (typing into native date pickers is locale-fragile). */
export async function setDate(scope: Page | Locator, label: string | RegExp, iso: string) {
  const inp = field(scope, label).locator('input[type="date"]').first();
  await inp.scrollIntoViewIfNeeded().catch(() => {});
  await inp.click().catch(() => {});
  await inp.fill(iso);
}

/** shadcn/Radix select inside a labelled field: open, pick option by text. */
export async function choose(page: Page, scope: Page | Locator, label: string | RegExp, option: string | RegExp) {
  const trig = field(scope, label).locator('button[role="combobox"], select').first();
  await trig.scrollIntoViewIfNeeded().catch(() => {});
  const tag = await trig.evaluate((e) => e.tagName.toLowerCase()).catch(() => "button");
  if (tag === "select") {
    await trig.selectOption({ label: typeof option === "string" ? option : undefined } as any).catch(async () => {
      const opts = await trig.locator("option").allTextContents();
      const hit = opts.find((o) => (typeof option === "string" ? o.includes(option) : option.test(o)));
      if (hit) await trig.selectOption({ label: hit });
    });
    return;
  }
  await trig.click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: option }).first().click();
  await page.waitForTimeout(200);
}

/** Smooth scroll so the film does not jump. */
export async function scrollTo(page: Page, target: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" })).catch(() => {});
  await page.waitForTimeout(700);
}

export async function scrollBy(page: Page, dy: number) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
  await page.waitForTimeout(800);
}

/** Move the visible cursor onto an element (for "point at this" moments). */
export async function point(page: Page, target: Locator) {
  const b = await target.boundingBox({ timeout: 2500 }).catch(() => null);
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(400);
}

/**
 * Visible typing that stays fast: some forms re-render on every keystroke
 * (~250 ms/char under video capture), so long values type their first words
 * on camera and then fill the remainder in one step.
 */
export async function typeText(target: Locator, text: string, delay = 30) {
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  if (text.length <= 22) { await target.pressSequentially(text, { delay }); return; }
  await target.pressSequentially(text.slice(0, 16), { delay });
  await target.fill(text);
}
