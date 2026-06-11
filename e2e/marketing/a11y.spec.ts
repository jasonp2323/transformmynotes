import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MARKETING_ROUTES = ['/', '/changelog'];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const route of MARKETING_ROUTES) {
  test(`${route} has no critical or serious a11y violations`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

    const actionableViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(
      actionableViolations,
      actionableViolations
        .map((v) => `[${v.impact}] ${v.id}: ${v.description}`)
        .join('\n'),
    ).toHaveLength(0);
  });
}
