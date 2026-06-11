import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { cardKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** Public card shape returned by db query functions. */
export interface Card {
  cardId: string;
  sourceNoteId: string;
  front: string;
  back: string;
  ease: number;
  interval: number;
  dueAt: string;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  sourceNoteId: string;
  front: string;
  back: string;
  dueAt: string;
  createdAt: string;
  ease?: number;
  interval?: number;
  lastReviewedAt?: string;
  updatedAt?: string;
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
    sourceNoteId: input.sourceNoteId,
    front: input.front,
    back: input.back,
    ease: input.ease ?? 2.5,
    interval: input.interval ?? 1,
    dueAt: input.dueAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };

  if (input.lastReviewedAt !== undefined) {
    item.lastReviewedAt = input.lastReviewedAt;
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
