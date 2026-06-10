/**
 * Pure time-formatting helpers used by the AdminPending page.
 * Both functions accept an optional `now` parameter for deterministic testing.
 */

/**
 * Returns a compact human-readable duration string for a given number of
 * milliseconds, e.g. "30m", "4h", "2d". Caller is responsible for supplying
 * a non-negative value.
 *
 * @internal — used by relativeTime and formatAvgWait.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Returns a relative-time string for an ISO-8601 datetime, e.g.
 * "just now", "5m ago", "3h ago", "2d ago".
 *
 * @param iso  ISO-8601 datetime string to format.
 * @param now  Optional reference time (defaults to `new Date()`).
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();

  if (ms < 60_000) return 'just now';

  return `${formatDuration(ms)} ago`;
}

/**
 * Returns the average age of a list of ISO-8601 datetimes formatted compactly
 * (e.g. "30m", "4h", "2d"), or "—" when the list is empty.
 *
 * @param isoDates  Array of ISO-8601 datetime strings.
 * @param now       Optional reference time (defaults to `new Date()`).
 */
export function formatAvgWait(isoDates: string[], now: Date = new Date()): string {
  if (isoDates.length === 0) return '—';

  const nowMs = now.getTime();
  const totalMs = isoDates.reduce((sum, iso) => sum + (nowMs - new Date(iso).getTime()), 0);
  const avgMs = totalMs / isoDates.length;

  return formatDuration(avgMs);
}
