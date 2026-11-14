import { test, expect } from "@playwright/test";
import { setup, login, logout, field } from "../video-lite/_film";
import { check, sql, waitIdle } from "./_check";

/**
 * Checks for the cases the role suites did not cover: passport-less applicants
 * (L1.5), mobile country code and WhatsApp (L1.6), drives and lifecycle (L4.10),
 * phone layout (L5.1), the 30-minute idle timeout (L5.3) and the evidence lock (L5.5).
 */
const STAMP = Date.now().toString().slice(-6);

test("Extras", async ({ page }) => {
  await setup(page);

  // A fresh applicant for the page-1 checks.
  const email = `extra.${STAMP}@demo.com`;
  await page.goto("/auth"); await waitIdle(page);
  await page.getByRole("tab", { name: /Create Account/ }).click();
  await page.getByPlaceholder("Enter your full name").fill("Extra Applicant");
  await page.getByPlaceholder("name@example.com").last().fill(email);
  await page.getByPlaceholder("Min. 8 characters").fill("Extra@2026x");
  await page.getByPlaceholder("Re-type your password").fill("Extra@2026x");
  await page.locator("form").getByRole("button", { name: /Create Account/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/register"), { timeout: 30000 });
  await waitIdle(page, 1500);
  await page.getByRole("button", { name: /I have these/ }).click({ timeout: 5000 }).catch(() => {});

  await check(page, "L1.5", "'I don't have a passport yet' hides the passport fields and explains the applicant can still apply", async () => {
    await expect(field(page, "Passport number").locator("input").first()).toBeVisible();
    await page.getByText("I don't have a passport yet").filter({ visible: true }).first().click();
    await waitIdle(page, 400);
    expect(await page.getByLabel(/Passport number/).filter({ visible: true }).count(), "passport number field hidden").toBe(0);
    await expect(page.getByText(/You can still apply/).filter({ visible: true }).first()).toBeVisible();
    await page.getByText("I don't have a passport yet").filter({ visible: true }).first().click(); // back on
    await expect(field(page, "Passport number").locator("input").first()).toBeVisible();
  });

  await check(page, "L1.6", "Mobile number has a country code; WhatsApp defaults to 'same as mobile' and asks for its own number when unticked", async () => {
    const codes = page.getByLabel("Country code").filter({ visible: true });
    expect(await codes.count(), "a country-code picker beside the mobile number").toBeGreaterThan(0);
    expect(await codes.first().inputValue(), "India by default").toBe("+91");
    expect(await codes.first().locator("option").count(), "other countries offered").toBeGreaterThan(3);
    const wa = field(page, "WhatsApp number").locator('input[type="tel"], input').last();
    await expect(wa, "WhatsApp copies the mobile while 'same as mobile' is ticked").toBeDisabled();
    await page.getByText("Same as mobile number").filter({ visible: true }).first().click(); await waitIdle(page, 300);
    await expect(wa, "WhatsApp asks for its own number when unticked").toBeEnabled();
  });

  await check(page, "L5.3", "The sign-in cookie is a 30-minute idle timeout, renewed on activity", async () => {
    await page.context().clearCookies();
    const r = await page.request.post("/api/v1/auth/login", { data: { username: "demo_candidate", password: "test123" } });
    expect(r.status()).toBe(200);
    const cookie = (await page.context().cookies()).find((c) => /sid|session/i.test(c.name));
    expect(cookie, "session cookie").toBeTruthy();
    const mins = (cookie!.expires * 1000 - Date.now()) / 60000;
    expect(mins, `cookie lifetime ${mins.toFixed(1)} min`).toBeGreaterThan(25);
    expect(mins).toBeLessThan(31);
    await page.waitForTimeout(2000);
    await page.request.get("/api/v1/candidates/profile");
    const renewed = (await page.context().cookies()).find((c) => c.name === cookie!.name)!;
    expect(renewed.expires, "expiry moves forward on activity").toBeGreaterThan(cookie!.expires);
    return `${mins.toFixed(0)} min, rolling`;
  });

  await check(page, "L5.5", "Evidence lock: once HPSEDC verifies the passport, the applicant can no longer change passport details", async () => {
    const cid = sql(`select c.id from candidates c join users u on u.id = c.user_id where u.username = 'demo_candidate'`);
    const doc = sql(`select id from documents where candidate_id = '${cid}' and lower(type) = 'passport' limit 1`);
    if (!doc) sql(`insert into documents (id, candidate_id, type, file_name, file_url, verified) values (gen_random_uuid(), '${cid}', 'passport', 'passport.pdf', '/uploads/x.pdf', true)`);
    else sql(`update documents set verified = true where id = '${doc}'`);
    try {
      const r = await page.request.patch("/api/v1/candidates/profile", { data: { passportNumber: "Z9999999" } });
      const body = await r.json().catch(() => ({}));
      const locked: string[] = body?.lockedFields ?? body?.data?.lockedFields ?? [];
      // The portal either refuses the whole save (403 with the reason) or saves the rest and lists the refused fields.
      const refused = (r.status() === 403 && /passport/i.test(body?.message ?? "")) || locked.includes("passportNumber");
      expect(refused, `server reply ${r.status()} ${JSON.stringify(body).slice(0, 160)}`).toBe(true);
      const now = sql(`select coalesce(passport_number,'') from candidates where id = '${cid}'`);
      expect(now, "passport number unchanged").not.toBe("Z9999999");
      return `refused (${r.status()}): ${String(body?.message ?? "").slice(0, 70)}…`;
    } finally { await page.context().clearCookies(); }
  });

  await check(page, "L4.10", "Admin: Drives approval and Lifecycle tabs open, and a lifecycle run completes", async () => {
    await page.context().clearCookies();
    await page.goto("/auth"); await login(page, "demo_admin"); await waitIdle(page, 1500);
    await page.goto("/"); await waitIdle(page, 1500);
    await page.getByRole("button", { name: /^Drives(\s*\d+)?$/ }).first().click({ noWaitAfter: true }); await waitIdle(page, 900);
    await page.getByRole("button", { name: /^Lifecycle(\s*\d+)?$/ }).first().click({ noWaitAfter: true }); await waitIdle(page, 900);
    const run = await page.request.post("/api/v1/admin/lifecycle/run");
    expect(run.status(), "lifecycle run").toBe(200);
    const open = sql(`select count(*) from jobs where status = 'active'`);
    expect(Number(open), "active jobs still open after the run").toBeGreaterThan(0);
    await logout(page);
    return `${open} jobs still active after the run`;
  });

  await check(page, "L5.1", "Phone width (390 px): form, dashboard and pipeline have no sideways scroll", async () => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 844 });
    const wide: string[] = [];
    const measure = async (where: string) => {
      await waitIdle(page, 1200);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 2) wide.push(`${where} +${over}px`);
    };
    await page.goto("/auth"); await login(page, "demo_candidate");
    await page.goto("/register"); await measure("application form");
    await page.goto("/"); await measure("applicant dashboard");
    await logout(page);
    await page.goto("/auth"); await login(page, "hpsedc_agency");
    await page.goto("/agent/applicants"); await measure("pipeline");
    await logout(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    if (wide.length) throw new Error(`sideways scroll: ${wide.join(", ")}`);
  });
});
