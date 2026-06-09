import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';

/**
 * Returns the authenticated Cognito `sub`, or null if no/invalid token.
 * For API routes — callers return 401 JSON on null (does NOT redirect).
 */
export async function getAuthenticatedSub(): Promise<string | null> {
  const token = cookies().get('CognitoIdToken')?.value;
  if (!token) return null;

  try {
    const claims = await verifyIdToken(token);
    const sub = claims.sub;
    if (typeof sub !== 'string' || !sub) return null;
    return sub;
  } catch {
    return null;
  }
}
