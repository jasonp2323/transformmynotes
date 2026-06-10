import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin } from '@/lib/auth-gate';
import { AdminShellProvider } from '@/src/components/admin';

/**
 * Server-side gate for the entire /admin/** subtree.
 *
 * Defense-in-depth: proxy.ts already blocks unauthenticated/unauthorized
 * requests at the edge; this layout re-checks so the pages are safe even if
 * middleware is bypassed (e.g. during local dev with middleware disabled).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get('CognitoIdToken')?.value;
  if (!token) {
    redirect('/login');
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyIdToken(token);
  } catch {
    redirect('/login');
  }

  if (!isAdmin(claims)) {
    redirect('/dashboard?forbidden=1');
  }

  const userName =
    (claims.name as string | undefined) ??
    (claims.email as string | undefined) ??
    (claims['cognito:username'] as string | undefined) ??
    'You';

  return (
    <AdminShellProvider userName={userName} isAdmin>
      {children}
    </AdminShellProvider>
  );
}
