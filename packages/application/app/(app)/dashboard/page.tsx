import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { AppShell } from '@/src/components/shells';
import { LibraryNotes } from '@/src/components/note/LibraryNotes';
import { CaptureFab } from '@/src/components/note/CaptureFab';
import { DueCountGreeting } from '@/src/components/review/DueCountGreeting';
import { getPendingAccessRequestCount } from '@/lib/pending-count';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { forbidden?: string };
}) {
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
    <AppShell active="library" title="Library" userName={who} isAdmin={adminUser} pendingCount={pendingCount} fab={<CaptureFab />}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        {searchParams.forbidden === '1' && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            You don&apos;t have access to the admin area.
          </div>
        )}

        {/* Greeting — live due-card count fetched client-side */}
        <DueCountGreeting userName={who} />

        {/* Interactive library list (client component) */}
        <LibraryNotes />
      </div>
    </AppShell>
  );
}
