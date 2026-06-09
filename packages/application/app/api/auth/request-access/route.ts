import { NextResponse } from 'next/server';
import { putAccessRequest } from '@transformmynotes/core';
import { rateLimit } from '@/lib/ratelimit';

/** Basic email regex — validates structure without being overly strict. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  // Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid name and email.' },
      { status: 400 },
    );
  }

  const { name, email, note } = (body ?? {}) as Record<string, unknown>;

  // Validate.
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedNote = typeof note === 'string' && note.trim() !== '' ? note.trim() : undefined;

  if (!trimmedName || !trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid name and email.' },
      { status: 400 },
    );
  }

  // Rate-limit by client IP (first hop of x-forwarded-for).
  const forwarded = (req.headers as Headers).get('x-forwarded-for') ?? 'unknown';
  const ip = forwarded.split(',')[0]!.trim() || 'unknown';
  const rl = rateLimit(`request-access:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // Write to DynamoDB — always return ok:true to avoid enumeration.
  try {
    await putAccessRequest({ name: trimmedName, email: trimmedEmail, note: trimmedNote });
  } catch (err) {
    console.error('[request-access] Failed to write access request', err);
  }

  return NextResponse.json({ ok: true });
}
