import { defineConfig, devices } from "@playwright/test";

/**
 * hirestream-lite walkthrough films + guide screenshots.
 *
 * Point VIDEO_BASE_URL at a PRODUCTION BUILD (never the Vite dev server — it
 * films a blank screen while compiling). Recording writes real data (accounts,
 * applications, interviews), so use a disposable copy of the database, not the
 * UAT portal HPSEDC are testing on. See README.md in this folder.
 * Over plain http://localhost the app's Secure session cookie still works
 * because Chrome treats localhost as a secure context; the forwarded-proto
 * header is what nginx would send.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.film\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 1_800_000,
  outputDir: "../../test-results/video-lite",
  use: {
    baseURL: process.env.VIDEO_BASE_URL || "http://localhost:5099",
    extraHTTPHeaders: { "X-Forwarded-Proto": "https" },
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    // Rehearsals (DRY=1) skip capture — this host has 2 vCPU / 4 GB and the
    // screencast is the heaviest part of a run.
    video: process.env.DRY ? "off" : { mode: "on", size: { width: 1280, height: 720 } },
    launchOptions: {
      slowMo: 40,
      args: ["--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
        "--renderer-process-limit=2", "--js-flags=--max-old-space-size=384"],
    },
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
  ],
});
