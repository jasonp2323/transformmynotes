import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';

/**
 * Returns the authenticated Cognito `sub` and verified claims if the caller is
 * an admin, or null otherwise.
 *
 * For admin API routes — callers MUST return 403 JSON on null:
 *   `if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });`
 *
 * Returns null when:
 *   - No `CognitoIdToken` cookie is present.
 *   - The token is invalid or verification throws.
 *   - The verified claims do not include the `admin` Cognito group.
 */
export async function getAdminApiUser(): Promise<{ sub: string; claims: Record<string, unknown> } | null> {
  const token = cookies().get('CognitoIdToken')?.value;
  if (!token) return null;

  try {
    const claims = await verifyIdToken(token);
    const sub = claims.sub;
    if (typeof sub !== 'string' || !sub) return null;
    if (!isAdmin(claims)) return null;
    return { sub, claims };
  } catch {
    return null;
  }
}
