/**
 * Authed application E2E suite.
 *
 * Runs against an offline stack: dynalite + cognito-local + next dev.
 * All services are started by global-setup.ts. Runtime values (pool id,
 * client id, credentials) are read from .e2e-runtime.json written by setup.
 *
 * The four auth flows tested:
 *  1. Login → /dashboard
 *  2. Unauthenticated redirect to /login
 *  3. Request-access → /pending
 *  4. Invite-accept → /dashboard
 *  5. Forgot-password round-trip → reset → re-login → /dashboard
 *
 * SRP bypass:
 *   cognito-local does not support USER_SRP_AUTH (Amplify's default signIn flow).
 *   We use page.route() to intercept InitiateAuth calls from the browser: when
 *   USER_SRP_AUTH is seen, we make a direct USER_PASSWORD_AUTH call to cognito-local
 *   from Node (where we know the plaintext password) and return the AuthenticationResult
 *   directly to Amplify — which accepts a direct result from InitiateAuth without
 *   going through the PASSWORD_VERIFIER challenge.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

interface Runtime {
  poolId: string;
  clientId: string;
  username: string;
  password: string;
  cognitoEndpoint: string;
  inviteCode: string;
  inviteEmail: string;
  forgotUsername: string;
  forgotInitialPassword: string;
  forgotNewPassword: string;
}

function readRuntime(): Runtime {
  const runtimePath = path.join(__dirname, '.e2e-runtime.json');
  return JSON.parse(fs.readFileSync(runtimePath, 'utf-8')) as Runtime;
}

const SCREENSHOTS_DIR = path.join(__dirname, '../../docs/verification/m2-auth');

/**
 * Installs a route interceptor on the given page that proxies
 * USER_SRP_AUTH InitiateAuth requests through USER_PASSWORD_AUTH.
 *
 * cognito-local does not implement the SRP protocol — it only supports
 * USER_PASSWORD_AUTH. Amplify defaults to USER_SRP_AUTH. This interceptor
 * bridges the two: when the browser's Amplify sends a USER_SRP_AUTH
 * InitiateAuth, we call cognito-local from Node with USER_PASSWORD_AUTH
 * (where we know the plaintext credentials) and return the tokens directly.
 * Amplify handles a direct AuthenticationResult from InitiateAuth without
 * needing the PASSWORD_VERIFIER round-trip.
 *
 * This is purely test-layer code and does not modify any production app file.
 */
async function installSrpBypass(
  page: Page,
  cognitoEndpoint: string,
  clientId: string,
  /** Map from username (lower-cased) → plaintext password, for all users that
   *  may sign in during this page's lifetime. */
  credentials: Record<string, string>,
) {
  await page.route(
    (url) => url.href.startsWith(cognitoEndpoint),
    async (route, request) => {
      const xTarget = request.headers()['x-amz-target'] ?? '';
      if (xTarget !== 'AWSCognitoIdentityProviderService.InitiateAuth') {
        // Pass all other requests (e.g. ForgotPassword, ConfirmForgotPassword) through unchanged.
        await route.continue();
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      } catch {
        await route.continue();
        return;
      }

      if (body['AuthFlow'] !== 'USER_SRP_AUTH') {
        // Already USER_PASSWORD_AUTH or something else — pass through.
        await route.continue();
        return;
      }

      // Extract username from the SRP auth parameters.
      const authParams = (body['AuthParameters'] ?? {}) as Record<string, string>;
      const username = authParams['USERNAME'] ?? '';
      const password = credentials[username.toLowerCase()] ?? credentials[username];

      if (!password) {
        // Unknown user — let Amplify fail naturally.
        await route.continue();
        return;
      }

      // Make a direct USER_PASSWORD_AUTH call from Node (not the browser) so
      // cognito-local sees the plaintext credentials it supports.
      try {
        const resp = await fetch(cognitoEndpoint + '/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          },
          body: JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: clientId,
            AuthParameters: { USERNAME: username, PASSWORD: password },
          }),
        });
        const data = await resp.json() as unknown;

        // Return the result to the browser, preserving the status code.
        await route.fulfill({
          status: resp.status,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify(data),
        });
      } catch (err) {
        // Network failure on our side — let Amplify try its own path.
        console.error('[srp-bypass] fetch failed:', err);
        await route.continue();
      }
    },
  );
}

