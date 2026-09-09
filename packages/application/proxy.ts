import { NextResponse, type NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/verify-id-token';
import { isAdmin, isAdminRoute } from '@/lib/auth-gate';

// Next.js 16 renamed the middleware convention to "proxy" (the exported
// function must be named `proxy`, in a file named proxy.ts) — see
// https://nextjs.org/docs/messages/middleware-to-proxy. This file is the
// single source of truth for the auth gate; `config.matcher` below controls
// which routes it runs on (Node-runtime status/role checks for these same
// routes additionally live in lib/require-user.ts et al.).
export async function proxy(req: NextRequest) {
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

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/notes/:path*',
    '/review/:path*',
    '/account/:path*',
    '/admin/:path*',
    '/search/:path*',
  ],
};
