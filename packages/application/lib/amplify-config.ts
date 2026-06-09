'use client';
import { Amplify } from 'aws-amplify';
import { buildAmplifyAuthConfig } from './amplify-config-builder';

/**
 * Configure Amplify Auth on the client from the public Cognito env vars.
 * `NEXT_PUBLIC_COGNITO_ENDPOINT` (optional) points Amplify at a local
 * cognito-local emulator for offline dev/E2E; unset in deployed stages.
 */
export function configureAmplify() {
  const auth = buildAmplifyAuthConfig({
    userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    endpoint: process.env.NEXT_PUBLIC_COGNITO_ENDPOINT,
  });
  if (!auth) return;
  Amplify.configure({ Auth: auth }, { ssr: true });
}
