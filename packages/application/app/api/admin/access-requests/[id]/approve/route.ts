import { NextResponse } from 'next/server';
import {
  getAccessRequest,
  updateAccessRequestStatus,
  generateInviteCode,
  putInvite,
} from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { rateLimit } from '@/lib/ratelimit';
import { sendInviteEmail } from '@/lib/email';
import { formatInviteCode, defaultExpiresAt, buildInviteUrl } from '@/lib/invite-create';
import { originFromHeaders } from '@/lib/request-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // 1. Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // 2. Rate-limit by admin sub (mirrors /api/admin/invites).
  const rl = rateLimit(`admin-access-requests:${admin.sub}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const { id } = params;

  // 3. Load the access request.
  let reqItem: Awaited<ReturnType<typeof getAccessRequest>>;
  try {
    reqItem = await getAccessRequest(id);
  } catch (err) {
    console.error('[admin/access-requests/approve] Failed to fetch request', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch access request.' }, { status: 500 });
  }

  if (!reqItem) {
    return NextResponse.json({ ok: false, error: 'Request not found.' }, { status: 404 });
  }

  if (reqItem.status !== 'new') {
    return NextResponse.json({ ok: false, error: 'Request is not pending.' }, { status: 409 });
  }

  // 4. Mint an email invite for the requester.
  const rawCode = generateInviteCode();
  const codeDisplay = formatInviteCode(rawCode);
  const expiresAt = defaultExpiresAt(new Date());

  try {
    await putInvite({
      code: rawCode,
      type: 'email',
      targetEmail: reqItem.email,
      maxUses: 1,
      expiresAt,
      createdBy: admin.sub,
    });
  } catch (err) {
    console.error('[admin/access-requests/approve] Failed to create invite', err);
    return NextResponse.json({ ok: false, error: 'Failed to create invite.' }, { status: 500 });
  }

  // 5. Build the invite URL and send the email (best-effort — invite is already written).
  const origin = originFromHeaders(req.headers as Headers, new URL(req.url).origin);
  const inviteUrl = buildInviteUrl(origin, rawCode, reqItem.email);

  let emailSent = false;
  try {
    await sendInviteEmail(reqItem.email, codeDisplay, null, expiresAt, inviteUrl);
    emailSent = true;
  } catch (err) {
    console.error('[admin/access-requests/approve] Invite written but email send failed', err);
  }

  // 6. Mark request as approved.
  try {
    await updateAccessRequestStatus(id, 'approved');
  } catch (err) {
    console.error('[admin/access-requests/approve] Failed to update request status', err);
    // Invite already written — still return success with a note.
    return NextResponse.json({ ok: true, emailSent, codeDisplay, warning: 'Status update failed.' });
  }

  return NextResponse.json({ ok: true, emailSent, codeDisplay });
}
