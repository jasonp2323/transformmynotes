import { NextResponse } from 'next/server';
import { getShareItem, revokeShareItem, listUserGroups } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: { noteId: string; recipientSub: string } },
) {
  // 1. Auth
  const caller = await getAuthenticatedSub();
  if (!caller) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate route params
  const { noteId, recipientSub } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid noteId.' }, { status: 400 });
  }
  if (typeof recipientSub !== 'string' || !recipientSub) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid recipientSub.' },
      { status: 400 },
    );
  }

  // 3. Resolve ownerSub
  const ownerSub = new URL(req.url).searchParams.get('owner') ?? caller;

  try {
    // 4. Authorisation
    if (ownerSub !== caller) {
      // ADMIN revoke path — need to verify the caller is an admin of the share's group.
      const share = await getShareItem(ownerSub, noteId, recipientSub);
      if (!share) {
        return NextResponse.json({ ok: false, error: 'Share not found.' }, { status: 404 });
      }

      const memberships = await listUserGroups(caller);
      const isGroupAdmin = memberships.some(
        (m) => m.groupId === share.groupId && m.role === 'admin',
      );
      if (!isGroupAdmin) {
        return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // 5. Perform the soft-delete
    const ok = await revokeShareItem(ownerSub, noteId, recipientSub);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Share not found.' }, { status: 404 });
    }

    // 6. Success — 204 No Content
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[shares/revoke] Unexpected error revoking share', err);
    return NextResponse.json({ ok: false, error: 'Could not revoke share.' }, { status: 500 });
  }
}
