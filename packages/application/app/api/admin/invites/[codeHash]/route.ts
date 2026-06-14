import { NextResponse } from 'next/server';
import { revokeInvite, deleteInvite } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: { codeHash: string } },
) {
  // 1. Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // 2. Validate codeHash param.
  const { codeHash } = params;
  if (!codeHash || typeof codeHash !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing codeHash.' }, { status: 400 });
  }

  // 3. Check for hard-delete mode (?hard=true).
  const hard = new URL(req.url).searchParams.get('hard') === 'true';

  if (hard) {
    // Hard delete: permanently remove the invite record from DynamoDB.
    // Intended for terminal invites (revoked / expired). Idempotent.
    try {
      await deleteInvite(codeHash);
    } catch (err) {
      console.error('[admin/invites/:codeHash] Failed to hard-delete invite', err);
      return NextResponse.json({ ok: false, error: 'Failed to delete invite.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'deleted' });
  }

  // 4. Soft revoke (default behavior — unchanged).

  // Optionally read auditNotes from the request body (best-effort; ignore parse errors).
  let auditNotes: string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.auditNotes === 'string' && body.auditNotes.trim()) {
      auditNotes = body.auditNotes.trim();
    }
  } catch {
    // No body or non-JSON body — perfectly fine; auditNotes stays undefined.
  }

  // Revoke the invite.
  let result: Awaited<ReturnType<typeof revokeInvite>>;
  try {
    result = await revokeInvite(codeHash, auditNotes ? { auditNotes } : undefined);
  } catch (err) {
    console.error('[admin/invites/:codeHash] Failed to revoke invite', err);
    return NextResponse.json({ ok: false, error: 'Failed to revoke invite.' }, { status: 500 });
  }

  // Map result.
  if (result.ok) {
    return NextResponse.json({ ok: true, status: 'revoked' });
  }

  if (result.reason === 'not_found') {
    return NextResponse.json({ ok: false, error: 'Invite not found.' }, { status: 404 });
  }

  // already_revoked → idempotent 200.
  // Treating a double-revoke as success keeps DELETE idempotent — the end state
  // (invite is revoked) is what the caller wants regardless of who got there first.
  return NextResponse.json({ ok: true, status: 'revoked' });
}
