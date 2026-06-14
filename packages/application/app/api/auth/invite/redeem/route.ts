import { NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { getInviteByCode, evaluateInvite, buildUserProfileItem, ddb, TableNames, claimInvite } from '@transformmynotes/core';
import { rateLimit } from '@/lib/ratelimit';
import { enforceRateLimit, clientIp } from '@/lib/rate-limit';

/** Basic email regex — validates structure without being overly strict. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MEMBER_GROUP = 'member';

export async function POST(req: Request) {
  // Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Please provide valid invite details.' },
      { status: 400 },
    );
  }

  const { code, email, name, password } = (body ?? {}) as Record<string, unknown>;

  // Validate inputs — generic errors to avoid leaking invite existence.
  const trimmedCode = typeof code === 'string' ? code.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedPassword = typeof password === 'string' ? password : '';

  if (!trimmedCode) {
    return NextResponse.json(
      { ok: false, error: 'Please provide valid invite details.' },
      { status: 400 },
    );
  }
  if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid email address.' },
      { status: 400 },
    );
  }
  if (!trimmedName) {
    return NextResponse.json(
      { ok: false, error: 'Please enter your name.' },
      { status: 400 },
    );
  }
  if (trimmedPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'Password must be at least 8 characters.' },
      { status: 400 },
    );
  }

  // Rate-limit by client IP (first hop of x-forwarded-for).
  const forwarded = (req.headers as Headers).get('x-forwarded-for') ?? 'unknown';
  const ip = forwarded.split(',')[0]!.trim() || 'unknown';
  const rl = rateLimit(`invite-redeem:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // DynamoDB-backed rate-limit — persists across instances/restarts.
  try {
    const dynRl = await enforceRateLimit(
      'invite-redeem',
      clientIp(req.headers as Headers),
      5,
      60,
    );
    if (!dynRl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(dynRl.retryAfterSeconds) },
        },
      );
    }
  } catch (err) {
    console.error('[invite/redeem] Rate-limit check failed', err);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // Re-validate the invite server-side — never trust client-supplied validation.
  let invite: Awaited<ReturnType<typeof getInviteByCode>>;
  try {
    invite = await getInviteByCode(trimmedCode);
  } catch (err) {
    console.error('[invite/redeem] Failed to look up invite', err);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  const evaln = evaluateInvite(invite);
  if (!evaln.valid) {
    return NextResponse.json(
      { ok: false, error: 'This invite is no longer valid.' },
      { status: 400 },
    );
  }

  const invitedRole = invite!.role === 'admin' ? 'admin' : 'member';

  // For email-targeted invites, enforce email match.
  if (invite!.type === 'email') {
    if (trimmedEmail.toLowerCase() !== (invite!.targetEmail ?? '').toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: 'This invite is no longer valid.' },
        { status: 400 },
      );
    }
  }

  // Read the Cognito user pool ID — required before we proceed.
  const userPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!userPoolId) {
    console.error('[invite/redeem] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set');
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // Build a server-side Cognito admin client (credentials from ambient IAM role).
  const cognito = new CognitoIdentityProviderClient({});

  try {
    // Step 1: AdminCreateUser — suppress the welcome email (we're doing invite flow).
    let sub: string;
    try {
      const createResult = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: trimmedEmail,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: trimmedEmail },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: trimmedName },
          ],
        }),
      );

      // Extract the Cognito sub from the created user's attributes.
      const subAttr = createResult.User?.Attributes?.find((a) => a.Name === 'sub');
      if (!subAttr?.Value) {
        console.error('[invite/redeem] AdminCreateUser succeeded but sub is missing from response', {
          attributes: createResult.User?.Attributes,
        });
        return NextResponse.json(
          { ok: false, error: 'Something went wrong. Please try again.' },
          { status: 500 },
        );
      }
      sub = subAttr.Value;
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        // An account already exists for this email. This typically means the invite
        // was already redeemed or the user exists from another source. Return a
        // generic invite-invalid message — do not enumerate existing accounts.
        return NextResponse.json(
          { ok: false, error: 'This invite is no longer valid.' },
          { status: 400 },
        );
      }
      throw err;
    }

    try {
      // Step 2: Set a permanent password so the user can sign in immediately
      // without going through a forced password-change challenge.
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: trimmedEmail,
          Password: trimmedPassword,
          Permanent: true,
        }),
      );

      // Step 3: Add the user to the 'member' Cognito group (always).
      // If the invite role is 'admin', also add to the 'admin' group.
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: trimmedEmail,
          GroupName: MEMBER_GROUP,
        }),
      );
      if (invitedRole === 'admin') {
        await cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: trimmedEmail,
            GroupName: 'admin',
          }),
        );
      }

      // Step 4: Write the UserData profile to DynamoDB.
      const profile = buildUserProfileItem({
        sub,
        email: trimmedEmail,
        name: trimmedName,
        status: 'active',
        role: invitedRole,
        groupIds: invite!.groupId ? [invite!.groupId] : [],
      });
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: profile,
        }),
      );

      // Step 5: Atomically claim the invite (LAST — so a Cognito failure doesn't burn the invite).
      // If claimInvite returns ok:false, the invite was claimed concurrently. This is safe to
      // ignore: the Cognito user and profile already exist, so the user has a working account.
      // We log a warning for observability but still return success.
      const claimResult = await claimInvite(trimmedCode);
      if (!claimResult.ok) {
        console.warn('[invite/redeem] claimInvite returned ok:false after successful account creation', {
          reason: claimResult.reason,
          email: trimmedEmail,
          // Note: this can happen in a rare race where two redemptions of the same
          // multi-use invite land simultaneously — the second claim loses the
          // conditional check but both accounts are valid. Acceptable trade-off.
        });
      }

      return NextResponse.json({ ok: true });
    } catch (postCreateErr) {
      // Roll back the just-created Cognito user so the invite can be retried cleanly.
      try {
        await cognito.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: trimmedEmail,
          }),
        );
      } catch (deleteErr) {
        console.error('[invite/redeem] Rollback delete failed — orphan user may exist', deleteErr);
      }
      throw postCreateErr;
    }
  } catch (err) {
    console.error('[invite/redeem] Unexpected error during account creation', err);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
