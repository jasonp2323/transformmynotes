import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { AppShell } from '@/src/components/shells';
import { HighlightText } from '@/src/components/ui';
import { LibraryNotes } from '@/src/components/note/LibraryNotes';
import { CaptureFab } from '@/src/components/note/CaptureFab';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { forbidden?: string };
}) {
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
    <AppShell active="library" title="Library" userName={who} fab={<CaptureFab />}>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        {searchParams.forbidden === '1' && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            You don&apos;t have access to the admin area.
          </div>
        )}

        {/* Greeting */}
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
            color: 'var(--text-muted)',
            margin: '0 0 16px',
            padding: '0 0 0 2px',
          }}
        >
          Welcome back, {who} —{' '}
          <HighlightText variant="teal">0 cards</HighlightText> ready to review.
        </p>

        {/* Interactive library list (client component) */}
        <LibraryNotes />
      </div>
    </AppShell>
  );
}
