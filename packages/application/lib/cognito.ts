/**
 * Server-side Cognito wrapper for auth routes.
 *
 * Builds ONE CognitoIdentityProviderClient per module lifetime, mirroring the
 * endpoint/region resolution used by the invite-redeem route so that offline
 * cognito-local (set via AWS_ENDPOINT_URL_COGNITO_IDENTITY_PROVIDER) works in
 * E2E and integration tests.
 *
 * The app client id is read from NEXT_PUBLIC_COGNITO_CLIENT_ID — a public value
 * (no secret), exposed via NEXT_PUBLIC_ just like in infra/auth.ts.
 *
 * Cognito SDK exceptions propagate unchanged — callers map them to HTTP responses.
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AuthFlowType,
  ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';

function getClientId(): string {
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'NEXT_PUBLIC_COGNITO_CLIENT_ID is not set — Cognito client id must be available.',
    );
  }
  return clientId;
}

// Build the client lazily so env vars are read at request time (Next.js may
// import the module before the child-process env is fully set in dev).
let _client: CognitoIdentityProviderClient | null = null;

function getCognitoClient(): CognitoIdentityProviderClient {
  if (!_client) {
    // AWS SDK v3 picks up AWS_ENDPOINT_URL_COGNITO_IDENTITY_PROVIDER automatically,
    // which is what the E2E global-setup sets to point at cognito-local.
    _client = new CognitoIdentityProviderClient({});
  }
  return _client;
}

// Exported for testing — lets unit tests reset the cached client.
export function _resetCognitoClient(): void {
  _client = null;
}

/**
 * Sign in with email + password via USER_PASSWORD_AUTH.
 *
 * Returns `{ idToken }` on success or `{ challenge: 'NEW_PASSWORD_REQUIRED', session }`
 * when Cognito demands a password change (first-time login after admin creation).
 */
export async function initiateAuth(
  email: string,
  password: string,
): Promise<{ idToken: string } | { challenge: 'NEW_PASSWORD_REQUIRED'; session: string }> {
  const client = getCognitoClient();
  const clientId = getClientId();

  const res = await client.send(
    new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  );

  if (res.AuthenticationResult?.IdToken) {
    return { idToken: res.AuthenticationResult.IdToken };
  }

  if (res.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED) {
    if (!res.Session) {
      throw new Error('[cognito] NEW_PASSWORD_REQUIRED challenge missing Session');
    }
    return { challenge: 'NEW_PASSWORD_REQUIRED', session: res.Session };
  }

  throw new Error(`[cognito] Unhandled challenge: ${res.ChallengeName ?? '(none)'}`);
}

/**
 * Complete a NEW_PASSWORD_REQUIRED challenge to set the user's permanent password.
 * Returns `{ idToken }` on success.
 */
export async function respondNewPassword(
  email: string,
  newPassword: string,
  session: string,
): Promise<{ idToken: string }> {
  const client = getCognitoClient();
  const clientId = getClientId();

  const res = await client.send(
    new RespondToAuthChallengeCommand({
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      ClientId: clientId,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
      },
      Session: session,
    }),
  );

  if (!res.AuthenticationResult?.IdToken) {
    throw new Error('[cognito] respondNewPassword: no IdToken in response');
  }

  return { idToken: res.AuthenticationResult.IdToken };
}

/**
 * Trigger a forgot-password flow — Cognito sends a verification code to the
 * user's email. Errors propagate (callers swallow them for no-enumeration).
 */
export async function forgotPassword(email: string): Promise<void> {
  const client = getCognitoClient();
  const clientId = getClientId();

  await client.send(
    new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
    }),
  );
}

/**
 * Confirm a forgot-password reset with the verification code and new password.
 */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const client = getCognitoClient();
  const clientId = getClientId();

  await client.send(
    new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }),
  );
}
