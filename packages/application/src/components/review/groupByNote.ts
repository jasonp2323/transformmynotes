import type { Card } from '@transformmynotes/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroupedNote {
  /** The sourceNoteId, or the sentinel `'__standalone__'` for cards with no note. */
  sourceNoteId: string;
  title: string;
  count: number;
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Groups a flat list of cards by their `sourceNoteId`, using a sentinel key
 * `'__standalone__'` for cards with no note.
 *
 * The standalone group is always sorted **last** in the returned array; note
 * groups retain their insertion order (first-seen wins).
 */
export function groupByNote(cards: Card[], titleMap: Map<string, string>): GroupedNote[] {
  const map = new Map<string, number>();
  for (const card of cards) {
    // Standalone manual cards have no sourceNoteId — bucket under a sentinel.
    const key = card.sourceNoteId ?? '__standalone__';
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const groups: GroupedNote[] = Array.from(map.entries()).map(([sourceNoteId, count]) => ({
    sourceNoteId,
    title:
      sourceNoteId === '__standalone__'
        ? 'Other / no note'
        : (titleMap.get(sourceNoteId) ?? 'Untitled note'),
    count,
  }));

  // Standalone group always sorts last; all note groups keep their insertion order.
  groups.sort((a, b) => {
    if (a.sourceNoteId === '__standalone__') return 1;
    if (b.sourceNoteId === '__standalone__') return -1;
    return 0;
  });

  return groups;
}
