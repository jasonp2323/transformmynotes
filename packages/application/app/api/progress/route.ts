import { NextResponse } from 'next/server';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { getUserProfileBySub, listDaySnapshots } from '@transformmynotes/core';
import {
  isValidRange,
  rangeWindow,
  densifyDays,
  computeTotals,
  RANGE_DAYS,
} from '@/lib/progress/range';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate the `range` query param.
  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get('range');
  const range = rawRange === null ? '30d' : rawRange;

  if (rawRange !== null && !isValidRange(rawRange)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid range',
        allowedValues: Object.keys(RANGE_DAYS),
      },
      { status: 400 },
    );
  }

  // At this point range is guaranteed to be a ProgressRange.
  const validRange = range as keyof typeof RANGE_DAYS;

  const today = new Date().toISOString().slice(0, 10);
  const { fromDate, toDate } = rangeWindow(today, validRange);

  try {
    // Fetch profile and snapshots in parallel.
    const [p, snapshots] = await Promise.all([
      getUserProfileBySub(sub),
      listDaySnapshots(sub, fromDate, toDate),
    ]);

    return NextResponse.json({
      range: validRange,
      profile: {
        studyStreakDays: p?.studyStreakDays ?? 0,
        longestStreakDays: p?.longestStreakDays ?? 0,
        lastStudyDay: p?.lastStudyDay ?? null,
        totalReviewsLifetime: p?.totalReviewsLifetime ?? 0,
        totalCardsMastered: p?.totalCardsMastered ?? 0,
        totalQuizAttemptsLifetime: p?.totalQuizAttemptsLifetime ?? 0,
      },
      days: densifyDays(snapshots, fromDate, toDate),
      totals: computeTotals(snapshots),
    });
  } catch (err) {
    console.error('[progress] Unexpected error fetching study progress', err);
    return NextResponse.json(
      { ok: false, error: 'Could not fetch study progress.' },
      { status: 500 },
    );
  }
}
