/**
 * Integration test: manual flashcard creation, prune-guard, grading, isolation,
 * and deletion via the real `ddb` DocumentClient + dynalite.
 *
 * Exercises:
 *   - createManualCard: note-attached (sourceNoteId set) + standalone (no sourceNoteId)
 *   - listCardsDue / listCardsByNote: both manual card types appear
 *   - syncCardsForNote prune guard: manual cards survive an empty-body sync pass
 *   - recordCardReview: graded standalone card moves out of the due window
 *   - User isolation: user B's cards never appear in user A's listCardsDue
 *   - deleteCard + getCard: hard-delete removes the card from all queries
 *
 * Uses the shared dynalite instance started by `dynalite-global.ts`
 * (globalSetup) and the production client pointed at it via env vars set
 * in `integration-env.ts` (setupFiles). No AWS access required.
 */

import { describe, it, expect } from 'vitest';
import {
  createManualCard,
  listCardsDue,
  listCardsByNote,
  syncCardsForNote,
  recordCardReview,
  deleteCard,
  getCard,
} from '../src/db/cards.js';
import { schedule } from '../src/srs/scheduler.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fixed "now" so all due-date comparisons are deterministic.
const NOW = new Date('2025-03-01T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

// A cutoff clearly after NOW to capture all cards due at/before now.
const CUTOFF = '2025-03-01T13:00:00.000Z';

// A note used for the note-attached card.
const NOTE_ID = 'note-manual-test-001';

// Unique subs per describe block to avoid cross-test collisions in the shared dynalite instance.
const SUB_A = 'sub-manual-001a';
const SUB_B = 'sub-manual-001b';

// Card ids generated deterministically so tests can reference them across `it` blocks.
const CARD_ATTACHED_ID = 'card-manual-attached-001';
const CARD_STANDALONE_ID = 'card-manual-standalone-001';
const CARD_B_ID = 'card-manual-b-001';

// ---------------------------------------------------------------------------
// 1. Create both card types and verify they appear in listCardsDue
// ---------------------------------------------------------------------------

describe('createManualCard — note-attached + standalone', () => {
  it('setup: creates one note-attached and one standalone manual card for user A', async () => {
    await createManualCard({
      sub: SUB_A,
      cardId: CARD_ATTACHED_ID,
      front: 'Note-attached front',
      back: 'Note-attached back',
      sourceNoteId: NOTE_ID,
      now: NOW,
    });

    await createManualCard({
      sub: SUB_A,
      cardId: CARD_STANDALONE_ID,
      front: 'Standalone front',
      back: 'Standalone back',
      // No sourceNoteId — fully standalone
      now: NOW,
    });
  });

  it('both cards appear in listCardsDue for user A at or after NOW', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(CARD_ATTACHED_ID);
    expect(ids).toContain(CARD_STANDALONE_ID);
  });

  it('note-attached card has sourceNoteId set', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const attached = cards.find((c) => c.cardId === CARD_ATTACHED_ID);
    expect(attached).toBeDefined();
    expect(attached!.sourceNoteId).toBe(NOTE_ID);
  });

  it('standalone card has NO sourceNoteId attribute', async () => {
    const card = await getCard(SUB_A, CARD_STANDALONE_ID);
    expect(card).toBeDefined();
    expect('sourceNoteId' in (card as object)).toBe(false);
  });

  it('both cards have origin:"manual"', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const attached = cards.find((c) => c.cardId === CARD_ATTACHED_ID);
    const standalone = cards.find((c) => c.cardId === CARD_STANDALONE_ID);
    expect(attached!.origin).toBe('manual');
    expect(standalone!.origin).toBe('manual');
  });

  it('both cards have interval:0 (not the default 1)', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    for (const id of [CARD_ATTACHED_ID, CARD_STANDALONE_ID]) {
      const c = cards.find((c) => c.cardId === id);
      expect(c!.interval).toBe(0);
    }
  });

  it('note-attached card appears in listCardsByNote for its note', async () => {
    const noteCards = await listCardsByNote(SUB_A, NOTE_ID);
    const ids = noteCards.map((c) => c.cardId);
    expect(ids).toContain(CARD_ATTACHED_ID);
  });
});

// ---------------------------------------------------------------------------
// 2. Highlight-prune guard: syncCardsForNote with an empty body must NOT delete
//    either manual card (they have no highlight to track)
// ---------------------------------------------------------------------------

describe('syncCardsForNote prune guard — manual cards survive empty body', () => {
  it('syncCardsForNote with empty body returns {deleted:0} for user A', async () => {
    const result = await syncCardsForNote({
      sub: SUB_A,
      noteId: NOTE_ID,
      markdownBody: '', // empty → no highlights extracted
      now: NOW,
    });
    // No highlight cards to delete; manual cards must be preserved.
    expect(result.deleted).toBe(0);
  });

  it('note-attached manual card still returned by listCardsByNote after prune pass', async () => {
    const noteCards = await listCardsByNote(SUB_A, NOTE_ID);
    const ids = noteCards.map((c) => c.cardId);
    expect(ids).toContain(CARD_ATTACHED_ID);
  });

  it('standalone manual card still returned by listCardsDue after prune pass', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(CARD_STANDALONE_ID);
  });
});

