import type { ActivitySummary } from '@transformmynotes/core';

/**
 * How long (ms) a completed/failed recent activity stays visible after its
 * last `updatedAt` timestamp before being auto-hidden from the indicator chip.
 */
export const RECENT_WINDOW_MS = 2 * 60 * 1_000; // 2 minutes

/**
 * Returns the subset of `recent` activities that should be shown in the
 * AI activity indicator chip.
 *
 * An item is hidden when:
 *  - its `activityId` is in `dismissedIds`, OR
 *  - its `updatedAt` is older than `windowMs` milliseconds ago.
 *
 * @param recent      - Raw recent list from `AiActivityProvider`.
 * @param dismissedIds - Set of ids the user has explicitly dismissed.
 * @param nowMs       - Current timestamp in ms (pass `Date.now()` at call site
 *                      so callers can control time in tests).
 * @param windowMs    - Visibility window in ms (defaults to RECENT_WINDOW_MS).
 */
export function selectVisibleRecent(
  recent: ActivitySummary[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
  windowMs: number = RECENT_WINDOW_MS,
): ActivitySummary[] {
  return recent.filter(
    (a) =>
      !dismissedIds.has(a.activityId) &&
      nowMs - new Date(a.updatedAt).getTime() <= windowMs,
  );
}
