import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getNote, createManualCard } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Zod schema for the request body
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().min(1).max(600),
  // sourceNoteId is optional — standalone manual cards need no parent note.
  // A simple .min(1) guard prevents accidentally sending an empty string.
  sourceNoteId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/cards — create a standalone manual flashcard
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Auth
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  // 3. Validate
  const parseResult = bodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { ok: false, error: parseResult.error.message },
      { status: 400 },
    );
  }

  const { front, back, sourceNoteId } = parseResult.data;

  try {
    // 4. If sourceNoteId is provided, verify the note exists and belongs to the caller.
    //    getNote is sub-scoped (pk = USER#<sub> / sk = NOTE#<noteId>), so a note
    //    owned by a different user is indistinguishable from a missing note — both
    //    return undefined. We return 404 in both cases rather than 403 to avoid
    //    leaking whether a noteId exists under a different user's sub. This mirrors
    //    the same reasoning documented in grade/route.ts and accept-cards/route.ts.
    if (sourceNoteId !== undefined) {
      const note = await getNote(sub, sourceNoteId);
      if (!note) {
        return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
      }
    }

    // 5. Generate card id and persist
    const cardId = ulid();
    await createManualCard({ sub, cardId, front, back, sourceNoteId });

    return NextResponse.json({ cardId }, { status: 201 });
  } catch (err) {
    console.error('[cards] POST unexpected error', err);
    return NextResponse.json({ ok: false, error: 'Could not create card.' }, { status: 500 });
  }
}
