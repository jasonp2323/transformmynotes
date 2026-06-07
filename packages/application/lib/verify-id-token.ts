/**
 * Memoized JWT verifier for Cognito ID tokens.
 *
 * In production (no COGNITO_JWKS_URI set): uses CognitoJwtVerifier which
 * resolves keys from the real AWS endpoint (HTTPS required by aws-jwt-verify).
 *
 * In offline E2E mode (COGNITO_JWKS_URI set): uses jose + createRemoteJWKSet
 * which uses the Web Fetch API and therefore supports plain HTTP, allowing
 * the cognito-local emulator to be reached at http://127.0.0.1:9229/… .
 *
 * The verifier is built lazily on the first call so that env vars are read
 * at request time, not at module import time (important for Next.js where the
 * module may be imported before the child process env is fully set).
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';

type AnyVerifier = {
  verify(token: string): Promise<Record<string, unknown>>;
};

let cachedVerifier: AnyVerifier | null = null;

async function buildOfflineVerifier(
  issuer: string,
  audience: string,
  jwksUri: string,
): Promise<AnyVerifier> {
  // jose is fully Web Crypto compatible and supports HTTP JWKS endpoints.
  // It is a transitive dependency (via aws-amplify) so it is always present.
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  return {
    verify: async (token: string) => {
      const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
      return payload as Record<string, unknown>;
    },
  };
}

async function buildVerifier(): Promise<AnyVerifier> {
  const jwksUri = process.env.COGNITO_JWKS_URI;

  if (jwksUri) {
    // Offline / E2E mode: use jose so HTTP JWKS endpoints are supported.
    const issuer = process.env.COGNITO_ISSUER;
    const audience = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    if (!issuer || !audience) {
      throw new Error(
        'Missing COGNITO_ISSUER / NEXT_PUBLIC_COGNITO_CLIENT_ID — required when COGNITO_JWKS_URI is set (offline E2E mode).',
      );
    }
    return buildOfflineVerifier(issuer, audience, jwksUri);
  }

  // Production mode: use CognitoJwtVerifier against real AWS.
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      'Missing NEXT_PUBLIC_COGNITO_USER_POOL_ID / NEXT_PUBLIC_COGNITO_CLIENT_ID — Cognito binding not set.',
    );
  }
  return CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' }) as AnyVerifier;
}

let verifierPromise: Promise<AnyVerifier> | null = null;

function getVerifierPromise(): Promise<AnyVerifier> {
  if (!verifierPromise) {
    verifierPromise = buildVerifier().catch((err) => {
      // Reset so a subsequent call can retry if env wasn't ready yet.
      verifierPromise = null;
      throw err;
    });
  }
  return verifierPromise;
}

/**
 * Verify a Cognito ID token and return the verified claims.
 * Throws if the token is invalid or the required env vars are missing.
 */
export async function verifyIdToken(token: string): Promise<Record<string, unknown>> {
  const verifier = await getVerifierPromise();
  return verifier.verify(token);
}
