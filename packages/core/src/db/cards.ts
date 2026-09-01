import { randomUUID } from 'node:crypto';
import {
  QueryCommand,
  GetCommand,
  UpdateCommand,
  BatchWriteCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { cardKeys } from './keys.js';
import { type RawCard, extractCards } from '../srs/extract.js';
import { type ScheduleResult } from '../srs/scheduler.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** Public card shape returned by db query functions. */
export interface Card {
  cardId: string;
  sourceNoteId?: string;
  front: string;
  back: string;
  ease: number;
  interval: number;
  dueAt: string;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  origin?: 'highlight' | 'ai' | 'manual';
  studySetId?: string;
}

/** Full DynamoDB item shape for a CARD (includes PK/SK and GSI5 keys). */
export interface CardItem extends Card {
  pk: string;
  sk: string;
  gsi5pk: string;
  gsi5sk: string;
}

// ---------------------------------------------------------------------------
// Pure item builder
// ---------------------------------------------------------------------------

/** Input for `buildCardItem`. */
export interface BuildCardItemInput {
  sub: string;
  cardId: string;
  sourceNoteId?: string;
  front: string;
  back: string;
  dueAt: string;
  createdAt: string;
  ease?: number;
  interval?: number;
  lastReviewedAt?: string;
  updatedAt?: string;
  origin?: 'highlight' | 'ai' | 'manual';
  studySetId?: string;
}

/**
 * Builds a `CardItem` with all DynamoDB keys populated.
 *
 * Defaults:
 *   - `ease`      → 2.5 (SM-2 initial ease factor)
 *   - `interval`  → 1   (SM-2 initial interval in days)
 *   - `updatedAt` → `createdAt` when not provided
 *
 * `lastReviewedAt` is omitted from the returned item when not supplied so the
 * attribute is absent in DynamoDB (rather than stored as `undefined`).
 */
export function buildCardItem(input: BuildCardItemInput): CardItem {
  const keys = cardKeys.cardItemKey(input.sub, input.cardId);

  const item: CardItem = {
    pk: keys.pk,
    sk: keys.sk,
    gsi5pk: cardKeys.gsi5pk(input.sub),
    gsi5sk: cardKeys.gsi5sk(input.dueAt),
    cardId: input.cardId,
    front: input.front,
    back: input.back,
    ease: input.ease ?? 2.5,
    interval: input.interval ?? 1,
    dueAt: input.dueAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };

  // Only write sourceNoteId when present — omitting it entirely for standalone
  // manual cards avoids storing an empty string (DynamoDB rejects '') and keeps
  // the note-based deck grouping logic clean (grouping keys on attribute presence).
  if (input.sourceNoteId !== undefined) {
    item.sourceNoteId = input.sourceNoteId;
  }
  if (input.lastReviewedAt !== undefined) {
    item.lastReviewedAt = input.lastReviewedAt;
  }
  if (input.origin !== undefined) {
    item.origin = input.origin;
  }
  if (input.studySetId !== undefined) {
    item.studySetId = input.studySetId;
  }

  return item;
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Lists all cards due at or before `nowIso` for the given user by querying
 * GSI5 (`ByDue`).
 *
 * Returns items in ascending due-date order (oldest-due first = most-overdue
 * cards first), capped at 100 per the query params. GSI5 is projection ALL so
 * no follow-up BatchGetItem is needed.
 *
 * Returns an empty array when the user has no due cards.
 */
export async function listCardsDue(sub: string, nowIso: string): Promise<Card[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...cardKeys.cardsByDueQuery(sub, nowIso),
    }),
  );

  return (Items ?? []) as Card[];
}

/**
 * Lists all cards for the given note (by `sourceNoteId`) belonging to the
 * given user by querying the base-table primary index and filtering on
 * `sourceNoteId`.
 *
 * Returns an empty array when the user has no cards for that note.
 */
export async function listCardsByNote(sub: string, noteId: string): Promise<Card[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...cardKeys.cardsByNoteQuery(sub, noteId),
    }),
  );

  return (Items ?? []) as Card[];
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

