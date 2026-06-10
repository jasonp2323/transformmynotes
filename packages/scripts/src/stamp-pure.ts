/**
 * stamp-pure — pure helper functions for stamp.ts.
 *
 * No external dependencies, no side-effects: easy to unit-test.
 */

/**
 * Parse the CLI arguments passed after `--` and return a validated
 * `{ issue, action }` pair.
 *
 * Expected: `[<issue-number>, 'start' | 'done']`
 */
export function parseStampArgs(argv: string[]): { issue: number; action: 'start' | 'done' } {
  if (argv.length < 2) {
    throw new Error(
      `stamp: expected 2 arguments (<issue-number> <start|done>), got ${argv.length}.\n` +
        'Usage: npm run -s stamp --prefix packages/scripts -- <issue-number> start|done',
    )
  }

  const rawIssue = argv[0]
  const rawAction = argv[1]

  const issue = Number(rawIssue)
  if (!Number.isInteger(issue) || issue <= 0 || String(issue) !== rawIssue.trim()) {
    throw new Error(
      `stamp: issue-number must be a positive integer, got "${rawIssue}".`,
    )
  }

  if (rawAction !== 'start' && rawAction !== 'done') {
    throw new Error(
      `stamp: action must be "start" or "done", got "${rawAction}".`,
    )
  }

  return { issue, action: rawAction }
}

/**
 * Compute the number of whole minutes between two ISO-8601 timestamps.
 * Result is clamped to >= 0 (negative durations become 0).
 */
export function computeCycleMinutes(startedAtIso: string, completedAtIso: string): number {
  const startMs = new Date(startedAtIso).getTime()
  const endMs = new Date(completedAtIso).getTime()
  const diffMs = endMs - startMs
  return Math.max(0, Math.round(diffMs / 60_000))
}

/**
 * Format a duration in whole minutes as a human-readable string.
 *
 * Rules:
 *  - 1 day = 1440 minutes, 1 hour = 60 minutes.
 *  - Compose days / hours / minutes components; omit zero components.
 *  - Exception: if ALL components are zero, return "0m".
 *
 * Examples:
 *   0    → "0m"
 *   45   → "45m"
 *   90   → "1h 30m"
 *   150  → "2h 30m"
 *   1440 → "1d"
 *   1500 → "1d 1h"
 *   1530 → "1d 1h 30m"
 */
export function formatCycleTime(minutes: number): string {
  const totalMinutes = Math.max(0, Math.round(minutes))

  const days = Math.floor(totalMinutes / 1440)
  const remainAfterDays = totalMinutes % 1440
  const hours = Math.floor(remainAfterDays / 60)
  const mins = remainAfterDays % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)

  return parts.length > 0 ? parts.join(' ') : '0m'
}

/**
 * Return an ISO-8601 datetime string at second precision (no milliseconds),
 * e.g. "2026-06-10T17:47:05Z". The Date is taken as a parameter so it is
 * fully testable.
 */
export function nowIsoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Return the UTC date portion of a Date as "YYYY-MM-DD".
 */
export function todayDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
