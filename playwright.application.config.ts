import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/application',
  // Include both *.spec.ts (existing suites) and *.e2e.ts (round-trip suites)
  testMatch: /.*\.(spec|e2e)\.[jt]s/,
  globalSetup: './e2e/application/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — global-setup starts next dev with the correct env.
});
