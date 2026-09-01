import { describe, it, expect } from 'vitest';
import type { Card } from '@transformmynotes/core';
import { groupByNote } from '../groupByNote';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> & { cardId: string }): Card {
  return {
    front: 'Q',
    back: 'A',
    ease: 2.5,
    interval: 1,
    dueAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('groupByNote', () => {
  const NOTE_A = 'note-id-aaa';
  const NOTE_B = 'note-id-bbb';

  const cards: Card[] = [
    makeCard({ cardId: 'c1', sourceNoteId: NOTE_A, front: 'A1' }),
    makeCard({ cardId: 'c2', sourceNoteId: NOTE_A, front: 'A2' }),
    makeCard({ cardId: 'c3', sourceNoteId: NOTE_B, front: 'B1' }),
    makeCard({ cardId: 'c4' /* no sourceNoteId */, front: 'S1' }),
    makeCard({ cardId: 'c5' /* no sourceNoteId */, front: 'S2' }),
  ];

  const titleMap = new Map([
    [NOTE_A, 'Note Alpha'],
    [NOTE_B, 'Note Beta'],
  ]);

  it('groups note A cards correctly', () => {
    const groups = groupByNote(cards, titleMap);
    const groupA = groups.find((g) => g.sourceNoteId === NOTE_A);
    expect(groupA).toBeDefined();
    expect(groupA!.title).toBe('Note Alpha');
    expect(groupA!.count).toBe(2);
  });

  it('groups note B cards correctly', () => {
    const groups = groupByNote(cards, titleMap);
    const groupB = groups.find((g) => g.sourceNoteId === NOTE_B);
    expect(groupB).toBeDefined();
    expect(groupB!.title).toBe('Note Beta');
    expect(groupB!.count).toBe(1);
  });

  it('groups standalone cards under __standalone__ sentinel with correct title and count', () => {
    const groups = groupByNote(cards, titleMap);
    const standalone = groups.find((g) => g.sourceNoteId === '__standalone__');
    expect(standalone).toBeDefined();
    expect(standalone!.title).toBe('Other / no note');
    expect(standalone!.count).toBe(2);
  });

  it('sorts the standalone group last', () => {
    const groups = groupByNote(cards, titleMap);
    const lastGroup = groups[groups.length - 1];
    expect(lastGroup?.sourceNoteId).toBe('__standalone__');
  });

  it('note groups appear before the standalone group', () => {
    const groups = groupByNote(cards, titleMap);
    const standaloneIndex = groups.findIndex((g) => g.sourceNoteId === '__standalone__');
    const noteAIndex = groups.findIndex((g) => g.sourceNoteId === NOTE_A);
    const noteBIndex = groups.findIndex((g) => g.sourceNoteId === NOTE_B);
    expect(noteAIndex).toBeGreaterThanOrEqual(0);
    expect(noteBIndex).toBeGreaterThanOrEqual(0);
    expect(noteAIndex).toBeLessThan(standaloneIndex);
    expect(noteBIndex).toBeLessThan(standaloneIndex);
  });

  it('returns empty array for empty card list', () => {
    expect(groupByNote([], new Map())).toEqual([]);
  });

  it('returns only a standalone group when all cards have no sourceNoteId', () => {
    const standaloneOnly = [
      makeCard({ cardId: 's1' }),
      makeCard({ cardId: 's2' }),
    ];
    const groups = groupByNote(standaloneOnly, new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sourceNoteId).toBe('__standalone__');
    expect(groups[0]!.count).toBe(2);
  });

  it('uses "Untitled note" for notes missing from the titleMap', () => {
    const unknownNoteCard = [makeCard({ cardId: 'u1', sourceNoteId: 'unknown-id' })];
    const groups = groupByNote(unknownNoteCard, new Map());
    expect(groups[0]!.title).toBe('Untitled note');
  });
});
