import { defineConfig } from 'vitest/config';

// Integration suite (dynalite in-memory DynamoDB; no AWS). The dynalite
// globalSetup + env setupFiles are wired in M0.4. passWithNoTests keeps the
// gate green until the first integration test lands.
export default defineConfig({
  test: {
    include: ['packages/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
