import { NextResponse } from 'next/server';
import { listInFlightActivities, listActivities, toSummary } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [inFlightItems, recentItems] = await Promise.all([
      listInFlightActivities(sub),
      listActivities(sub, 25),
    ]);

    return NextResponse.json({
      ok: true,
      inFlight: inFlightItems.map(toSummary),
      recent: recentItems.map(toSummary),
    });
  } catch (err) {
    console.error('[activity/list]', err);
    return NextResponse.json({ ok: false, error: 'Could not load activity.' }, { status: 500 });
  }
}
