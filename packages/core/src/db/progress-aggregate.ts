/**
 * Pure aggregation functions for the M25 Study Progress event log.
 *
 * No I/O — all functions are pure and fully unit-testable. They are consumed
 * by the M25.2 stream aggregator (delta increments) and nightly finalize cron
 * (fold-and-recompute for self-healing).
 */

import type { Grade } from '../srs/scheduler.js';
import type { StudyEvent } from './progress.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Number of days an SM-2 card's interval must reach for the card to be
 * considered "mastered" (mature). Cards that transition from below this
 * threshold to at-or-above are counted as newly mastered.
 */
export const MASTERY_THRESHOLD_DAYS = 21;

// ---------------------------------------------------------------------------
// Day-counter shape (subset of DaySnapshotItem without pk/sk/derived fields)
// ---------------------------------------------------------------------------

/** The raw counter fields accumulated per day. Used by folding and delta functions. */
export interface DayCounters {
  reviews: number;
  cardsReviewed: number;
  correctReviews: number;
  easeSum: number;
  easeCount: number;
  quizAttempts: number;
  quizScoreSum: number;
  notesCreated: number;
  studySetsCreated: number;
  cardsMastered: number;
}

// ---------------------------------------------------------------------------
// Activity guard helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a `DayCounters`-shaped object has at least one unit of
 * activity — i.e. any of the four primary activity counters is greater than zero.
 *
 * Used by the nightly finalize cron to identify which day snapshots count as
 * "active" when computing the study streak. Days where all four counters are
 * zero (e.g. the cron wrote a self-heal snapshot but the user did nothing) are
 * NOT considered active.
 */
export function dayHasActivity(
  c: Pick<DayCounters, 'reviews' | 'notesCreated' | 'quizAttempts' | 'studySetsCreated'>,
): boolean {
  return c.reviews > 0 || c.notesCreated > 0 || c.quizAttempts > 0 || c.studySetsCreated > 0;
}

// ---------------------------------------------------------------------------
// Grade helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the SM-2 grade represents a passing review.
 * In SM-2, grades 0–2 reset the card (failed) and grades 3–5 advance it
 * (passed). This matches the scheduler's threshold (`grade < 3` = failed).
 */
export function isCorrectGrade(grade: Grade): boolean {
  return grade >= 3;
}

// ---------------------------------------------------------------------------
// Mastery transition
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a card's interval crosses the mastery threshold on this
 * review — i.e. `prevIntervalDays` was below the threshold and `newIntervalDays`
 * is at or above it. Used to count newly mastered cards without double-counting
 * cards already above the threshold.
 *
 * @param prevIntervalDays - The card's interval before this review.
 * @param newIntervalDays  - The card's interval after this review.
 * @param threshold        - Mastery threshold in days (defaults to `MASTERY_THRESHOLD_DAYS`).
 */
export function isMasteryTransition(
  prevIntervalDays: number,
  newIntervalDays: number,
  threshold: number = MASTERY_THRESHOLD_DAYS,
): boolean {
  return prevIntervalDays < threshold && newIntervalDays >= threshold;
}

// ---------------------------------------------------------------------------
// Per-event counter delta
// ---------------------------------------------------------------------------

/**
 * Returns the partial `DayCounters` increments that a single `StudyEvent`
 * contributes to its day's snapshot. Used by the stream aggregator to compute
 * the `ADD` operands for an `UpdateCommand`.
 *
 * Callers sum these deltas; the keys present vary by event kind.
 */
export function deltaForEvent(event: StudyEvent): Partial<DayCounters> {
  switch (event.kind) {
    case 'REVIEW':
      return {
        reviews: 1,
        cardsReviewed: 1,
        correctReviews: isCorrectGrade(event.grade) ? 1 : 0,
        easeSum: event.newEase,
        easeCount: 1,
        cardsMastered: isMasteryTransition(event.prevIntervalDays, event.newIntervalDays) ? 1 : 0,
      };

    case 'QUIZATTEMPT':
      return {
        quizAttempts: 1,
        quizScoreSum: event.score,
      };

    case 'NOTE_CREATED':
      return { notesCreated: 1 };

    case 'STUDYSET_CREATED':
      return { studySetsCreated: 1 };
  }
}

// ---------------------------------------------------------------------------
// Fold a day's events into counters (used by the cron self-heal)
// ---------------------------------------------------------------------------

/** Returns a zeroed `DayCounters` object. */
function zeroDayCounters(): DayCounters {
  return {
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
  };
}

