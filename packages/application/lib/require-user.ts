import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserProfileBySub, ensureActiveAdminProfile, type UserProfileItem } from '@transformmynotes/core';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { gateDecision } from '@/lib/gate-decision';

/**
 * Server-side gate for notebook routes. Verifies the Cognito ID token, loads the
 * UserData profile, and redirects:
 *   - to /login if no/invalid token
 *   - to /pending if the profile is missing or status !== 'active' (non-admin only)
 *
 * Admins (Cognito group 'admin') are never redirected to /pending. If an admin
 * has no active profile, one is self-provisioned automatically.
 *
 * Returns the active profile on success. Node runtime only (reads DynamoDB) —
 * never import this from middleware/proxy.ts (it pulls the AWS SDK, not Edge-safe).
 */
export async function requireActiveUser(): Promise<UserProfileItem> {
  const token = cookies().get('CognitoIdToken')?.value;
  if (!token) redirect('/login');

  let claims: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    claims = await verifyIdToken(token!);
  } catch {
    redirect('/login');
  }

  const sub = claims!.sub as string;
  const adminUser = isAdmin(claims!);

  const profile = await getUserProfileBySub(sub);
  const decision = gateDecision(profile?.status ?? null, adminUser);

  if (decision === 'allow') {
    return profile!;
  }

  if (decision === 'provision-admin') {
    const email = typeof claims!.email === 'string' ? claims!.email : '';
    const name = typeof claims!.name === 'string' ? claims!.name : sub;
    return ensureActiveAdminProfile({ sub, email, name });
  }

  // decision === 'pending'
  redirect('/pending');
}