/** Result of diffing extracted cards against existing stored cards for a note. */
export interface CardDiff {
  /** Cards to create (extracted fronts not present in existing cards). */
  toCreate: RawCard[];
  /** Cards to delete (orphaned unreviewed cards whose front was removed). */
  toDelete: Card[];
  /** Cards to keep unchanged (matching fronts, or reviewed orphans preserved). */
  unchanged: Card[];
}

/**
 * Pure diff of extracted `RawCard[]` against existing stored `Card[]` for a
 * single note.
 *
 * Rules:
 *   - `extracted` is deduped by `front` (first occurrence wins) before diffing
 *     so duplicate highlights in a note produce only one card.
 *   - `toCreate`   — deduped extracted cards whose `front` is not in existing.
 *   - `unchanged`  — existing cards whose `front` IS in the deduped extracted
 *                    set, PLUS orphaned existing cards that have been reviewed
 *                    (`lastReviewedAt` is present) — reviewed cards are
 *                    preserved even when their highlight is removed.
 *   - `toDelete`   — orphaned existing cards whose `front` is NOT in the
 *                    deduped extracted set AND whose `lastReviewedAt` is absent.
 *
 * This is a pure function — no I/O.
 */
export function diffCards(extracted: RawCard[], existing: Card[]): CardDiff {
  // Dedupe extracted by front (keep first occurrence).
  const seen = new Set<string>();
  const deduped: RawCard[] = [];
  for (const card of extracted) {
    if (!seen.has(card.front)) {
      seen.add(card.front);
      deduped.push(card);
    }
  }

  const existingFronts = new Set(existing.map((c) => c.front));
  const dedupedFronts = new Set(deduped.map((c) => c.front));

  // Cards to create: deduped extracted fronts not present in existing.
  const toCreate = deduped.filter((c) => !existingFronts.has(c.front));

  // Classify existing cards.
  const toDelete: Card[] = [];
  const unchanged: Card[] = [];

  for (const card of existing) {
    // Non-highlight cards (ai, manual) are never auto-pruned — they have no
    // highlight to track. Only cards with origin 'highlight' (or no origin, which
    // is the legacy default for highlight-derived cards) participate in the prune.
    if (card.origin === 'ai' || card.origin === 'manual') {
      unchanged.push(card);
      continue;
    }
    if (dedupedFronts.has(card.front)) {
      // Front still present → keep.
      unchanged.push(card);
    } else if (card.lastReviewedAt != null) {
      // Orphaned but reviewed → preserve.
      unchanged.push(card);
    } else {
      // Orphaned and never reviewed → delete.
      toDelete.push(card);
    }
  }

  return { toCreate, toDelete, unchanged };
}

// ---------------------------------------------------------------------------
// Batch-write helpers (mirrors notes.ts private helpers)
// ---------------------------------------------------------------------------

/**
 * Splits an array into consecutive chunks of at most `size` elements.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Retries a `BatchWriteCommand` batch until `UnprocessedItems` is empty,
 * or up to `maxRetries` additional attempts after the first call.
 */
async function batchWriteWithRetry(
  tableName: string,
  requests: Record<string, unknown>[],
  maxRetries = 3,
): Promise<void> {
  let remaining: Record<string, unknown>[] = requests;
  let attempt = 0;

  while (remaining.length > 0 && attempt <= maxRetries) {
    const result = await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: remaining },
      }),
    );
    const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
    remaining = unprocessed as Record<string, unknown>[];
    attempt++;
  }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * Syncs the flashcards derived from a note body with those already stored in
 * DynamoDB for that note, using the `diffCards` algorithm.
 *
 * IMPORTANT: Call this AFTER the note-metadata write completes. Batching card
 * writes separately avoids the 25-item `TransactWriteItems` limit — a note
 * with more than 25 highlights is handled transparently by the 25-chunk
 * `BatchWriteItem` loop below.
 *
 * Steps:
 *   1. Extract `RawCard[]` from the markdown body via `extractCards`.
 *   2. Fetch existing cards for the note via `listCardsByNote`.
 *   3. Diff extracted vs existing to get `toCreate`, `toDelete`, `unchanged`.
 *   4. Build `BatchWriteItem` `PutRequest`/`DeleteRequest` entries.
 *   5. Write in 25-item chunks via `BatchWriteCommand` with retry.
 *   6. Return counts of `created`, `deleted`, `unchanged`.
 */
