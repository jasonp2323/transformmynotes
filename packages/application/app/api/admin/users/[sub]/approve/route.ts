import { NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getUserProfileBySub, updateUserStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { sendApprovalEmail } from '@/lib/email';

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
    console.error('[admin/users/approve] Failed to look up user profile', err);
    return NextResponse.json({ ok: false, error: 'Failed to look up user.' }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
  }

  if (profile.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'User is not pending.' }, { status: 409 });
  }

  // Read the Cognito user pool ID — required before proceeding.
  const UserPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!UserPoolId) {
    console.error('[admin/users/approve] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set');
    return NextResponse.json({ ok: false, error: 'Server configuration error.' }, { status: 500 });
  }

  // Add user to the 'member' Cognito group.
  const cognito = new CognitoIdentityProviderClient({});
  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({ UserPoolId, Username: sub, GroupName: 'member' }),
    );
  } catch (err) {
    console.error('[admin/users/approve] Failed to add user to Cognito group', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to update user in Cognito.' },
      { status: 500 },
    );
  }

  // Update user status to 'active'.
  const updateResult = await updateUserStatus(sub, 'active');
  if (!updateResult.ok) {
    console.error('[admin/users/approve] updateUserStatus returned !ok', { sub, reason: updateResult.reason });
    return NextResponse.json({ ok: false, error: 'Failed to update user status.' }, { status: 500 });
  }

  // Best-effort approval email.
  let emailSent = false;
  try {
    await sendApprovalEmail(profile.email, profile.name?.trim() || profile.email);
    emailSent = true;
  } catch (err) {
    console.error('[admin/users/approve] Failed to send approval email', err);
    emailSent = false;
  }

  return NextResponse.json({ ok: true, emailSent });
}
