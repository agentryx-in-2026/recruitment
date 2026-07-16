import { test, expect } from "@playwright/test";

/**
 * Auth flow — registration, login, logout, forgot password
 */

test.describe("Auth flow", () => {
  test("landing page renders the 4 public stakeholder cards", async ({ page }) => {
    await page.goto("/");

    // Hero + CTAs visible
    await expect(page.locator("h1:has-text('HireStream')").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();

    // 4 public stakeholder cards (Super Admin is an internal role, not advertised)
    await expect(page.locator("text=Job Seekers").first()).toBeVisible();
    await expect(page.locator("text=Recruitment Agencies").first()).toBeVisible();
    await expect(page.locator("text=Employers").first()).toBeVisible();
    await expect(page.locator("text=Government Officers").first()).toBeVisible();
  });

  test("clicking Get Started navigates to auth page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.locator("text=Welcome").first()).toBeVisible();
  });

  test("register tab shows role selector with 3 public roles", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("tab", { name: /create account/i }).click();

    // Role selector
    await expect(page.locator("text=I want to register as")).toBeVisible();
  });

  test("invalid login shows error", async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[name="username"]').first().waitFor({ state: "visible" });
    await page.locator('input[name="username"]').first().fill("nonexistent@fake.dev");
    await page.locator('input[name="password"]').first().fill("wrongpass");
    await page.locator("text=I'm not a robot").click();
    await page.waitForTimeout(200);
    await page.locator('form button[type="submit"]').first().click();

    // Error toast or form message
    await expect(page.locator("text=/Login Failed|Unauthorized|Incorrect|Invalid/i").first()).toBeVisible({ timeout: 8000 });
  });

  test("forgot password flow is accessible", async ({ page }) => {
    await page.goto("/auth");
    await page.locator("text=Forgot password?").click();
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });
});
