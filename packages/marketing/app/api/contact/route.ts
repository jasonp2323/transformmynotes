import { NextResponse } from 'next/server';

// Stubbed until M3 wires Cloudflare Turnstile + Resend.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Contact form not implemented yet' },
    { status: 501 },
  );
}
