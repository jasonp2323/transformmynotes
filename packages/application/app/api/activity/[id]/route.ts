import { NextResponse } from 'next/server';
import { getActivity, toDetail } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  try {
    // Ownership is implicit: an activity not under the caller's USER#<sub>
    // partition simply isn't found, so it returns 404 here.
    const item = await getActivity(sub, id);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, activity: toDetail(item) });
  } catch (err) {
    console.error('[activity/get]', err);
    return NextResponse.json({ ok: false, error: 'Could not load activity.' }, { status: 500 });
  }
}
