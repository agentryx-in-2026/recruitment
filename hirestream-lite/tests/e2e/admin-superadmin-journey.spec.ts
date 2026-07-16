import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers";

/**
 * Admin + Super Admin — console access, CSV export, user management, DB reset guard
 */

test.describe("Admin Console", () => {
  test("demo_admin sees Admin Console hero and export CSV buttons", async ({ page }) => {
    await loginAs(page, "demo_admin", "test123");

    // Dark gradient Admin Console header
    await expect(page.locator("text=Admin Console")).toBeVisible({ timeout: 5000 });

    // CSV export buttons for 5 entities
    await expect(page.locator("button:has-text('candidates CSV')")).toBeVisible();
    await expect(page.locator("button:has-text('jobs CSV')")).toBeVisible();
  });
});

test.describe("Super Admin Console", () => {
  test("demo_superadmin sees Crown-branded console", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");

    await expect(page.locator("text=Super Admin Console")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Restricted").first()).toBeVisible();
  });

  test("superadmin can navigate to User Management", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");

    await page.locator("aside button:has-text('User Management')").click();
    await expect(page.locator("text=/User Management|users/i").first()).toBeVisible({ timeout: 3000 });

    // Create User button
    await expect(page.getByRole("button", { name: /create user/i })).toBeVisible();
  });

  test("superadmin sees Danger Zone with DB reset", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");

    await page.locator("aside button:has-text('System Health')").click();
    await expect(page.getByRole("heading", { name: /Danger Zone/i })).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Wipe + Reseed").first()).toBeVisible();
    await expect(page.locator("text=Wipe to empty").first()).toBeVisible();
  });

  test("superadmin can open Create User dialog", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");

    await page.locator("aside button:has-text('User Management')").click();
    await page.getByRole("button", { name: /create user/i }).click();

    await expect(page.locator("text=Create New User")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Registration form only allows")).toBeVisible();
  });
});

