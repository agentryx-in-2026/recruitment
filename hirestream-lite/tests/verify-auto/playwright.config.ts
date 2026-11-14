import { defineConfig, devices } from "@playwright/test";

/** Automated E2E checks for Agentryx Verify — launched by run.sh against a disposable portal copy. */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.auto\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 1_200_000,
  outputDir: "../../test-results/verify-auto",
  use: {
    baseURL: process.env.AUTO_BASE_URL || "http://localhost:5098",
    extraHTTPHeaders: { "X-Forwarded-Proto": "https" },
    viewport: { width: 1280, height: 800 },
    video: "off",
    launchOptions: { args: ["--disable-dev-shm-usage", "--disable-extensions", "--renderer-process-limit=2", "--js-flags=--max-old-space-size=384"] },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
