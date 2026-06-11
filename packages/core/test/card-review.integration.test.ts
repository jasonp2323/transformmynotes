/**
 * Integration test: `getCard`, `countCardsDue`, and `recordCardReview` via
 * real `ddb` + dynalite.
 *
 * Exercises:
 *   - countCardsDue: exact count via SELECT COUNT + pagination, boundary logic
 *   - getCard: round-trips a written card
 *   - recordCardReview: updates ease/interval/dueAt/lastReviewedAt and the
 *     card moves out of the due window (gsi5sk updated correctly)
 *
 * Uses a unique `sub` per describe block to avoid collisions with other test
 * files sharing the same dynalite instance.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import {
  buildCardItem,
  getCard,
  countCardsDue,
  recordCardReview,
  listCardsDue,
} from '../src/db/cards.js';
import { schedule } from '../src/srs/scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a single card item via PutCommand (mirrors the existing integration test style). */
async function seedCard(opts: {
  sub: string;
  cardId: string;
  sourceNoteId: string;
  front: string;
  back: string;
  dueAt: string;
  createdAt: string;
  lastReviewedAt?: string;
}): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: buildCardItem(opts),
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. countCardsDue — exact count, boundary logic
// ---------------------------------------------------------------------------

describe('countCardsDue — exact count via SELECT COUNT', () => {
  const SUB = 'sub-review-001';
  const NOW_ISO = '2024-06-11T12:00:00.000Z';
  const PAST_ISO = '2020-01-01T00:00:00.000Z';
  const FUTURE_ISO = '2999-12-31T00:00:00.000Z';
  const CREATED_AT = '2024-01-01T00:00:00.000Z';

  it('setup: seeds 3 past + 1 exactly-at-now + 1 future card', async () => {
    for (let i = 1; i <= 3; i++) {
      await seedCard({
        sub: SUB,
        cardId: `card-count-past-${i}`,
        sourceNoteId: 'note-count-001',
        front: `Past ${i}`,
        back: `Back ${i}`,
        dueAt: PAST_ISO,
        createdAt: CREATED_AT,
      });
    }
    await seedCard({
      sub: SUB,
      cardId: 'card-count-now',
      sourceNoteId: 'note-count-001',
      front: 'Exactly now',
      back: 'Back now',
      dueAt: NOW_ISO,
      createdAt: CREATED_AT,
    });
    await seedCard({
      sub: SUB,
      cardId: 'card-count-future',
      sourceNoteId: 'note-count-001',
      front: 'Future',
      back: 'Back future',
      dueAt: FUTURE_ISO,
      createdAt: CREATED_AT,
    });
  });

  it('countCardsDue returns 4 (3 past + exactly-now) at the NOW boundary', async () => {
    const count = await countCardsDue(SUB, NOW_ISO);
    expect(count).toBe(4);
  });

  it('countCardsDue returns 0 when nothing is due before a very early cutoff', async () => {
    const count = await countCardsDue(SUB, '2000-01-01T00:00:00.000Z');
    expect(count).toBe(0);
  });

  it('countCardsDue returns all 5 when cutoff is far in the future', async () => {
    const count = await countCardsDue(SUB, '3000-01-01T00:00:00.000Z');
    expect(count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. getCard — round-trip
// ---------------------------------------------------------------------------

describe('getCard — round-trip', () => {
  const SUB = 'sub-review-002';
  const CARD_ID = 'card-getcard-001';
  const DUE_AT = '2024-06-10T00:00:00.000Z';
  const CREATED_AT = '2024-06-01T00:00:00.000Z';

  it('setup: seeds a card', async () => {
    await seedCard({
      sub: SUB,
      cardId: CARD_ID,
      sourceNoteId: 'note-getcard-001',
      front: 'What is photosynthesis?',
      back: 'The process by which plants make food from sunlight.',
      dueAt: DUE_AT,
      createdAt: CREATED_AT,
    });
  });

  it('getCard returns the card with correct attributes', async () => {
    const card = await getCard(SUB, CARD_ID);
    expect(card).toBeDefined();
    expect(card!.cardId).toBe(CARD_ID);
    expect(card!.front).toBe('What is photosynthesis?');
    expect(card!.back).toBe('The process by which plants make food from sunlight.');
    expect(card!.dueAt).toBe(DUE_AT);
    expect(card!.createdAt).toBe(CREATED_AT);
    expect(card!.ease).toBe(2.5);
    expect(card!.interval).toBe(1);
    expect(card!.lastReviewedAt).toBeUndefined();
  });

  it('getCard returns undefined for a non-existent card', async () => {
    const card = await getCard(SUB, 'nonexistent-card-id');
    expect(card).toBeUndefined();
  });

  it('getCard includes DynamoDB key attributes (pk, sk, gsi5pk, gsi5sk)', async () => {
    const card = await getCard(SUB, CARD_ID);
    expect(card!.pk).toBe(`USER#${SUB}`);
    expect(card!.sk).toBe(`CARD#${CARD_ID}`);
    expect(card!.gsi5pk).toBe(`USER#${SUB}`);
    expect(card!.gsi5sk).toBe(`DUE#${DUE_AT}`);
  });
});

// ---------------------------------------------------------------------------
// 3. recordCardReview — updates SM-2 state and moves card out of the due window
// ---------------------------------------------------------------------------

describe('recordCardReview — updates state and advances due date', () => {
  const SUB = 'sub-review-003';
  const CARD_ID = 'card-review-001';
  // Card is due in the past so it appears in listCardsDue.
  const PAST_DUE = '2020-01-01T00:00:00.000Z';
  const CREATED_AT = '2019-12-01T00:00:00.000Z';
  // Fixed review time.
  const REVIEW_NOW = new Date('2024-06-11T12:00:00.000Z');
  const REVIEW_NOW_ISO = REVIEW_NOW.toISOString();
  const INITIAL_STATE = { ease: 2.5, interval: 1, dueAt: PAST_DUE };

  it('setup: seeds a card due in the past', async () => {
    await seedCard({
      sub: SUB,
      cardId: CARD_ID,
      sourceNoteId: 'note-review-001',
      front: 'Capital of Japan?',
      back: 'Tokyo',
      dueAt: PAST_DUE,
      createdAt: CREATED_AT,
    });
  });

  it('card appears in listCardsDue before the review', async () => {
    const cards = await listCardsDue(SUB, REVIEW_NOW_ISO);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).toContain(CARD_ID);
  });

  it('recordCardReview returns the updated card with new SM-2 state', async () => {
    const scheduleResult = schedule(INITIAL_STATE, 5, REVIEW_NOW);

    const updated = await recordCardReview({
      sub: SUB,
      cardId: CARD_ID,
      result: scheduleResult,
      now: REVIEW_NOW,
    });

    // The schedule(interval=1, grade=5) path: newInterval = 6 days; ease increases.
    expect(updated.cardId).toBe(CARD_ID);
    expect(updated.interval).toBe(scheduleResult.interval);
    expect(updated.ease).toBeCloseTo(scheduleResult.ease);
    expect(updated.dueAt).toBe(scheduleResult.dueAt);
    expect(updated.lastReviewedAt).toBe(REVIEW_NOW_ISO);
    expect(updated.updatedAt).toBe(REVIEW_NOW_ISO);
  });

  it('getCard reflects the new ease/interval/dueAt/lastReviewedAt after review', async () => {
    const scheduleResult = schedule(INITIAL_STATE, 5, REVIEW_NOW);
    const card = await getCard(SUB, CARD_ID);
    expect(card).toBeDefined();
    expect(card!.interval).toBe(scheduleResult.interval);
    expect(card!.ease).toBeCloseTo(scheduleResult.ease);
    expect(card!.dueAt).toBe(scheduleResult.dueAt);
    expect(card!.lastReviewedAt).toBe(REVIEW_NOW_ISO);
  });

  it('reviewed card no longer appears in listCardsDue at the original review time', async () => {
    // The new dueAt is 6 days in the future from REVIEW_NOW, so it should NOT
    // appear in a due query at REVIEW_NOW.
    const cards = await listCardsDue(SUB, REVIEW_NOW_ISO);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).not.toContain(CARD_ID);
  });

  it('gsi5sk on the stored item reflects the new dueAt (not the old past due)', async () => {
    const scheduleResult = schedule(INITIAL_STATE, 5, REVIEW_NOW);
    const card = await getCard(SUB, CARD_ID);
    expect(card!.gsi5sk).toBe(`DUE#${scheduleResult.dueAt}`);
    expect(card!.gsi5sk).not.toBe(`DUE#${PAST_DUE}`);
  });
});

// ---------------------------------------------------------------------------
// 4. recordCardReview — failed review resets interval to 1 and keeps card due soon
// ---------------------------------------------------------------------------

describe('recordCardReview — failed review (grade < 3)', () => {
  const SUB = 'sub-review-004';
  const CARD_ID = 'card-review-fail-001';
  const PAST_DUE = '2020-01-01T00:00:00.000Z';
  const CREATED_AT = '2019-12-01T00:00:00.000Z';
  const REVIEW_NOW = new Date('2024-06-11T12:00:00.000Z');
  const REVIEW_NOW_ISO = REVIEW_NOW.toISOString();
  const INITIAL_STATE = { ease: 2.5, interval: 21, dueAt: PAST_DUE };

  it('setup: seeds a card with a long interval (21 days) due in the past', async () => {
    await seedCard({
      sub: SUB,
      cardId: CARD_ID,
      sourceNoteId: 'note-review-fail-001',
      front: 'Hard concept?',
      back: 'This one is tricky.',
      dueAt: PAST_DUE,
      createdAt: CREATED_AT,
      lastReviewedAt: '2023-01-01T00:00:00.000Z',
    });
  });

  it('failed review resets interval to 1 and ease is unchanged', async () => {
    const scheduleResult = schedule(INITIAL_STATE, 0, REVIEW_NOW);
    expect(scheduleResult.interval).toBe(1);
    expect(scheduleResult.ease).toBe(INITIAL_STATE.ease); // SM-2: ease unchanged on fail

    const updated = await recordCardReview({
      sub: SUB,
      cardId: CARD_ID,
      result: scheduleResult,
      now: REVIEW_NOW,
    });

    expect(updated.interval).toBe(1);
    expect(updated.ease).toBeCloseTo(INITIAL_STATE.ease);
    expect(updated.lastReviewedAt).toBe(REVIEW_NOW_ISO);
  });

  it('card is due approximately 1 day after review (new dueAt > reviewNow)', async () => {
    const card = await getCard(SUB, CARD_ID);
    expect(card).toBeDefined();
    // New dueAt should be roughly 1 day after REVIEW_NOW.
    const newDue = new Date(card!.dueAt);
    const reviewMs = REVIEW_NOW.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(newDue.getTime()).toBeGreaterThan(reviewMs);
    expect(newDue.getTime()).toBeCloseTo(reviewMs + oneDayMs, -3); // within ~1 second
  });
});