// ── 1. Login → /dashboard ─────────────────────────────────────────────────────

test('login lands on dashboard', async ({ page }) => {
  const runtime = readRuntime();

  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.username.toLowerCase()]: runtime.password,
  });

  await page.goto('/login');

  await page.getByLabel('Email').fill(runtime.username);
  // getByLabel('Password') is ambiguous (also matches the "Show password" toggle button) — use first()
  await page.getByLabel('Password').first().fill(runtime.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // There are two h1 elements on the dashboard (shell title + content heading);
  // target the one that contains "Welcome back".
  const heading = page.getByRole('heading', { level: 1, name: /Welcome back/i });
  await expect(heading).toContainText('Welcome back');
  await expect(heading).toContainText(runtime.username);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'login-dashboard.png'), fullPage: true });
});

// ── 2. Unauthenticated redirect ───────────────────────────────────────────────

test('unauthenticated user is redirected to login', async ({ page, context }) => {
  await context.clearCookies();

  await page.goto('/dashboard');

  // proxy.ts redirects to /login (not /auth/login)
  await expect(page).toHaveURL(/\/login/);
});

// ── 3. Request-access → /pending ──────────────────────────────────────────────

test('request access lands on pending', async ({ page }) => {
  // Use a unique email to avoid any potential duplicate conflicts
  const testEmail = `requestor-${Date.now()}@example.com`;

  await page.goto('/request-access');

  await page.getByLabel('Full name').fill('E2E Tester');
  await page.getByLabel('Email').fill(testEmail);
  await page.getByRole('button', { name: 'Request access' }).click();

  await expect(page).toHaveURL(/\/pending/, { timeout: 15_000 });

  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('Your request is in');

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'request-access-pending.png'), fullPage: true });
});

// ── 4. Invite-accept → /dashboard ────────────────────────────────────────────

test('invite accept creates account and lands on dashboard', async ({ page }) => {
  const runtime = readRuntime();
  const invitePassword = 'Test1234!Password';

  // The invite page auto-signs-in via Amplify after redeem. Set up the SRP bypass
  // for the invitee's email and the password they will choose on the form.
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.inviteEmail.toLowerCase()]: invitePassword,
  });

  await page.goto(`/invite?code=${runtime.inviteCode}&email=${encodeURIComponent(runtime.inviteEmail)}`);

  // Wait for the validation to complete and form to appear
  await page.getByRole('button', { name: 'Accept & create account' }).waitFor({ timeout: 15_000 });

  await page.getByLabel('Full name').fill('E2E Invitee');
  await page.getByLabel('Create password').fill(invitePassword);
  await page.getByRole('button', { name: 'Accept & create account' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'invite-accept-dashboard.png'), fullPage: true });
});

// ── 5. Forgot-password round-trip ─────────────────────────────────────────────

test('forgot password reset round-trip', async ({ page }) => {
  const runtime = readRuntime();

  // Step 1: Request reset code
  await page.goto('/forgot-password');

  await page.getByLabel('Email').fill(runtime.forgotUsername);
  await page.getByRole('button', { name: 'Send reset code' }).click();

  await expect(page).toHaveURL(/\/reset-password/, { timeout: 15_000 });

  // Step 2: Submit the deterministic OTP code + new password
  await page.getByLabel('Verification code').fill('123456');
  await page.getByLabel('New password').fill(runtime.forgotNewPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();

  // Expect success message
  await expect(page.getByText('Password reset successfully')).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'forgot-password.png'), fullPage: true });

  // Step 3: Wait for redirect to /login
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

  // Step 4: Sign in with the NEW password to prove the reset persisted.
  // The page navigation cleared the SRP bypass; reinstall it for the new password.
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.forgotUsername.toLowerCase()]: runtime.forgotNewPassword,
  });

  await page.getByLabel('Email').fill(runtime.forgotUsername);
  // getByLabel('Password') is ambiguous — use first()
  await page.getByLabel('Password').first().fill(runtime.forgotNewPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});
