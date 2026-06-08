import { test, expect } from '@playwright/test';

test('homepage smoke test', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/TransformMyNotes/);

  // The hero headline is the page's single <h1>.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/transformed/i);

  // "Request access" appears in both the header and the hero CTA — scope to the
  // hero section (#top) to assert the primary CTA links to the app sign-up.
  const heroRequestAccess = page
    .locator('#top')
    .getByRole('link', { name: 'Request access' });
  await expect(heroRequestAccess).toBeVisible();
  await expect(heroRequestAccess).toHaveAttribute(
    'href',
    'https://app.transformmynotes.com/signup',
  );

  // The hero "Sign in" CTA links to the app login.
  const heroSignIn = page.locator('#top').getByRole('link', { name: 'Sign in' });
  await expect(heroSignIn).toHaveAttribute(
    'href',
    'https://app.transformmynotes.com/login',
  );
});
