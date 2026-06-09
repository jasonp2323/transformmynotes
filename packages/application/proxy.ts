import { NextResponse, type NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/verify-id-token';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('CognitoIdToken')?.value;
  const loginUrl = new URL('/login', req.url);
  if (!token) {
    return NextResponse.redirect(loginUrl);
  }
  try {
    await verifyIdToken(token);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}
