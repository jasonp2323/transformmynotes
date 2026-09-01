import { test, expect } from '@playwright/test';

test('unknown routes redirect to homepage', async ({ page }) => {
  // Collect console errors before navigating so no early messages are missed.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/this-route-does-not-exist');
  await page.waitForLoadState('networkidle');

  // The not-found handler should redirect to the homepage.
  expect(new URL(page.url()).pathname).toBe('/');

  // The hero headline is present, confirming we're on the homepage.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/transform/i);

  // No console errors should fire during the redirect and load.
  expect(consoleErrors, `console errors: ${consoleErrors.join(', ')}`).toEqual([]);
});
