/**
 * SM-2 spaced-repetition scheduler.
 *
 * Pure function — no I/O, no side effects, no DynamoDB. The `now` parameter is
 * injectable for deterministic testing. Can be swapped for FSRS or another
 * algorithm later without touching callers.
 *
 * Reference: Piotr Wozniak's SuperMemo SM-2 algorithm.
 */

/** Rating given by the learner after reviewing a card. 0–2 = failed; 3–5 = passed. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

/** Persisted state for a single flashcard. */
export interface CardState {
  /** Easiness factor (EF). Starts at 2.5; minimum 1.3. */
  ease: number;
  /** Current inter-repetition interval in days. Starts at 1. */
  interval: number;
  /** ISO-8601 UTC timestamp of when the card is next due. */
  dueAt: string;
}

/** Returned by `schedule` — the updated card state plus the review timestamp. */
export interface ScheduleResult extends CardState {
  /** ISO-8601 UTC timestamp of the review (equals the injected `now`). */
  lastReviewedAt: string;
}

/**
 * Advances a card's SM-2 state given a learner grade and the current time.
 *
 * @param current - The card's existing state (not mutated).
 * @param grade   - Learner's self-assessed grade (0–5).
 * @param now     - Review timestamp; defaults to `new Date()`.
 * @returns A new `ScheduleResult` with updated ease, interval, dueAt, and lastReviewedAt.
 */
export function schedule(current: CardState, grade: Grade, now: Date = new Date()): ScheduleResult {
  const DAY_MS = 24 * 60 * 60 * 1000;

  let newInterval: number;
  let newEase: number;

  if (grade < 3) {
    // Failed: reset interval to 1 day; ease is unchanged per SM-2.
    newInterval = 1;
    newEase = current.ease;
  } else {
    // Passed: compute new interval using current ease, then update ease.
    if (current.interval === 1) {
      newInterval = 6;
    } else if (current.interval === 6) {
      newInterval = 21;
    } else {
      newInterval = Math.round(current.interval * current.ease);
    }

    newEase = current.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (newEase < 1.3) {
      newEase = 1.3;
    }
  }

  const dueAt = new Date(now.getTime() + newInterval * DAY_MS).toISOString();

  return {
    ease: newEase,
    interval: newInterval,
    dueAt,
    lastReviewedAt: now.toISOString(),
  };
}
