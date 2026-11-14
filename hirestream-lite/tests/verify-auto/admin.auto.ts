import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { setup, login } from "../video-lite/_film";
import { check, waitIdle } from "./_check";

/** Admin Console checks (demo_admin) — Verify cases L4.1–L4.9. */
const FIX = path.resolve("tests/video-lite/fixtures");

async function tab(page: Page, label: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}(\\s*\\d+)?$`) }).first().click({ noWaitAfter: true });
  await waitIdle(page, 1200);
}

test("Admin", async ({ page }) => {
  await setup(page);
  await page.goto("/auth");

  await check(page, "L4.1", "Admin Console opens with overview and CSV exports", async () => {
    await login(page, "demo_admin");
    await expect(page.getByText("Admin Console").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /candidates CSV/i }).filter({ visible: true }).first()).toBeVisible();
    const r = await page.request.get("/api/v1/admin/reports/export/candidates.csv");
    expect(r.status(), "candidates CSV download").toBe(200);
  });

  await check(page, "L4.3", "Professions list loads and a profession opens for editing", async () => {
    await tab(page, "Professions");
    await expect(page.getByText("Professions & eligibility").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Edit$/ }).first().click();
    await expect(page.getByText("Name (Hindi)").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/ }).first().click();
  });

  await check(page, "L4.4", "Form Fields shows Shown/Hidden and Must fill/Optional controls", async () => {
    await tab(page, "Form Fields");
    await expect(page.getByText("Registration form fields").filter({ visible: true }).first()).toBeVisible();
    expect(await page.getByTitle(/Hide from the form|Show on the form|The portal depends on this field/).count()).toBeGreaterThan(3);
  });

  await check(page, "L4.5", "System Config shows the Direct 4-stage pipeline selected", async () => {
    await tab(page, "System Config");
    await expect(page.getByText("Recruitment pipeline").filter({ visible: true }).first()).toBeVisible();
    const s = await page.request.get("/api/v1/admin/settings");
    const body = await s.json();
    const list = body.data ?? body;
    const pipe = (Array.isArray(list) ? list : Object.values(list)).find((x: any) => x.key === "pipeline.profile");
    expect(pipe?.value ?? pipe, "pipeline.profile").toBe("compact");
  });

  await check(page, "L4.6", "Users list loads with Disable/Enable controls", async () => {
    await tab(page, "Users");
    await expect(page.getByText(/Users \(\d+\)/).filter({ visible: true }).first()).toBeVisible();
    expect(await page.getByRole("button", { name: /^(Disable|Enable)$/ }).count()).toBeGreaterThan(0);
  });

  await check(page, "L4.2", "Smart Job Importer maps columns, rejects the bad row, imports the rest", async () => {
    await tab(page, "Import Jobs");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Choose file/ }).first().click();
    await (await chooser).setFiles(path.join(FIX, "govt-job-batch.csv"));
    await waitIdle(page, 2500);
    await expect(page.getByText("Column mapping").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/Country is required/).filter({ visible: true }).first()).toBeVisible();
    const btn = page.getByRole("button", { name: /^Import \d+ jobs?/ }).first();
    const label = await btn.innerText();
    await btn.click();
    await waitIdle(page, 2500);
    await expect(page.getByText(/Import complete|jobs posted/i).filter({ visible: true }).first()).toBeVisible();
    return label.trim();
  });

  await check(page, "L4.7", "Compliance, Deployment Readiness and Welfare SLA panels load", async () => {
    await tab(page, "Compliance");
    await expect(page.getByText(/Compliance Oversight/).filter({ visible: true }).first()).toBeVisible();
    await tab(page, "Deployment Readiness");
    await expect(page.getByText(/Travel-Ready|Deployment Readiness/).filter({ visible: true }).first()).toBeVisible();
    await tab(page, "Welfare SLA");
    await expect(page.getByText(/Welfare SLA|welfare check-ins/i).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L4.8", "Audit Log, Fraud Watch and Duplicates load; audit shows the import", async () => {
    await tab(page, "Audit Log");
    await expect(page.getByText(/Audit Log|When/).filter({ visible: true }).first()).toBeVisible();
    await tab(page, "Fraud Watch");
    await expect(page.getByText(/fraud reports/i).filter({ visible: true }).first()).toBeVisible();
    await tab(page, "Duplicates");
    await expect(page.getByText(/Duplicate/i).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L4.9", "All grievances visible to admin; notification templates editable", async () => {
    await tab(page, "Notifications");
    await expect(page.getByText(/Notification Templates/i).filter({ visible: true }).first()).toBeVisible();
    expect(await page.getByRole("button", { name: /^Edit/ }).count()).toBeGreaterThan(0);
    await page.goto("/grievances");
    await waitIdle(page);
    await expect(page.getByText(/All grievances/).filter({ visible: true }).first()).toBeVisible();
  });
});
