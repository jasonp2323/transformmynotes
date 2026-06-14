import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyIdToken } from '@/lib/verify-id-token';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  // If the user already has a valid session cookie, skip the login page.
  // We only redirect on a VERIFIED token to avoid a redirect loop with proxy.ts.
  const cookieStore = await cookies();
  const idToken = cookieStore.get('CognitoIdToken')?.value;
  if (idToken) {
    try {
      await verifyIdToken(idToken);
      redirect('/dashboard');
    } catch {
      // Token missing or invalid — fall through and render the login form.
    }
  }

  return <LoginForm />;
}
