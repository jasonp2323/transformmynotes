/**
 * M17.2.1 — multi-source provenance helpers.
 *
 * Pure module: no I/O, no side effects. All functions return new values and
 * never mutate their inputs.
 */

import type { StudyMaterialType } from './types.js';

// ── Primitive sanitiser ───────────────────────────────────────────────────────

/**
 * Keep only ids present in `allowed` (dedup, preserve first-seen order).
 * If the result is empty (the input was empty, non-array, or contained only
 * ids not in `allowed`), fall back to the full `allowed` set.
 */
export function sanitizeSourceNoteIds(ids: unknown, allowed: string[]): string[] {
  if (!Array.isArray(ids)) return [...allowed];

  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (typeof id === 'string' && allowedSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result.length > 0 ? result : [...allowed];
}

// ── Per-type helpers (narrow from `unknown` defensively) ─────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Attach sourceNoteIds to each item in an array property. */
function applyToArrayItems(
  payload: Record<string, unknown>,
  arrayKey: string,
  allowed: string[],
): Record<string, unknown> {
  const arr = payload[arrayKey];
  if (!Array.isArray(arr)) return payload;

  const items = arr.map((item) => {
    if (!isObject(item)) return item;
    return {
      ...item,
      sourceNoteIds: sanitizeSourceNoteIds(item['sourceNoteIds'], allowed),
    };
  });

  return { ...payload, [arrayKey]: items };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach / normalise per-artifact `sourceNoteIds` on a generated payload so
 * every artifact carries a non-empty array drawn only from `allowed`.
 *
 * Pure — returns a new payload, does not mutate the input.
 * `allowed` is the study set's full `sourceNoteIds` (also the default when the
 * model omits the field).
 *
 * Granularity:
 * - `flashcards`  → each `payload.cards[i].sourceNoteIds`
 * - `quiz`        → each `payload.questions[i].sourceNoteIds`
 * - `study_guide` → each `payload.sections[i].sourceNoteIds`
 * - `summary`, `glossary`, `assignment` → top-level `payload.sourceNoteIds`
 *
 * Defensive: if `payload` isn't the expected shape the function returns it
 * unchanged (no throw).
 */
export function applyProvenance(
  type: StudyMaterialType,
  payload: unknown,
  allowed: string[],
): unknown {
  if (!isObject(payload)) return payload;

  switch (type) {
    case 'flashcards':
      return applyToArrayItems(payload, 'cards', allowed);

    case 'quiz':
      return applyToArrayItems(payload, 'questions', allowed);

    case 'study_guide':
      return applyToArrayItems(payload, 'sections', allowed);

    case 'summary':
    case 'glossary':
    case 'assignment':
      return {
        ...payload,
        sourceNoteIds: sanitizeSourceNoteIds(payload['sourceNoteIds'], allowed),
      };

    default:
      // Unknown type — return unchanged.
      return payload;
  }
}
