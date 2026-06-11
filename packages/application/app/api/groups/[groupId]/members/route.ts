import { NextResponse } from 'next/server';
import {
  listUserGroups,
  listGroupMembers,
  getUserProfileBySub,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { groupId: string } },
) {
  // Auth
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { groupId } = params;
  if (typeof groupId !== 'string' || !groupId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid groupId.' }, { status: 400 });
  }

  try {
    // Authorisation: caller must be a member of the group
    const callerMemberships = await listUserGroups(sub);
    const isMember = callerMemberships.some((m) => m.groupId === groupId);
    if (!isMember) {
      return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 });
    }

    // Fetch all group members
    const members = await listGroupMembers(groupId);

    // Resolve display names in parallel, excluding the caller
    const otherMembers = members.filter((m) => m.userSub !== sub);

    const resolved = await Promise.all(
      otherMembers.map(async (m) => {
        const profile = await getUserProfileBySub(m.userSub);
        return {
          sub: m.userSub,
          name: profile?.name || profile?.email || 'Member',
          role: m.role as 'member' | 'admin',
        };
      }),
    );

    return NextResponse.json({ ok: true, members: resolved });
  } catch (err) {
    console.error('[groups/members/get] Unexpected error fetching members', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch members.' }, { status: 500 });
  }
}
