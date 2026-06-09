import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing page has no critical a11y violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).analyze();

  const criticalViolations = results.violations.filter(
    (v) => v.impact === 'critical',
  );

  expect(
    criticalViolations,
    JSON.stringify(criticalViolations, null, 2),
  ).toEqual([]);
});
