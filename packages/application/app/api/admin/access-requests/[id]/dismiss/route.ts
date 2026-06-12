import { NextResponse } from 'next/server';
import { getAccessRequest, updateAccessRequestStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { sendRejectionEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // 1. Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;

  // 2. Load the access request.
  let reqItem: Awaited<ReturnType<typeof getAccessRequest>>;
  try {
    reqItem = await getAccessRequest(id);
  } catch (err) {
    console.error('[admin/access-requests/dismiss] Failed to fetch request', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch access request.' }, { status: 500 });
  }

  if (!reqItem) {
    return NextResponse.json({ ok: false, error: 'Request not found.' }, { status: 404 });
  }

  if (reqItem.status !== 'new') {
    return NextResponse.json({ ok: false, error: 'Request is not pending.' }, { status: 409 });
  }

  // 3. Mark request as dismissed.
  try {
    await updateAccessRequestStatus(id, 'dismissed');
  } catch (err) {
    console.error('[admin/access-requests/dismiss] Failed to update request status', err);
    return NextResponse.json({ ok: false, error: 'Failed to dismiss request.' }, { status: 500 });
  }

  // 4. Best-effort rejection email.
  try {
    await sendRejectionEmail(reqItem.email);
  } catch (err) {
    console.error('[admin/access-requests/dismiss] Failed to send rejection email', err);
  }

  return NextResponse.json({ ok: true });
}
