/**
 * [E2E] /progress page — Study Progress & Insights
 *
 * Drives the Progress page fully offline:
 *   1. Empty state — asserts friendly empty-state message for a user with no data.
 *   2. Loaded state — mocks the /api/progress route with seeded data and asserts
 *      stat cards render correct values.
 *   3. Range switch — changes range from 30d to 7d, confirms the fetch fires with
 *      the new range parameter and the UI updates.
 *
 * The API route (/api/progress) is intercepted via page.route() so this spec
 * does not depend on the parallel-agent-owned API implementation being present.
 *
 * Uses the dedicated progress test user (e2e-progress@example.com) seeded by
 * global-setup with zero study data so the empty-state assertion is clean.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import { test, expect } from '@playwright/test';
import { readRuntime, installSrpBypass } from './helpers';
import type { ProgressResponse } from '../../packages/application/src/components/progress/types';

// ── Fixture data ──────────────────────────────────────────────────────────────

function buildEmptyResponse(range: string): ProgressResponse {
  return {
    range,
    profile: {
      studyStreakDays: 0,
      longestStreakDays: 0,
      lastStudyDay: null,
      totalReviewsLifetime: 0,
      totalCardsMastered: 0,
      totalQuizAttemptsLifetime: 0,
    },
    days: [],
    totals: {
      reviews: 0,
      correctReviews: 0,
      quizAttempts: 0,
      notesCreated: 0,
      studySetsCreated: 0,
      cardsMastered: 0,
      retentionRate: null,
      avgQuizScore: null,
      avgEase: null,
    },
  };
}

function buildSeededResponse(range: string): ProgressResponse {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    return {
      date: d.toISOString().slice(0, 10),
      reviews: i % 3 === 0 ? 15 + i : 0,
      cardsReviewed: i % 3 === 0 ? 12 + i : 0,
      correctReviews: i % 3 === 0 ? 10 + i : 0,
      quizAttempts: i % 7 === 0 ? 1 : 0,
      notesCreated: i === 0 ? 2 : 0,
      studySetsCreated: 0,
      cardsMastered: i % 5 === 0 ? 3 : 0,
      retentionRate: i % 3 === 0 ? 0.82 : null,
      avgQuizScore: i % 7 === 0 ? 0.75 : null,
      avgEase: i % 3 === 0 ? 2.1 : null,
    };
  });

  return {
    range,
    profile: {
      studyStreakDays: 5,
      longestStreakDays: 14,
      lastStudyDay: today.toISOString().slice(0, 10),
      totalReviewsLifetime: 342,
      totalCardsMastered: 87,
      totalQuizAttemptsLifetime: 12,
    },
    days,
    totals: {
      reviews: 210,
      correctReviews: 175,
      quizAttempts: 5,
      notesCreated: 4,
      studySetsCreated: 2,
      cardsMastered: 18,
      retentionRate: 0.83,
      avgQuizScore: 0.75,
      avgEase: 2.1,
    },
  };
}

// ── Helper: sign in as progress user ─────────────────────────────────────────

async function signInAsProgressUser(page: import('@playwright/test').Page, runtime: ReturnType<typeof readRuntime>) {
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.progressUsername.toLowerCase()]: runtime.progressPassword,
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.progressUsername);
  await page.getByLabel('Password').first().fill(runtime.progressPassword);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] progress page', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ viewport: { width: 1280, height: 800 } });

  // ── 1. Empty state ───────────────────────────────────────────────────────────

  test('empty state shows friendly message when user has no data', async ({ page }) => {
    const runtime = readRuntime();

    // Intercept the progress API to return empty data
    await page.route('**/api/progress**', async (route) => {
      const url = new URL(route.request().url());
      const range = url.searchParams.get('range') ?? '30d';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildEmptyResponse(range)),
      });
    });

    await signInAsProgressUser(page, runtime);
    await page.goto('/progress');

    // The empty state heading should appear (visible in the active shell).
    // AppShell renders both mobile + desktop shells; .filter({visible:true}) picks
    // the one in the currently-visible shell.
    await expect(
      page.getByText('Start studying to see your progress').filter({ visible: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Stat cards should show zero streak and zero reviews
    await expect(page.getByText('0d').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 2. Loaded state ──────────────────────────────────────────────────────────

  test('stat cards render with seeded data', async ({ page }) => {
    const runtime = readRuntime();

    // Intercept with seeded non-empty data
    await page.route('**/api/progress**', async (route) => {
      const url = new URL(route.request().url());
      const range = url.searchParams.get('range') ?? '30d';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSeededResponse(range)),
      });
    });

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.progressUsername.toLowerCase()]: runtime.progressPassword,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.progressUsername);
    await page.getByLabel('Password').first().fill(runtime.progressPassword);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/progress');

    // Wait for the data to load — the streak card should show 5d
    await expect(page.getByText('5d').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });

    // Total reviews stat card
    await expect(page.getByText('342').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

    // Cards mastered stat card
    await expect(page.getByText('87').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

    // Avg quiz score: 75%
    await expect(page.getByText('75%').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });

    // Charts should be rendered (recharts renders SVG inside a ResponsiveContainer div)
    await expect(
      page.locator('.recharts-wrapper svg').filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Empty state text should not be visible in any shell
    for (const el of await page.getByText('Start studying to see your progress').all()) {
      await expect(el).toBeHidden({ timeout: 5_000 });
    }
  });

  // ── 3. Range switch ──────────────────────────────────────────────────────────

  test('range switch from 30d to 7d refetches and updates the range label', async ({ page }) => {
    const runtime = readRuntime();

    const fetchedRanges: string[] = [];

    // Track which ranges are requested
    await page.route('**/api/progress**', async (route) => {
      const url = new URL(route.request().url());
      const range = url.searchParams.get('range') ?? '30d';
      fetchedRanges.push(range);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSeededResponse(range)),
      });
    });

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.progressUsername.toLowerCase()]: runtime.progressPassword,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.progressUsername);
    await page.getByLabel('Password').first().fill(runtime.progressPassword);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto('/progress');

    // Wait for initial 30d load
    await expect(page.getByText('5d').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText('Showing 30d of activity').filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the 7d segment (visible in the desktop shell)
    await page.getByRole('radio', { name: '7d' }).filter({ visible: true }).first().click();

    // The range label should update
    await expect(
      page.getByText('Showing 7d of activity').filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify that both 30d and 7d were requested
    expect(fetchedRanges).toContain('30d');
    expect(fetchedRanges).toContain('7d');
  });
});
