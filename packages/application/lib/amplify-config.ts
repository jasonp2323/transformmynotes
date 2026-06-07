'use client';
import { Amplify } from 'aws-amplify';

export function configureAmplify() {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (!userPoolId || !userPoolClientId) return;
  Amplify.configure(
    { Auth: { Cognito: { userPoolId, userPoolClientId } } },
    { ssr: true },
  );
}
