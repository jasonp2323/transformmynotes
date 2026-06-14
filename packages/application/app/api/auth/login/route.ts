import { NextResponse } from 'next/server';
import { loginBodySchema } from '@/lib/auth-schemas';
import { initiateAuth, respondNewPassword } from '@/lib/cognito';
import { verifyTurnstile, TurnstileError } from '@/lib/turnstile';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';

const RATE_LIMIT_ROUTE = 'login';
const RATE_LIMIT_THRESHOLD = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Auth errors that map to a generic "invalid credentials" 401. */
const AUTH_FAILURE_NAMES = new Set([
  'NotAuthorizedException',
  'UserNotFoundException',
  'UserNotConfirmedException',
  'PasswordResetRequiredException',
]);

export async function POST(req: Request) {
  // 1. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = loginBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const data = parsed.data;

  // 2. Rate-limit — checked before Turnstile and Cognito.
  try {
    const ip = clientIp(req.headers as Headers);
    const rl = await enforceRateLimit(
      RATE_LIMIT_ROUTE,
      ip,
      RATE_LIMIT_THRESHOLD,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSeconds) },
        },
      );
    }
  } catch (err) {
    console.error('[login] Rate-limit check failed', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // ── PASSWORD step ──────────────────────────────────────────────────────────
  if (data.step === 'PASSWORD') {
    // 3. Turnstile — only on the initial password step.
    try {
      await verifyTurnstile(data.turnstileToken);
    } catch (err) {
      if (err instanceof TurnstileError) {
        return NextResponse.json(
          { error: 'Bot check failed. Please try again.' },
          { status: 400 },
        );
      }
      console.error('[login] Turnstile error', err);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 },
      );
    }

    // 4. Cognito sign-in.
    try {
      const result = await initiateAuth(data.email, data.password);

      if ('idToken' in result) {
        const res = NextResponse.json({ ok: true });
        res.cookies.set('CognitoIdToken', result.idToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
        return res;
      }

      // NEW_PASSWORD_REQUIRED challenge — return to client for step 2.
      return NextResponse.json({
        ok: false,
        challenge: 'NEW_PASSWORD_REQUIRED',
        session: result.session,
      });
    } catch (err) {
      const name = (err as { name?: string }).name ?? '';
      if (AUTH_FAILURE_NAMES.has(name)) {
        return NextResponse.json(
          { error: 'Invalid email or password.' },
          { status: 401 },
        );
      }
      console.error('[login] Cognito error', err);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 },
      );
    }
  }

  // ── NEW_PASSWORD step ──────────────────────────────────────────────────────
  // No Turnstile on continuation — possession of the challenge session is the gate.
  try {
    const result = await respondNewPassword(data.email, data.newPassword, data.session);
    const res = NextResponse.json({ ok: true });
    res.cookies.set('CognitoIdToken', result.idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (AUTH_FAILURE_NAMES.has(name)) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 },
      );
    }
    console.error('[login] Cognito respondNewPassword error', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
