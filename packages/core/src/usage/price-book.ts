/**
 * Price book defaults and model-price resolution (M23).
 *
 * Rates used in DEFAULT_PRICE_BOOK:
 *  - Claude 3.5 Sonnet (us-east-1 cross-region inference profile):
 *    $0.003 / 1k input tokens, $0.015 / 1k output tokens.
 *    Source: https://aws.amazon.com/bedrock/pricing/ (Claude 3.5 Sonnet v2,
 *    On-Demand, us-east-1, as of 2025-06). The `us.*` cross-region inference
 *    profile routes to the same model and uses the same on-demand token rates.
 *  - S3 Standard storage: $0.023 / GB-month.
 *    Source: https://aws.amazon.com/s3/pricing/ (S3 Standard, us-east-1).
 */

import type { PriceBook, ModelPrice } from './types.js';

/**
 * The Bedrock cross-region inference profile the app currently uses as its
 * primary model (locked in `AI_MODEL_ALLOWLIST` in `study/config.ts`).
 * Listed explicitly as a key in the default price book so lookups are exact.
 */
const CLAUDE_35_SONNET_V2_US =
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Bare foundation-model id alias for the same model, kept as a secondary key
 * in case any records were written before the cross-region profile was enforced.
 */
const CLAUDE_35_SONNET_V2_BASE = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Claude 3.5 Sonnet v2 on-demand token rates (USD per 1,000 tokens).
 * Source: AWS Bedrock pricing page, us-east-1, as of 2025-06.
 */
const SONNET_35_V2_RATES: ModelPrice = {
  inputPer1k: 0.003,  // $0.003 / 1k input tokens
  outputPer1k: 0.015, // $0.015 / 1k output tokens
};

/**
 * Sensible default price book seeded at first deploy (M23).
 *
 * Admins can override these values via the admin CONFIG/PRICING item; this
 * constant serves as both the first-run seed and the in-code documentation
 * of the expected shape.
 */
export const DEFAULT_PRICE_BOOK: PriceBook = {
  models: {
    // Primary model — cross-region inference profile (production + CI)
    [CLAUDE_35_SONNET_V2_US]: SONNET_35_V2_RATES,
    // Bare foundation-model id alias (legacy records / test env)
    [CLAUDE_35_SONNET_V2_BASE]: SONNET_35_V2_RATES,
  },
  /**
   * Fallback rate for any model id not present in `models`.
   * Defaults to Sonnet 3.5 v2 rates — a conservative overestimate for cheaper
   * models, an underestimate for more expensive ones, but safe enough for an
   * "unrecognized model" guard. The `unpriced: true` flag surfaces this.
   */
  defaultModel: SONNET_35_V2_RATES,
  /**
   * S3 Standard storage rate.
   * Source: https://aws.amazon.com/s3/pricing/ (us-east-1, first 50 TB / month).
   */
  s3PerGbMonth: 0.023,
};

/**
 * Resolves the price for a given Bedrock model id from the price book.
 *
 * Returns the model's specific rate when it is present in `priceBook.models`
 * (`unpriced: false`). When the model id is unknown, falls back to
 * `priceBook.defaultModel` and sets `unpriced: true` so callers can surface
 * a warning — matching the "unknown-model fallback" guard from the M23 spec.
 *
 * @param priceBook - The currently active price book (admin-editable).
 * @param modelId   - Bedrock model id recorded in the usage aggregate.
 * @returns `{ price, unpriced }` — the resolved ModelPrice and a flag
 *   indicating whether the fallback rate was used.
 */
export function priceForModel(
  priceBook: PriceBook,
  modelId: string,
): { price: ModelPrice; unpriced: boolean } {
  const price = priceBook.models[modelId];
  if (price !== undefined) {
    return { price, unpriced: false };
  }
  return { price: priceBook.defaultModel, unpriced: true };
}
