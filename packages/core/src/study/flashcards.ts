/**
 * Typed accessor for a *ready* flashcards StudySet payload (M14).
 *
 * A flashcards StudySet is generated asynchronously by M13's pipeline:
 * `generateStudyMaterial({ type: 'flashcards', ... })` produces a `toolUse.input`
 * matching `TOOL_SCHEMAS.flashcards`, which a DynamoDB-stream Lambda stores as JSON
 * in S3 and serves via `GET /api/study/[studySetId]/body`.
 *
 * `parseFlashcardsPayload` validates that raw payload at the boundary so M14's
 * review-before-accept + accept-cards flows can rely on a clean `RawFlashcard[]`.
 * It is pure and dependency-free (plain runtime checks, no zod), and throws a
 * structured Error rather than silently returning an empty array when generation
 * produced nothing usable.
 */

export interface RawFlashcard {
  front: string;
  back: string;
  sourceSpan?: string;
}

export interface FlashcardsPayload {
  cards: RawFlashcard[];
}

/** Mirrors TOOL_SCHEMAS.flashcards `cards.maxItems`. */
const MAX_CARDS = 20;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate the payload of a ready flashcards StudySet and return the cards.
 *
 * @throws {Error} when the payload is not an object, `cards` is missing/not an
 * array/empty, exceeds the 20-card cap, or any card is missing a non-empty
 * string `front`/`back`.
 */
export function parseFlashcardsPayload(payload: unknown): RawFlashcard[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('flashcard payload is not an object');
  }

  const cards = (payload as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) {
    throw new Error('flashcard payload is missing a `cards` array');
  }
  if (cards.length === 0) {
    throw new Error('flashcard generation returned no cards');
  }
  if (cards.length > MAX_CARDS) {
    throw new Error(`flashcard generation returned ${cards.length} cards (max ${MAX_CARDS})`);
  }

  return cards.map((card, index) => {
    if (typeof card !== 'object' || card === null || Array.isArray(card)) {
      throw new Error(`flashcard at index ${index} is not an object`);
    }
    const { front, back, sourceSpan } = card as {
      front?: unknown;
      back?: unknown;
      sourceSpan?: unknown;
    };
    if (!isNonEmptyString(front)) {
      throw new Error(`flashcard at index ${index} is missing a non-empty string \`front\``);
    }
    if (!isNonEmptyString(back)) {
      throw new Error(`flashcard at index ${index} is missing a non-empty string \`back\``);
    }

    const result: RawFlashcard = { front, back };
    if (isNonEmptyString(sourceSpan)) {
      result.sourceSpan = sourceSpan;
    }
    return result;
  });
}
