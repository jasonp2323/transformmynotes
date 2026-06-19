/**
 * Aggregate rollup reducers for AI usage cost breakdown (M23).
 *
 * Pure functions — no I/O, no DynamoDB, no AWS SDK. Each reducer groups
 * DailyAiAggregate records by a dimension (model, feature, user, or group),
 * sums tokens/calls, and derives USD using the given PriceBook. The `unpriced`
 * flag propagates when any contributing record used the fallback model rate.
 *
 * Ordering: results are sorted by `usd` descending, then `key` ascending, for
 * deterministic output across all callers and tests.
 */

import type { DailyAiAggregate, PriceBook } from './types.js';
import { priceForModel } from './price-book.js';
import { aiTokensToUsd } from './cost.js';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/**
 * A single aggregated cost row produced by a reducer.
 *
 * Carries both physical quantities (tokens, calls) and the derived dollar
 * cost so callers can display either without re-computing.
 */
export interface CostRow {
  /** The grouping key (modelId, feature name, user sub, or group id). */
  key: string;
  /** Total input tokens summed across all contributing records. */
  inputTokens: number;
  /** Total output tokens summed across all contributing records. */
  outputTokens: number;
  /** Total API calls summed across all contributing records. */
  calls: number;
  /** Derived USD cost (full precision; the UI/API layer formats). */
  usd: number;
  /**
   * True when any contributing record used the PriceBook's `defaultModel`
   * fallback rate (i.e., the model id was not found in `priceBook.models`).
   * Surface this in the UI as a "rate may be approximate" warning.
   */
  unpriced: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Accumulator used while building rows before final sort. */
interface Acc {
  inputTokens: number;
  outputTokens: number;
  calls: number;
  usd: number;
  unpriced: boolean;
}

/** Stable sort comparator: usd descending, then key ascending. */
function sortRows(rows: CostRow[]): CostRow[] {
  return rows.slice().sort((a, b) => {
    if (b.usd !== a.usd) return b.usd - a.usd;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** Converts an accumulator map to a sorted CostRow array. */
function accToRows(acc: Map<string, Acc>): CostRow[] {
  const rows: CostRow[] = [];
  for (const [key, a] of acc) {
    rows.push({ key, ...a });
  }
  return sortRows(rows);
}

/** Returns the accumulator entry for `key`, creating it if absent. */
function getOrInit(acc: Map<string, Acc>, key: string): Acc {
  let entry = acc.get(key);
  if (!entry) {
    entry = { inputTokens: 0, outputTokens: 0, calls: 0, usd: 0, unpriced: false };
    acc.set(key, entry);
  }
  return entry;
}

/** Prices a single aggregate record and returns its USD + unpriced flag. */
function priceRecord(
  agg: DailyAiAggregate,
  priceBook: PriceBook,
): { usd: number; unpriced: boolean } {
  const { price, unpriced } = priceForModel(priceBook, agg.model);
  const usd = aiTokensToUsd(
    { inputTokens: agg.inputTokens, outputTokens: agg.outputTokens },
    price,
  );
  return { usd, unpriced };
}

// ---------------------------------------------------------------------------
// Public reducers
// ---------------------------------------------------------------------------

/**
 * Groups aggregates by Bedrock model id.
 *
 * USD for each row is computed from the model's own rate in the price book.
 * The `key` is the model id.
 */
export function reduceByModel(
  aggs: DailyAiAggregate[],
  priceBook: PriceBook,
): CostRow[] {
  const acc = new Map<string, Acc>();
  for (const agg of aggs) {
    const { usd, unpriced } = priceRecord(agg, priceBook);
    const row = getOrInit(acc, agg.model);
    row.inputTokens += agg.inputTokens;
    row.outputTokens += agg.outputTokens;
    row.calls += agg.calls;
    row.usd += usd;
    if (unpriced) row.unpriced = true;
  }
  return accToRows(acc);
}

/**
 * Groups aggregates by feature name.
 *
 * A feature can span multiple models; USD is the sum of each record's own
 * model-priced cost. `unpriced` is true if any contributing record used the
 * fallback rate. The `key` is the feature name.
 */
export function reduceByFeature(
  aggs: DailyAiAggregate[],
  priceBook: PriceBook,
): CostRow[] {
  const acc = new Map<string, Acc>();
  for (const agg of aggs) {
    const { usd, unpriced } = priceRecord(agg, priceBook);
    const row = getOrInit(acc, agg.feature);
    row.inputTokens += agg.inputTokens;
    row.outputTokens += agg.outputTokens;
    row.calls += agg.calls;
    row.usd += usd;
    if (unpriced) row.unpriced = true;
  }
  return accToRows(acc);
}

/**
 * Groups aggregates by user (Cognito sub).
 *
 * The `key` is the user's sub. USD is the sum of each record's own
 * model-priced cost.
 */
export function reduceByUser(
  aggs: DailyAiAggregate[],
  priceBook: PriceBook,
): CostRow[] {
  const acc = new Map<string, Acc>();
  for (const agg of aggs) {
    const { usd, unpriced } = priceRecord(agg, priceBook);
    const row = getOrInit(acc, agg.sub);
    row.inputTokens += agg.inputTokens;
    row.outputTokens += agg.outputTokens;
    row.calls += agg.calls;
    row.usd += usd;
    if (unpriced) row.unpriced = true;
  }
  return accToRows(acc);
}

/**
 * Groups aggregates by group id, resolved from a caller-supplied mapping.
 *
 * Records whose `sub` is not in `subToGroup` are bucketed under the literal
 * key `'(no group)'`. The `key` is the group id (or `'(no group)'`).
 *
 * Group membership resolution is intentionally NOT done here — the mapping
 * is accepted as a parameter so this function remains pure and testable
 * without a DynamoDB round-trip.
 *
 * @param aggs       - AI usage aggregates to roll up.
 * @param priceBook  - The currently active price book.
 * @param subToGroup - Maps each user sub to its group id.
 */
export function reduceByGroup(
  aggs: DailyAiAggregate[],
  priceBook: PriceBook,
  subToGroup: Map<string, string>,
): CostRow[] {
  const NO_GROUP = '(no group)';
  const acc = new Map<string, Acc>();
  for (const agg of aggs) {
    const { usd, unpriced } = priceRecord(agg, priceBook);
    const groupKey = subToGroup.get(agg.sub) ?? NO_GROUP;
    const row = getOrInit(acc, groupKey);
    row.inputTokens += agg.inputTokens;
    row.outputTokens += agg.outputTokens;
    row.calls += agg.calls;
    row.usd += usd;
    if (unpriced) row.unpriced = true;
  }
  return accToRows(acc);
}

/**
 * Computes the account-wide total across all aggregates.
 *
 * Returns a single object with summed quantities and derived USD; `unpriced`
 * is true if any record used the fallback model rate.
 */
export function totalCost(
  aggs: DailyAiAggregate[],
  priceBook: PriceBook,
): {
  inputTokens: number;
  outputTokens: number;
  calls: number;
  usd: number;
  unpriced: boolean;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let usd = 0;
  let unpriced = false;

  for (const agg of aggs) {
    const { usd: recordUsd, unpriced: recordUnpriced } = priceRecord(agg, priceBook);
    inputTokens += agg.inputTokens;
    outputTokens += agg.outputTokens;
    calls += agg.calls;
    usd += recordUsd;
    if (recordUnpriced) unpriced = true;
  }

  return { inputTokens, outputTokens, calls, usd, unpriced };
}
