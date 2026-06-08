/**
 * Authed application E2E suite.
 *
 * Runs against an offline stack: dynalite + cognito-local + next dev.
 * All services are started by global-setup.ts. Runtime values (pool id,
 * client id, credentials) are read from .e2e-runtime.json written by setup.
 */

import { test, expect } from '@playwright/test';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import fs from 'node:fs';
import path from 'node:path';

interface Runtime {
  poolId: string;
  clientId: string;
  username: string;
  password: string;
  cognitoEndpoint: string;
}

function readRuntime(): Runtime {
  const runtimePath = path.join(__dirname, '.e2e-runtime.json');
  return JSON.parse(fs.readFileSync(runtimePath, 'utf-8')) as Runtime;
}

test.describe.serial('dashboard auth', () => {
  let runtime: Runtime;
  let idToken: string;

  test.beforeAll(async () => {
    runtime = readRuntime();

    // Mint an ID token via headless InitiateAuth (USER_PASSWORD_AUTH flow).
    const cognitoClient = new CognitoIdentityProviderClient({
      endpoint: runtime.cognitoEndpoint,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });

    const authResp = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: runtime.clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: runtime.username,
          PASSWORD: runtime.password,
        },
      }),
    );

    idToken = authResp.AuthenticationResult!.IdToken!;
    cognitoClient.destroy();
  });

  test('authenticated user sees dashboard', async ({ page, context }) => {
    // Inject the Cognito ID token as a cookie before navigating.
    await context.addCookies([
      {
        name: 'CognitoIdToken',
        value: idToken,
        url: 'http://localhost:3002',
      },
    ]);

    await page.goto('/dashboard');

    // The dashboard renders "Welcome, {email}" — assert the heading is present.
    await expect(page.getByRole('heading')).toContainText('Welcome');
    await expect(page.getByRole('heading')).toContainText(runtime.username);
  });

  test('unauthenticated user is redirected to login', async ({ page, context }) => {
    await context.clearCookies();

    await page.goto('/dashboard');

    // Middleware should redirect to /auth/login.
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
