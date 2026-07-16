import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5001',
    trace: 'on-first-retry',
    // Accept all cookies over http for local testing
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start a dedicated dev server for E2E on port 5001
  // Dev mode does NOT set secure cookies, so sessions work over plain HTTP
  // We pass DATABASE_URL so the test server connects to real Postgres
  webServer: {
    command: 'bash -c "export $(grep DATABASE_URL .env | xargs) && PORT=5001 NODE_ENV=development tsx server/index.ts"',
    url: 'http://localhost:5001',
    reuseExistingServer: false,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
