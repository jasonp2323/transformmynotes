import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { getPendingAccessRequestCount } from '@/lib/pending-count';
import { AppShell } from '@/src/components/shells';
import { SearchScreen } from '@/src/components/note/SearchScreen';

export default async function SearchPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  let claims: Record<string, unknown> | null = null;
  if (token) {
    try {
      claims = await verifyIdToken(token);
      who = (claims.email as string | undefined) ?? (claims['cognito:username'] as string | undefined) ?? 'there';
    } catch { /* fall through */ }
  }
  const adminUser = claims ? isAdmin(claims) : false;
  const pendingCount = adminUser ? await getPendingAccessRequestCount().catch(() => 0) : undefined;
  return (
    <AppShell active="search" title="Search" userName={who} isAdmin={adminUser} pendingCount={pendingCount}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <SearchScreen />
      </div>
    </AppShell>
  );
}
