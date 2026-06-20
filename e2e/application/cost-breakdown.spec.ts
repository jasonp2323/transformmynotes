/**
 * Cost Breakdown admin page E2E tests (M23.5.4).
 *
 * Runs against the same offline stack as admin.spec.ts.
 * Prerequisites seeded by global-setup:
 *  - Admin user (e2e-admin@example.com, admin group, active DDB profile)
 *  - Usage table with 5 days of daily aggregates for the admin user
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { readRuntime, installSrpBypass } from './helpers';

const SCREENSHOTS_DIR = path.join(__dirname, '../../docs/verification/m23-cost-breakdown');

// Helper: sign in as admin (mirrors admin.spec.ts pattern exactly)
async function signInAsAdmin(page: Page, runtime: ReturnType<typeof readRuntime>) {
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ── 1. Renders with data ──────────────────────────────────────────────────────

test('cost-breakdown renders summary cards and per-user table with seeded data', async ({ page }) => {
  const runtime = readRuntime();
  await signInAsAdmin(page, runtime);

  await page.goto('/admin/cost-breakdown');

  // h1 contains "Cost Breakdown"
  await expect(page.locator('h1')).toContainText('Cost Breakdown', { timeout: 10_000 });

  // Admin nav has Cost Breakdown link
  await expect(page.locator('nav').getByRole('link', { name: 'Cost Breakdown' })).toBeVisible({ timeout: 10_000 });

  // Wait for a summary card with a dollar value (seeded data means total usd > 0)
  await expect(page.getByText(/\$\d/).first()).toBeVisible({ timeout: 20_000 });

  // Per-user table shows the admin's email
  await expect(page.getByText(runtime.adminUsername).first()).toBeVisible({ timeout: 15_000 });

  // Ensure screenshots dir exists
  const fs = await import('node:fs');
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'cost-breakdown-overview.png'),
    fullPage: true,
  });
});

// ── 2. Breakdown dimension filter ────────────────────────────────────────────

test('cost-breakdown by-feature dimension shows breakdown heading', async ({ page }) => {
  const runtime = readRuntime();
  await signInAsAdmin(page, runtime);

  await page.goto('/admin/cost-breakdown');

  // Wait for page to finish initial load (dollar value visible)
  await expect(page.getByText(/\$\d/).first()).toBeVisible({ timeout: 20_000 });

  // Switch to "By feature" via the SegmentedControl (rendered as radios)
  await page.getByRole('radio', { name: 'By feature' }).click();

  // The section heading changes to "Cost breakdown — by feature"
  await expect(page.getByText(/by feature/i)).toBeVisible({ timeout: 10_000 });

  const fs = await import('node:fs');
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'cost-breakdown-by-feature.png'),
    fullPage: true,
  });
});

// ── 3. Price-book editor round-trip ──────────────────────────────────────────

test('cost-breakdown price-book editor saves and shows success toast', async ({ page }) => {
  const runtime = readRuntime();
  await signInAsAdmin(page, runtime);

  await page.goto('/admin/cost-breakdown');

  // Wait for page to load fully (pricing section becomes visible after pricing fetch)
  await expect(page.getByText(/\$\d/).first()).toBeVisible({ timeout: 20_000 });

  // Wait for price book editor to appear (it's conditionally rendered after pricing fetch)
  // The S3 rate input has label "$/GB-month"
  const s3Input = page.getByLabel('$/GB-month');
  await expect(s3Input).toBeVisible({ timeout: 15_000 });

  // Change the S3 rate
  await s3Input.fill('0.025');

  // Click Save price book
  await page.getByRole('button', { name: 'Save price book' }).click();

  // Toast with "Price book saved"
  await expect(page.getByText(/Price book saved/i)).toBeVisible({ timeout: 15_000 });

  const fs = await import('node:fs');
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'cost-breakdown-pricing-saved.png'),
    fullPage: true,
  });
});
