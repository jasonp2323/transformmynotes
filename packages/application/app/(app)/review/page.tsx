import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { AppShell } from '@/src/components/shells';
import { ReviewDeck } from '@/src/components/review/ReviewDeck';
import { getPendingAccessRequestCount } from '@/lib/pending-count';

export default async function ReviewPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  let claims: Record<string, unknown> | null = null;
  if (token) {
    try {
      claims = await verifyIdToken(token);
      who =
        (claims.email as string | undefined) ??
        (claims['cognito:username'] as string | undefined) ??
        'there';
    } catch {
      /* middleware should have redirected; fall through */
    }
  }
  const adminUser = claims ? isAdmin(claims) : false;
  const pendingCount = adminUser ? await getPendingAccessRequestCount().catch(() => 0) : undefined;

  return (
    <AppShell active="review" title="Review" userName={who} isAdmin={adminUser} pendingCount={pendingCount}>
      <ReviewDeck />
    </AppShell>
  );
}
