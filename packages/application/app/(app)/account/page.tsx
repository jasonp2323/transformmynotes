import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { AppShell } from '@/src/components/shells';
import { AccountScreen } from '@/src/components/account/AccountScreen';

export default async function AccountPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  let admin = false;
  if (token) {
    try {
      const claims = await verifyIdToken(token);
      who = (claims.email as string | undefined) ?? (claims['cognito:username'] as string | undefined) ?? 'there';
      admin = isAdmin(claims);
    } catch { /* fall through */ }
  }
  return (
    <AppShell active="profile" title="You" userName={who}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <AccountScreen email={who} isAdmin={admin} />
      </div>
    </AppShell>
  );
}
