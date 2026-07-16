import type { Page } from "@playwright/test";

/**
 * Log in as a demo user. Handles the CAPTCHA checkbox gate on the login form.
 *
 * NOTE: "Sign In" text appears in both the Tabs trigger and the submit button,
 * so we target the submit button explicitly by `type="submit"` inside the login form.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/auth");

  // Wait for the login form to render — email input uses name="username"
  await page.locator('input[name="username"]').first().waitFor({ state: "visible" });

  // Fill email + password
  await page.locator('input[name="username"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);

  // Click CAPTCHA checkbox (the whole div is clickable)
  await page.locator('text=I\'m not a robot').click();
  await page.waitForTimeout(200);

  // Target the submit button inside the login form (not the Tab trigger)
  await page.locator('form button[type="submit"]').first().click();

  // Wait for navigation away from /auth (dashboard URL or home)
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}
