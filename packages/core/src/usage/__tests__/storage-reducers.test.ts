/**
 * Unit tests for storage reducers and buildDailyTrend (M23.4).
 */
import { describe, it, expect } from 'vitest';
import {
  reduceStorageByUser,
  totalStorageCost,
  buildDailyTrend,
} from '../reducers.js';
import type { DailyAiAggregate, DailyStorageAggregate } from '../types.js';
import { DEFAULT_PRICE_BOOK } from '../price-book.js';

// Helper: build a storage aggregate.
function sa(sub: string, day: string, byteDayBytes: number): DailyStorageAggregate {
  return { sub, day, byteDayBytes };
}

// Helper: build an AI aggregate.
function aa(
  sub: string,
  day: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  calls: number,
): DailyAiAggregate {
  return { sub, day, feature, model, inputTokens, outputTokens, calls };
}

const RATE = 0.023; // S3 rate matching DEFAULT_PRICE_BOOK

// ---------------------------------------------------------------------------
// reduceStorageByUser
// ---------------------------------------------------------------------------

describe('reduceStorageByUser', () => {
  it('returns [] for empty input', () => {
    expect(reduceStorageByUser([], RATE)).toEqual([]);
  });

  it('computes a single user, single day correctly', () => {
    const aggs = [sa('user-a', '2026-06-01', 1_000_000_000)]; // 1 GB for 1 day
    const rows = reduceStorageByUser(aggs, RATE);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.sub).toBe('user-a');
    expect(row.avgBytes).toBeCloseTo(1_000_000_000, 0);
    expect(row.snapshotDays).toBe(1);
    // gbMonths(1e9, 1) = (1e9/1e9)*(1/30) = 1/30
    expect(row.gbMonths).toBeCloseTo(1 / 30, 10);
    // usd = (1/30)*0.023
    expect(row.usd).toBeCloseTo((1 / 30) * RATE, 10);
  });

  it('computes a single user, multiple days: avgBytes is mean', () => {
    const aggs = [
      sa('user-b', '2026-06-01', 2_000_000_000),
      sa('user-b', '2026-06-02', 4_000_000_000),
    ];
    const rows = reduceStorageByUser(aggs, RATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].avgBytes).toBeCloseTo(3_000_000_000, 0);
    expect(rows[0].snapshotDays).toBe(2);
    // gbMonths(3e9, 2) = 3*(2/30) = 0.2
    expect(rows[0].gbMonths).toBeCloseTo(0.2, 10);
  });

  it('groups by sub (multiple users)', () => {
    const aggs = [
      sa('user-a', '2026-06-01', 1_000_000_000),
      sa('user-b', '2026-06-01', 2_000_000_000),
    ];
    const rows = reduceStorageByUser(aggs, RATE);
    expect(rows).toHaveLength(2);
    const subs = rows.map((r) => r.sub).sort();
    expect(subs).toEqual(['user-a', 'user-b']);
  });

  it('sorts by usd descending, then sub ascending', () => {
    const aggs = [
      sa('user-a', '2026-06-01', 1_000_000_000),
      sa('user-b', '2026-06-01', 3_000_000_000),
      sa('user-c', '2026-06-01', 2_000_000_000),
    ];
    const rows = reduceStorageByUser(aggs, RATE);
    expect(rows[0].sub).toBe('user-b');
    expect(rows[1].sub).toBe('user-c');
    expect(rows[2].sub).toBe('user-a');
  });

  it('sorts sub ascending as tiebreaker when usd equal', () => {
    const aggs = [
      sa('user-z', '2026-06-01', 1_000_000_000),
      sa('user-a', '2026-06-01', 1_000_000_000),
    ];
    const rows = reduceStorageByUser(aggs, RATE);
    expect(rows[0].sub).toBe('user-a');
    expect(rows[1].sub).toBe('user-z');
  });
});

// ---------------------------------------------------------------------------
// totalStorageCost
// ---------------------------------------------------------------------------

describe('totalStorageCost', () => {
  it('returns zeros for empty input', () => {
    const result = totalStorageCost([], RATE);
    expect(result).toEqual({ avgBytes: 0, gbMonths: 0, usd: 0, users: 0 });
  });

  it('sums across users correctly', () => {
    const aggs = [
      sa('user-a', '2026-06-01', 1_000_000_000),
      sa('user-b', '2026-06-01', 2_000_000_000),
    ];
    const result = totalStorageCost(aggs, RATE);
    expect(result.users).toBe(2);
    // user-a: avgBytes=1e9, snapshotDays=1, gbm=1/30, usd=(1/30)*0.023
    // user-b: avgBytes=2e9, snapshotDays=1, gbm=2/30, usd=(2/30)*0.023
    expect(result.avgBytes).toBeCloseTo(3_000_000_000, 0);
    expect(result.gbMonths).toBeCloseTo(3 / 30, 10);
    expect(result.usd).toBeCloseTo((3 / 30) * RATE, 10);
  });
});

