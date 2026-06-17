/**
 * Token-budget utilities for multi-note AI generation (M17).
 *
 * All token estimates use the ~4 chars/token approximation, which is a
 * reasonable average for English and Portuguese prose with markdown.
 */

/** Default direct-pass context limit in input tokens. */
export const DEFAULT_CONTEXT_LIMIT = 60_000;

/**
 * Absolute rejection threshold in input tokens. Requests estimated above this
 * are rejected before being sent to the model.
 */
export const HARD_CAP_TOKENS = 200_000;

/**
 * Approximates the total input tokens across the combined texts using ~4 chars/token.
 * Sums each text's length, then rounds (`Math.round`), so a 400-char text → 100
 * tokens exactly. Empty array → 0.
 *
 * @param texts - Array of raw text strings whose lengths are summed.
 * @returns Estimated token count (non-negative integer).
 */
export function estimateTokens(texts: string[]): number {
  if (texts.length === 0) return 0;
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  return Math.round(totalChars / 4);
}

/**
 * Resolves the effective direct-pass context limit (in tokens).
 *
 * Reads `process.env.SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value`; if that
 * string parses to a positive integer, returns it. Otherwise returns
 * `DEFAULT_CONTEXT_LIMIT` (60 000). This matches the secret declaration pattern
 * where an empty/unset default is treated as "use the code default".
 *
 * @returns Context limit in tokens.
 */
export function resolveContextLimit(): number {
  const raw = process.env.SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value;
  if (raw && raw.length > 0) {
    const parsed = parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CONTEXT_LIMIT;
}
