import { NextResponse } from 'next/server';
import { setSessionBodySchema } from '@/lib/auth-schemas';
import { verifyIdToken } from '@/lib/verify-id-token';

export async function POST(req: Request) {
  // 1. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = setSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { idToken } = parsed.data;

  // 2. Verify the ID token.
  try {
    await verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  }

  // 3. Set the HttpOnly session cookie.
  const res = NextResponse.json({ ok: true });
  res.cookies.set('CognitoIdToken', idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
