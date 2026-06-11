import { test, expect } from '@playwright/test';

test('landing page HTML is not stale-cached', async ({ page }) => {
  // Navigate to the landing page and capture the main document response.
  // We need to ensure that server-rendered HTML is not cached as immutable
  // but is instead dynamically revalidated by the CDN. Only hashed /assets
  // and /_next/static resources are immutable and should be cached long-term.
  const response = await page.goto('/');

  // Assert the response status is 200 (successful).
  expect(response?.status()).toBe(200);

  // Read the Cache-Control header from the main document response.
  const cacheControl = response?.headers()['cache-control'];

  // The HTML document must not be served with a stale/long-lived cache.
  // It should either:
  // - Be absent (acceptable for local dev server without caching)
  // - Contain no-store, no-cache, max-age=0, or must-revalidate
  // It must NOT:
  // - Contain 'immutable' (would freeze stale HTML at the CDN)
  // - Contain a large max-age without revalidation directives
  if (cacheControl) {
    expect(
      cacheControl,
      'HTML should not be immutable; must allow revalidation by CDN',
    ).not.toContain('immutable');

    // Ensure either no max-age, or max-age with revalidation, or explicit no-cache.
    const hasNoCache = cacheControl.includes('no-cache');
    const hasMustRevalidate = cacheControl.includes('must-revalidate');
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null;

    // If max-age is present, it should be 0 or small, or paired with revalidation.
    if (maxAge !== null && maxAge > 0) {
      expect(
        hasMustRevalidate || hasNoCache,
        'Large max-age must be paired with must-revalidate or no-cache',
      ).toBe(true);
    }
  }
  // If cacheControl header is absent (e.g., local next dev), that is acceptable.
});
