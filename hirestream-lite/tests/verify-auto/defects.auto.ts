import { test, expect } from "@playwright/test";
import { setup, login, logout } from "../video-lite/_film";
import { check, sql, waitIdle } from "./_check";

/** Retests for the known defects (Verify section "Known defects — retest", L6.x). */
test("Defects", async ({ page }) => {
  await setup(page);

  await check(page, "L6.4", "Sign-in page shows no Demo Mode button while quick login is off", async () => {
    await page.goto("/auth"); await waitIdle(page, 1500);
    await expect(page.getByRole("tab", { name: /Create Account/ }).first()).toBeVisible();
    expect(await page.getByText(/Demo Mode/).count(), "Demo Mode button").toBe(0);
  });

  await check(page, "L6.2", "Reset-password link opens a page; a bad link is refused; a real link sets the new password", async () => {
    await page.goto("/reset-password?token=" + "0".repeat(64)); await waitIdle(page);
    await page.locator("#np").fill("Reset@2026x");
    await page.locator("#np2").fill("Reset@2026x");
    await page.getByRole("button", { name: /Set new password/ }).click();
    await expect(page.getByRole("alert").filter({ visible: true }).first(), "bad token refused").toBeVisible();

    const token = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    sql(`insert into password_reset_tokens (user_id, token, expires_at) select id, '${token}', now() + interval '1 hour' from users where username = 'demo42'`);
    await page.goto(`/reset-password?token=${token}`); await waitIdle(page);
    await page.locator("#np").fill("Reset@2026x");
    await page.locator("#np2").fill("Reset@2026x");
    await page.getByRole("button", { name: /Set new password/ }).click();
    await expect(page.getByText(/Your password has been changed/).filter({ visible: true }).first()).toBeVisible();
    const r = await page.request.post("/api/v1/auth/login", { data: { username: "demo42", password: "Reset@2026x" } });
    expect(r.status(), "sign in with the new password").toBe(200);
    await page.context().clearCookies();
  });

  await check(page, "L6.9", "Callback links follow the assisted-callback switch", async () => {
    const setCallback = async (on: boolean) => {
      const a = await page.request.post("/api/v1/auth/login", { data: { username: "demo_admin", password: "test123" } });
      expect(a.status()).toBe(200);
      const r = await page.request.put("/api/v1/admin/settings/capability.assisted_callback_enabled", { data: { value: on } });
      expect(r.status(), "admin setting update").toBe(200);
      await page.context().clearCookies();
    };
    await setCallback(false);
    try {
      await page.goto("/auth"); await login(page, "demo_candidate");
      await page.goto("/register"); await waitIdle(page, 1500);
      const offLinks = page.getByText("Request a callback").filter({ visible: true });
      await page.waitForTimeout(1500);
      const where = await offLinks.evaluateAll((els) => els.map((e) => `${e.tagName}<${(e.closest("a,button") as HTMLElement | null)?.outerHTML.slice(0, 160)}> @${location.pathname}`));
      if (where.length) throw new Error(`callback link while OFF: ${where.join(" | ")}`);
      await logout(page);
    } finally {
      await setCallback(true);
    }
    await page.goto("/auth"); await login(page, "demo_candidate");
    await page.goto("/register"); await waitIdle(page, 1500);
    await expect(page.getByText("Request a callback").filter({ visible: true }).first(), "callback link while ON").toBeVisible();
    await logout(page);
  });

  await check(page, "L6.10", "Placement Cell dashboard funnel, job tiles and Reports show the four Direct stages", async () => {
    await page.context().clearCookies();
    await page.goto("/auth"); await login(page, "hpsedc_agency"); await waitIdle(page, 2000);
    await expect(page.getByText("Applicant Pipeline").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Interview", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    for (const st of ["Reviewed", "Shortlisted"]) await expect(page.getByText(st, { exact: true }).filter({ visible: true }), `${st} on dashboard`).toHaveCount(0);

    const jobId = sql(`select j.id from jobs j where j.title = 'Heavy Truck Driver' limit 1`);
    await page.goto(`/agent/jobs/${jobId}`); await waitIdle(page, 1500);
    const occupied = sql(`select count(*) from applications where job_id = '${jobId}' and status in ('reviewed','shortlisted')`);
    if (occupied === "0") expect(await page.getByText("Shortlisted", { exact: true }).filter({ visible: true }).count(), "Shortlisted tile on job page").toBe(0);

    const rep = await page.request.get("/api/v1/agent/reports");
    expect(rep.status(), "reports API").toBe(200);
    const funnelKeys = Object.keys((await rep.json())?.data?.applicants?.funnel ?? {});
    expect(funnelKeys.length, "funnel present").toBeGreaterThan(0);
    expect(funnelKeys.includes("reviewed") || funnelKeys.includes("shortlisted"), `report funnel keys: ${funnelKeys.join(",")}`).toBe(false);
  });
});
