import { defineConfig } from 'vitest/config';

// Integration suite (dynalite in-memory DynamoDB; no AWS).
// globalSetup boots dynalite + creates tables (main process).
// setupFiles sets env vars so the production client.ts points at dynalite (workers).
export default defineConfig({
  test: {
    include: ['packages/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./packages/core/test/dynalite-global.ts'],
    setupFiles: ['./packages/core/test/integration-env.ts'],
  },
});
