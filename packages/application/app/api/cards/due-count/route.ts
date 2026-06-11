import { NextResponse } from 'next/server';
import { countCardsDue } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/cards/due-count — returns the number of cards due for the
// authenticated user right now.
// ---------------------------------------------------------------------------

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await countCardsDue(sub, new Date().toISOString());
    return NextResponse.json(
      { count },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    console.error('[cards/due-count] Unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch due count.' }, { status: 500 });
  }
}
