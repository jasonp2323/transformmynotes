/**
 * Integration test: CARD item shape + `listCardsDue` / `listCardsByNote` via
 * GSI5 (ByDue) and base-table primary index (issue #92, M8.1.3).
 *
 * Exercises the real `ddb` DocumentClient, `cardKeys` builders,
 * `buildCardItem`, `listCardsDue`, and `listCardsByNote` — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { cardKeys } from '../src/db/keys.js';
import { buildCardItem, listCardsDue, listCardsByNote } from '../src/db/cards.js';

// ---------------------------------------------------------------------------
// Pure builder unit checks (no I/O)
// ---------------------------------------------------------------------------

describe('cardKeys — pure builder checks', () => {
  it('cardItemKey returns USER#<sub> / CARD#<cardId>', () => {
    const key = cardKeys.cardItemKey('sub-abc', 'card-001');
    expect(key.pk).toBe('USER#sub-abc');
    expect(key.sk).toBe('CARD#card-001');
  });

  it('gsi5pk returns USER#<sub>', () => {
    expect(cardKeys.gsi5pk('my-sub')).toBe('USER#my-sub');
  });

  it('gsi5sk returns DUE#<dueAt>', () => {
    expect(cardKeys.gsi5sk('2024-06-01T00:00:00.000Z')).toBe(
      'DUE#2024-06-01T00:00:00.000Z',
    );
  });

  it('cardsByDueQuery uses IndexName GSI5 with correct KeyConditionExpression and :hi value', () => {
    const now = '2024-06-11T12:00:00.000Z';
    const params = cardKeys.cardsByDueQuery('sub-xyz', now);

    expect(params.IndexName).toBe('GSI5');
    expect(params.KeyConditionExpression).toBe('gsi5pk = :pk AND gsi5sk <= :hi');
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#sub-xyz');
    expect(params.ExpressionAttributeValues[':hi']).toBe(`DUE#${now}`);
    expect(params.ScanIndexForward).toBe(true);
    expect(params.Limit).toBe(100);
  });

  it('cardsByNoteQuery uses base-table primary index with FilterExpression on sourceNoteId', () => {
    const params = cardKeys.cardsByNoteQuery('sub-xyz', 'note-001');

    expect(params.KeyConditionExpression).toBe(
      'pk = :pk AND begins_with(sk, :sk)',
    );
    expect(params.FilterExpression).toBe('sourceNoteId = :nid');
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#sub-xyz');
    expect(params.ExpressionAttributeValues[':sk']).toBe('CARD#');
    expect(params.ExpressionAttributeValues[':nid']).toBe('note-001');
  });
});

describe('buildCardItem — pure builder checks', () => {
  const BASE_INPUT = {
    sub: 'sub-build-001',
    cardId: 'card-build-001',
    sourceNoteId: 'note-build-001',
    front: 'What is the capital of France?',
    back: 'Paris',
    dueAt: '2024-06-11T00:00:00.000Z',
    createdAt: '2024-06-01T00:00:00.000Z',
  };

  it('populates pk / sk / gsi5pk / gsi5sk correctly', () => {
    const item = buildCardItem(BASE_INPUT);

    expect(item.pk).toBe('USER#sub-build-001');
    expect(item.sk).toBe('CARD#card-build-001');
    expect(item.gsi5pk).toBe('USER#sub-build-001');
    expect(item.gsi5sk).toBe('DUE#2024-06-11T00:00:00.000Z');
  });

  it('applies default ease=2.5 and interval=1 when not provided', () => {
    const item = buildCardItem(BASE_INPUT);
    expect(item.ease).toBe(2.5);
    expect(item.interval).toBe(1);
  });

  it('respects explicit ease and interval values', () => {
    const item = buildCardItem({ ...BASE_INPUT, ease: 3.0, interval: 7 });
    expect(item.ease).toBe(3.0);
    expect(item.interval).toBe(7);
  });

  it('defaults updatedAt to createdAt when not provided', () => {
    const item = buildCardItem(BASE_INPUT);
    expect(item.updatedAt).toBe(BASE_INPUT.createdAt);
  });

  it('respects explicit updatedAt when provided', () => {
    const updated = '2024-06-10T10:00:00.000Z';
    const item = buildCardItem({ ...BASE_INPUT, updatedAt: updated });
    expect(item.updatedAt).toBe(updated);
  });

  it('omits lastReviewedAt from the item when not provided', () => {
    const item = buildCardItem(BASE_INPUT);
    expect('lastReviewedAt' in item).toBe(false);
  });

  it('includes lastReviewedAt when provided', () => {
    const reviewed = '2024-06-09T08:00:00.000Z';
    const item = buildCardItem({ ...BASE_INPUT, lastReviewedAt: reviewed });
    expect(item.lastReviewedAt).toBe(reviewed);
  });

  it('populates cardId, sourceNoteId, front, back, dueAt, createdAt', () => {
    const item = buildCardItem(BASE_INPUT);
    expect(item.cardId).toBe(BASE_INPUT.cardId);
    expect(item.sourceNoteId).toBe(BASE_INPUT.sourceNoteId);
    expect(item.front).toBe(BASE_INPUT.front);
    expect(item.back).toBe(BASE_INPUT.back);
    expect(item.dueAt).toBe(BASE_INPUT.dueAt);
    expect(item.createdAt).toBe(BASE_INPUT.createdAt);
  });
});

// ---------------------------------------------------------------------------
// Integration: write card items → listCardsDue round-trip (GSI5)
// ---------------------------------------------------------------------------

describe('listCardsDue — write / query round-trip (GSI5 ByDue)', () => {
  // Unique sub to avoid collisions with other test files sharing dynalite.
  const SUB = 'sub-card-001';

  // Fixed "now" cutoff for the due-date boundary test.
  const NOW = '2024-06-11T12:00:00.000Z';

  // Three cards: one in the past, one exactly at now, one in the future.
  const CARD_PAST = {
    cardId: 'card-past-001',
    sourceNoteId: 'note-card-001',
    front: 'Past card front',
    back: 'Past card back',
    dueAt: '2020-01-01T00:00:00.000Z', // clearly in the past
  };
  const CARD_NOW = {
    cardId: 'card-now-001',
    sourceNoteId: 'note-card-001',
    front: 'Now card front',
    back: 'Now card back',
    dueAt: NOW, // exactly at the cutoff
  };
  const CARD_FUTURE = {
    cardId: 'card-future-001',
    sourceNoteId: 'note-card-001',
    front: 'Future card front',
    back: 'Future card back',
    dueAt: '2999-01-01T00:00:00.000Z', // far in the future
  };

  const CREATED_AT = '2024-05-01T00:00:00.000Z';

  it('setup: writes 3 card items (past, now, future) for the test user', async () => {
    for (const card of [CARD_PAST, CARD_NOW, CARD_FUTURE]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildCardItem({
            sub: SUB,
            cardId: card.cardId,
            sourceNoteId: card.sourceNoteId,
            front: card.front,
            back: card.back,
            dueAt: card.dueAt,
            createdAt: CREATED_AT,
          }),
        }),
      );
    }
  });

  it('listCardsDue returns exactly the 2 cards at or before NOW (past + now)', async () => {
    const cards = await listCardsDue(SUB, NOW);
    expect(cards).toHaveLength(2);
  });

  it('listCardsDue returns cards in ascending due order (oldest first)', async () => {
    const cards = await listCardsDue(SUB, NOW);
    const dueValues = cards.map((c) => c.dueAt);
    expect(dueValues[0]).toBe(CARD_PAST.dueAt);
    expect(dueValues[1]).toBe(CARD_NOW.dueAt);
  });

  it('listCardsDue does NOT return the future card', async () => {
    const cards = await listCardsDue(SUB, NOW);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).not.toContain(CARD_FUTURE.cardId);
  });

  it('listCardsDue returns full card attributes (projection ALL, no BatchGet needed)', async () => {
    const cards = await listCardsDue(SUB, NOW);
    const past = cards.find((c) => c.cardId === CARD_PAST.cardId);
    expect(past).toBeDefined();
    expect(past!.front).toBe(CARD_PAST.front);
    expect(past!.back).toBe(CARD_PAST.back);
    expect(past!.ease).toBe(2.5);
    expect(past!.interval).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// User isolation: due-card query is scoped to the requesting user
// ---------------------------------------------------------------------------

describe('listCardsDue — user isolation', () => {
  const SUB_A = 'sub-card-002a';
  const SUB_B = 'sub-card-002b';
  const NOW = '2024-06-11T12:00:00.000Z';
  const PAST_DUE = '2020-01-01T00:00:00.000Z';
  const CREATED_AT = '2024-05-01T00:00:00.000Z';
  const CARD_A_ID = 'card-isolation-a';
  const CARD_B_ID = 'card-isolation-b';

  it('setup: writes one due card each for user A and user B', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildCardItem({
          sub: SUB_A,
          cardId: CARD_A_ID,
          sourceNoteId: 'note-iso-a',
          front: 'User A front',
          back: 'User A back',
          dueAt: PAST_DUE,
          createdAt: CREATED_AT,
        }),
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildCardItem({
          sub: SUB_B,
          cardId: CARD_B_ID,
          sourceNoteId: 'note-iso-b',
          front: 'User B front',
          back: 'User B back',
          dueAt: PAST_DUE,
          createdAt: CREATED_AT,
        }),
      }),
    );
  });

  it("user A's listCardsDue does NOT return user B's card", async () => {
    const cards = await listCardsDue(SUB_A, NOW);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).toContain(CARD_A_ID);
    expect(cardIds).not.toContain(CARD_B_ID);
  });

  it("user B's listCardsDue does NOT return user A's card", async () => {
    const cards = await listCardsDue(SUB_B, NOW);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).toContain(CARD_B_ID);
    expect(cardIds).not.toContain(CARD_A_ID);
  });
});

// ---------------------------------------------------------------------------
// Integration: listCardsByNote — base-table FilterExpression on sourceNoteId
// ---------------------------------------------------------------------------

describe('listCardsByNote — filter by sourceNoteId (base-table query)', () => {
  const SUB = 'sub-card-003';
  const NOTE_TARGET = 'note-target-001';
  const NOTE_OTHER = 'note-other-001';
  const CREATED_AT = '2024-05-01T00:00:00.000Z';
  const DUE_AT = '2024-06-11T00:00:00.000Z';

  // Two cards for the target note, one card for a different note.
  const CARD_1 = { cardId: 'card-note-001', sourceNoteId: NOTE_TARGET, front: 'Q1', back: 'A1' };
  const CARD_2 = { cardId: 'card-note-002', sourceNoteId: NOTE_TARGET, front: 'Q2', back: 'A2' };
  const CARD_OTHER = { cardId: 'card-note-003', sourceNoteId: NOTE_OTHER, front: 'Q3', back: 'A3' };

  it('setup: writes 2 cards for the target note and 1 card for a different note', async () => {
    for (const card of [CARD_1, CARD_2, CARD_OTHER]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildCardItem({
            sub: SUB,
            cardId: card.cardId,
            sourceNoteId: card.sourceNoteId,
            front: card.front,
            back: card.back,
            dueAt: DUE_AT,
            createdAt: CREATED_AT,
          }),
        }),
      );
    }
  });

  it('listCardsByNote returns exactly the 2 cards matching the target noteId', async () => {
    const cards = await listCardsByNote(SUB, NOTE_TARGET);
    expect(cards).toHaveLength(2);
  });

  it('listCardsByNote returns the correct card ids for the target note', async () => {
    const cards = await listCardsByNote(SUB, NOTE_TARGET);
    const cardIds = cards.map((c) => c.cardId).sort();
    expect(cardIds).toEqual([CARD_1.cardId, CARD_2.cardId].sort());
  });

  it('listCardsByNote does NOT return cards from a different note', async () => {
    const cards = await listCardsByNote(SUB, NOTE_TARGET);
    const cardIds = cards.map((c) => c.cardId);
    expect(cardIds).not.toContain(CARD_OTHER.cardId);
  });

  it('listCardsByNote for the other note returns only that card', async () => {
    const cards = await listCardsByNote(SUB, NOTE_OTHER);
    expect(cards).toHaveLength(1);
    expect(cards[0].cardId).toBe(CARD_OTHER.cardId);
  });

  it('listCardsByNote returns full card attributes (front, back, ease, interval, etc.)', async () => {
    const cards = await listCardsByNote(SUB, NOTE_TARGET);
    const card1 = cards.find((c) => c.cardId === CARD_1.cardId);
    expect(card1).toBeDefined();
    expect(card1!.front).toBe(CARD_1.front);
    expect(card1!.back).toBe(CARD_1.back);
    expect(card1!.ease).toBe(2.5);
    expect(card1!.interval).toBe(1);
    expect(card1!.sourceNoteId).toBe(NOTE_TARGET);
  });
});
