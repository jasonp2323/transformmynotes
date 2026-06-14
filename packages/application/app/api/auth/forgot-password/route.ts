import { NextResponse } from 'next/server';
import { forgotPasswordBodySchema } from '@/lib/auth-schemas';
import { forgotPassword } from '@/lib/cognito';
import { verifyTurnstile, TurnstileError } from '@/lib/turnstile';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';

const RATE_LIMIT_ROUTE = 'forgot-password';
const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function POST(req: Request) {
  // 1. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = forgotPasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { email, turnstileToken } = parsed.data;

  // 2. Rate-limit.
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
    console.error('[forgot-password] Rate-limit check failed', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // 3. Turnstile.
  try {
    await verifyTurnstile(turnstileToken);
  } catch (err) {
    if (err instanceof TurnstileError) {
      return NextResponse.json(
        { error: 'Bot check failed. Please try again.' },
        { status: 400 },
      );
    }
    console.error('[forgot-password] Turnstile error', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // 4. Trigger forgot-password — swallow ALL Cognito errors for no-enumeration.
  // Always return ok:true regardless of whether the email exists.
  try {
    await forgotPassword(email);
  } catch (err) {
    // Log for observability but never surface to the client.
    console.error('[forgot-password] Cognito ForgotPassword error (swallowed)', err);
  }

  return NextResponse.json({ ok: true });
}
