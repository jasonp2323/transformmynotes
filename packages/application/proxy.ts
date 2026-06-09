import { NextResponse, type NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin, isAdminRoute } from '@/lib/auth-gate';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('CognitoIdToken')?.value;
  const loginUrl = new URL('/login', req.url);
  if (!token) return NextResponse.redirect(loginUrl);

  let claims: Record<string, unknown>;
  try {
    claims = await verifyIdToken(token);
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  // Admin-area gate: claim-based (cognito:groups), edge-safe. Status gate for
  // notebook routes lives in the Node (app) layout (requireActiveUser).
  if (isAdminRoute(req.nextUrl.pathname) && !isAdmin(claims)) {
    const dashboard = new URL('/dashboard', req.url);
    dashboard.searchParams.set('forbidden', '1');
    return NextResponse.redirect(dashboard);
  }

  return NextResponse.next();
}
