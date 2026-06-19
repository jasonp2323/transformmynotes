/**
 * Date-range helpers for the admin cost-breakdown API (M23.4).
 *
 * Pure functions — no I/O, no AWS SDK.
 */

/**
 * Returns an inclusive list of YYYY-MM-DD UTC calendar day strings
 * from `fromDay` to `toDay`. Returns `[]` if `fromDay > toDay`.
 */
export function eachDayInRange(fromDay: string, toDay: string): string[] {
  if (fromDay > toDay) return [];
  const result: string[] = [];
  // Parse as UTC midnight dates by appending T00:00:00Z
  let cursor = Date.UTC(
    parseInt(fromDay.slice(0, 4), 10),
    parseInt(fromDay.slice(5, 7), 10) - 1,
    parseInt(fromDay.slice(8, 10), 10),
  );
  const end = Date.UTC(
    parseInt(toDay.slice(0, 4), 10),
    parseInt(toDay.slice(5, 7), 10) - 1,
    parseInt(toDay.slice(8, 10), 10),
  );
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  while (cursor <= end) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    result.push(`${y}-${m}-${day}`);
    cursor += ONE_DAY_MS;
  }
  return result;
}

/** Regex for YYYY-MM-DD format check. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true if the string is a real, parseable calendar date. */
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  // Parse as UTC midnight — NaN if invalid (e.g. 2026-13-40).
  const t = Date.UTC(
    parseInt(s.slice(0, 4), 10),
    parseInt(s.slice(5, 7), 10) - 1,
    parseInt(s.slice(8, 10), 10),
  );
  if (!isFinite(t)) return false;
  // Reconstruct to catch month/day overflow (e.g. 2026-02-30 would roll over).
  const d = new Date(t);
  const reconstructed = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return reconstructed === s;
}

/** UTC today as YYYY-MM-DD. */
function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Subtracts `n` calendar days from a YYYY-MM-DD string (UTC). */
function subtractDays(day: string, n: number): string {
  const t =
    Date.UTC(
      parseInt(day.slice(0, 4), 10),
      parseInt(day.slice(5, 7), 10) - 1,
      parseInt(day.slice(8, 10), 10),
    ) -
    n * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export type ParseDateRangeResult =
  | { ok: true; from: string; to: string; days: string[] }
  | { ok: false; error: string };

/**
 * Parses and validates a `from`/`to` date range from request params.
 *
 * Rules:
 * - Both must be YYYY-MM-DD and real dates.
 * - `from <= to`.
 * - Inclusive day count must be `<= maxDays` (default 92).
 * - When BOTH are absent, defaults to the last `defaultDays` (default 30) ending today (UTC).
 * - When only one is provided, returns an error.
 */
export function parseDateRange(
  params: { from?: string | null; to?: string | null },
  opts?: { maxDays?: number; defaultDays?: number },
): ParseDateRangeResult {
  const maxDays = opts?.maxDays ?? 92;
  const defaultDays = opts?.defaultDays ?? 30;

  const hasFrom = params.from != null && params.from !== '';
  const hasTo = params.to != null && params.to !== '';

  // Both absent → default range.
  if (!hasFrom && !hasTo) {
    const to = todayUtc();
    const from = subtractDays(to, defaultDays - 1);
    const days = eachDayInRange(from, to);
    return { ok: true, from, to, days };
  }

  // Only one provided → error.
  if (hasFrom !== hasTo) {
    return { ok: false, error: 'Both from and to must be provided together.' };
  }

  const from = params.from as string;
  const to = params.to as string;

  if (!isValidDate(from)) {
    return { ok: false, error: `Invalid from date: "${from}". Expected YYYY-MM-DD.` };
  }
  if (!isValidDate(to)) {
    return { ok: false, error: `Invalid to date: "${to}". Expected YYYY-MM-DD.` };
  }
  if (from > to) {
    return { ok: false, error: `from (${from}) must be <= to (${to}).` };
  }

  const days = eachDayInRange(from, to);
  if (days.length > maxDays) {
    return { ok: false, error: `Date range too large (max ${maxDays} days).` };
  }

  return { ok: true, from, to, days };
}
