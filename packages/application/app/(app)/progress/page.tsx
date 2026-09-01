import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { AppShell } from '@/src/components/shells';
import { ProgressScreen } from '@/src/components/progress/ProgressScreen';

export default async function ProgressPage() {
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

  return (
    <AppShell active="progress" title="Progress" userName={who} isAdmin={adminUser}>
      <ProgressScreen />
    </AppShell>
  );
}
