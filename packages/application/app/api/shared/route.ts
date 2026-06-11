import { NextResponse } from 'next/server';
import { listSharesForRecipient } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SharedNoteSummary {
  noteId: string;
  noteTitle: string;
  ownerSub: string;
  ownerName: string;
  groupId: string;
  sharedAt: string;
}

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const shares = await listSharesForRecipient(sub);

    const notes: SharedNoteSummary[] = shares.map((share) => ({
      noteId: share.noteId,
      noteTitle: share.noteTitle,
      ownerSub: share.ownerSub,
      ownerName: share.ownerName,
      groupId: share.groupId,
      sharedAt: share.sharedAt,
    }));

    return NextResponse.json(
      { ok: true, notes },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (err) {
    console.error('[shared/get] Unexpected error fetching shared notes', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch shared notes.' }, { status: 500 });
  }
}
