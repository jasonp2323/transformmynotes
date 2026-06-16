/**
 * AI Settings admin page E2E tests (M19.2.1 + M19.2.3).
 *
 * Runs against the offline stack booted by global-setup.ts:
 * dynalite + cognito-local + next dev (:3002).
 *
 * Prerequisites seeded by global-setup:
 *  - Admin user: e2e-admin@example.com (in cognito 'admin' group, active DDB profile)
 *
 * Tests:
 *  1. Admin navigates to /admin/ai-settings — form sections render
 *  2. Setting maxTokens to 9999 (out of bounds) → Save → inline validation error,
 *     no success toast, no network request
 *  3. Valid config save → success toast with version number
 *  4. Expand version history → ≥1 row visible
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readRuntime, installSrpBypass } from './helpers';

const SCREENSHOTS_DIR = path.join(__dirname, '../../docs/verification/m19-ai-settings');

// Helper: sign in as admin and navigate to /admin/ai-settings
async function signInAsAdmin(page: Parameters<typeof installSrpBypass>[0]) {
  const runtime = readRuntime();

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

// ── 1. Form sections render ──────────────────────────────────────────────────

test('admin AI settings page renders all form sections', async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto('/admin/ai-settings');
  await expect(page.locator('h1')).toContainText('AI Settings', { timeout: 10_000 });

  // Wait for the form to load (loading state disappears when config is fetched)
  // The card containing "Feature flags" section heading should appear
  await expect(page.getByText('Feature flags')).toBeVisible({ timeout: 15_000 });

  // Verify key sections are rendered
  await expect(page.getByText('System prompts')).toBeVisible();
  await expect(page.getByText('Model selection')).toBeVisible();
  await expect(page.getByText('Inference parameters')).toBeVisible();
  await expect(page.getByText('Language', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Guardrails')).toBeVisible();
  await expect(page.getByText(/Audio/)).toBeVisible();

  // Master kill switch (generationEnabled) is present
  await expect(page.getByText(/AI generation enabled/)).toBeVisible();

  // Material type switches: flashcards, quiz, etc.
  await expect(page.getByText('Flashcards')).toBeVisible();
  await expect(page.getByText('Quiz')).toBeVisible();

  // Save button is present
  await expect(page.getByRole('button', { name: /Save configuration/i })).toBeVisible();

  // AI Settings link in the Admin nav sidebar
  await expect(page.locator('nav').getByRole('link', { name: 'AI Settings' })).toBeVisible();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'ai-settings-form.png'),
    fullPage: true,
  });
});

// ── 2. Invalid maxTokens → validation error, no success ─────────────────────

test('maxTokens 9999 blocks save with inline validation error', async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto('/admin/ai-settings');
  await expect(page.getByText('Inference parameters')).toBeVisible({ timeout: 15_000 });

  // Set maxTokens to 9999 (beyond the max of 8192)
  const maxTokensInput = page.getByLabel(/Max tokens/i);
  await maxTokensInput.fill('9999');

  // Click save
  await page.getByRole('button', { name: /Save configuration/i }).click();

  // Inline validation error should appear — no success toast
  await expect(page.getByText(/Must be between/i).first()).toBeVisible({ timeout: 5_000 });

  // Success toast must NOT appear
  await expect(page.getByText(/AI config saved/i)).not.toBeVisible({ timeout: 2_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'ai-settings-validation-error.png'),
    fullPage: true,
  });
});

// ── 3. Valid save → success toast with version number ───────────────────────

test('valid config save shows success toast with version number', async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto('/admin/ai-settings');
  await expect(page.getByText('System prompts')).toBeVisible({ timeout: 15_000 });

  // Set a valid baseSystemPrompt (required field)
  const basePromptTextarea = page.getByLabel(/Base system prompt/i);
  await basePromptTextarea.fill('You are a helpful study assistant for Brazilian students.');

  // Set a valid maxTokens value (within bounds)
  const maxTokensInput = page.getByLabel(/Max tokens/i);
  await maxTokensInput.fill('4096');

  // Click save
  await page.getByRole('button', { name: /Save configuration/i }).click();

  // Success toast should appear with "version" in the title
  await expect(page.getByText(/AI config saved/i)).toBeVisible({ timeout: 15_000 });
  // The toast title includes "version N"
  await expect(page.getByText(/version \d+/i)).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'ai-settings-save-success.png'),
    fullPage: true,
  });
});

// ── 4. Version history panel shows ≥1 row after save ────────────────────────

test('version history panel shows at least one row', async ({ page }) => {
  await signInAsAdmin(page);

  await page.goto('/admin/ai-settings');
  await expect(page.getByText('System prompts')).toBeVisible({ timeout: 15_000 });

  // Save a config first to ensure at least one version exists
  const basePromptTextarea = page.getByLabel(/Base system prompt/i);
  await basePromptTextarea.fill('You are a study assistant.');
  await page.getByLabel(/Max tokens/i).fill('4096');
  await page.getByRole('button', { name: /Save configuration/i }).click();
  await expect(page.getByText(/AI config saved/i)).toBeVisible({ timeout: 15_000 });

  // Expand version history
  const historyToggle = page.getByRole('button', { name: /Version history/i });
  await historyToggle.click();

  // Wait for version rows to load — look for "v1" or any "v\d+" text
  await expect(page.getByText(/^v\d+$/m).first()).toBeVisible({ timeout: 10_000 });

  // A "Restore" button should be visible in the version list
  await expect(page.getByRole('button', { name: 'Restore' }).first()).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'ai-settings-version-history.png'),
    fullPage: true,
  });
});
