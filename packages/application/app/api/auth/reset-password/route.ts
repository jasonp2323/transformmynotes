import { NextResponse } from 'next/server';
import { resetPasswordBodySchema } from '@/lib/auth-schemas';
import { confirmForgotPassword } from '@/lib/cognito';
import { verifyTurnstile, TurnstileError } from '@/lib/turnstile';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';

const RATE_LIMIT_ROUTE = 'reset-password';
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

  const parsed = resetPasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { email, code, newPassword, turnstileToken } = parsed.data;

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
    console.error('[reset-password] Rate-limit check failed', err);
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
    console.error('[reset-password] Turnstile error', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // 4. Confirm forgot-password reset.
  try {
    await confirmForgotPassword(email, code, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'CodeMismatchException' || name === 'ExpiredCodeException') {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired code. Please try again.' },
        { status: 400 },
      );
    }
    if (name === 'InvalidPasswordException') {
      return NextResponse.json(
        { ok: false, error: 'Password does not meet the requirements.' },
        { status: 400 },
      );
    }
    console.error('[reset-password] Cognito ConfirmForgotPassword error', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
