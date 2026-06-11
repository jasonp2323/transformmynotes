import { NextResponse } from 'next/server';
import { listSharesForRecipient, getGroup } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SharedNoteSummary {
  noteId: string;
  noteTitle: string;
  ownerSub: string;
  ownerName: string;
  groupId: string;
  groupName: string;
  sharedAt: string;
}

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const shares = await listSharesForRecipient(sub);

    // Resolve group names in one pass — dedupe groupIds so each is fetched once
    const uniqueGroupIds = [...new Set(shares.map((s) => s.groupId))];
    const groupEntries = await Promise.all(
      uniqueGroupIds.map(async (gid) => {
        const group = await getGroup(gid);
        return [gid, group?.name ?? ''] as const;
      }),
    );
    const groupNameMap = new Map<string, string>(groupEntries);

    const notes: SharedNoteSummary[] = shares.map((share) => ({
      noteId: share.noteId,
      noteTitle: share.noteTitle,
      ownerSub: share.ownerSub,
      ownerName: share.ownerName,
      groupId: share.groupId,
      groupName: groupNameMap.get(share.groupId) ?? '',
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
