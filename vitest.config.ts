import { defineConfig } from 'vitest/config';

// Unit suite (no SST stage, no AWS). Picks up *.test.ts across workspaces and
// excludes *.integration.test.ts (which run under vitest.integration.config.ts).
// passWithNoTests keeps the gate green until the first unit test lands (M0.3).
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