export async function syncCardsForNote(input: {
  sub: string;
  noteId: string;
  markdownBody: string;
  now?: Date;
}): Promise<{ created: number; deleted: number; unchanged: number }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const extracted = extractCards(input.noteId, input.markdownBody);
  const existing = await listCardsByNote(input.sub, input.noteId);
  const { toCreate, toDelete, unchanged } = diffCards(extracted, existing);

  const requests: Record<string, unknown>[] = [
    ...toCreate.map((card) => ({
      PutRequest: {
        Item: buildCardItem({
          sub: input.sub,
          cardId: randomUUID(),
          sourceNoteId: input.noteId,
          front: card.front,
          back: card.back,
          dueAt: nowIso,
          createdAt: nowIso,
        }),
      },
    })),
    ...toDelete.map((card) => ({
      DeleteRequest: {
        Key: cardKeys.cardItemKey(input.sub, card.cardId),
      },
    })),
  ];

  if (requests.length > 0) {
    for (const batch of chunk(requests, 25)) {
      await batchWriteWithRetry(TableNames.Notes, batch);
    }
  }

  return { created: toCreate.length, deleted: toDelete.length, unchanged: unchanged.length };
}

/**
 * Creates AI-generated flashcard items in DynamoDB for the given user.
 *
 * Each accepted card is written with `origin: "ai"` and the source `studySetId`
 * so it can be identified and filtered separately from highlight-origin cards.
 * Cards are due immediately (`dueAt = now`) so they appear in the next review
 * session straight away.
 *
 * The 20-card cap on `accepted` is a known limit: it is within the DynamoDB
 * BatchWriteItem 25-item cap, but cards are still chunked by 25 for safety.
 *
 * @param input.sub          Cognito sub of the card owner.
 * @param input.studySetId   ULID of the M13 StudySet that produced these cards.
 * @param input.sourceNoteId ULID of the source note the study set was generated from.
 * @param input.accepted     Card candidates (front + back) accepted by the user.
 * @param input.now          Optional fixed timestamp (defaults to `new Date()`).
 */
export async function createAiCards(input: {
  sub: string;
  studySetId: string;
  sourceNoteId: string;
  accepted: { front: string; back: string }[];
  now?: Date;
}): Promise<{ created: number }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const requests: Record<string, unknown>[] = input.accepted.map((card) => ({
    PutRequest: {
      Item: buildCardItem({
        sub: input.sub,
        cardId: randomUUID(),
        sourceNoteId: input.sourceNoteId,
        front: card.front,
        back: card.back,
        dueAt: nowIso,
        createdAt: nowIso,
        origin: 'ai',
        studySetId: input.studySetId,
      }),
    },
  }));

  if (requests.length > 0) {
    for (const batch of chunk(requests, 25)) {
      await batchWriteWithRetry(TableNames.Notes, batch);
    }
  }

  return { created: input.accepted.length };
}

/**
 * Fetches a single card item by user sub and cardId.
 *
 * Returns `undefined` when the card does not exist.
 */
export async function getCard(sub: string, cardId: string): Promise<CardItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: cardKeys.cardItemKey(sub, cardId),
    }),
  );
  return result.Item as CardItem | undefined;
}

/**
 * Returns the exact count of cards due at or before `nowIso` for the given
 * user by querying GSI5 with `Select: 'COUNT'` and paginating over
 * `LastEvaluatedKey` until exhausted.
 *
 * The 100-item `Limit` from `cardsByDueQuery` is removed so the full index
 * range is scanned for an accurate count.
 */
