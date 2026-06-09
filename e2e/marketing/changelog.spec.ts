import { test, expect } from '@playwright/test';

test('changelog page', async ({ page }) => {
  // Collect console errors and page errors before navigating so no early
  // messages are missed.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/changelog');
  await page.waitForLoadState('networkidle');

  // The page must have the "Changelog" <h1> visible.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/changelog/i);

  // The footer "What's new" link to /changelog must be present.
  const footerChangelogLink = page
    .locator('footer')
    .getByRole('link', { name: /what.s new/i });
  await expect(footerChangelogLink).toBeVisible();
  await expect(footerChangelogLink).toHaveAttribute('href', '/changelog');

  // No console errors should fire during page load (covers the empty-state path
  // when api.github.com is unreachable offline).
  expect(consoleErrors, `console errors: ${consoleErrors.join(', ')}`).toEqual([]);
});
