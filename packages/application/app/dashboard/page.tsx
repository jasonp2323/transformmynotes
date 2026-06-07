import { cookies } from 'next/headers';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

export default async function DashboardPage() {
  const token = cookies().get('CognitoIdToken')?.value;
  let who = 'there';
  if (token) {
    try {
      const verifier = CognitoJwtVerifier.create({
        userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
        clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
        tokenUse: 'id',
      });
      const claims = await verifier.verify(token);
      who = (claims.email as string) ?? (claims['cognito:username'] as string) ?? 'there';
    } catch { /* middleware should have redirected; fall through */ }
  }
  return (
    <main>
      <h1>Welcome, {who}</h1>
    </main>
  );
}
