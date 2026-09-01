import { NextResponse } from 'next/server';
import { getCard, deleteCard } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// DELETE /api/cards/[cardId] — hard-delete a flashcard owned by the caller
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: { cardId: string } },
) {
  // 1. Auth
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate cardId
  const { cardId } = params;
  if (typeof cardId !== 'string' || !cardId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid cardId.' }, { status: 400 });
  }

  try {
    // 3. Verify the card exists and belongs to the caller.
    //    getCard is sub-scoped (pk = USER#<sub> / sk = CARD#<cardId>), so a card
    //    owned by a different user is indistinguishable from a missing card — both
    //    return undefined. We return 404 in both cases to avoid leaking whether a
    //    cardId exists under a different user's sub.
    const card = await getCard(sub, cardId);
    if (!card) {
      return NextResponse.json({ ok: false, error: 'Card not found.' }, { status: 404 });
    }

    // 4. Delete the card
    await deleteCard(sub, cardId);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[cards/delete] Unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Could not delete card.' }, { status: 500 });
  }
}
