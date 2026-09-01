/**
 * Unit tests for packages/application/lib/progress/range.ts
 *
 * All core imports are mocked so tests run fully offline (no DynamoDB client).
 * The pure math helpers (computeRetentionRate, computeAvgQuizScore,
 * computeAvgEase, progressKeys.parseDaySk) are implemented inline so that
 * densifyDays / computeTotals behave exactly as they would in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @transformmynotes/core before the module under test is loaded.
// We re-implement the pure helpers faithfully so derived-rate assertions work.
// ---------------------------------------------------------------------------

vi.mock('@transformmynotes/core', () => ({
  progressKeys: {
    parseDaySk: (sk: string): { date: string } => {
      const match = /^DAY#(\d{4}-\d{2}-\d{2})$/.exec(sk);
      if (!match) throw new Error(`parseDaySk: malformed "${sk}"`);
      return { date: match[1] };
    },
  },
  computeRetentionRate: (correct: number, total: number): number | undefined =>
    total === 0 ? undefined : correct / total,
  computeAvgQuizScore: (sum: number, count: number): number | undefined =>
    count === 0 ? undefined : sum / count,
  computeAvgEase: (sum: number, count: number): number | undefined =>
    count === 0 ? undefined : sum / count,
}));

import {
  isValidRange,
  rangeWindow,
  listDatesInWindow,
  densifyDays,
  computeTotals,
  RANGE_DAYS,
  type ProgressRange,
} from '../range';
import type { DaySnapshotItem } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnap(date: string, overrides: Partial<DaySnapshotItem> = {}): DaySnapshotItem {
  return {
    pk: `USER#test-sub`,
    sk: `DAY#${date}`,
    reviews: 0,
    cardsReviewed: 0,
    correctReviews: 0,
    easeSum: 0,
    easeCount: 0,
    quizAttempts: 0,
    quizScoreSum: 0,
    notesCreated: 0,
    studySetsCreated: 0,
    cardsMastered: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isValidRange
// ---------------------------------------------------------------------------

describe('isValidRange', () => {
  it('returns true for all valid range keys', () => {
    for (const key of Object.keys(RANGE_DAYS)) {
      expect(isValidRange(key)).toBe(true);
    }
  });

  it('returns false for invalid strings', () => {
    expect(isValidRange('1d')).toBe(false);
    expect(isValidRange('60d')).toBe(false);
    expect(isValidRange('')).toBe(false);
    expect(isValidRange('30')).toBe(false);
    expect(isValidRange('all')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rangeWindow
// ---------------------------------------------------------------------------

describe('rangeWindow', () => {
  it('7d: fromDate is 6 days before today', () => {
    const { fromDate, toDate } = rangeWindow('2026-06-20', '7d');
    expect(toDate).toBe('2026-06-20');
    expect(fromDate).toBe('2026-06-14');
  });

  it('30d: fromDate is 29 days before today', () => {
    const { fromDate, toDate } = rangeWindow('2026-06-20', '30d');
    expect(toDate).toBe('2026-06-20');
    expect(fromDate).toBe('2026-05-22');
  });

  it('90d: fromDate is 89 days before today', () => {
    const { fromDate, toDate } = rangeWindow('2026-06-20', '90d');
    expect(toDate).toBe('2026-06-20');
    expect(fromDate).toBe('2026-03-23');
  });

  it('365d: fromDate is 364 days before today', () => {
    const { fromDate, toDate } = rangeWindow('2026-06-20', '365d');
    expect(toDate).toBe('2026-06-20');
    expect(fromDate).toBe('2025-06-21');
  });

  it('handles month rollover correctly (7d crossing month boundary)', () => {
    const { fromDate, toDate } = rangeWindow('2026-03-02', '7d');
    expect(toDate).toBe('2026-03-02');
    expect(fromDate).toBe('2026-02-24');
  });

  it('handles year rollover correctly (30d crossing year boundary)', () => {
    const { fromDate, toDate } = rangeWindow('2026-01-10', '30d');
    expect(toDate).toBe('2026-01-10');
    expect(fromDate).toBe('2025-12-12');
  });
});

// ---------------------------------------------------------------------------
// listDatesInWindow
// ---------------------------------------------------------------------------

describe('listDatesInWindow', () => {
  it('returns exactly N=7 dates for a 7-day window', () => {
    const dates = listDatesInWindow('2026-06-14', '2026-06-20');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-06-14');
    expect(dates[6]).toBe('2026-06-20');
  });

  it('returns exactly 1 date when fromDate === toDate', () => {
    const dates = listDatesInWindow('2026-06-20', '2026-06-20');
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBe('2026-06-20');
  });

  it('returns 30 dates for a 30-day window', () => {
    const dates = listDatesInWindow('2026-05-22', '2026-06-20');
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-05-22');
    expect(dates[29]).toBe('2026-06-20');
  });

  it('correctly spans across a month boundary', () => {
    const dates = listDatesInWindow('2026-02-27', '2026-03-02');
    expect(dates).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

// ---------------------------------------------------------------------------
// densifyDays
// ---------------------------------------------------------------------------

describe('densifyDays', () => {
  it('fills days with no snapshot with zero counters and null rates', () => {
    const days = densifyDays([], '2026-06-18', '2026-06-20');
    expect(days).toHaveLength(3);
    for (const day of days) {
      expect(day.reviews).toBe(0);
      expect(day.retentionRate).toBeNull();
      expect(day.avgQuizScore).toBeNull();
      expect(day.avgEase).toBeNull();
    }
  });

  it('returns dates in chronological order', () => {
    const days = densifyDays([], '2026-06-18', '2026-06-20');
    expect(days.map((d) => d.date)).toEqual(['2026-06-18', '2026-06-19', '2026-06-20']);
  });

  it('fills snapshot data for a day that has one', () => {
    const snap = makeSnap('2026-06-19', {
      reviews: 10,
      cardsReviewed: 10,
      correctReviews: 8,
      easeSum: 25,
      easeCount: 10,
      quizAttempts: 2,
      quizScoreSum: 1.5,
      notesCreated: 1,
      studySetsCreated: 0,
      cardsMastered: 3,
    });

    const days = densifyDays([snap], '2026-06-18', '2026-06-20');
    expect(days).toHaveLength(3);

    const june18 = days[0];
    expect(june18.date).toBe('2026-06-18');
    expect(june18.reviews).toBe(0);
    expect(june18.retentionRate).toBeNull();

    const june19 = days[1];
    expect(june19.date).toBe('2026-06-19');
    expect(june19.reviews).toBe(10);
    expect(june19.correctReviews).toBe(8);
    expect(june19.retentionRate).toBeCloseTo(0.8);
    expect(june19.avgQuizScore).toBeCloseTo(0.75);
    expect(june19.avgEase).toBeCloseTo(2.5);
    expect(june19.notesCreated).toBe(1);
    expect(june19.cardsMastered).toBe(3);

    const june20 = days[2];
    expect(june20.date).toBe('2026-06-20');
    expect(june20.reviews).toBe(0);
    expect(june20.retentionRate).toBeNull();
  });

  it('returns null rates when denominator is 0 (0 reviews, 0 quizAttempts, 0 easeCount)', () => {
    const snap = makeSnap('2026-06-19', {
      reviews: 0,
      correctReviews: 0,
      easeSum: 0,
      easeCount: 0,
      quizAttempts: 0,
      quizScoreSum: 0,
    });
    const days = densifyDays([snap], '2026-06-19', '2026-06-19');
    expect(days[0].retentionRate).toBeNull();
    expect(days[0].avgQuizScore).toBeNull();
    expect(days[0].avgEase).toBeNull();
  });

  it('handles multiple snapshots with gaps between them', () => {
    const snap1 = makeSnap('2026-06-15', { reviews: 5, correctReviews: 5, easeSum: 10, easeCount: 5 });
    const snap2 = makeSnap('2026-06-18', { reviews: 3, correctReviews: 2, easeSum: 6, easeCount: 3 });
    const days = densifyDays([snap1, snap2], '2026-06-15', '2026-06-18');

    expect(days).toHaveLength(4);
    expect(days[0].date).toBe('2026-06-15');
    expect(days[0].reviews).toBe(5);
    expect(days[0].retentionRate).toBeCloseTo(1.0);

    expect(days[1].date).toBe('2026-06-16');
    expect(days[1].reviews).toBe(0);
    expect(days[1].retentionRate).toBeNull();

    expect(days[2].date).toBe('2026-06-17');
    expect(days[2].reviews).toBe(0);

    expect(days[3].date).toBe('2026-06-18');
    expect(days[3].reviews).toBe(3);
    expect(days[3].retentionRate).toBeCloseTo(2 / 3);
  });
});

// ---------------------------------------------------------------------------
// computeTotals
// ---------------------------------------------------------------------------

describe('computeTotals', () => {
  it('returns all-zero totals with null rates for an empty snapshot array', () => {
    const totals = computeTotals([]);
    expect(totals.reviews).toBe(0);
    expect(totals.correctReviews).toBe(0);
    expect(totals.quizAttempts).toBe(0);
    expect(totals.notesCreated).toBe(0);
    expect(totals.studySetsCreated).toBe(0);
    expect(totals.cardsMastered).toBe(0);
    expect(totals.retentionRate).toBeNull();
    expect(totals.avgQuizScore).toBeNull();
    expect(totals.avgEase).toBeNull();
  });

  it('sums raw counters across multiple snapshots', () => {
    const snaps = [
      makeSnap('2026-06-18', { reviews: 10, correctReviews: 8, quizAttempts: 2, quizScoreSum: 1.6, notesCreated: 1, studySetsCreated: 1, cardsMastered: 2, easeSum: 20, easeCount: 10 }),
      makeSnap('2026-06-19', { reviews: 5, correctReviews: 4, quizAttempts: 1, quizScoreSum: 0.9, notesCreated: 2, studySetsCreated: 0, cardsMastered: 1, easeSum: 10, easeCount: 5 }),
    ];
    const totals = computeTotals(snaps);
    expect(totals.reviews).toBe(15);
    expect(totals.correctReviews).toBe(12);
    expect(totals.quizAttempts).toBe(3);
    expect(totals.notesCreated).toBe(3);
    expect(totals.studySetsCreated).toBe(1);
    expect(totals.cardsMastered).toBe(3);
  });

  it('derives rates from summed counters (not averages of per-day rates)', () => {
    // Day 1: 10 reviews, 10 correct  → day rate = 1.0
    // Day 2:  5 reviews,  0 correct  → day rate = 0.0
    // Aggregate: 15 reviews, 10 correct → 10/15 ≈ 0.667 (NOT (1.0+0.0)/2 = 0.5)
    const snaps = [
      makeSnap('2026-06-18', { reviews: 10, correctReviews: 10, easeSum: 0, easeCount: 0, quizAttempts: 0, quizScoreSum: 0 }),
      makeSnap('2026-06-19', { reviews: 5, correctReviews: 0, easeSum: 0, easeCount: 0, quizAttempts: 0, quizScoreSum: 0 }),
    ];
    const totals = computeTotals(snaps);
    expect(totals.retentionRate).toBeCloseTo(10 / 15);
  });

  it('returns null retentionRate when total reviews is 0', () => {
    const snaps = [makeSnap('2026-06-18', { reviews: 0, correctReviews: 0 })];
    const totals = computeTotals(snaps);
    expect(totals.retentionRate).toBeNull();
  });

  it('returns null avgQuizScore when total quizAttempts is 0', () => {
    const snaps = [makeSnap('2026-06-18', { quizAttempts: 0, quizScoreSum: 0 })];
    const totals = computeTotals(snaps);
    expect(totals.avgQuizScore).toBeNull();
  });

  it('returns null avgEase when total easeCount is 0', () => {
    const snaps = [makeSnap('2026-06-18', { easeSum: 0, easeCount: 0 })];
    const totals = computeTotals(snaps);
    expect(totals.avgEase).toBeNull();
  });

  it('computes avgQuizScore from summed quizScoreSum / quizAttempts', () => {
    const snaps = [
      makeSnap('2026-06-18', { quizAttempts: 2, quizScoreSum: 1.4, reviews: 0, correctReviews: 0, easeSum: 0, easeCount: 0 }),
      makeSnap('2026-06-19', { quizAttempts: 1, quizScoreSum: 0.9, reviews: 0, correctReviews: 0, easeSum: 0, easeCount: 0 }),
    ];
    const totals = computeTotals(snaps);
    // 2.3 / 3 ≈ 0.7667
    expect(totals.avgQuizScore).toBeCloseTo(2.3 / 3);
  });

  it('computes avgEase from summed easeSum / easeCount', () => {
    const snaps = [
      makeSnap('2026-06-18', { easeSum: 30, easeCount: 10, reviews: 0, correctReviews: 0, quizAttempts: 0, quizScoreSum: 0 }),
      makeSnap('2026-06-19', { easeSum: 15, easeCount: 5, reviews: 0, correctReviews: 0, quizAttempts: 0, quizScoreSum: 0 }),
    ];
    const totals = computeTotals(snaps);
    // 45 / 15 = 3.0
    expect(totals.avgEase).toBeCloseTo(3.0);
  });
});
