import { NextResponse } from 'next/server';
import { putAccessRequest } from '@transformmynotes/core';
import { rateLimit } from '@/lib/ratelimit';
import { originFromHeaders } from '@/lib/request-origin';
import { listAdminEmails } from '@/lib/admin-emails';
import { sendAdminAccessRequestNotification } from '@/lib/email';
import { verifyTurnstile, TurnstileError } from '@/lib/turnstile';
import { requestAccessBodySchema } from '@/lib/auth-schemas';

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

  // Validate with zod.
  const parsed = requestAccessBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid name and email.' },
      { status: 400 },
    );
  }
  const { name, email, note: trimmedNote, turnstileToken } = parsed.data;
  const trimmedName = name;
  const trimmedEmail = email;

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

  // Turnstile — bot check before any DB write.
  try {
    await verifyTurnstile(turnstileToken);
  } catch (err) {
    if (err instanceof TurnstileError) {
      return NextResponse.json(
        { ok: false, error: 'Bot check failed. Please try again.' },
        { status: 400 },
      );
    }
    console.error('[request-access] Turnstile error', err);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // Write to DynamoDB — always return ok:true to avoid enumeration.
  try {
    await putAccessRequest({ name: trimmedName, email: trimmedEmail, note: trimmedNote });
  } catch (err) {
    console.error('[request-access] Failed to write access request', err);
  }

  // Best-effort: notify admins of the new request. Never affects the response.
  try {
    const origin = originFromHeaders(req.headers as Headers, new URL(req.url).origin);
    let admins: string[] = [];
    try {
      admins = await listAdminEmails();
    } catch (e) {
      console.error('[request-access] Failed to list admin emails', e);
    }
    await sendAdminAccessRequestNotification(
      admins,
      { name: trimmedName, email: trimmedEmail, note: trimmedNote },
      `${origin}/admin/pending`,
    );
  } catch (err) {
    console.error('[request-access] Failed to send admin notification', err);
  }

  return NextResponse.json({ ok: true });
}
