/**
 * Integration test: `syncCardsForNote` — the two-phase card sync helper.
 *
 * Exercises the real `ddb` DocumentClient + dynalite against:
 *   - syncCardsForNote (create path, idempotent path, delete path, reviewed-preserve path, >25 batch)
 *   - diffCards is exercised implicitly via syncCardsForNote
 *
 * Uses a unique `sub` per describe block to avoid collisions with other test
 * files sharing the same dynalite instance.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * syncCardsForNote uses BatchWriteItem (via batchWriteWithRetry) which dynalite
 * does support — no workaround needed.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { cardKeys } from '../src/db/keys.js';
import {
  buildCardItem,
  syncCardsForNote,
  listCardsByNote,
} from '../src/db/cards.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a markdown body with the given highlight phrases on separate lines. */
function bodyWithHighlights(...phrases: string[]): string {
  return phrases.map((p) => `This sentence contains ==<em>${p}</em>== as a highlight.`).join('\n');
}

/**
 * Build a simple markdown body using plain highlight syntax that extractCards
 * can process. Each phrase becomes its own line: `The ==<phrase>== highlight.`
 */
function body(...phrases: string[]): string {
  return phrases.map((p) => `The ==${p}== highlight.`).join('\n');
}

// ---------------------------------------------------------------------------
// 1. Initial sync: 3 distinct highlights → 3 cards created
// ---------------------------------------------------------------------------

describe('syncCardsForNote — initial sync creates cards', () => {
  const SUB = 'sub-sync-001';
  const NOTE_ID = 'note-sync-001';
  const NOW = new Date('2024-06-11T10:00:00.000Z');
  const NOW_ISO = NOW.toISOString();

  it('returns {created:3, deleted:0, unchanged:0} for 3 distinct highlights', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('alpha', 'beta', 'gamma'),
      now: NOW,
    });

    expect(result.created).toBe(3);
    expect(result.deleted).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('listCardsByNote shows exactly 3 cards after the sync', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    expect(cards).toHaveLength(3);
  });

  it('each new card has dueAt === createdAt === the injected now ISO', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    for (const card of cards) {
      expect(card.dueAt).toBe(NOW_ISO);
      expect(card.createdAt).toBe(NOW_ISO);
    }
  });

  it('each new card has no lastReviewedAt (never reviewed)', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    for (const card of cards) {
      expect(card.lastReviewedAt).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotent re-sync: same body → 0 created, 0 deleted, 3 unchanged
// ---------------------------------------------------------------------------

describe('syncCardsForNote — idempotent re-sync', () => {
  const SUB = 'sub-sync-002';
  const NOTE_ID = 'note-sync-002';
  const NOW = new Date('2024-06-11T10:00:00.000Z');

  it('setup: first sync creates 3 cards', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('one', 'two', 'three'),
      now: NOW,
    });
    expect(result.created).toBe(3);
  });

  it('second sync with identical body returns {created:0, deleted:0, unchanged:3}', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('one', 'two', 'three'),
      now: new Date('2024-06-11T11:00:00.000Z'),
    });
    expect(result.created).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.unchanged).toBe(3);
  });

  it('still exactly 3 cards after idempotent sync', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    expect(cards).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Remove one highlight → {created:0, deleted:1, unchanged:2}
// ---------------------------------------------------------------------------

describe('syncCardsForNote — remove unreviewed highlight', () => {
  const SUB = 'sub-sync-003';
  const NOTE_ID = 'note-sync-003';
  const NOW = new Date('2024-06-11T10:00:00.000Z');

  it('setup: creates 3 cards', async () => {
    await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('keep1', 'keep2', 'remove'),
      now: NOW,
    });
  });

  it('sync with removed highlight returns {created:0, deleted:1, unchanged:2}', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('keep1', 'keep2'),
      now: new Date('2024-06-11T11:00:00.000Z'),
    });
    expect(result.created).toBe(0);
    expect(result.deleted).toBe(1);
    expect(result.unchanged).toBe(2);
  });

  it('removed card is gone from listCardsByNote', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    expect(cards).toHaveLength(2);
    const fronts = cards.map((c) => c.front);
    expect(fronts).not.toContain('remove');
  });
});

// ---------------------------------------------------------------------------
// 4. Reviewed card is preserved even when highlight is removed
// ---------------------------------------------------------------------------

describe('syncCardsForNote — reviewed card is preserved', () => {
  const SUB = 'sub-sync-004';
  const NOTE_ID = 'note-sync-004';
  const NOW = new Date('2024-06-11T10:00:00.000Z');

  it('setup: creates 2 cards then marks one as reviewed', async () => {
    // Create 2 cards via syncCardsForNote.
    await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('stay', 'reviewed-gone'),
      now: NOW,
    });

    // Find the card for 'reviewed-gone' and rewrite it with lastReviewedAt set.
    const cards = await listCardsByNote(SUB, NOTE_ID);
    const reviewedCard = cards.find((c) => c.front === 'reviewed-gone');
    expect(reviewedCard).toBeDefined();

    // Overwrite with lastReviewedAt to simulate a review.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildCardItem({
          sub: SUB,
          cardId: reviewedCard!.cardId,
          sourceNoteId: NOTE_ID,
          front: reviewedCard!.front,
          back: reviewedCard!.back,
          dueAt: reviewedCard!.dueAt,
          createdAt: reviewedCard!.createdAt,
          lastReviewedAt: '2024-06-11T09:00:00.000Z',
        }),
      }),
    );
  });

  it('sync without the reviewed highlight does NOT delete the reviewed card', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body('stay'), // 'reviewed-gone' removed
      now: new Date('2024-06-11T11:00:00.000Z'),
    });

    expect(result.deleted).toBe(0);
    expect(result.unchanged).toBe(2); // both 'stay' (match) + 'reviewed-gone' (reviewed orphan)
    expect(result.created).toBe(0);
  });

  it('both cards still present in listCardsByNote after sync', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    expect(cards).toHaveLength(2);
    const fronts = cards.map((c) => c.front).sort();
    expect(fronts).toEqual(['reviewed-gone', 'stay'].sort());
  });
});

// ---------------------------------------------------------------------------
// 5. 30-highlight body — exercises the >25 BatchWrite chunk boundary
// ---------------------------------------------------------------------------

describe('syncCardsForNote — >25 highlights exercises batch chunking', () => {
  const SUB = 'sub-sync-005';
  const NOTE_ID = 'note-sync-005';
  const NOW = new Date('2024-06-11T10:00:00.000Z');

  // Build 30 distinct phrases.
  const PHRASES = Array.from({ length: 30 }, (_, i) => `phrase${String(i + 1).padStart(2, '0')}`);

  it('syncCardsForNote creates 30 cards for a 30-highlight body', async () => {
    const result = await syncCardsForNote({
      sub: SUB,
      noteId: NOTE_ID,
      markdownBody: body(...PHRASES),
      now: NOW,
    });
    expect(result.created).toBe(30);
    expect(result.deleted).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('listCardsByNote returns all 30 cards', async () => {
    const cards = await listCardsByNote(SUB, NOTE_ID);
    expect(cards).toHaveLength(30);
  });
});
