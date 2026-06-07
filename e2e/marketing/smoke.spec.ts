import { test, expect } from '@playwright/test';

test('homepage smoke test', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/TransformMyNotes/);

  const requestAccessLink = page.getByRole('link', { name: 'Request access' });
  await expect(requestAccessLink).toBeVisible();
});
