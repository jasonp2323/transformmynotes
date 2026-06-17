/**
 * Jaccard trigram cross-note deduplication for study material candidates (M17).
 *
 * Candidates that share a normalised key with word-trigram Jaccard similarity
 * >= JACCARD_THRESHOLD are merged: one representative is kept and the merged
 * item carries the union of both items' `sourceNoteIds`.
 */

/** Minimum Jaccard similarity to consider two candidates duplicates. */
export const JACCARD_THRESHOLD = 0.75;

/**
 * Normalises a string for similarity comparison.
 * - Lowercases.
 * - Strips punctuation (replaces `[^\p{L}\p{N}\s]` with space, unicode-aware).
 * - Collapses consecutive whitespace to a single space.
 * - Trims leading/trailing whitespace.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenises a normalised string into words.
 */
function words(normalised: string): string[] {
  if (!normalised) return [];
  return normalised.split(' ').filter((w) => w.length > 0);
}

/**
 * Builds a set of word-trigrams (sliding window of 3 consecutive words, joined
 * by a space) from the provided word array.  When fewer than 3 words are
 * present, falls back to using the set of the words themselves so short strings
 * still compare meaningfully.
 */
function buildTrigrams(ws: string[]): Set<string> {
  if (ws.length < 3) {
    return new Set(ws);
  }
  const trigrams = new Set<string>();
  for (let i = 0; i <= ws.length - 3; i++) {
    trigrams.add(`${ws[i]} ${ws[i + 1]} ${ws[i + 2]}`);
  }
  return trigrams;
}

/**
 * Computes Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|.
 * Both-empty edge case: treats as similarity 1 only if the original normalised
 * strings are equal, else 0.
 */
function jaccardSimilarity(
  a: Set<string>,
  b: Set<string>,
  normA: string,
  normB: string,
): number {
  if (a.size === 0 && b.size === 0) {
    return normA === normB ? 1 : 0;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates an array of candidates using Jaccard word-trigram similarity.
 *
 * Candidates with similarity >= `JACCARD_THRESHOLD` are merged:
 * - Their `sourceNoteIds` are unioned (de-duplicated, first-occurrence order).
 * - The kept representative is the one whose `getKey` string is longer (the
 *   richer/more-informative key wins); ties keep the earlier candidate.
 *
 * Order of returned candidates follows first-seen order.
 *
 * @param candidates - Array of candidates to deduplicate.
 * @param getKey - Extracts the text used for similarity comparison.
 * @returns Deduplicated array with merged `sourceNoteIds`.
 */
export function deduplicateCandidates<T extends { sourceNoteIds: string[] }>(
  candidates: T[],
  getKey: (t: T) => string,
): T[] {
  if (candidates.length === 0) return [];

  // Each kept representative, with its pre-computed trigram data.
  const reps: Array<{
    candidate: T;
    normKey: string;
    trigrams: Set<string>;
  }> = [];

  for (const candidate of candidates) {
    const key = getKey(candidate);
    const norm = normalise(key);
    const ws = words(norm);
    const trigrams = buildTrigrams(ws);

    // Search existing representatives for a near-duplicate.
    let merged = false;
    for (const rep of reps) {
      const similarity = jaccardSimilarity(trigrams, rep.trigrams, norm, rep.normKey);
      if (similarity >= JACCARD_THRESHOLD) {
        // Merge: union sourceNoteIds (preserving order, deduplicating).
        const unionIds = [
          ...rep.candidate.sourceNoteIds,
          ...candidate.sourceNoteIds.filter(
            (id) => !rep.candidate.sourceNoteIds.includes(id),
          ),
        ];

        // The candidate with the longer getKey wins as the representative
        // content; ties (equal length) keep the earlier representative.
        if (key.length > getKey(rep.candidate).length) {
          // Replace rep content with the new candidate, but keep unioned ids.
          rep.candidate = { ...candidate, sourceNoteIds: unionIds };
          rep.normKey = norm;
          rep.trigrams = trigrams;
        } else {
          rep.candidate = { ...rep.candidate, sourceNoteIds: unionIds };
        }

        merged = true;
        break;
      }
    }

    if (!merged) {
      reps.push({ candidate, normKey: norm, trigrams });
    }
  }

  return reps.map((r) => r.candidate);
}