/**
 * Reduces an array of `StudyEvent` objects (all from the same UTC day) into
 * a complete `DayCounters` snapshot. Used by the nightly finalize cron to
 * re-derive a day's totals from raw events (self-healing for missed stream
 * deliveries).
 */
export function foldEventsToDay(events: StudyEvent[]): DayCounters {
  const acc = zeroDayCounters();
  for (const event of events) {
    const delta = deltaForEvent(event);
    acc.reviews += delta.reviews ?? 0;
    acc.cardsReviewed += delta.cardsReviewed ?? 0;
    acc.correctReviews += delta.correctReviews ?? 0;
    acc.easeSum += delta.easeSum ?? 0;
    acc.easeCount += delta.easeCount ?? 0;
    acc.quizAttempts += delta.quizAttempts ?? 0;
    acc.quizScoreSum += delta.quizScoreSum ?? 0;
    acc.notesCreated += delta.notesCreated ?? 0;
    acc.studySetsCreated += delta.studySetsCreated ?? 0;
    acc.cardsMastered += delta.cardsMastered ?? 0;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Derived metric helpers
// ---------------------------------------------------------------------------

/**
 * Computes the retention rate (percentage of passing reviews).
 * Returns `undefined` when `reviews` is 0 to avoid division by zero.
 */
export function computeRetentionRate(
  correctReviews: number,
  reviews: number,
): number | undefined {
  if (reviews === 0) return undefined;
  return correctReviews / reviews;
}

/**
 * Computes the average quiz score across all quiz attempts for a day.
 * Returns `undefined` when `quizAttempts` is 0 to avoid division by zero.
 */
export function computeAvgQuizScore(
  quizScoreSum: number,
  quizAttempts: number,
): number | undefined {
  if (quizAttempts === 0) return undefined;
  return quizScoreSum / quizAttempts;
}

/**
 * Computes the average SM-2 ease factor across all reviews for a day.
 * Returns `undefined` when `easeCount` is 0 to avoid division by zero.
 */
export function computeAvgEase(easeSum: number, easeCount: number): number | undefined {
  if (easeCount === 0) return undefined;
  return easeSum / easeCount;
}

// ---------------------------------------------------------------------------
// Streak computation
// ---------------------------------------------------------------------------

/** Result of a streak computation. */
export interface StreakResult {
  /** Number of consecutive days with activity ending today or yesterday. */
  current: number;
  /** Longest consecutive run of active days ever recorded. */
  longest: number;
  /** The most recent active day (YYYY-MM-DD), or `null` when no activity exists. */
  lastStudyDay: string | null;
}

/**
 * Adds `n` calendar days to a YYYY-MM-DD date string, using UTC arithmetic.
 * Handles month and year boundaries correctly.
 */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Computes the current streak and longest streak from a set of active days.
 *
 * - `activeDays` is the set of YYYY-MM-DD calendar days (UTC) on which the
 *   user performed any study activity. Duplicates are ignored; order is irrelevant.
 * - `today` is the current UTC date (YYYY-MM-DD). The current streak counts
 *   consecutive days ending on `today` OR `yesterday` so a streak isn't broken
 *   until a full UTC day with no activity passes.
 * - The longest streak is the longest consecutive run ever recorded in `activeDays`.
 *
 * Returns `{ current: 0, longest: 0, lastStudyDay: null }` for empty input.
 */
export function computeStreak(
  activeDays: string[],
  today: string,
): StreakResult {
  if (activeDays.length === 0) {
    return { current: 0, longest: 0, lastStudyDay: null };
  }

  // De-duplicate and sort ascending.
  const sorted = [...new Set(activeDays)].sort();
  const lastStudyDay = sorted[sorted.length - 1];

  // ── Longest streak ────────────────────────────────────────────────────────
  let longest = 1;
  let runLen = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1], 1) === sorted[i]) {
      runLen++;
      if (runLen > longest) longest = runLen;
    } else {
      runLen = 1;
    }
  }

  // ── Current streak ────────────────────────────────────────────────────────
  // The current streak extends if the last active day is today or yesterday.
  const yesterday = addDays(today, -1);
  const isActive = lastStudyDay === today || lastStudyDay === yesterday;

  let current = 0;
  if (isActive) {
    // Walk backwards from lastStudyDay counting consecutive days.
    current = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (addDays(sorted[i], 1) === sorted[i + 1]) {
        current++;
      } else {
        break;
      }
    }
  }

  return { current, longest, lastStudyDay };
}
