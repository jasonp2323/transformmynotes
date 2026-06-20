/**
 * Unit tests for `buildCardItem` and `diffCards` in cards.ts.
 * No I/O — pure function tests only.
 *
 * Covers:
 *   - buildCardItem with origin:'manual' and no sourceNoteId → attribute absent
 *   - buildCardItem with origin:'manual' and sourceNoteId present
 *   - diffCards: manual cards are never auto-pruned (survive an empty-body sync)
 *   - diffCards: ai cards are never auto-pruned (pre-existing behaviour, regression guard)
 */

import { describe, it, expect } from 'vitest';
import { buildCardItem, diffCards } from '../cards.js';

// ---------------------------------------------------------------------------
// buildCardItem — manual card shape
// ---------------------------------------------------------------------------

describe('buildCardItem — origin:manual without sourceNoteId', () => {
  const INPUT = {
    sub: 'sub-unit-001',
    cardId: 'card-unit-001',
    front: 'What is the speed of light?',
    back: 'Approximately 299,792 km/s',
    dueAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    origin: 'manual' as const,
    ease: 2.5,
    interval: 0,
  };

  it('does NOT include a sourceNoteId attribute when none is provided', () => {
    const item = buildCardItem(INPUT);
    expect('sourceNoteId' in item).toBe(false);
  });

  it('sets origin to "manual"', () => {
    const item = buildCardItem(INPUT);
    expect(item.origin).toBe('manual');
  });

  it('populates gsi5pk and gsi5sk correctly', () => {
    const item = buildCardItem(INPUT);
    expect(item.gsi5pk).toBe('USER#sub-unit-001');
    expect(item.gsi5sk).toBe('DUE#2025-01-01T00:00:00.000Z');
  });

  it('sets pk and sk correctly', () => {
    const item = buildCardItem(INPUT);
    expect(item.pk).toBe('USER#sub-unit-001');
    expect(item.sk).toBe('CARD#card-unit-001');
  });

  it('uses the explicit ease and interval values (not defaults)', () => {
    const item = buildCardItem(INPUT);
    expect(item.ease).toBe(2.5);
    expect(item.interval).toBe(0);
  });
});

describe('buildCardItem — origin:manual WITH sourceNoteId', () => {
  const INPUT = {
    sub: 'sub-unit-002',
    cardId: 'card-unit-002',
    sourceNoteId: 'note-unit-001',
    front: 'Front text',
    back: 'Back text',
    dueAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    origin: 'manual' as const,
    ease: 2.5,
    interval: 0,
  };

  it('DOES include sourceNoteId when provided', () => {
    const item = buildCardItem(INPUT);
    expect('sourceNoteId' in item).toBe(true);
    expect(item.sourceNoteId).toBe('note-unit-001');
  });

  it('sets origin to "manual"', () => {
    const item = buildCardItem(INPUT);
    expect(item.origin).toBe('manual');
  });
});

// ---------------------------------------------------------------------------
// diffCards — manual cards survive an auto-prune pass
// ---------------------------------------------------------------------------

describe('diffCards — manual card is never auto-pruned', () => {
  it('an unreviewed manual card NOT in the extracted set ends up in unchanged, not toDelete', () => {
    const manualCard = {
      cardId: 'card-manual-001',
      front: 'Manual card front',
      back: 'Manual card back',
      ease: 2.5,
      interval: 0,
      dueAt: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      origin: 'manual' as const,
      // No lastReviewedAt (never reviewed)
    };

    // Empty extracted set simulates an empty markdown body (all highlights removed)
    const { toCreate, toDelete, unchanged } = diffCards([], [manualCard]);

    expect(toDelete).toHaveLength(0);
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].cardId).toBe('card-manual-001');
    expect(toCreate).toHaveLength(0);
  });

  it('an unreviewed manual card WITH a matching front in the extracted set ends up in unchanged', () => {
    const manualCard = {
      cardId: 'card-manual-002',
      front: 'Shared front text',
      back: 'Back',
      ease: 2.5,
      interval: 0,
      dueAt: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      origin: 'manual' as const,
    };

    const extracted = [{ noteId: 'note-x', front: 'Shared front text', back: 'Back from highlight' }];
    const { toDelete, unchanged } = diffCards(extracted, [manualCard]);

    expect(toDelete).toHaveLength(0);
    expect(unchanged).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// diffCards — ai card is never auto-pruned (regression guard)
// ---------------------------------------------------------------------------

describe('diffCards — ai card is never auto-pruned', () => {
  it('an unreviewed ai card NOT in the extracted set ends up in unchanged, not toDelete', () => {
    const aiCard = {
      cardId: 'card-ai-001',
      front: 'AI card front',
      back: 'AI card back',
      ease: 2.5,
      interval: 1,
      dueAt: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      origin: 'ai' as const,
      // No lastReviewedAt (never reviewed)
    };

    const { toDelete, unchanged } = diffCards([], [aiCard]);

    expect(toDelete).toHaveLength(0);
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].cardId).toBe('card-ai-001');
  });
});

// ---------------------------------------------------------------------------
// diffCards — highlight card without lastReviewedAt IS pruned (baseline sanity)
// ---------------------------------------------------------------------------

describe('diffCards — unreviewed highlight card IS pruned when its front disappears', () => {
  it('toDelete contains the unreviewed highlight card when its front is removed', () => {
    const highlightCard = {
      cardId: 'card-highlight-001',
      front: 'Orphaned highlight',
      back: 'Back',
      ease: 2.5,
      interval: 1,
      dueAt: '2025-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      origin: 'highlight' as const,
      // No lastReviewedAt
    };

    const { toDelete, unchanged } = diffCards([], [highlightCard]);

    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].cardId).toBe('card-highlight-001');
    expect(unchanged).toHaveLength(0);
  });
});
