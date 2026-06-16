/**
 * Unit tests for `diffCards` — pure diff of extracted RawCard[] vs stored Card[].
 *
 * No I/O. All test cases are deterministic.
 */

import { describe, it, expect } from 'vitest';
import { diffCards } from '../../src/db/cards.js';
import type { Card } from '../../src/db/cards.js';
import type { RawCard } from '../../src/srs/extract.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Card fixture, defaulting lastReviewedAt to absent. */
function makeCard(overrides: Partial<Card> & Pick<Card, 'cardId' | 'front' | 'back'>): Card {
  return {
    sourceNoteId: 'note-001',
    ease: 2.5,
    interval: 1,
    dueAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Build a minimal RawCard. */
function raw(front: string, back = `context for ${front}`): RawCard {
  return { front, back };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diffCards', () => {
  // ---------------------------------------------------------------------------
  // All-new creates
  // ---------------------------------------------------------------------------

  describe('all-new creates', () => {
    it('creates all extracted cards when existing is empty', () => {
      const extracted = [raw('alpha'), raw('beta'), raw('gamma')];
      const { toCreate, toDelete, unchanged } = diffCards(extracted, []);
      expect(toCreate).toHaveLength(3);
      expect(toCreate.map((c) => c.front)).toEqual(['alpha', 'beta', 'gamma']);
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotent re-extract
  // ---------------------------------------------------------------------------

  describe('identical re-extract → all unchanged, nothing created or deleted', () => {
    it('is idempotent when extracted fronts match existing fronts exactly', () => {
      const existing = [
        makeCard({ cardId: 'c1', front: 'alpha', back: 'ctx alpha' }),
        makeCard({ cardId: 'c2', front: 'beta', back: 'ctx beta' }),
      ];
      const extracted = [raw('alpha'), raw('beta')];

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toCreate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Removed unreviewed highlight → toDelete
  // ---------------------------------------------------------------------------

  describe('removed unreviewed highlight', () => {
    it('puts an unreviewed orphaned card into toDelete', () => {
      const existing = [
        makeCard({ cardId: 'c1', front: 'alpha', back: 'ctx' }),
        makeCard({ cardId: 'c2', front: 'removed', back: 'ctx' }), // no lastReviewedAt
      ];
      const extracted = [raw('alpha')]; // 'removed' highlight gone

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].cardId).toBe('c2');
      expect(unchanged).toHaveLength(1);
      expect(unchanged[0].cardId).toBe('c1');
      expect(toCreate).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Removed REVIEWED highlight → preserved in unchanged
  // ---------------------------------------------------------------------------

  describe('removed REVIEWED highlight', () => {
    it('preserves a reviewed card in unchanged even after its highlight is removed', () => {
      const existing = [
        makeCard({ cardId: 'c1', front: 'alpha', back: 'ctx' }),
        makeCard({
          cardId: 'c2',
          front: 'reviewed-gone',
          back: 'ctx',
          lastReviewedAt: '2024-06-01T00:00:00.000Z',
        }),
      ];
      const extracted = [raw('alpha')]; // 'reviewed-gone' removed from note

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(2);
      const preservedIds = unchanged.map((c) => c.cardId).sort();
      expect(preservedIds).toEqual(['c1', 'c2'].sort());
      expect(toCreate).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate fronts in extracted are deduped
  // ---------------------------------------------------------------------------

  describe('duplicate fronts in extracted', () => {
    it('dedupes extracted cards with the same front — only one create', () => {
      const extracted = [raw('dup', 'first ctx'), raw('dup', 'second ctx'), raw('unique')];
      const { toCreate, toDelete, unchanged } = diffCards(extracted, []);
      // Only one 'dup' card should be created (the first occurrence).
      expect(toCreate).toHaveLength(2);
      expect(toCreate.map((c) => c.front)).toEqual(['dup', 'unique']);
      // The kept 'dup' is the first occurrence.
      expect(toCreate[0].back).toBe('first ctx');
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(0);
    });

    it('deduped extracted front matches an existing card → counts as unchanged, not created', () => {
      const existing = [makeCard({ cardId: 'c1', front: 'dup', back: 'stored ctx' })];
      const extracted = [raw('dup', 'new ctx 1'), raw('dup', 'new ctx 2')];

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toCreate).toHaveLength(0);
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(1);
      expect(unchanged[0].cardId).toBe('c1');
    });
  });

  // ---------------------------------------------------------------------------
  // Changed front = delete old (if unreviewed) + create new
  // ---------------------------------------------------------------------------

  describe('changed front', () => {
    it('creates the new front and deletes the old unreviewed card', () => {
      const existing = [makeCard({ cardId: 'old', front: 'old-front', back: 'ctx' })];
      const extracted = [raw('new-front')];

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toCreate).toHaveLength(1);
      expect(toCreate[0].front).toBe('new-front');
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].cardId).toBe('old');
      expect(unchanged).toHaveLength(0);
    });

    it('creates the new front but preserves a reviewed card with the old front', () => {
      const existing = [
        makeCard({
          cardId: 'reviewed-old',
          front: 'old-reviewed',
          back: 'ctx',
          lastReviewedAt: '2024-05-01T00:00:00.000Z',
        }),
      ];
      const extracted = [raw('new-front')];

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toCreate).toHaveLength(1);
      expect(toCreate[0].front).toBe('new-front');
      expect(toDelete).toHaveLength(0);
      expect(unchanged).toHaveLength(1);
      expect(unchanged[0].cardId).toBe('reviewed-old');
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed scenario
  // ---------------------------------------------------------------------------

  describe('mixed scenario', () => {
    it('handles create + delete + unchanged in one diff correctly', () => {
      const existing = [
        makeCard({ cardId: 'keep', front: 'keep-me', back: 'ctx' }),
        makeCard({ cardId: 'del', front: 'delete-me', back: 'ctx' }), // unreviewed orphan
        makeCard({
          cardId: 'preserve',
          front: 'preserve-me',
          back: 'ctx',
          lastReviewedAt: '2024-05-01T00:00:00.000Z',
        }), // reviewed orphan
      ];
      const extracted = [raw('keep-me'), raw('brand-new')];

      const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
      expect(toCreate).toHaveLength(1);
      expect(toCreate[0].front).toBe('brand-new');
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].cardId).toBe('del');
      expect(unchanged).toHaveLength(2);
      const unchangedIds = unchanged.map((c) => c.cardId).sort();
      expect(unchangedIds).toEqual(['keep', 'preserve'].sort());
    });
  });
});

// ---------------------------------------------------------------------------
// AI cards are never auto-pruned (M14)
// ---------------------------------------------------------------------------

describe('AI card preservation', () => {
  it('an origin:"ai" card with no lastReviewedAt is preserved in unchanged, not toDelete', () => {
    const existing = [
      makeCard({ cardId: 'ai-card', front: 'AI question', back: 'AI answer', origin: 'ai' }),
    ];
    const extracted: RawCard[] = []; // no highlights at all

    const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);
    expect(toDelete).toHaveLength(0);
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].cardId).toBe('ai-card');
    expect(toCreate).toHaveLength(0);
  });

  it('an origin:"ai" card is preserved even when a highlight card with the same front would be deleted', () => {
    const existing = [
      // highlight card with no lastReviewedAt — would normally be deleted
      makeCard({ cardId: 'highlight-card', front: 'shared-front', back: 'h-back' }),
      // AI card with the same front and no lastReviewedAt — must be preserved
      makeCard({ cardId: 'ai-card', front: 'ai-only-front', back: 'a-back', origin: 'ai' }),
    ];
    const extracted: RawCard[] = []; // everything removed

    const { toDelete, unchanged } = diffCards(extracted, existing);
    // highlight card has no lastReviewedAt and no ai origin → toDelete
    expect(toDelete.map((c) => c.cardId)).toContain('highlight-card');
    // ai card → unchanged regardless
    expect(unchanged.map((c) => c.cardId)).toContain('ai-card');
    expect(toDelete.map((c) => c.cardId)).not.toContain('ai-card');
  });
});
