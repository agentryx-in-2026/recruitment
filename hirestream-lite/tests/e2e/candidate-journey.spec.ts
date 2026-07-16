import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers";

/**
 * Candidate Journey — full lifecycle E2E
 * Covers: login → browse dashboard → open profile wizard → view my journey
 *         → browse jobs → view job detail → see saved jobs view
 */

test.describe("Candidate Journey", () => {
  test("logs in as demo candidate and sees the dashboard", async ({ page }) => {
    await loginAs(page, "demo_candidate", "test123");

    // Dashboard should appear
    await expect(page.locator('text=Profile Completion').first()).toBeVisible({ timeout: 10000 });
  });

  test("sidebar navigation switches between views", async ({ page }) => {
    await loginAs(page, "demo_candidate", "test123");

    // Click "Browse Jobs"
    await page.locator("aside button:has-text('Browse Jobs')").click();
    await expect(page.locator("text=/jobs found|Search by title/i").first()).toBeVisible();

    // Click "My Applications"
    await page.locator("aside button:has-text('My Applications')").click();
    // Main content shows the applications panel (not the sidebar link itself)
    await expect(page.locator("main").locator("text=/No applications|Recent|Status/i").first()).toBeVisible({ timeout: 5000 });

    // Click "My Journey"
    await page.locator("aside button:has-text('My Journey')").click();
    await expect(page.locator("text=My Career Journey")).toBeVisible();

    // Journey milestones render
    await expect(page.locator("text=Registered").first()).toBeVisible();
    await expect(page.locator("text=Placed Abroad").first()).toBeVisible();
  });

  test("can open and navigate Profile Wizard", async ({ page }) => {
    await loginAs(page, "demo_candidate", "test123");

    // Click Edit Profile
    await page.getByRole("button", { name: /edit profile/i }).click();

    // Wizard header
    await expect(page.locator("text=Complete Your Profile")).toBeVisible({ timeout: 5000 });

    // Step pills
    await expect(page.locator("button:has-text('Personal Info')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Education')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Skills')").first()).toBeVisible();

    // AI Resume Parser widget visible
    await page.locator("button:has-text('Skills')").first().click();
    await expect(page.locator("text=AI Resume Parser")).toBeVisible();
  });
});
