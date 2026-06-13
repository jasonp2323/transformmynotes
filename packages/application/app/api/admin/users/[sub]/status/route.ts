import { NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { updateUserStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { sub: string } },
) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { sub } = params;

  // Parse and validate request body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const { status } = (body ?? {}) as Record<string, unknown>;

  if (status !== 'active' && status !== 'disabled') {
    return NextResponse.json({ ok: false, error: 'Invalid status.' }, { status: 400 });
  }

  // Self-guard: prevent admin from disabling their own account.
  if (sub === admin.sub && status === 'disabled') {
    return NextResponse.json(
      { ok: false, error: 'You cannot disable your own account.' },
      { status: 400 },
    );
  }

  // Update user status in DB first.
  const updateResult = await updateUserStatus(sub, status);
  if (!updateResult.ok) {
    if (updateResult.reason === 'not_found') {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }
    console.error('[admin/users/status] updateUserStatus returned !ok', { sub, reason: updateResult.reason });
    return NextResponse.json({ ok: false, error: 'Failed to update user status.' }, { status: 500 });
  }

  // Reflect the status change in Cognito so sign-in is actually blocked/restored.
  const UserPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!UserPoolId) {
    console.error('[admin/users/status] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set');
    return NextResponse.json({ ok: false, error: 'Server configuration error.' }, { status: 500 });
  }

  const cognito = new CognitoIdentityProviderClient({});
  const CognitoCommand =
    status === 'disabled' ? AdminDisableUserCommand : AdminEnableUserCommand;
  try {
    await cognito.send(new CognitoCommand({ UserPoolId, Username: sub }));
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      // User already absent from Cognito — treat as idempotent success.
      console.warn('[admin/users/status] User not found in Cognito (already deleted?)', { sub });
    } else {
      console.error('[admin/users/status] Failed to update user status in Cognito', err);
      return NextResponse.json(
        { ok: false, error: 'Failed to update user status in Cognito.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