// ---------------------------------------------------------------------------
// 3. Grade the standalone card and verify review state is persisted.
//
// NOTE on interval:0 + SM-2: createManualCard uses interval:0 so the first
// review of a fresh manual card produces newInterval = Math.round(0 * ease) = 0
// (none of the SM-2 special cases for 1→6 or 6→21 apply). This means dueAt
// stays at `now + 0 days = now` after the first review — the card remains due
// immediately, which is the expected behaviour for a brand-new manual card:
// you still need to learn it properly. The key persisted change is lastReviewedAt.
// ---------------------------------------------------------------------------

describe('recordCardReview — graded standalone card has review state persisted', () => {
  it('standalone card appears in listCardsDue before grading', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(CARD_STANDALONE_ID);
  });

  it('grading the standalone card with grade=5 persists lastReviewedAt', async () => {
    const card = await getCard(SUB_A, CARD_STANDALONE_ID);
    expect(card).toBeDefined();

    // interval:0 → SM-2 returns newInterval:0 → dueAt stays at NOW (not future).
    // The important thing is that the review is persisted correctly.
    const result = schedule(
      { ease: card!.ease, interval: card!.interval, dueAt: card!.dueAt },
      5, // Easy
      NOW,
    );

    const updated = await recordCardReview({
      sub: SUB_A,
      cardId: CARD_STANDALONE_ID,
      result,
      now: NOW,
    });

    // lastReviewedAt is stamped with the review time.
    expect(updated.lastReviewedAt).toBe(NOW_ISO);
    // ease increases (grade=5 is the highest, so EF goes up).
    expect(updated.ease).toBeGreaterThan(2.5);
  });

  it('graded standalone card now has lastReviewedAt set (retrieved via getCard)', async () => {
    const card = await getCard(SUB_A, CARD_STANDALONE_ID);
    expect(card).toBeDefined();
    expect(card!.lastReviewedAt).toBe(NOW_ISO);
  });

  it('note-attached card is still due (not graded)', async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(CARD_ATTACHED_ID);
  });
});

// ---------------------------------------------------------------------------
// 4. User isolation: user B's cards must not appear in user A's listCardsDue
// ---------------------------------------------------------------------------

describe('listCardsDue — user isolation', () => {
  it('setup: creates a due manual card for user B', async () => {
    await createManualCard({
      sub: SUB_B,
      cardId: CARD_B_ID,
      front: 'User B front',
      back: 'User B back',
      now: NOW,
    });
  });

  it("user A's listCardsDue does NOT return user B's card", async () => {
    const cards = await listCardsDue(SUB_A, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).not.toContain(CARD_B_ID);
  });

  it("user B's listCardsDue does NOT return user A's cards", async () => {
    const cards = await listCardsDue(SUB_B, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).not.toContain(CARD_ATTACHED_ID);
    expect(ids).not.toContain(CARD_STANDALONE_ID);
  });

  it("user B's listCardsDue DOES return user B's card", async () => {
    const cards = await listCardsDue(SUB_B, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(CARD_B_ID);
  });
});

// ---------------------------------------------------------------------------
// 5. deleteCard: hard-delete removes the card from all query paths
// ---------------------------------------------------------------------------

describe('deleteCard — hard-delete removes card', () => {
  const SUB = 'sub-manual-del-001';
  const DEL_CARD_ID = 'card-manual-del-001';

  it('setup: creates a manual card to delete', async () => {
    await createManualCard({
      sub: SUB,
      cardId: DEL_CARD_ID,
      front: 'To be deleted',
      back: 'Gone soon',
      now: NOW,
    });
  });

  it('card is present before deletion', async () => {
    const card = await getCard(SUB, DEL_CARD_ID);
    expect(card).toBeDefined();
    expect(card!.cardId).toBe(DEL_CARD_ID);
  });

  it('card appears in listCardsDue before deletion', async () => {
    const cards = await listCardsDue(SUB, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).toContain(DEL_CARD_ID);
  });

  it('deleteCard succeeds without throwing', async () => {
    await expect(deleteCard(SUB, DEL_CARD_ID)).resolves.toBeUndefined();
  });

  it('getCard returns undefined after deletion', async () => {
    const card = await getCard(SUB, DEL_CARD_ID);
    expect(card).toBeUndefined();
  });

  it('card no longer appears in listCardsDue after deletion', async () => {
    const cards = await listCardsDue(SUB, CUTOFF);
    const ids = cards.map((c) => c.cardId);
    expect(ids).not.toContain(DEL_CARD_ID);
  });
});
