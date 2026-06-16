import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStudySet, createAiCards } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Zod schema for the request body.
// The 20-card cap is a known limit: DynamoDB BatchWriteItem allows up to 25
// items; we accept up to 20 to match the generation cap (maxItems in M14).
const bodySchema = z.object({
  accepted: z
    .array(z.object({ front: z.string().min(1), back: z.string().min(1) }))
    .min(1)
    .max(20),
});

export async function POST(
  req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;

  // Parse and validate the request body.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const parseResult = bodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { ok: false, error: parseResult.error.message },
      { status: 400 },
    );
  }

  const { accepted } = parseResult.data;

  try {
    // getStudySet is sub-scoped: a missing OR non-owned set returns undefined.
    // We return 404 for both cases — returning 403 for a non-owner would leak
    // the existence of the study set to callers who do not own it.
    const studySet = await getStudySet(sub, studySetId);
    if (!studySet) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

    if (studySet.type !== 'flashcards') {
      return NextResponse.json(
        { ok: false, error: 'Study set is not flashcards.' },
        { status: 400 },
      );
    }

    const sourceNoteId = studySet.sourceNoteIds[0];

    const { created } = await createAiCards({
      sub,
      studySetId,
      sourceNoteId,
      accepted,
    });

    return NextResponse.json({ created }, { status: 200 });
  } catch (err) {
    console.error('[accept-cards] Could not save cards', err);
    return NextResponse.json(
      { ok: false, error: 'Could not save cards.' },
      { status: 500 },
    );
  }
}
