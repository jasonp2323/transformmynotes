/**
 * Pure date/time helpers for rate-limit window calculations.
 * All inputs/outputs use UTC to avoid timezone-dependent behaviour.
 */

/**
 * Returns the UTC date string (YYYY-MM-DD) for the given epoch milliseconds.
 * e.g. utcDateString(Date.UTC(2026, 5, 18, 23, 59, 0)) === '2026-06-18'
 */
export function utcDateString(now: number): string {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the epoch SECONDS of the next UTC midnight strictly after `now`.
 * If `now` is exactly at midnight, returns the NEXT day's midnight
 * (i.e., midnight + 86400 seconds).
 *
 * e.g. nextMidnightUtcEpochSeconds(Date.UTC(2026, 5, 18, 23, 59, 0)) === Date.UTC(2026, 5, 19) / 1000
 *      nextMidnightUtcEpochSeconds(Date.UTC(2026, 5, 19, 0, 0, 0)) === Date.UTC(2026, 5, 20) / 1000
 */
export function nextMidnightUtcEpochSeconds(now: number): number {
  const d = new Date(now);
  // Advance to the start of the next UTC day
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1, // always +1 day, covers both "strictly after" and "at midnight" cases
    0, 0, 0, 0,
  );
  return Math.floor(nextMidnight / 1000);
}
