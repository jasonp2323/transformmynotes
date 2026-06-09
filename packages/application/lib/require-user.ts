import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserProfileBySub, type UserProfileItem } from '@transformmynotes/core';
import { verifyIdToken } from '@/lib/verify-id-token';

/**
 * Server-side gate for notebook routes. Verifies the Cognito ID token, loads the
 * UserData profile, and redirects:
 *   - to /login if no/invalid token
 *   - to /pending if the profile is missing or status !== 'active'
 * Returns the active profile on success. Node runtime only (reads DynamoDB) —
 * never import this from middleware/proxy.ts (it pulls the AWS SDK, not Edge-safe).
 */
export async function requireActiveUser(): Promise<UserProfileItem> {
  const token = cookies().get('CognitoIdToken')?.value;
  if (!token) redirect('/login');

  let sub: string;
  try {
    const claims = await verifyIdToken(token!);
    sub = claims.sub as string;
  } catch {
    redirect('/login');
  }

  const profile = await getUserProfileBySub(sub!);
  if (!profile || profile.status !== 'active') redirect('/pending');
  return profile!;
}
