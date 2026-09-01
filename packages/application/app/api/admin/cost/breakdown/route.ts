import { NextResponse } from 'next/server';
import {
  aggregateUsageOverRange,
  getPriceBook,
  reduceByModel,
  reduceByFeature,
  reduceByGroup,
} from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { parseRangeFromRequest, buildSubToGroup, resolveGroupNames } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_DIMENSIONS = ['model', 'feature', 'group'] as const;
type Dimension = (typeof VALID_DIMENSIONS)[number];

export async function GET(req: Request) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const dimensionParam = url.searchParams.get('dimension') ?? 'model';
  if (!VALID_DIMENSIONS.includes(dimensionParam as Dimension)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown dimension "${dimensionParam}". Must be one of: ${VALID_DIMENSIONS.join(', ')}.`,
      },
      { status: 400 },
    );
  }
  const dimension = dimensionParam as Dimension;

  const rangeResult = parseRangeFromRequest(req);
  if (!rangeResult.ok) return rangeResult.response;
  const { range } = rangeResult;

  try {
    const [{ aiAggs }, priceBook] = await Promise.all([
      aggregateUsageOverRange(range.days),
      getPriceBook(),
    ]);

    let rows;
    if (dimension === 'model') {
      rows = reduceByModel(aiAggs, priceBook);
    } else if (dimension === 'feature') {
      rows = reduceByFeature(aiAggs, priceBook);
    } else {
      // group
      const subToGroup = await buildSubToGroup();
      const rawRows = reduceByGroup(aiAggs, priceBook, subToGroup);
      rows = await resolveGroupNames(rawRows);
    }

    return NextResponse.json({
      ok: true,
      range: { from: range.from, to: range.to, days: range.days.length },
      dimension,
      rows,
    });
  } catch (err) {
    console.error('[admin/cost/breakdown]', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load cost breakdown.' },
      { status: 500 },
    );
  }
}
