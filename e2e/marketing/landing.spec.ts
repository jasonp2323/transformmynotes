import { test, expect } from '@playwright/test';

test('landing page', async ({ page }) => {
  // Collect console errors before navigating so no early messages are missed.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveTitle(/TransformMyNotes/);

  // The hero headline is the page's single <h1> and must contain "transform".
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/transform/i);

  // The logo is rendered as an <img alt="TransformMyNotes"> by the Header.
  // (The footer also renders the wordmark, so scope this to the banner/header.)
  await expect(
    page.getByRole('banner').getByRole('img', { name: 'TransformMyNotes' }),
  ).toBeVisible();

  // "Request access" appears in both the header and the hero CTA — scope to the
  // hero section (#top) to assert the primary CTA links to the request-access form.
  const heroRequestAccess = page
    .locator('#top')
    .getByRole('link', { name: 'Request access' });
  await expect(heroRequestAccess).toBeVisible();
  await expect(heroRequestAccess).toHaveAttribute(
    'href',
    'https://app.transformmynotes.com/request-access',
  );

  // The hero "Sign in" CTA links to the app login.
  const heroSignIn = page.locator('#top').getByRole('link', { name: 'Sign in' });
  await expect(heroSignIn).toHaveAttribute(
    'href',
    'https://app.transformmynotes.com/login',
  );

  // No console errors should fire during page load.
  expect(consoleErrors, `console errors: ${consoleErrors.join(', ')}`).toEqual([]);
});
