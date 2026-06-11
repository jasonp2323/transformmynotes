import { NextResponse } from 'next/server';
import {
  getNote,
  getShareItem,
  putShareItem,
  listSharesForNote,
  getUserProfileBySub,
  listUserGroups,
  listGroupMembers,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/notes/[noteId]/shares — create shares (owner-only)
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: { noteId: string } },
) {
  // 1. Auth
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate noteId
  const { noteId } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid noteId.' }, { status: 400 });
  }

  // 3. Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const { recipientSubs, groupId: bodyGroupId } = (body ?? {}) as Record<string, unknown>;

  // Validate recipientSubs if provided
  if (
    recipientSubs !== undefined &&
    (!Array.isArray(recipientSubs) || !recipientSubs.every((s) => typeof s === 'string'))
  ) {
    return NextResponse.json(
      { ok: false, error: 'recipientSubs must be an array of strings.' },
      { status: 400 },
    );
  }

  try {
    // 4. Owner check — getNote only resolves for the caller's own notes
    const note = await getNote(sub, noteId);
    if (!note) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // 5. Resolve group scope
    const resolvedGroupId = (bodyGroupId as string | undefined) ?? note.groupId;
    if (!resolvedGroupId) {
      return NextResponse.json(
        { ok: false, error: 'A note must belong to a group to be shared.' },
        { status: 400 },
      );
    }

    // 6. Verify owner is a member of the resolved group
    const ownerMemberships = await listUserGroups(sub);
    const isGroupMember = ownerMemberships.some((m) => m.groupId === resolvedGroupId);
    if (!isGroupMember) {
      return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 });
    }

    // 7. Resolve recipient list
    let recipients: string[];
    if (Array.isArray(recipientSubs) && recipientSubs.length > 0) {
      // Explicit list — exclude the owner's own sub
      recipients = (recipientSubs as string[]).filter((s) => s !== sub);
    } else {
      // Whole-group fan-out — exclude owner
      const members = await listGroupMembers(resolvedGroupId);
      recipients = members.map((m) => m.userSub).filter((s) => s !== sub);
    }

    // 8. Idempotent fan-out
    const profile = await getUserProfileBySub(sub);
    const ownerName = profile?.name || profile?.email || '';

    let created = 0;
    for (const recipientSub of recipients) {
      const existing = await getShareItem(sub, noteId, recipientSub);
      // Skip if an ACTIVE share already exists (item present AND no revokedAt)
      if (existing && !existing.revokedAt) {
        continue;
      }
      await putShareItem({
        ownerSub: sub,
        ownerName,
        recipientSub,
        noteId,
        noteTitle: note.title,
        groupId: resolvedGroupId,
      });
      created++;
    }

    // 9. Return
    return NextResponse.json({ ok: true, created }, { status: 201 });
  } catch (err) {
    console.error('[shares/post] Unexpected error creating shares', err);
    return NextResponse.json({ ok: false, error: 'Could not create shares.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/notes/[noteId]/shares — list current shares (owner-only)
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: { noteId: string } },
) {
  // 1. Auth
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Validate noteId
  const { noteId } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid noteId.' }, { status: 400 });
  }

  try {
    // 2. Owner check
    const note = await getNote(sub, noteId);
    if (!note) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // 3. List all shares and filter to active only (no revokedAt)
    const allShares = await listSharesForNote(sub, noteId);
    const activeShares = allShares.filter((s) => !s.revokedAt);

    // 4. Return
    const shares = activeShares.map((s) => ({
      recipientSub: s.recipientSub,
      ownerName: s.ownerName,
      noteTitle: s.noteTitle,
      groupId: s.groupId,
      sharedAt: s.sharedAt,
    }));

    return NextResponse.json({ ok: true, shares });
  } catch (err) {
    console.error('[shares/get] Unexpected error listing shares', err);
    return NextResponse.json({ ok: false, error: 'Could not list shares.' }, { status: 500 });
  }
}
