/**
 * Price book defaults and model-price resolution (M23).
 *
 * Rates used in DEFAULT_PRICE_BOOK:
 *  - Claude Sonnet 4.5 (us-east-1 cross-region inference profile) — the current
 *    primary model. The previous primary, Claude 3.5 Sonnet v2, was retired /
 *    reached EOL by AWS Bedrock and is kept here only as a legacy entry for
 *    historical usage records.
 *    $0.003 / 1k input tokens, $0.015 / 1k output tokens.
 *    Source: https://aws.amazon.com/bedrock/pricing/ (Claude Sonnet 4.5,
 *    On-Demand, us-east-1). The `us.*` cross-region inference profile routes to
 *    the same model and uses the same on-demand token rates.
 *  - S3 Standard storage: $0.023 / GB-month.
 *    Source: https://aws.amazon.com/s3/pricing/ (S3 Standard, us-east-1).
 */

import type { PriceBook, ModelPrice } from './types.js';

/**
 * The Bedrock cross-region inference profile the app currently uses as its
 * primary model (Claude Sonnet 4.5, locked in `AI_MODEL_ALLOWLIST` in
 * `study/config.ts`). Listed explicitly as a key in the default price book so
 * lookups are exact.
 */
const CLAUDE_SONNET_45_US = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Bare foundation-model id alias for the same model, kept as a secondary key
 * in case any records were written before the cross-region profile was enforced.
 */
const CLAUDE_SONNET_45_BASE = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Claude Sonnet 4.5 on-demand token rates (USD per 1,000 tokens).
 * Source: AWS Bedrock pricing page, us-east-1.
 */
const SONNET_45_RATES: ModelPrice = {
  inputPer1k: 0.003,  // $0.003 / 1k input tokens
  outputPer1k: 0.015, // $0.015 / 1k output tokens
};

/**
 * LEGACY: the previous primary model (Claude 3.5 Sonnet v2), retired / EOL by
 * AWS Bedrock. Kept only so historical usage records written against it still
 * resolve to a price — never used for new generations.
 */
const CLAUDE_35_SONNET_V2_US =
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Bare foundation-model id alias for the legacy Claude 3.5 Sonnet v2 model.
 */
const CLAUDE_35_SONNET_V2_BASE = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Claude 3.5 Sonnet v2 on-demand token rates (USD per 1,000 tokens). Legacy.
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
    // Primary model — Claude Sonnet 4.5 cross-region inference profile
    // (production + CI).
    [CLAUDE_SONNET_45_US]: SONNET_45_RATES,
    // Bare foundation-model id alias for the primary model.
    [CLAUDE_SONNET_45_BASE]: SONNET_45_RATES,
    // LEGACY: Claude 3.5 Sonnet v2 (retired/EOL) — kept so historical usage
    // records still resolve to a price.
    [CLAUDE_35_SONNET_V2_US]: SONNET_35_V2_RATES,
    [CLAUDE_35_SONNET_V2_BASE]: SONNET_35_V2_RATES,
  },
  /**
   * Fallback rate for any model id not present in `models`.
   * Defaults to Sonnet 4.5 rates (numerically identical to the old Sonnet 3.5
   * v2 fallback) — a conservative overestimate for cheaper models, an
   * underestimate for more expensive ones, but safe enough for an
   * "unrecognized model" guard. The `unpriced: true` flag surfaces this.
   */
  defaultModel: SONNET_45_RATES,
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

// ---------------------------------------------------------------------------
// Price-book input validation (M23.4)
// ---------------------------------------------------------------------------

/**
 * Validates and sanitises a raw `unknown` value as a `PriceBook`.
 *
 * Returns `{ ok: true, value }` on success (with unknown top-level keys stripped),
 * or `{ ok: false, error }` with a human-readable message on failure.
 *
 * Rules:
 * - `models` must be an object; every value must be a valid `ModelPrice`
 *   (finite numbers >= 0); every key must be a non-empty string.
 * - `defaultModel` must be a valid `ModelPrice` (finite numbers >= 0).
 * - `s3PerGbMonth` must be a finite number >= 0.
 * - NaN, Infinity, negative, or missing values are rejected.
 * - Extra top-level keys are stripped (the returned value is a clean `PriceBook`).
 * - An empty `models` map `{}` is valid.
 */
export type ValidatePriceBookResult =
  | { ok: true; value: PriceBook }
  | { ok: false; error: string };

function isValidModelPrice(v: unknown, label: string): string | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return `${label} must be an object with inputPer1k and outputPer1k.`;
  }
  const obj = v as Record<string, unknown>;
  for (const field of ['inputPer1k', 'outputPer1k'] as const) {
    const val = obj[field];
    if (typeof val !== 'number') {
      return `${label}.${field} must be a number.`;
    }
    if (!isFinite(val)) {
      return `${label}.${field} must be a finite number (got ${val}).`;
    }
    if (val < 0) {
      return `${label}.${field} must be >= 0 (got ${val}).`;
    }
  }
  return null; // valid
}

export function validatePriceBookInput(body: unknown): ValidatePriceBookResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Price book must be a JSON object.' };
  }
  const obj = body as Record<string, unknown>;

  // Validate models.
  if (!('models' in obj)) {
    return { ok: false, error: 'Missing required field: models.' };
  }
  const models = obj['models'];
  if (typeof models !== 'object' || models === null || Array.isArray(models)) {
    return { ok: false, error: 'models must be an object.' };
  }
  const modelsObj = models as Record<string, unknown>;
  const validatedModels: Record<string, ModelPrice> = {};
  for (const [key, val] of Object.entries(modelsObj)) {
    if (!key) {
      return { ok: false, error: 'Model id keys must be non-empty strings.' };
    }
    const err = isValidModelPrice(val, `models["${key}"]`);
    if (err) return { ok: false, error: err };
    const mp = val as Record<string, number>;
    validatedModels[key] = { inputPer1k: mp['inputPer1k'], outputPer1k: mp['outputPer1k'] };
  }

  // Validate defaultModel.
  if (!('defaultModel' in obj)) {
    return { ok: false, error: 'Missing required field: defaultModel.' };
  }
  const dmErr = isValidModelPrice(obj['defaultModel'], 'defaultModel');
  if (dmErr) return { ok: false, error: dmErr };
  const dm = obj['defaultModel'] as Record<string, number>;

  // Validate s3PerGbMonth.
  if (!('s3PerGbMonth' in obj)) {
    return { ok: false, error: 'Missing required field: s3PerGbMonth.' };
  }
  const s3Rate = obj['s3PerGbMonth'];
  if (typeof s3Rate !== 'number') {
    return { ok: false, error: 's3PerGbMonth must be a number.' };
  }
  if (!isFinite(s3Rate)) {
    return { ok: false, error: `s3PerGbMonth must be a finite number (got ${s3Rate}).` };
  }
  if (s3Rate < 0) {
    return { ok: false, error: `s3PerGbMonth must be >= 0 (got ${s3Rate}).` };
  }

  // Return clean PriceBook (unknown top-level keys stripped).
  return {
    ok: true,
    value: {
      models: validatedModels,
      defaultModel: { inputPer1k: dm['inputPer1k'], outputPer1k: dm['outputPer1k'] },
      s3PerGbMonth: s3Rate,
    },
  };
}
