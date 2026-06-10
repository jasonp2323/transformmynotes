import { NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { updateUserRole } from '@transformmynotes/core';
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

  const { role } = (body ?? {}) as Record<string, unknown>;

  if (role !== 'admin' && role !== 'member') {
    return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 });
  }

  // Self-guard: prevent admin from removing their own admin role.
  if (sub === admin.sub && role === 'member') {
    return NextResponse.json(
      { ok: false, error: 'You cannot remove your own admin role.' },
      { status: 400 },
    );
  }

  // Read the Cognito user pool ID — required before proceeding.
  const UserPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!UserPoolId) {
    console.error('[admin/users/role] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set');
    return NextResponse.json({ ok: false, error: 'Server configuration error.' }, { status: 500 });
  }

  // Update Cognito group membership.
  const cognito = new CognitoIdentityProviderClient({});
  try {
    if (role === 'admin') {
      await cognito.send(
        new AdminAddUserToGroupCommand({ UserPoolId, Username: sub, GroupName: 'admin' }),
      );
    } else {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({ UserPoolId, Username: sub, GroupName: 'admin' }),
      );
    }
  } catch (err) {
    console.error('[admin/users/role] Failed to update Cognito group membership', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to update user role in Cognito.' },
      { status: 500 },
    );
  }

  // Update user role in DB.
  const updateResult = await updateUserRole(sub, role);
  if (!updateResult.ok) {
    if (updateResult.reason === 'not_found') {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }
    console.error('[admin/users/role] updateUserRole returned !ok', { sub, reason: updateResult.reason });
    return NextResponse.json({ ok: false, error: 'Failed to update user role.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
