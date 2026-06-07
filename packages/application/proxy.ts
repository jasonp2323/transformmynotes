import { NextResponse, type NextRequest } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

// Built lazily so a missing binding fails loudly at request time, not import.
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
function getVerifier() {
  if (!userPoolId || !clientId) {
    throw new Error(
      'Missing NEXT_PUBLIC_COGNITO_USER_POOL_ID / NEXT_PUBLIC_COGNITO_CLIENT_ID — Cognito binding not set.',
    );
  }
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
  }
  return verifier;
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('CognitoIdToken')?.value;
  const loginUrl = new URL('/auth/login', req.url);
  if (!token) {
    return NextResponse.redirect(loginUrl);
  }
  try {
    await getVerifier().verify(token);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/app/:path*'],
};
