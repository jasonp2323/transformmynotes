import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MARKETING_ROUTES = ['/', '/changelog'];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Scan with reduced motion (legit user path) AND explicitly settle the
// scroll-reveal so axe measures the final, fully-opaque resting state. The
// landing page fades `[data-reveal]` ancestors in (opacity 0 → 1 via an
// IntersectionObserver-added `.is-in`); if axe samples before that settles it
// measures partially-transparent text blended toward the background, producing
// flaky false-positive color-contrast violations. `settle()` freezes all
// transitions/animations and forces the revealed state, so the assertion
// reflects true resting contrast.
test.use({ reducedMotion: 'reduce' });

async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-reveal]')
      .forEach((el) => el.classList.add('is-in'));
  });
  await page.addStyleTag({
    content: `*, *::before, *::after { transition: none !important; animation: none !important; }
              [data-reveal] { opacity: 1 !important; transform: none !important; }`,
  });
  // One frame for the forced styles to paint before axe samples colors.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => r(null))),
  );
}

for (const route of MARKETING_ROUTES) {
  test(`${route} has no critical or serious a11y violations`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await settle(page);

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
