import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserProfileBySub, ensureActiveProfile, type UserProfileItem } from '@transformmynotes/core';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { gateDecision } from '@/lib/gate-decision';

/**
 * Server-side gate for authed routes. Verifies the Cognito ID token, loads the
 * UserData profile, and either allows or self-provisions the user:
 *   - Redirects to /login if no/invalid token is present.
 *   - Redirects to /login if the profile is explicitly 'disabled'.
 *   - If the profile is missing or 'pending', self-provisions an active profile
 *     (role is derived from the Cognito 'admin' group membership).
 *   - Returns the active profile on success.
 *
 * The Cognito pool is invite/admin-only — every authenticated user was
 * deliberately created by an admin, so any valid token grants access. Disabled
 * users are also blocked by Cognito at sign-in, so the 'blocked' case here is a
 * belt-and-suspenders guard only. Never redirects to /pending — that screen is
 * solely the confirmation page after a "Request Access" form submission.
 *
 * Node runtime only (reads DynamoDB) — never import this from middleware/proxy.ts
 * (it pulls the AWS SDK, not Edge-safe).
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
  const decision = gateDecision(profile?.status ?? null);

  if (decision === 'allow') {
    return profile!;
  }

  if (decision === 'blocked') {
    redirect('/login');
  }

  // decision === 'provision': profile is missing or pending — self-provision an active profile.
  const email = typeof claims!.email === 'string' ? claims!.email : '';
  const name = typeof claims!.name === 'string' ? claims!.name : sub;
  const role = adminUser ? 'admin' : 'member';
  return ensureActiveProfile({ sub, email, name, role });
}
