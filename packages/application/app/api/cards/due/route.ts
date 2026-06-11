import { NextResponse } from 'next/server';
import { listCardsDue } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/cards/due — returns the next batch of due cards for the
// authenticated user (capped at 20).
// ---------------------------------------------------------------------------

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cards = await listCardsDue(sub, new Date().toISOString());
    // Cap at 20 per the review-deck page size
    const limited = cards.slice(0, 20);

    // Map defensively to the public Card shape — strips any internal DynamoDB
    // keys that might leak through from future CardItem returns.
    const mapped = limited.map((c) => ({
      cardId: c.cardId,
      sourceNoteId: c.sourceNoteId,
      front: c.front,
      back: c.back,
      ease: c.ease,
      interval: c.interval,
      dueAt: c.dueAt,
      lastReviewedAt: c.lastReviewedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json({ cards: mapped, total: mapped.length });
  } catch (err) {
    console.error('[cards/due] Unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch due cards.' }, { status: 500 });
  }
}