// ---------------------------------------------------------------------------
// buildDailyTrend
// ---------------------------------------------------------------------------

describe('buildDailyTrend', () => {
  const MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
  const priceBook = DEFAULT_PRICE_BOOK;

  it('returns zero-filled points for days with no data', () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const trend = buildDailyTrend(days, [], [], priceBook);
    expect(trend).toHaveLength(3);
    for (const pt of trend) {
      expect(pt.aiUsd).toBe(0);
      expect(pt.storageUsd).toBe(0);
      expect(pt.usd).toBe(0);
      expect(pt.inputTokens).toBe(0);
      expect(pt.outputTokens).toBe(0);
      expect(pt.calls).toBe(0);
      expect(pt.bytes).toBe(0);
    }
  });

  it('preserves order of days list', () => {
    const days = ['2026-06-03', '2026-06-01', '2026-06-02'];
    const trend = buildDailyTrend(days, [], [], priceBook);
    expect(trend.map((p) => p.day)).toEqual(['2026-06-03', '2026-06-01', '2026-06-02']);
  });

  it('sums AI tokens and computes correct aiUsd for a day', () => {
    const days = ['2026-06-01'];
    const aiAggs = [
      aa('user-a', '2026-06-01', 'study', MODEL, 1000, 500, 2),
      aa('user-b', '2026-06-01', 'ocr', MODEL, 2000, 1000, 4),
    ];
    const trend = buildDailyTrend(days, aiAggs, [], priceBook);
    expect(trend[0].inputTokens).toBe(3000);
    expect(trend[0].outputTokens).toBe(1500);
    expect(trend[0].calls).toBe(6);
    // (3000/1000)*0.003 + (1500/1000)*0.015 = 0.009 + 0.0225 = 0.0315
    expect(trend[0].aiUsd).toBeCloseTo(0.0315, 8);
  });

  it('computes storageUsd as single-day prorate', () => {
    const days = ['2026-06-01'];
    const storageAggs = [sa('user-a', '2026-06-01', 30_000_000_000)]; // 30 GB
    const trend = buildDailyTrend(days, [], storageAggs, priceBook);
    // gbMonths(30e9, 1) = 30*(1/30) = 1 GB-month
    // storageUsd = 1*0.023 = 0.023
    expect(trend[0].storageUsd).toBeCloseTo(0.023, 8);
    expect(trend[0].bytes).toBe(30_000_000_000);
  });

  it('usd = aiUsd + storageUsd', () => {
    const days = ['2026-06-01'];
    const aiAggs = [aa('user-a', '2026-06-01', 'study', MODEL, 1000, 500, 1)];
    const storageAggs = [sa('user-a', '2026-06-01', 1_000_000_000)];
    const trend = buildDailyTrend(days, aiAggs, storageAggs, priceBook);
    expect(trend[0].usd).toBeCloseTo(trend[0].aiUsd + trend[0].storageUsd, 10);
  });

  it('sums bytes across multiple users on same day', () => {
    const days = ['2026-06-01'];
    const storageAggs = [
      sa('user-a', '2026-06-01', 1_000_000_000),
      sa('user-b', '2026-06-01', 2_000_000_000),
    ];
    const trend = buildDailyTrend(days, [], storageAggs, priceBook);
    expect(trend[0].bytes).toBe(3_000_000_000);
  });

  it('zero-fills a gap day between data days', () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const aiAggs = [aa('user-a', '2026-06-01', 'study', MODEL, 1000, 500, 1)];
    const storageAggs = [sa('user-a', '2026-06-03', 1_000_000_000)];
    const trend = buildDailyTrend(days, aiAggs, storageAggs, priceBook);
    // Day 2 has no data.
    expect(trend[1].aiUsd).toBe(0);
    expect(trend[1].storageUsd).toBe(0);
    expect(trend[1].bytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation: sum(trend.storageUsd) === totalStorageCost(...).usd
// ---------------------------------------------------------------------------

describe('Storage reconciliation: trend sum === totalStorageCost', () => {
  it('reconciles for a multi-user, multi-day, gappy dataset', () => {
    // User A: data on days 1 and 3 (day 2 is a gap for A).
    // User B: data only on day 2.
    // days list covers all three days.
    const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const storageAggs: DailyStorageAggregate[] = [
      sa('user-a', '2026-06-01', 1_000_000_000),
      sa('user-a', '2026-06-03', 3_000_000_000),
      sa('user-b', '2026-06-02', 2_000_000_000),
    ];

    const trend = buildDailyTrend(days, [], storageAggs, DEFAULT_PRICE_BOOK);
    const trendSum = trend.reduce((sum, pt) => sum + pt.storageUsd, 0);

    const total = totalStorageCost(storageAggs, DEFAULT_PRICE_BOOK.s3PerGbMonth);

    // They must reconcile within floating-point tolerance.
    expect(trendSum).toBeCloseTo(total.usd, 8);
  });
});
