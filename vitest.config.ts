import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit suite (no SST stage, no AWS). Picks up *.test.ts across workspaces and
// excludes *.integration.test.ts (which run under vitest.integration.config.ts).
// passWithNoTests keeps the gate green until the first unit test lands (M0.3).
export default defineConfig({
  resolve: {
    alias: {
      // Mirror the Next.js `@/*` → `packages/application/*` path alias so that
      // application component unit tests (which import Button, Input, etc.) can
      // resolve `@/src/lib/cn` without needing the Next.js bundler.
      '@': path.resolve(__dirname, 'packages/application'),
    },
  },
  // application/tsconfig.json sets `jsx: "preserve"` (Next.js transforms JSX
  // itself via SWC). Vite's default oxc transform picks that up from tsconfig,
  // so .tsx components under test would be left with unstripped JSX unless we
  // override it here for the test run.
  oxc: {
    jsx: 'automatic',
  },
  test: {
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
