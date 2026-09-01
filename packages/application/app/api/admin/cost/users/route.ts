import { NextResponse } from 'next/server';
import {
  aggregateUsageOverRange,
  getPriceBook,
  listUserProfilesByStatus,
  reduceByUser,
  reduceStorageByUser,
} from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';
import { parseRangeFromRequest } from '../_shared';

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
    const [{ aiAggs, storageAggs }, priceBook, activeProfiles, disabledProfiles] =
      await Promise.all([
        aggregateUsageOverRange(range.days),
        getPriceBook(),
        listUserProfilesByStatus('active'),
        listUserProfilesByStatus('disabled'),
      ]);

    // Build profile lookup map
    const profileMap = new Map<string, { email: string; name: string; groupIds: string[] }>();
    for (const p of [...activeProfiles, ...disabledProfiles]) {
      profileMap.set(p.sub, {
        email: p.email ?? '',
        name: p.name ?? '',
        groupIds: p.groupIds ?? [],
      });
    }

    // Per-user AI and storage rows
    const aiRows = reduceByUser(aiAggs, priceBook);
    const storageRows = reduceStorageByUser(storageAggs, priceBook.s3PerGbMonth);

    // Index storage rows by sub
    const storageByUser = new Map(storageRows.map((r) => [r.sub, r]));

    // Union of all subs from either source
    const allSubs = new Set([...aiRows.map((r) => r.key), ...storageRows.map((r) => r.sub)]);

    // Build per-user merged rows
    const users = [...allSubs].map((sub) => {
      const aiRow = aiRows.find((r) => r.key === sub);
      const storageRow = storageByUser.get(sub);
      const profile = profileMap.get(sub);

      const aiUsd = aiRow?.usd ?? 0;
      const storageUsd = storageRow?.usd ?? 0;

      return {
        sub,
        email: profile?.email ?? '',
        name: profile?.name ?? '',
        groupIds: profile?.groupIds ?? [],
        ai: {
          inputTokens: aiRow?.inputTokens ?? 0,
          outputTokens: aiRow?.outputTokens ?? 0,
          calls: aiRow?.calls ?? 0,
          usd: aiUsd,
          unpriced: aiRow?.unpriced ?? false,
        },
        storage: {
          avgBytes: storageRow?.avgBytes ?? 0,
          snapshotDays: storageRow?.snapshotDays ?? 0,
          gbMonths: storageRow?.gbMonths ?? 0,
          usd: storageUsd,
        },
        usd: aiUsd + storageUsd,
      };
    });

    // Sort by total usd desc, then sub asc
    users.sort((a, b) => {
      if (b.usd !== a.usd) return b.usd - a.usd;
      return a.sub.localeCompare(b.sub);
    });

    return NextResponse.json({
      ok: true,
      range: { from: range.from, to: range.to, days: range.days.length },
      users,
    });
  } catch (err) {
    console.error('[admin/cost/users]', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load per-user cost breakdown.' },
      { status: 500 },
    );
  }
}
