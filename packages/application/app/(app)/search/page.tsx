import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { AppShell } from '@/src/components/shells';
import { SearchScreen } from '@/src/components/note/SearchScreen';

export default async function SearchPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  if (token) {
    try {
      const claims = await verifyIdToken(token);
      who = (claims.email as string | undefined) ?? (claims['cognito:username'] as string | undefined) ?? 'there';
    } catch { /* fall through */ }
  }
  return (
    <AppShell active="search" title="Search" userName={who}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <SearchScreen />
      </div>
    </AppShell>
  );
}
