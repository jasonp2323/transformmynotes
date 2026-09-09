/**
 * M18.3 account voice-selector verification (opt-in `[E2E]` authed application suite).
 *
 * Reuses the offline authed harness (dynalite + cognito-local + s3rver) wired by
 * global-setup. Signs in headlessly on a DESKTOP viewport, confirms the desktop
 * sidebar "Account settings" link navigates to /account, then exercises the
 * VoiceSelector Save flow: Save is disabled at baseline, enables on a voice
 * change, persists `tts.voiceId` to localStorage on Save, shows the "Voice saved"
 * confirmation, and returns to disabled.
 */

import { test, expect } from '@playwright/test';
import { readRuntime, installSrpBypass } from './helpers';

test.describe('M18.3 account voice selector (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function signIn(page: import('@playwright/test').Page) {
    const runtime = readRuntime();
    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.reviewUsername.toLowerCase()]: runtime.reviewPassword,
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.reviewUsername);
    await page.getByLabel('Password').first().fill(runtime.reviewPassword);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }

  test('desktop sidebar Account link works and voice Save persists Thiago', async ({ page }) => {
    await signIn(page);

    // ── Desktop sidebar "Account settings" link ──
    const accountLink = page
      .locator('div.md\\:flex')
      .getByRole('link', { name: 'Account settings' });
    await expect(accountLink).toBeVisible({ timeout: 10_000 });
    await accountLink.click();
    await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });

    // ── Voice selector radiogroup ──
    // AppShell renders BOTH a MobileShell and a DesktopShell with the same
    // children, toggled purely by Tailwind (`md:hidden` / `hidden md:flex`).
    // So the account content (incl. the VoiceSelector) exists twice in the DOM;
    // at this desktop viewport only the DesktopShell copy is actually visible
    // (the mobile wrapper is `display:none`). Scope to the visible desktop
    // wrapper so role queries don't trip strict mode on the hidden duplicate.
    const main = page.locator('div.md\\:flex').getByRole('main');
    const radiogroup = main.getByRole('radiogroup', { name: 'Pronunciation voice' });
    await expect(radiogroup).toBeVisible({ timeout: 10_000 });
    const thiago = radiogroup.getByRole('radio', { name: 'Thiago' });
    await expect(thiago).toBeVisible();

    // ── Save disabled at baseline ──
    // Wait for the VoiceSelector's mount effect to sync state from localStorage
    // (it initialises `pending`/`saved` to the stored voice, default Camila)
    // before interacting — otherwise a click can race the effect, which would
    // reset `pending` back to the baseline and leave Save disabled.
    //
    // Scoped to the radiogroup's own immediate next sibling <button>, NOT
    // `main.getByRole('button', { name: 'Save' })`. The account page also
    // renders AiProfileSection ("AI environment"), which has its own "Save"
    // button and only appears once its `/api/profile/ai` fetch resolves.
    // That's unrelated to the Mobile/Desktop shell duplication (already
    // handled by scoping to `main` above) — it's a second, independent
    // "Save"-labelled button inside the SAME visible desktop shell. Under
    // React 19 / Next 16 the account page hydrates and that fetch resolves
    // fast enough that the two locators race: `main.getByRole('button', {
    // name: 'Save' })` intermittently matches both buttons and trips
    // Playwright strict mode. VoiceSelector renders its Save button as the
    // radiogroup's next sibling (see VoiceSelector.tsx), so anchor off that
    // instead of the ambiguous accessible name.
    const saveBtn = radiogroup.locator('xpath=following-sibling::button[1]');
    await expect(radiogroup.getByRole('radio', { name: 'Camila' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(saveBtn).toBeDisabled();

    // ── Change voice → Save enables ──
    // The account page is reached via a Next.js soft (client-side) navigation
    // from the sidebar; the VoiceSelector's onClick handler can attach a tick
    // after the button is rendered/visible, so a single click occasionally
    // lands before React wires it up. Click until the selection actually takes
    // (this exercises the real handler — it does not mask a product bug; the
    // component reliably selects once its handler is attached).
    await expect(async () => {
      await thiago.click();
      await expect(thiago).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await expect(saveBtn).toBeEnabled();

    // Evidence screenshot: Thiago selected, Save enabled.
    await page.screenshot({ path: 'docs/verification/m18-3-account-voice.png' });

    // ── Save → confirmation, persists, returns to disabled ──
    await saveBtn.click();
    await expect(page.getByText('Voice saved').first()).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeDisabled();

    const v = await page.evaluate(() => localStorage.getItem('tts.voiceId'));
    expect(v).toBe('Thiago');
  });
});
