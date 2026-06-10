/**
 * Token normalisation utilities for full-text search (M6).
 *
 * The pipeline: lowercase → unicode-aware split on non-alphanumeric boundaries
 * → strip empty tokens → filter stop-words → filter very short tokens (< 2
 * chars) → deduplicate (first-occurrence order).
 */

// ---------------------------------------------------------------------------
// Stop-words
// ---------------------------------------------------------------------------

/**
 * A compact set of common English and Spanish stop-words (~100 words).
 * All entries are lowercase. Used by `tokenise` to discard uninformative tokens.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in',
  'on', 'for', 'with', 'as', 'by', 'at', 'from', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it',
  'its', 'he', 'she', 'they', 'we', 'you', 'i', 'not', 'no', 'do',
  'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'shall', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'each', 'all', 'both',
  'few', 'more', 'most', 'other', 'such', 'than', 'too', 'very', 'just',
  'also', 'so', 'up', 'out', 'my', 'your', 'his', 'her', 'our', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'any',
  'me', 'him', 'us', 'them',
  // Spanish
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o',
  'pero', 'si', 'de', 'del', 'al', 'en', 'con', 'por', 'para', 'que',
  'como', 'su', 'sus', 'lo', 'le', 'les', 'se', 'es', 'son', 'era',
  'eran', 'ser', 'este', 'esta', 'estos', 'estas', 'eso', 'esa', 'mas',
  'muy', 'ya', 'nos', 'mi', 'mis', 'tu', 'tus', 'hay', 'sin', 'hasta',
  'desde', 'sobre', 'entre', 'porque', 'cuando', 'donde', 'quien',
]);

// ---------------------------------------------------------------------------
// tokenise
// ---------------------------------------------------------------------------

/**
 * Normalises `text` into a deduplicated array of meaningful tokens suitable
 * for full-text indexing.
 *
 * Pipeline:
 * 1. Coerce `null`/`undefined` / empty input → return `[]`.
 * 2. Lowercase.
 * 3. Split on one-or-more non-alphanumeric characters (unicode-aware via
 *    `\p{L}` + `\p{N}`), so accented letters (e.g. "canción", "façade") are
 *    kept intact.
 * 4. Discard empty strings produced by leading/trailing separators.
 * 5. Filter out stop-words (`STOP_WORDS`).
 * 6. Filter out very short tokens (length < 2) — single characters are noise.
 * 7. Deduplicate, preserving first-occurrence order.
 *
 * @param text - Raw input string (may be `null` / `undefined`).
 * @returns Array of normalised tokens; empty array for blank/null input.
 */
export function tokenise(text: string | null | undefined): string[] {
  if (!text) return [];

  const lower = text.toLowerCase();

  // Split on any run of characters that are NOT unicode letters or digits.
  const raw = lower.split(/[^\p{L}\p{N}]+/u);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of raw) {
    if (!token) continue;
    if (token.length < 2) continue;
    if (STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }

  return result;
}

// ---------------------------------------------------------------------------
// diffTokens
// ---------------------------------------------------------------------------

/**
 * Result of comparing two token sets.
 */
export interface TokenDiff {
  /** Tokens present in `newTokens` but not in `oldTokens`. */
  toAdd: string[];
  /** Tokens present in `oldTokens` but not in `newTokens`. */
  toRemove: string[];
}

/**
 * Computes the delta between two token arrays.
 *
 * Both inputs are de-duplicated first (first-occurrence order).
 * - `toAdd`    = tokens in `newTokens` that are absent from `oldTokens`.
 * - `toRemove` = tokens in `oldTokens` that are absent from `newTokens`.
 *
 * Mirrors the `computeTagDelta` helper in `packages/core/src/db/notes.ts`,
 * but uses the field names `toAdd`/`toRemove` appropriate for a search index.
 *
 * @param oldTokens - Previously indexed tokens.
 * @param newTokens - Freshly computed tokens.
 * @returns `TokenDiff` with `toAdd` and `toRemove` arrays.
 */
export function diffTokens(oldTokens: string[], newTokens: string[]): TokenDiff {
  const oldUnique = [...new Set(oldTokens)];
  const newUnique = [...new Set(newTokens)];
  const oldSet = new Set(oldUnique);
  const newSet = new Set(newUnique);

  return {
    toAdd: newUnique.filter((t) => !oldSet.has(t)),
    toRemove: oldUnique.filter((t) => !newSet.has(t)),
  };
}
