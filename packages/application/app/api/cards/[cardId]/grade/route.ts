import { NextResponse } from 'next/server';
import {
  getCard,
  recordCardReview,
  schedule,
  type Grade,
  buildReviewEventItem,
  appendStudyEvent,
  newEventId,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// PATCH /api/cards/[cardId]/grade — record a review result for a card and
// advance its SM-2 schedule.
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
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

  // 3. Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const { grade } = (body ?? {}) as Record<string, unknown>;

  // grade must be an integer in 0..5
  if (
    typeof grade !== 'number' ||
    !Number.isInteger(grade) ||
    grade < 0 ||
    grade > 5
  ) {
    return NextResponse.json(
      { ok: false, error: 'grade must be an integer between 0 and 5.' },
      { status: 400 },
    );
  }

  try {
    // 4. Fetch card — getCard is sub-scoped (pk = USER#<sub>/sk = CARD#<cardId>),
    //    so a card belonging to a different user will simply not resolve under
    //    the caller's sub and returns undefined. This means cross-user access is
    //    indistinguishable from a missing card → 404 is both correct and safe
    //    (avoids leaking whether a cardId exists at all).
    const card = await getCard(sub, cardId);
    if (!card) {
      return NextResponse.json({ ok: false, error: 'Card not found.' }, { status: 404 });
    }

    // 5. Advance SM-2 schedule
    const result = schedule(
      { ease: card.ease, interval: card.interval, dueAt: card.dueAt },
      grade as Grade,
    );

    // 6. Persist review
    const prevEase = card.ease;
    const prevIntervalDays = card.interval;
    const updated = await recordCardReview({ sub, cardId, result });

    // 7. Append study-progress event (fail-soft: never aborts the review action)
    try {
      const reviewedAt = updated.lastReviewedAt ?? new Date().toISOString();
      const eventTs = reviewedAt;
      const eventId = newEventId();
      await appendStudyEvent(
        buildReviewEventItem(
          sub,
          {
            cardId,
            grade: grade as Grade,
            prevEase,
            newEase: result.ease,
            prevIntervalDays,
            newIntervalDays: result.interval,
            reviewedAt,
          },
          eventTs,
          eventId,
        ),
      );
    } catch (err) {
      console.error('[progress] REVIEW event append failed', err);
    }

    // 8. Return the updated scheduling fields
    return NextResponse.json({
      ease: updated.ease,
      interval: updated.interval,
      dueAt: updated.dueAt,
      lastReviewedAt: updated.lastReviewedAt,
    });
  } catch (err) {
    console.error('[cards/grade] Unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Could not record review.' }, { status: 500 });
  }
}
