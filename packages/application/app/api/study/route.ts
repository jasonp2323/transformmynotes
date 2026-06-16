import { NextResponse } from 'next/server';
import { listStudySetsByUser, listStudySetsByNote, type StudySet } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toStudySetMeta(s: StudySet) {
  return {
    studySetId: s.studySetId,
    sourceNoteIds: s.sourceNoteIds,
    type: s.type,
    title: s.title,
    status: s.status,
    language: s.language,
    model: s.model,
    promptVersion: s.promptVersion,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...(s.error ? { error: s.error } : {}),
  };
}

export async function GET(req: Request) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const noteId = new URL(req.url).searchParams.get('noteId');

  try {
    const sets = noteId
      ? await listStudySetsByNote(sub, noteId)
      : await listStudySetsByUser(sub);

    return NextResponse.json({ studySets: sets.map(toStudySetMeta) });
  } catch (err) {
    console.error('[study/list]', err);
    return NextResponse.json({ ok: false, error: 'Could not list study sets.' }, { status: 500 });
  }
}
