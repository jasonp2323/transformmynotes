import type { DaySnapshot, ProgressTotals } from './types';

/**
 * Format a yyyy-mm-dd date string into a compact chart label.
 * For example: "2026-06-20" → "Jun 20"
 */
export function formatChartDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Convert a 0..1 fraction to a percentage integer, or null if the input is null.
 */
export function pctOrNull(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Math.round(v * 100);
}

/**
 * Format a percentage fraction (0..1) as a display string, e.g. "72%" or "—" when null.
 */
export function formatPct(v: number | null | undefined): string {
  const p = pctOrNull(v);
  return p == null ? '—' : `${p}%`;
}

/**
 * Returns true if all totals are zero / null — indicating a brand-new user with no data.
 */
export function isEmptyTotals(totals: ProgressTotals, days: DaySnapshot[]): boolean {
  if (totals.reviews > 0 || totals.quizAttempts > 0 || totals.notesCreated > 0) return false;
  const hasActivity = days.some(
    (d) => d.reviews > 0 || d.quizAttempts > 0 || d.notesCreated > 0,
  );
  return !hasActivity;
}
