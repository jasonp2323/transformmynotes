/**
 * Pure utility functions for the M25.3 Study Progress read API.
 * No I/O — all exports are side-effect-free and fully unit-testable.
 */

import {
  progressKeys,
  computeRetentionRate,
  computeAvgQuizScore,
  computeAvgEase,
  type DaySnapshotItem,
} from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Range constants
// ---------------------------------------------------------------------------

export const RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
} as const;

export type ProgressRange = keyof typeof RANGE_DAYS;

/** Returns true when `r` is one of the supported range strings. */
export function isValidRange(r: string): r is ProgressRange {
  return Object.prototype.hasOwnProperty.call(RANGE_DAYS, r);
}

// ---------------------------------------------------------------------------
// Date window helpers
// ---------------------------------------------------------------------------

/**
 * Returns the inclusive [fromDate, toDate] window for a given range ending on
 * `today`. `fromDate` is exactly RANGE_DAYS[range]-1 days before `today` so
 * that the window contains exactly N calendar days.
 *
 * All arithmetic is UTC-based.
 */
export function rangeWindow(
  today: string,
  range: ProgressRange,
): { fromDate: string; toDate: string } {
  const n = RANGE_DAYS[range];
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  const fromDate = d.toISOString().slice(0, 10);
  return { fromDate, toDate: today };
}

/**
 * Returns every YYYY-MM-DD date in the inclusive range [fromDate, toDate],
 * in chronological order.
 */
export function listDatesInWindow(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${toDate}T00:00:00Z`);
  const cur = new Date(`${fromDate}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// ProgressDay shape
// ---------------------------------------------------------------------------

export interface ProgressDay {
  date: string;
  reviews: number;
  cardsReviewed: number;
  correctReviews: number;
  quizAttempts: number;
  notesCreated: number;
  studySetsCreated: number;
  cardsMastered: number;
  retentionRate: number | null;
  avgQuizScore: number | null;
  avgEase: number | null;
}

/**
 * Produces one `ProgressDay` per calendar day in the inclusive window
 * [fromDate, toDate], filling gaps with zero counters and null rates when no
 * snapshot exists for that day.
 *
 * Per-day derived rates (retentionRate, avgQuizScore, avgEase) are computed
 * from the snapshot's raw counters via the core compute* helpers.
 * `undefined` return values are mapped to `null` for the JSON contract.
 */
export function densifyDays(
  snapshots: DaySnapshotItem[],
  fromDate: string,
  toDate: string,
): ProgressDay[] {
  // Index snapshots by their parsed date for O(1) lookup.
  const byDate = new Map<string, DaySnapshotItem>();
  for (const snap of snapshots) {
    const { date } = progressKeys.parseDaySk(snap.sk);
    byDate.set(date, snap);
  }

  const dates = listDatesInWindow(fromDate, toDate);
  return dates.map((date) => {
    const snap = byDate.get(date);
    if (!snap) {
      return {
        date,
        reviews: 0,
        cardsReviewed: 0,
        correctReviews: 0,
        quizAttempts: 0,
        notesCreated: 0,
        studySetsCreated: 0,
        cardsMastered: 0,
        retentionRate: null,
        avgQuizScore: null,
        avgEase: null,
      };
    }
    return {
      date,
      reviews: snap.reviews,
      cardsReviewed: snap.cardsReviewed,
      correctReviews: snap.correctReviews,
      quizAttempts: snap.quizAttempts,
      notesCreated: snap.notesCreated,
      studySetsCreated: snap.studySetsCreated,
      cardsMastered: snap.cardsMastered,
      retentionRate: computeRetentionRate(snap.correctReviews, snap.reviews) ?? null,
      avgQuizScore: computeAvgQuizScore(snap.quizScoreSum, snap.quizAttempts) ?? null,
      avgEase: computeAvgEase(snap.easeSum, snap.easeCount) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// ProgressTotals shape
// ---------------------------------------------------------------------------

export interface ProgressTotals {
  reviews: number;
  correctReviews: number;
  quizAttempts: number;
  notesCreated: number;
  studySetsCreated: number;
  cardsMastered: number;
  retentionRate: number | null;
  avgQuizScore: number | null;
  avgEase: number | null;
}

/**
 * Sums raw counters across all snapshots in the window and derives the three
 * aggregate rates from the summed sums (not averages of per-day rates).
 *
 * Division-by-zero cases (e.g. no reviews → no retentionRate) return `null`.
 */
export function computeTotals(snapshots: DaySnapshotItem[]): ProgressTotals {
  let reviews = 0;
  let correctReviews = 0;
  let quizAttempts = 0;
  let quizScoreSum = 0;
  let notesCreated = 0;
  let studySetsCreated = 0;
  let cardsMastered = 0;
  let easeSum = 0;
  let easeCount = 0;

  for (const snap of snapshots) {
    reviews += snap.reviews;
    correctReviews += snap.correctReviews;
    quizAttempts += snap.quizAttempts;
    quizScoreSum += snap.quizScoreSum;
    notesCreated += snap.notesCreated;
    studySetsCreated += snap.studySetsCreated;
    cardsMastered += snap.cardsMastered;
    easeSum += snap.easeSum;
    easeCount += snap.easeCount;
  }

  return {
    reviews,
    correctReviews,
    quizAttempts,
    notesCreated,
    studySetsCreated,
    cardsMastered,
    retentionRate: computeRetentionRate(correctReviews, reviews) ?? null,
    avgQuizScore: computeAvgQuizScore(quizScoreSum, quizAttempts) ?? null,
    avgEase: computeAvgEase(easeSum, easeCount) ?? null,
  };
}
