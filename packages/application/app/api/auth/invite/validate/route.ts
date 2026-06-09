import { NextResponse } from 'next/server';
import { getInviteByCode, evaluateInvite } from '@transformmynotes/core';
import { rateLimit } from '@/lib/ratelimit';

export async function POST(req: Request) {
  // Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false });
  }

  const { code, email } = (body ?? {}) as Record<string, unknown>;

  // Validate required field.
  const trimmedCode = typeof code === 'string' ? code.trim() : '';
  if (!trimmedCode) {
    return NextResponse.json({ valid: false });
  }

  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  // Rate-limit by client IP (first hop of x-forwarded-for).
  const forwarded = (req.headers as Headers).get('x-forwarded-for') ?? 'unknown';
  const ip = forwarded.split(',')[0]!.trim() || 'unknown';
  const rl = rateLimit(`invite-validate:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  try {
    const invite = await getInviteByCode(trimmedCode);
    const evaln = evaluateInvite(invite);

    // If the invite is invalid for any reason, return { valid: false } without
    // leaking the reason to prevent enumeration of invite codes.
    if (!evaln.valid) {
      return NextResponse.json({ valid: false });
    }

    // For email-targeted invites, enforce that the provided email matches.
    if (invite!.type === 'email') {
      if (!trimmedEmail || trimmedEmail.toLowerCase() !== (invite!.targetEmail ?? '').toLowerCase()) {
        return NextResponse.json({ valid: false });
      }
    }

    // Valid invite — return metadata the sign-up page needs to pre-fill / lock the form.
    return NextResponse.json({
      valid: true,
      groupName: invite!.groupName ?? null,
      inviterName: invite!.inviterName ?? null,
      expiresAt: invite!.expiresAt ?? null,
      type: invite!.type,
      // For email invites, lock to the invite's target email.
      // For code invites, echo back whatever the caller sent (may be empty string or absent).
      email: invite!.targetEmail ?? (trimmedEmail || null),
    });
  } catch (err) {
    console.error('[invite/validate] Unexpected error validating invite', err);
    // Return generic { valid: false } on unexpected errors — do not 500-leak.
    return NextResponse.json({ valid: false });
  }
}
