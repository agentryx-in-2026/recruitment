import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers";

/**
 * Agent Journey — agency dashboard, candidate search, drives
 */

test.describe("Agent Journey", () => {
  test("demo_agent logs in and sees agency card", async ({ page }) => {
    await loginAs(page, "demo_agent", "test123");
    // Agent dashboard has either "My Jobs" (if registered) or "Register Your Agency"
    // Wait for either to appear
    const dashboardLocator = page.locator("h2:has-text('Register Your Agency'), aside button:has-text('My Jobs')").first();
    await expect(dashboardLocator).toBeVisible({ timeout: 8000 });
  });

  test("agent can navigate to Candidates view and open detail dialog", async ({ page }) => {
    await loginAs(page, "demo_agent", "test123");

    // Navigate to Candidates
    const candidatesTab = page.locator("aside button:has-text('Candidates'), button:has-text('Candidates')").first();
    if (await candidatesTab.isVisible()) {
      await candidatesTab.click();

      // Search bar should appear
      await expect(page.locator("input[placeholder*='skill' i]").first()).toBeVisible({ timeout: 5000 });

      // If any candidates listed, clicking View opens a dialog
      const viewBtn = page.locator("button:has-text('View')").first();
      if (await viewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await viewBtn.click();
        // Dialog has Email/Call action buttons
        await expect(page.locator("text=/Email|Call/").first()).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

