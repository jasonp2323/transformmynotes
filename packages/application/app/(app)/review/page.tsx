import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { AppShell } from '@/src/components/shells';
import { ReviewDeck } from '@/src/components/review/ReviewDeck';

export default async function ReviewPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  if (token) {
    try {
      const claims = await verifyIdToken(token);
      who =
        (claims.email as string | undefined) ??
        (claims['cognito:username'] as string | undefined) ??
        'there';
    } catch {
      /* middleware should have redirected; fall through */
    }
  }

  return (
    <AppShell active="review" title="Review" userName={who}>
      <ReviewDeck />
    </AppShell>
  );
}
