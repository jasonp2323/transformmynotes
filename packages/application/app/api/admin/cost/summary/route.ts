import { NextResponse } from 'next/server';
import {
  getPriceBookItem,
  aggregateUsageOverRange,
  reduceByModel,
  reduceByFeature,
  reduceByGroup,
  totalCost,
  totalStorageCost,
  buildDailyTrend,
} from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { parseRangeFromRequest, buildSubToGroup, resolveGroupNames } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const rangeResult = parseRangeFromRequest(req);
  if (!rangeResult.ok) return rangeResult.response;
  const { range } = rangeResult;

  try {
    const [{ aiAggs, storageAggs }, priceBookItem] = await Promise.all([
      aggregateUsageOverRange(range.days),
      getPriceBookItem(),
    ]);

    const pb = priceBookItem.priceBook;

    // Group map + name resolution
    const subToGroup = await buildSubToGroup();
    const groupRows = await resolveGroupNames(reduceByGroup(aiAggs, pb, subToGroup));

    // Unpriced models: models in aiAggs that have no entry in pb.models
    const modelIds = new Set(aiAggs.map((a) => a.model));
    const unpricedModels = [...modelIds].filter((m) => !(m in pb.models));

    const aiTotals = totalCost(aiAggs, pb);
    const storageTotals = totalStorageCost(storageAggs, pb.s3PerGbMonth);

    return NextResponse.json({
      ok: true,
      range: { from: range.from, to: range.to, days: range.days.length },
      totals: {
        ai: aiTotals,
        storage: storageTotals,
        usd: aiTotals.usd + storageTotals.usd,
      },
      byModel: reduceByModel(aiAggs, pb),
      byFeature: reduceByFeature(aiAggs, pb),
      byGroup: groupRows,
      trend: buildDailyTrend(range.days, aiAggs, storageAggs, pb),
      unpricedModels,
      priceUpdatedAt: priceBookItem.seeded ? null : (priceBookItem.updatedAt ?? null),
    });
  } catch (err) {
    console.error('[admin/cost/summary]', err);
    return NextResponse.json({ ok: false, error: 'Failed to load cost summary.' }, { status: 500 });
  }
}
