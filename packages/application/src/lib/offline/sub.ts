import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Returns the Cognito user sub for the currently signed-in user, or null if
 * signed out or if the session cannot be resolved (e.g. offline). Reads from
 * Amplify local storage — works without a network round-trip.
 */
export async function getCurrentUserSub(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    const sub = session.tokens?.idToken?.payload?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}
