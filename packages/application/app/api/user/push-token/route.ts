import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * M12 stub: Accept push notification tokens from native clients.
 * This endpoint returns 501 Not Implemented.
 *
 * Full server-side implementation (FCM setup, token storage, dispatch) is deferred to M13.
 */
export async function POST() {
  // TODO M13: implement token storage and FCM server-side dispatch
  return NextResponse.json({ error: 'Push notifications not yet implemented' }, { status: 501 });
}
