import { NextResponse } from 'next/server';
import { getStudySet, setStudySetCompleted } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;
  if (!studySetId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId.' }, { status: 400 });
  }

  let completed: unknown;
  try {
    const body = await req.json();
    completed = (body as { completed?: unknown })?.completed;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid completed flag.' }, { status: 400 });
  }

  if (typeof completed !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'Invalid completed flag.' }, { status: 400 });
  }

  try {
    const item = await getStudySet(sub, studySetId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

    await setStudySetCompleted(sub, studySetId, completed);
    return NextResponse.json({ completed });
  } catch (err) {
    console.error('[study/complete]', err);
    return NextResponse.json({ ok: false, error: 'Could not update study set.' }, { status: 500 });
  }
}
