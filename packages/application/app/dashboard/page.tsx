import { cookies } from 'next/headers';
import { verifyIdToken } from '@/lib/verify-id-token';

export default async function DashboardPage() {
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
    <main>
      <h1>Welcome, {who}</h1>
    </main>
  );
}
