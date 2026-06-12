import { test, expect } from '@playwright/test';

test('marketing index response includes required security headers', async ({ page }) => {
  // Navigate to the landing page and capture the main document response.
  // Playwright lowercases all response header names, so comparisons are case-insensitive
  // by design. We assert the three most critical security response headers that must be
  // present on every response from the marketing app.
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);

  const headers = response?.headers() ?? {};

  // X-Frame-Options must be DENY to prevent clickjacking.
  expect(headers['x-frame-options']).toBe('DENY');

  // X-Content-Type-Options must be nosniff to prevent MIME-type sniffing attacks.
  expect(headers['x-content-type-options']).toBe('nosniff');

  // Strict-Transport-Security must be present with the required max-age.
  // The exact value also includes includeSubDomains and preload directives,
  // but we assert the core max-age here for stability across future tweaks.
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
});
