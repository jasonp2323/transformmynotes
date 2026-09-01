/**
 * cost-format.ts
 *
 * Pure formatting utilities for the Cost Breakdown admin UI.
 * No React imports — safe to import in unit tests without a DOM.
 */

/**
 * Format a number as USD with 2–4 significant decimal places.
 * Values < $0.01 are shown as "<$0.01" to avoid "$0.00" misleading displays.
 * Values >= $1,000 include thousands separators.
 *
 * Examples:
 *   0        → "$0.00"
 *   0.001    → "<$0.01"
 *   0.0123   → "$0.01"
 *   1.2345   → "$1.23"
 *   1234.56  → "$1,234.56"
 */
export function formatUSD(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0.00';
  if (value < 0.005) return '<$0.01';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a token count with thousands-separating commas and a unit suffix.
 * Uses "K" suffix for values >= 10,000 for compactness in table cells.
 *
 * Examples:
 *   0       → "0"
 *   999     → "999"
 *   1500    → "1,500"
 *   15000   → "15K"
 *   1500000 → "1,500K"
 */
export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count >= 10_000) {
    const k = Math.round(count / 1000);
    return k.toLocaleString('en-US') + 'K';
  }
  return count.toLocaleString('en-US');
}

/**
 * Format a plain integer with thousands-separating commas.
 * Alias for use with call counts, row counts, etc.
 *
 * Examples:
 *   0       → "0"
 *   1234    → "1,234"
 *   1000000 → "1,000,000"
 */
export function formatNumber(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  return Math.round(count).toLocaleString('en-US');
}

/**
 * Human-readable byte size using binary (1024) units.
 * Re-exports the same logic as sources-upload.ts so callers can import
 * from one place; the actual implementation is duplicated here to avoid
 * a cross-concern import in the test environment.
 *
 * Examples:
 *   0         → "0 B"
 *   1536      → "1.5 KB"
 *   5_242_880 → "5 MB"
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  const rounded =
    exponent === 0 ? String(bytes) : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[exponent]!}`;
}
