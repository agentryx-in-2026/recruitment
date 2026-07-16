import { defineConfig, devices } from '@playwright/test';

/**
 * Recorded WALKTHROUGH videos. Records against the LIVE STAGING build (the
 * compiled production app) — fast page loads, no Vite dev-server blank screen.
 * https → secure cookies work fine. No local webServer.
 */
export default defineConfig({
  testDir: './tests/video',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  outputDir: './test-results/video',
  use: {
    baseURL: 'https://hirestream-stg.agentryx.dev',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { slowMo: 350 },
    actionTimeout: 25_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
