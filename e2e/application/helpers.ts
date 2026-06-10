/**
 * Shared E2E helpers for the authed application suite.
 *
 * Provides:
 *  - `Runtime` interface (all fields from .e2e-runtime.json)
 *  - `readRuntime()` to load the runtime file written by global-setup
 *  - `installSrpBypass()` to bridge Amplify's USER_SRP_AUTH to cognito-local's
 *    USER_PASSWORD_AUTH via a page.route() interceptor
 */

import { type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Runtime interface — extends as new services/users are seeded in global-setup
// ---------------------------------------------------------------------------

export interface Runtime {
  // ── Core pool ──
  poolId: string;
  clientId: string;
  cognitoEndpoint: string;

  // ── Primary test user ──
  username: string;
  password: string;

  // ── Invite test data ──
  inviteCode: string;
  inviteEmail: string;

  // ── Forgot-password test user ──
  forgotUsername: string;
  forgotInitialPassword: string;
  forgotNewPassword: string;

  // ── Admin user ──
  adminUsername: string;
  adminPassword: string;

  // ── Pending users (for admin pending-queue tests) ──
  pendingUser1: { email: string; password: string; sub: string };
  pendingUser2: { email: string; password: string; sub: string };

  // ── Seeded revokable invite ──
  revokableInvite: { label: string; codeHash: string };
}

// ---------------------------------------------------------------------------
// readRuntime
// ---------------------------------------------------------------------------

export function readRuntime(): Runtime {
  const runtimePath = path.join(__dirname, '.e2e-runtime.json');
  return JSON.parse(fs.readFileSync(runtimePath, 'utf-8')) as Runtime;
}

// ---------------------------------------------------------------------------
// installSrpBypass
// ---------------------------------------------------------------------------

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
export async function installSrpBypass(
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
