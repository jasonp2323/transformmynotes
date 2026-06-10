import { NextResponse } from 'next/server';
import { generateInviteCode, putInvite, getGroup, listInvites } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import type { InviteStatus } from '@transformmynotes/core';
import { rateLimit } from '@/lib/ratelimit';
import { sendInviteEmail } from '@/lib/email';
import { formatInviteCode, defaultExpiresAt, parseCreateInviteBody } from '@/lib/invite-create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: InviteStatus[] = ['pending', 'used', 'expired', 'revoked'];

export async function GET(req: Request) {
  // 1. Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // 2. Parse optional status filter from query string.
  const rawStatus = new URL(req.url).searchParams.get('status');
  let validStatus: InviteStatus | undefined;

  if (rawStatus && rawStatus !== 'all') {
    if (!(VALID_STATUSES as string[]).includes(rawStatus)) {
      return NextResponse.json({ ok: false, error: 'Invalid status filter.' }, { status: 400 });
    }
    validStatus = rawStatus as InviteStatus;
  }

  // 3. Fetch invites from DynamoDB.
  try {
    const invites = await listInvites(validStatus);
    return NextResponse.json({ ok: true, invites });
  } catch (err) {
    console.error('[admin/invites] Failed to list invites', err);
    return NextResponse.json({ ok: false, error: 'Failed to list invites.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // 1. Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // 2. Rate-limit by admin sub.
  const rl = rateLimit(`admin-invites:${admin.sub}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // 3. Parse and validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = parseCreateInviteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const invite = parsed.value;

  // 4. Generate code and expiry.
  const rawCode = generateInviteCode();
  const codeDisplay = formatInviteCode(rawCode);
  const expiresAt = invite.expiresAt ?? defaultExpiresAt(new Date());

  // 5. Resolve group name if groupId provided.
  // If a groupId was supplied but not found, return 400 rather than silently
  // proceeding — the admin explicitly chose a group and a miss likely indicates
  // a typo or stale UI state.
  let groupName: string | null = null;
  if (invite.groupId) {
    let group: Awaited<ReturnType<typeof getGroup>>;
    try {
      group = await getGroup(invite.groupId);
    } catch (err) {
      console.error('[admin/invites] Failed to look up group', err);
      return NextResponse.json({ ok: false, error: 'Failed to look up group.' }, { status: 500 });
    }
    if (!group) {
      return NextResponse.json(
        { ok: false, error: `Unknown group: ${invite.groupId}` },
        { status: 400 },
      );
    }
    groupName = group.name;
  }

  // 6. Write invite to DynamoDB.
  try {
    await putInvite({
      code: rawCode,
      type: invite.type,
      targetEmail: invite.type === 'email' ? invite.email : undefined,
      label: invite.type === 'code' ? invite.label : undefined,
      groupId: invite.groupId,
      groupName: groupName ?? undefined,
      maxUses: invite.maxUses,
      expiresAt,
      createdBy: admin.sub,
    });
  } catch (err) {
    console.error('[admin/invites] Failed to create invite', err);
    return NextResponse.json({ ok: false, error: 'Failed to create invite.' }, { status: 500 });
  }

  // 7. Send email for email-type invites.
  if (invite.type === 'email') {
    try {
      await sendInviteEmail(invite.email, codeDisplay, groupName, expiresAt);
      return NextResponse.json({ ok: true, codeDisplay, expiresAt, emailSent: true });
    } catch (err) {
      // The invite row is already written — log the failure and still return success
      // so the admin can see the code and manually follow up if needed.
      console.error('[admin/invites] Invite written but email send failed', err);
      return NextResponse.json({ ok: true, codeDisplay, expiresAt, emailSent: false });
    }
  }

  // Code-type invite — no email.
  return NextResponse.json({ ok: true, codeDisplay, expiresAt });
}