export async function countCardsDue(sub: string, nowIso: string): Promise<number> {
  const baseQuery = cardKeys.cardsByDueQuery(sub, nowIso);
  // Remove the Limit cap and switch to COUNT mode.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { Limit: _limit, ...queryWithoutLimit } = baseQuery;

  let total = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Notes,
        ...queryWithoutLimit,
        Select: 'COUNT',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    total += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey !== undefined);

  return total;
}

/**
 * Creates a single manual flashcard in DynamoDB.
 *
 * Writes with `origin: 'manual'`, `ease: 2.5`, `interval: 0` (explicitly
 * overriding the buildCardItem default of 1 so the first review is treated as
 * a fresh card), and `dueAt = now` so the card appears immediately in the
 * review queue.
 *
 * `sourceNoteId` is omitted from the item when not provided — standalone manual
 * cards have no parent note.
 *
 * @param input.sub          Cognito sub of the card owner.
 * @param input.cardId       Caller-generated ULID for the new card.
 * @param input.front        Question / prompt text.
 * @param input.back         Answer / explanation text.
 * @param input.sourceNoteId Optional ULID of a note to associate with this card.
 * @param input.now          Optional fixed timestamp (defaults to `new Date()`).
 */
export async function createManualCard(input: {
  sub: string;
  cardId: string;
  front: string;
  back: string;
  sourceNoteId?: string;
  now?: Date;
}): Promise<void> {
  const nowIso = (input.now ?? new Date()).toISOString();

  const item = buildCardItem({
    sub: input.sub,
    cardId: input.cardId,
    front: input.front,
    back: input.back,
    sourceNoteId: input.sourceNoteId,
    origin: 'manual',
    ease: 2.5,
    interval: 0,
    dueAt: nowIso,
    createdAt: nowIso,
  });

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );
}

/**
 * Deletes a single card item from DynamoDB by owner sub and cardId.
 *
 * This is a hard delete — no soft-delete / TTL pattern. The caller is
 * responsible for verifying ownership before calling this function.
 *
 * @param sub    Cognito sub of the card owner.
 * @param cardId ULID of the card to delete.
 */
export async function deleteCard(sub: string, cardId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TableNames.Notes,
      Key: cardKeys.cardItemKey(sub, cardId),
    }),
  );
}

/**
 * Records the result of a card review by updating the card's SM-2 state in
 * DynamoDB.
 *
 * Updates `ease`, `interval`, `dueAt`, `gsi5sk` (moves the card's GSI5
 * position to its new due date), `lastReviewedAt`, and `updatedAt`.
 * Uses `ReturnValues: 'ALL_NEW'` and returns the full updated item.
 *
 * `interval` is a DynamoDB reserved word and must be aliased as `#interval`.
 * `ease`, `dueAt`, `gsi5sk`, `lastReviewedAt`, and `updatedAt` are also
 * aliased defensively via ExpressionAttributeNames.
 */
export async function recordCardReview(input: {
  sub: string;
  cardId: string;
  result: ScheduleResult;
  now?: Date;
}): Promise<CardItem> {
  const updatedAt = (input.now ?? new Date()).toISOString();

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: cardKeys.cardItemKey(input.sub, input.cardId),
      UpdateExpression: [
        'SET #ease = :ease',
        '#interval = :interval',
        '#dueAt = :dueAt',
        '#gsi5sk = :gsi5sk',
        '#lastReviewedAt = :lastReviewedAt',
        '#updatedAt = :updatedAt',
      ].join(', '),
      ExpressionAttributeNames: {
        '#ease': 'ease',
        '#interval': 'interval',
        '#dueAt': 'dueAt',
        '#gsi5sk': 'gsi5sk',
        '#lastReviewedAt': 'lastReviewedAt',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':ease': input.result.ease,
        ':interval': input.result.interval,
        ':dueAt': input.result.dueAt,
        ':gsi5sk': cardKeys.gsi5sk(input.result.dueAt),
        ':lastReviewedAt': input.result.lastReviewedAt,
        ':updatedAt': updatedAt,
      },
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as CardItem;
}
