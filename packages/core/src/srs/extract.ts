/**
 * extract.ts — Review-card extractor for `==highlighted==` Markdown spans.
 *
 * Given a Markdown note body, finds every `==…==` highlight and turns it into
 * a `RawCard` with:
 *   - `front`: the highlighted phrase (markers stripped, trimmed).
 *   - `back`:  the surrounding sentence context from the same line (all `==`
 *              markers stripped, trimmed); up to 2 sentences are included.
 *
 * This module is pure text logic — no I/O, no DynamoDB keys, no side-effects.
 * The `noteId` parameter is accepted for caller convenience / signature
 * stability but is not used in extraction.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single review card extracted from a `==highlighted==` span. */
export interface RawCard {
  /** The highlighted phrase, stripped of `==` markers and trimmed. */
  front: string;
  /** The surrounding sentence context, all `==` markers stripped and trimmed. */
  back: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches every `==…==` span (non-greedy, so adjacent spans stay separate). */
const HIGHLIGHT_RE = /==(.+?)==/g;

/** Sentence-boundary delimiters: period / bang / question followed by a space. */
const SENTENCE_DELIMITERS = /(?<=\. |! |\? )/;

/** Minimum allowed length for a card front (noise guard, inclusive). */
const FRONT_MIN_LEN = 2;

/** Maximum allowed length for a card front (noise guard, inclusive). */
const FRONT_MAX_LEN = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips every `==` marker from `text` and trims surrounding whitespace.
 *
 * Used to sanitise both the `front` capture and the `back` context so no
 * raw highlight syntax leaks into the returned card.
 */
function stripMarkers(text: string): string {
  return text.replace(/==/g, '').trim();
}

/**
 * Splits `line` into sentences on `. `, `! `, `? ` boundaries and returns
 * the sentence that contains the `==…==` match at `matchIndex`, plus the
 * immediately following sentence (if any) — a maximum of 2 sentences.
 *
 * When no delimiter is found the whole line is treated as a single sentence.
 *
 * @param line        - The full line of text (with `==` markers still present).
 * @param matchIndex  - The character offset at which the `==match==` begins.
 * @returns           The 1-or-2-sentence context with all `==` markers stripped
 *                    and whitespace trimmed.
 */
function sentenceContext(line: string, matchIndex: number): string {
  // Split on sentence-ending punctuation followed by a space.
  // The lookbehind keeps the delimiter attached to the preceding sentence.
  const sentences = line.split(SENTENCE_DELIMITERS);

  if (sentences.length <= 1) {
    // No sentence boundary found — the whole line is the context.
    return stripMarkers(line);
  }

  // Walk through sentences to find which one contains matchIndex.
  let cursor = 0;
  let containingIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    const end = cursor + sentences[i].length;
    if (matchIndex >= cursor && matchIndex < end) {
      containingIdx = i;
      break;
    }
    cursor = end;
  }

  // Take the containing sentence plus the next one (max 2 total).
  const taken = sentences.slice(containingIdx, containingIdx + 2);
  return stripMarkers(taken.join(''));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts review cards from all `==highlighted==` spans in `markdownBody`.
 *
 * Algorithm:
 *   1. Split the body on newlines into lines.
 *   2. For each line, find all `==…==` matches (non-greedy regex).
 *   3. Build a `RawCard` per match:
 *        - `front` = captured inner text, trimmed.
 *        - `back`  = sentence context from the same line (markers stripped).
 *   4. Apply a noise guard: skip cards whose `front` is shorter than 2 chars
 *      or longer than 200 chars.
 *   5. Return cards in document order.
 *
 * @param noteId        - Accepted for caller convenience; not used internally.
 * @param markdownBody  - Raw Markdown string (may include `==…==` highlights).
 * @returns             Ordered array of `RawCard` objects.
 */
export function extractCards(noteId: string, markdownBody: string): RawCard[] {
  // Fast path: nothing to do for an empty body.
  if (!markdownBody) return [];

  const cards: RawCard[] = [];

  // Process each line independently — highlights don't span lines.
  const lines = markdownBody.split('\n');

  for (const line of lines) {
    // Skip lines that contain no highlight markers at all (cheap pre-check).
    if (!line.includes('==')) continue;

    // Reset lastIndex before each exec loop (required when reusing a RegExp
    // with the `g` flag across iterations).
    HIGHLIGHT_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = HIGHLIGHT_RE.exec(line)) !== null) {
      const front = match[1].trim();

      // Noise guard: skip fronts that are too short or too long to be useful.
      if (front.length < FRONT_MIN_LEN || front.length > FRONT_MAX_LEN) continue;

      // Build the back from sentence context; matchIndex is the full `==…==` start.
      const back = sentenceContext(line, match.index);

      cards.push({ front, back });
    }
  }

  return cards;
}
