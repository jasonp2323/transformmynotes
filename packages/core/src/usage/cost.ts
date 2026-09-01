/**
 * Pure cost-math functions for usage metering (M23).
 *
 * No I/O, no DynamoDB, no AWS SDK. All functions are deterministic and
 * side-effect-free. Rounding is intentionally omitted here — callers
 * (the UI/API layer) format values as needed.
 */

import type { ModelPrice } from './types.js';

// ---------------------------------------------------------------------------
// AI token cost
// ---------------------------------------------------------------------------

/**
 * Converts token counts to USD using the given ModelPrice rates.
 *
 * Formula: (inputTokens / 1000) * inputPer1k + (outputTokens / 1000) * outputPer1k
 *
 * @param input - Token counts for a single invocation or aggregate period.
 * @param price - Per-1k-token rates (USD) for the model.
 * @returns Total cost in USD (full precision, not rounded).
 */
export function aiTokensToUsd(
  input: { inputTokens: number; outputTokens: number },
  price: ModelPrice,
): number {
  return (input.inputTokens / 1000) * price.inputPer1k +
    (input.outputTokens / 1000) * price.outputPer1k;
}

// ---------------------------------------------------------------------------
// Storage cost helpers
// ---------------------------------------------------------------------------

/**
 * Computes the arithmetic mean of an array of daily byte-snapshot values.
 *
 * Each element represents the total bytes stored by a user on one day.
 * The mean approximates the user's average storage footprint over the period.
 *
 * @param snapshots - Array of byte values (one per day). May be empty.
 * @returns Mean bytes, or `0` when `snapshots` is empty.
 */
export function averageBytes(snapshots: number[]): number {
  if (snapshots.length === 0) return 0;
  const sum = snapshots.reduce((acc, b) => acc + b, 0);
  return sum / snapshots.length;
}

/**
 * Converts an average byte value + period length to GB-months.
 *
 * This is the standard daily-snapshot approximation of AWS's continuous
 * GB-month integration: average GB stored, prorated by the fraction of a
 * 30-day month the period covers.
 *
 * Formula: (avgBytes / 1e9) * (periodDays / 30)
 *
 * Example — a full 30-day period where a user stores 5 GB every day:
 *   averageBytes([5e9, 5e9, …]) = 5e9
 *   gbMonths(5e9, 30) = (5e9 / 1e9) * (30 / 30) = 5.0 GB-months
 *
 * A 15-day period with the same footprint would yield 2.5 GB-months, matching
 * AWS's prorated billing for partial months.
 *
 * @param avgBytes   - Mean bytes stored per day over the period.
 * @param periodDays - Number of calendar days in the period (must be > 0).
 * @returns GB-months (full precision). Returns `0` when `periodDays <= 0`.
 */
export function gbMonths(avgBytes: number, periodDays: number): number {
  if (periodDays <= 0) return 0;
  return (avgBytes / 1e9) * (periodDays / 30);
}

/**
 * Converts GB-months to USD using the given S3 per-GB-month rate.
 *
 * @param gbMonthsValue  - Storage in GB-months (from `gbMonths()`).
 * @param s3PerGbMonth   - S3 storage rate in USD per GB-month.
 * @returns Storage cost in USD (full precision, not rounded).
 */
export function storageUsd(gbMonthsValue: number, s3PerGbMonth: number): number {
  return gbMonthsValue * s3PerGbMonth;
}
