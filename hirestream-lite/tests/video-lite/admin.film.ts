import { test, type Page } from "@playwright/test";
import path from "path";
import { beat, showTitleCard } from "./_overlay";
import { film, setup, login, settle, scrollTo, scrollBy, point, typeText, BEST } from "./_film";

/**
 * ADMIN — the HPSEDC officer's Admin Console (demo_admin, role "admin"):
 * oversight + configuration. Superadmin-only screens (user creation, feature
 * flags, data reset, backups) are covered in the written guide, not filmed.
 */
const FIX = path.resolve("tests/video-lite/fixtures");

async function tab(page: Page, label: string) {
  const b = page.getByRole("button", { name: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s*\\d+)?$") }).first();
  await point(page, b);
  await b.click({ noWaitAfter: true });
  await settle(page, 1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await beat(page, 500);
}

test("Admin", async ({ page }) => {
  await setup(page);
  const f = film(page, "admin");

  await page.goto("/auth");
  await settle(page);
  f.start();
  await showTitleCard(page, "Admin User Guide", "Oversight and configuration of the HPSEDC overseas placement portal",
    "Walkthrough · HPSEDC administrators", 4200);

  // 1 ── Sign in + Overview
  await f.chapter("overview");
  await login(page, "demo_admin");
  await f.snap("01-overview", { full: true });
  await point(page, page.getByText("Admin Console").first());
  await point(page, page.getByRole("button", { name: /Candidates CSV/ }).first());
  await scrollBy(page, 450);
  await beat(page, 1200);
  await scrollBy(page, 450);
  await beat(page, 1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await beat(page, 600);

  // 2 ── Smart Job Importer
  await f.chapter("import");
  await tab(page, "Import Jobs");
  await f.snap("02-import");
  const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
  await page.getByRole("button", { name: /Choose file/ }).first().click();
  await (await chooser).setFiles(path.join(FIX, "govt-job-batch.csv"));
  await settle(page, 2500);
  await f.snap("03-import-preview", { full: true });
  await scrollBy(page, 400);
  await beat(page, 1500);
  await scrollBy(page, 400);
  await beat(page, 1200);
  const imp = page.getByRole("button", { name: /^Import \d+ jobs?/ }).first();
  await scrollTo(page, imp);
  await imp.click();
  await settle(page, 2500);
  await f.snap("04-import-done");

  // 3 ── Professions
  await f.chapter("professions");
  await tab(page, "Professions");
  await f.snap("05-professions", { full: true });
  const row = page.locator("div").filter({ hasText: /^Electrician/ }).first();
  await scrollTo(page, page.getByText("Electrician").first());
  await page.getByRole("button", { name: /^Edit$/ }).nth(3).click(BEST).catch(() => {});
  await settle(page, 1200);
  await f.snap("06-profession-edit", { full: true });
  await scrollBy(page, 400);
  await beat(page, 1500);
  await page.getByRole("button", { name: /^Cancel$/ }).first().click(BEST).catch(() => {});
  await beat(page, 600);
  void row;

  // 4 ── Form Fields
  await f.chapter("formfields");
  await tab(page, "Form Fields");
  await f.snap("07-form-fields", { full: true });
  await point(page, page.getByTitle(/Hide from the form/).first());
  await point(page, page.getByTitle(/Make optional|Make compulsory/).first());
  await scrollBy(page, 500);
  await beat(page, 1500);
  await scrollBy(page, 500);
  await beat(page, 1200);

  // 5 ── System Configuration
  await f.chapter("settings");
  await tab(page, "System Config");
  await f.snap("08-system-config");
  await point(page, page.getByText(/Recruitment pipeline/).first());
  await scrollTo(page, page.getByText(/Recruitment pipeline/).first());
  await beat(page, 1500);
  await f.snap("09-pipeline-setting");
  await scrollTo(page, page.getByText(/Require a confirmed email before applying/).first());
  await beat(page, 1500);
  await f.snap("10-registration-settings");
  await scrollTo(page, page.getByText(/Offer validity/).first());
  await beat(page, 1500);

  // 6 ── People: users, callbacks, placement support
  await f.chapter("people");
  await tab(page, "Users");
  await f.snap("11-users");
  await page.getByRole("tab", { name: /Staff/ }).first().click(BEST).catch(() => {});
  await beat(page, 1200);
  await tab(page, "Callbacks");
  await f.snap("12-callbacks");
  await tab(page, "Placement Support");
  await f.snap("13-placement-support");

  // 7 ── Deployment & compliance
  await f.chapter("compliance");
  await tab(page, "Compliance");
  await f.snap("14-compliance", { full: true });
  await scrollBy(page, 450);
  await beat(page, 1200);
  await tab(page, "Deployment Readiness");
  await f.snap("15-readiness");
  await tab(page, "Welfare SLA");
  await f.snap("16-welfare-sla");

  // 8 ── Risk: audit log, fraud watch, duplicates
  await f.chapter("risk");
  await tab(page, "Audit Log");
  await f.snap("17-audit-log");
  await scrollBy(page, 400);
  await beat(page, 1200);
  await tab(page, "Fraud Watch");
  await f.snap("18-fraud-watch");
  await tab(page, "Duplicates");
  await f.snap("19-duplicates");

  // 9 ── Communication: messages, grievances, notification templates
  await f.chapter("communication");
  await tab(page, "Messages");
  await page.locator("button").filter({ hasText: "Geeta Bhandari" }).first().click(BEST).catch(() => {});
  await beat(page, 1000);
  const reply = page.getByPlaceholder(/Type your reply/).first();
  if (await reply.isVisible().catch(() => false)) {
    await typeText(reply, "Namaste Geeta ji. Interviews for the tailor batch are in Shimla next week — you will get the date by SMS and email.");
    await page.locator("button:has(svg.lucide-send)").first().click(BEST).catch(() => {});
    await beat(page, 1200);
  }
  await f.snap("20-messages");
  await tab(page, "Grievances");
  await f.snap("21-grievances");
  await beat(page, 1200);
  // Grievances opens its own page; return to the console.
  await page.goto("/");
  await settle(page, 1500);
  await tab(page, "Notifications");
  await f.snap("22-notification-templates");
  await scrollBy(page, 400);
  await beat(page, 1000);

  // 10 ── Reports, funnel, exports, countries
  await f.chapter("reports");
  await tab(page, "Reports");
  await f.snap("23-reports", { full: true });
  await scrollBy(page, 450);
  await beat(page, 1000);
  await tab(page, "Funnel");
  await f.snap("24-funnel");
  await tab(page, "Countries");
  await f.snap("25-countries");
  await tab(page, "Lifecycle");
  await f.snap("26-lifecycle");
  await tab(page, "Drives");
  await f.snap("27-drives");

  await f.finish();
  await showTitleCard(page, "HPSEDC Admin Console", "Oversight, configuration and compliance — without a code release", "Admin walkthrough", 4000, false);
});
