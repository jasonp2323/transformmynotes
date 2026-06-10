import { NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { deleteUserProfileWithAudit } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { sub: string } },
) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { sub } = params;

  // Self-guard: prevent admin from removing their own account.
  if (sub === admin.sub) {
    return NextResponse.json(
      { ok: false, error: 'You cannot remove your own account.' },
      { status: 400 },
    );
  }

  // Read the Cognito user pool ID — required before proceeding.
  const UserPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!UserPoolId) {
    console.error('[admin/users/delete] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set');
    return NextResponse.json({ ok: false, error: 'Server configuration error.' }, { status: 500 });
  }

  // Delete user from Cognito — idempotent: UserNotFoundException is treated as success.
  const cognito = new CognitoIdentityProviderClient({});
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId, Username: sub }));
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      console.warn('[admin/users/delete] User not found in Cognito (already deleted?)', { sub });
      // proceed idempotently
    } else {
      console.error('[admin/users/delete] Failed to delete user from Cognito', err);
      return NextResponse.json(
        { ok: false, error: 'Failed to delete user from Cognito.' },
        { status: 500 },
      );
    }
  }

  // Delete user profile from DB — not_found is treated as idempotent success.
  const deleteResult = await deleteUserProfileWithAudit(sub, { deletedBy: admin.sub });
  if (!deleteResult.ok && deleteResult.reason !== 'not_found') {
    console.error('[admin/users/delete] deleteUserProfileWithAudit returned !ok', { sub, reason: deleteResult.reason });
    return NextResponse.json({ ok: false, error: 'Failed to delete user profile.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
