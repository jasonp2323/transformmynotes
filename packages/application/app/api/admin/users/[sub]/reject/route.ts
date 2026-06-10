import { NextResponse } from 'next/server';
import { getUserProfileBySub, updateUserStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { sendRejectionEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { sub: string } },
) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { sub } = params;

  // Look up the user profile.
  let profile: Awaited<ReturnType<typeof getUserProfileBySub>>;
  try {
    profile = await getUserProfileBySub(sub);
  } catch (err) {
    console.error('[admin/users/reject] Failed to look up user profile', err);
    return NextResponse.json({ ok: false, error: 'Failed to look up user.' }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
  }

  if (profile.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'User is not pending.' }, { status: 409 });
  }

  // Update user status to 'disabled' with audit note.
  const updateResult = await updateUserStatus(sub, 'disabled', { auditNotes: 'Rejected by admin' });
  if (!updateResult.ok) {
    console.error('[admin/users/reject] updateUserStatus returned !ok', { sub, reason: updateResult.reason });
    return NextResponse.json({ ok: false, error: 'Failed to update user status.' }, { status: 500 });
  }

  // Best-effort rejection email.
  let emailSent = false;
  try {
    await sendRejectionEmail(profile.email);
    emailSent = true;
  } catch (err) {
    console.error('[admin/users/reject] Failed to send rejection email', err);
    emailSent = false;
  }

  return NextResponse.json({ ok: true, emailSent });
}
