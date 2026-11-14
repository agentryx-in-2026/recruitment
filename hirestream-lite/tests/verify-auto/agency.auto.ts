import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { setup, login, typeText } from "../video-lite/_film";
import { check, waitIdle } from "./_check";

/** HPSEDC Placement Cell checks (hpsedc_agency) — Verify cases L2.1–L2.14. */
const FIX = path.resolve("tests/video-lite/fixtures");
const pipeline = async (page: Page, status: string) => { await page.goto(`/agent/applicants?status=${status}`); await waitIdle(page, 1500); };
const row = (page: Page, name: string) => page.locator("div").filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole("button", { name: /View/ }) }).last();
const panel = (page: Page, title: string) => page.locator("div.border-t").filter({ hasText: title }).first();

test("Agency", async ({ page }) => {
  await setup(page);
  await page.goto("/auth");
  const title = `Auto check job ${Date.now().toString().slice(-5)}`;

  await check(page, "L2.1", "Placement Cell dashboard loads with pipeline and Post Job", async () => {
    await login(page, "hpsedc_agency");
    await expect(page.getByText("Verified Agency").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Applicant Pipeline").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Post Job/ }).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.2", "Post a job with country, city, category and fixed salary; it goes live", async () => {
    await page.getByRole("button", { name: /Post Job/ }).first().click();
    const dlg = page.getByRole("dialog");
    await typeText(dlg.getByPlaceholder(/Registered Nurse/), title);
    await typeText(dlg.getByPlaceholder(/Name of the hiring company/), "Automated Checks LLC");
    const cb = dlg.getByRole("combobox");
    const pick = async (i: number, opt: RegExp) => { await cb.nth(i).click(); await page.getByRole("option").filter({ hasText: opt }).first().click(); };
    await pick(0, /United Arab Emirates/); await pick(1, /^Dubai$/); await pick(2, /^Healthcare$/);
    await typeText(dlg.locator("textarea").first(), "Created by the automated E2E check. Safe to ignore.");
    await dlg.getByRole("button", { name: /Publish Job/ }).click();
    await waitIdle(page, 1500);
    const pub = await page.request.get("/api/v1/jobs");
    expect(JSON.stringify(await pub.json())).toContain(title);
  });

  await check(page, "L2.3", "Job page offers Edit, Preview, Share, Close and exports", async () => {
    await page.goto("/?view=jobs"); await waitIdle(page);
    await page.getByText(title).first().click({ noWaitAfter: true });
    await waitIdle(page, 1500);
    for (const b of [/^Edit$/, /Preview/, /Share/, /Close/]) await expect(page.getByRole("button", { name: b }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Export CSV/ }).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.4", "Applicant CSV export downloads for a job", async () => {
    const id = page.url().split("/agent/jobs/")[1]?.split(/[?#]/)[0];
    expect(id, "job id from URL").toBeTruthy();
    const r = await page.request.get(`/api/v1/agent/jobs/${id}/applicants.csv`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"] ?? "").toMatch(/csv|text/);
  });

  await check(page, "L2.5", "Applications Pipeline shows only the four Direct stages plus Rejected/Withdrawn", async () => {
    await pipeline(page, "submitted");
    await expect(page.getByText("Applications Pipeline").filter({ visible: true }).first()).toBeVisible();
    for (const s of ["Submitted", "Interview", "Selected", "Placed"]) await expect(page.getByText(s, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    expect(await page.getByText("Shortlisted", { exact: true }).count(), "no Shortlisted stage tile").toBe(0);
  });

  await check(page, "L2.14", "Candidate pool search and filters work", async () => {
    await page.goto("/"); await waitIdle(page);
    await page.getByRole("button", { name: /^Candidates/ }).first().click({ noWaitAfter: true });
    await waitIdle(page);
    const search = page.getByPlaceholder(/Search by name, email, or skill/).first();
    await search.fill("weld");
    await page.waitForTimeout(800);
    expect(await page.getByRole("button", { name: /^View$/ }).count()).toBeGreaterThan(0);
  });

  await check(page, "L2.6", "Schedule an interview; the application moves to Interview", async () => {
    await pipeline(page, "submitted");
    const before = await page.getByRole("button", { name: /Schedule interview/ }).count();
    await page.getByRole("button", { name: /Schedule interview/ }).first().click({ noWaitAfter: true });
    const sd = page.getByRole("dialog");
    await sd.locator('input[type="date"]').fill(new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10));
    await sd.locator('input[type="time"]').fill("10:30");
    await sd.getByPlaceholder(/Hotel Clarkes/).fill("HPSEDC Office, Shimla");
    await sd.getByRole("button", { name: /Schedule & Notify/ }).click();
    await waitIdle(page, 1500);
    await pipeline(page, "submitted");
    expect(await page.getByRole("button", { name: /Schedule interview/ }).count()).toBe(before - 1);
  });

  await check(page, "L2.7", "Respond to a reschedule request by accepting the proposed time", async () => {
    await pipeline(page, "interview_scheduled");
    const btn = page.getByRole("button", { name: /Respond to reschedule/ }).first();
    await expect(btn).toBeVisible();
    await btn.click({ noWaitAfter: true });
    await page.getByRole("button", { name: /Accept proposed time/ }).click();
    await waitIdle(page, 1500);
    await pipeline(page, "interview_scheduled");
    expect(await page.getByRole("button", { name: /Respond to reschedule/ }).count()).toBe(0);
  });

  await check(page, "L2.8", "Record outcome Pass / Select; the candidate moves to Selected", async () => {
    await pipeline(page, "interview_scheduled");
    const r = row(page, "Sanjay Chauhan");
    await r.getByRole("button", { name: /Outcome/ }).click({ noWaitAfter: true });
    const od = page.getByRole("dialog");
    await od.getByRole("button", { name: /Pass \/ Select/ }).click();
    await od.getByRole("button", { name: /Select Candidate/ }).click();
    await waitIdle(page, 1500);
    await pipeline(page, "selected");
    await expect(page.getByText("Sanjay Chauhan", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.10", "Visa status update is saved with history", async () => {
    await pipeline(page, "selected");
    await row(page, "Suresh Thakur").getByRole("button", { name: /View/ }).first().click({ noWaitAfter: true });
    await waitIdle(page, 1500);
    const visa = panel(page, "Visa / passport assistance");
    await visa.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Application submitted" }).click();
    await visa.getByPlaceholder(/Embassy appointment/).fill("Automated check note");
    await visa.getByRole("button", { name: /Update & notify/ }).click();
    await waitIdle(page, 1200);
    await expect(visa.getByText("Automated check note").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.9", "Appointment letter uploads and can be viewed", async () => {
    const at = panel(page, "Appointment & travel");
    await at.locator('input[type="file"]').setInputFiles(path.join(FIX, "appointment-letter.pdf"));
    await waitIdle(page, 1500);
    await expect(at.getByText("View current").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.11", "Record a 30-day welfare check-in for a placed worker", async () => {
    await pipeline(page, "placed");
    await row(page, "Rakesh Verma").getByRole("button", { name: /View/ }).first().click({ noWaitAfter: true });
    await waitIdle(page, 1500);
    const wf = panel(page, "Post-placement welfare check-ins");
    await wf.getByRole("button", { name: /^(Record|Edit)$/ }).first().click();
    await wf.getByPlaceholder(/Notes/).fill("Automated welfare check");
    await wf.getByRole("button", { name: /^Save$/ }).click();
    await waitIdle(page, 1200);
    await expect(wf.getByText("Automated welfare check").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.12", "Reply to a candidate message in Ask HPSEDC", async () => {
    await page.goto("/"); await waitIdle(page);
    await page.getByRole("button", { name: /^Messages/ }).first().click({ noWaitAfter: true });
    await waitIdle(page);
    await page.locator("button").filter({ hasText: "Nirmala Devi" }).first().click();
    await page.getByPlaceholder(/Type your reply/).first().fill("Automated reply from HPSEDC.");
    await page.locator("button:has(svg.lucide-send)").first().click();
    await waitIdle(page, 1200);
    await expect(page.getByText("Automated reply from HPSEDC.").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L2.13", "Reports load with pipeline and compliance sections", async () => {
    await page.goto("/"); await waitIdle(page);
    await page.getByRole("button", { name: /^Reports/ }).first().click({ noWaitAfter: true });
    await waitIdle(page, 2000);
    await expect(page.getByText(/Pipeline health/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/HPSEDC compliance/i).filter({ visible: true }).first()).toBeVisible();
  });
});
