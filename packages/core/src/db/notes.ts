import {
  PutCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  BatchWriteCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { noteKeys, type NoteStatus } from './keys.js';
import { diffTokens } from '../search/tokenise.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** A main note item (PK = `USER#<cognitoSub>`, SK = `NOTE#<ulid>`). */
export interface NoteItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  noteId: string;
  sub: string;
  title: string;
  tags: string[];
  status: NoteStatus;
  words: number;
  highlights: number;
  langPair: string;
  ocrConfidence: number;
  bodyS3Key: string;
  originalImageS3Key: string;
  groupId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A tag-index item (PK = `TAG#<tag>`, SK = `USER#<sub>#NOTE#<ulid>`). */
export interface TagIndexItem {
  pk: string;
  sk: string;
  gsi2pk: string;
  gsi2sk: string;
  noteId: string;
}

/** A token-index item (PK = `USER#<sub>`, SK = `TOKEN#<token>#NOTE#<noteId>`). */
export interface TokenIndexItem {
  pk: string;
  sk: string;
  gsi3pk: string;
  gsi3sk: string;
  noteId: string;
}

// ---------------------------------------------------------------------------
// Pure item builders
// ---------------------------------------------------------------------------

/** Input for building a main note item. */
export interface BuildNoteItemInput {
  sub: string;
  noteId: string;
  title: string;
  tags: string[];
  status: NoteStatus;
  words: number;
  highlights: number;
  langPair: string;
  ocrConfidence: number;
  bodyS3Key: string;
  originalImageS3Key: string;
  /** Optional group the note belongs to. */
  groupId?: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  createdAt?: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  updatedAt?: string;
}

/** Builds a `NoteItem` with all DynamoDB keys populated. */
export function buildNoteItem(input: BuildNoteItemInput): NoteItem {
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const keys = noteKeys.note(input.sub, input.noteId);

  const item: NoteItem = {
    pk: keys.pk,
    sk: keys.sk,
    gsi1pk: noteKeys.gsi1pk(input.sub),
    gsi1sk: noteKeys.gsi1sk(input.noteId),
    noteId: input.noteId,
    sub: input.sub,
    title: input.title,
    tags: input.tags,
    status: input.status,
    words: input.words,
    highlights: input.highlights,
    langPair: input.langPair,
    ocrConfidence: input.ocrConfidence,
    bodyS3Key: input.bodyS3Key,
    originalImageS3Key: input.originalImageS3Key,
    createdAt,
    updatedAt,
  };

  if (input.groupId !== undefined) {
    item.groupId = input.groupId;
  }

  return item;
}

/** Input for building a tag-index item. */
export interface BuildTagIndexItemInput {
  tag: string;
  sub: string;
  noteId: string;
}

/** Builds a `TagIndexItem` with all DynamoDB keys populated. */
export function buildTagIndexItem(input: BuildTagIndexItemInput): TagIndexItem {
  const { tag, sub, noteId } = input;
  const keys = noteKeys.tagItem(tag, sub, noteId);

  return {
    pk: keys.pk,
    sk: keys.sk,
    gsi2pk: noteKeys.gsi2pk(tag),
    gsi2sk: noteKeys.gsi2sk(sub, noteId),
    noteId,
  };
}

/** Input for building a token-index item. */
export interface BuildTokenIndexItemInput {
  token: string;
  sub: string;
  noteId: string;
}

/** Builds a `TokenIndexItem` with all DynamoDB keys populated. */
export function buildTokenIndexItem(input: BuildTokenIndexItemInput): TokenIndexItem {
  const { token, sub, noteId } = input;
  const keys = noteKeys.tokenItemKey(sub, token, noteId);

  return {
    pk: keys.pk,
    sk: keys.sk,
    gsi3pk: noteKeys.gsi3pk(sub),
    gsi3sk: noteKeys.gsi3sk(token, noteId),
    noteId,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/** Input for `putNote`. */
export interface PutNoteInput extends BuildNoteItemInput {}

/**
 * Writes a new note item together with one tag-index item per unique tag in a
 * single `TransactWriteItems` call (main Put + one Put per tag-index item).
 *
 * Enforces a maximum of 20 tags per note — throws if exceeded.
 * Returns the built note item.
 */
export async function putNote(input: PutNoteInput): Promise<NoteItem> {
  const uniqueTags = [...new Set(input.tags)];
  if (uniqueTags.length > 20) {
    throw new Error(
      `putNote: a note may have at most 20 tags (${uniqueTags.length} provided).`,
    );
  }

  const noteItem = buildNoteItem(input);

  const tagPuts = uniqueTags.map((tag) => ({
    Put: {
      TableName: TableNames.Notes,
      Item: buildTagIndexItem({ tag, sub: input.sub, noteId: input.noteId }),
    },
  }));

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TableNames.Notes,
            Item: noteItem,
          },
        },
        ...tagPuts,
      ],
    }),
  );

  return noteItem;
}

/**
 * Retrieves a note item by user sub and noteId.
 *
 * Returns `undefined` if no matching item is found.
 */
export async function getNote(sub: string, noteId: string): Promise<NoteItem | undefined> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: noteKeys.note(sub, noteId),
    }),
  );

  return Item as NoteItem | undefined;
}

/**
 * Lists all notes for a user by querying GSI1 (`UserNotesByTime`), returning
 * items in newest-first order (descending ULID = descending time).
 *
 * Returns an empty array if the user has no notes.
 */
export async function listUserNotes(sub: string): Promise<NoteItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...noteKeys.listUserNotes(sub),
    }),
  );

  return (Items ?? []) as NoteItem[];
}

/**
 * Lists all tag-index items for a given tag by querying GSI2 (`NotesByTag`).
 *
 * Returns KEYS_ONLY items (pk, sk, gsi2pk, gsi2sk, noteId).
 * `noteId` is recovered from the sort key since GSI2 is KEYS_ONLY and does not project the stored `noteId` attribute.
 * Returns an empty array if no notes are tagged with the given tag.
 */
export async function listNoteIdsByTag(tag: string): Promise<TagIndexItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...noteKeys.listNotesByTag(tag),
    }),
  );

  return (Items ?? []).map((raw) => {
    const item = raw as { pk: string; sk: string; gsi2pk: string; gsi2sk: string };
    const { noteId } = noteKeys.parseTagItemSk(item.sk);
    return {
      pk: item.pk,
      sk: item.sk,
      gsi2pk: item.gsi2pk,
      gsi2sk: item.gsi2sk,
      noteId,
    };
  });
}

/**
 * Lists all token-index items matching a search term prefix for a user via GSI3 (`ByToken`).
 *
 * Returns KEYS_ONLY items (pk, sk, gsi3pk, gsi3sk, noteId).
 * `noteId` is recovered from the sort key since GSI3 is KEYS_ONLY and does not project the stored `noteId` attribute.
 * Returns an empty array if no notes contain tokens matching the given term.
 */
export async function listNoteIdsByToken(sub: string, term: string): Promise<TokenIndexItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...noteKeys.tokenQueryKey(sub, term),
    }),
  );

  return (Items ?? []).map((raw) => {
    const item = raw as { pk: string; sk: string; gsi3pk: string; gsi3sk: string };
    const { noteId } = noteKeys.parseTokenItemSk(item.sk);
    return {
      pk: item.pk,
      sk: item.sk,
      gsi3pk: item.gsi3pk,
      gsi3sk: item.gsi3sk,
      noteId,
    };
  });
}

// ---------------------------------------------------------------------------
// Tag delta helper
// ---------------------------------------------------------------------------

export interface TagDelta {
  added: string[];
  removed: string[];
}

/**
 * Computes which tags were added vs removed between an old and new tag set.
 * Both inputs are de-duplicated first. Order of the returned arrays follows
 * first-occurrence in the respective new/old arrays.
 */
export function computeTagDelta(oldTags: string[], newTags: string[]): TagDelta {
  const oldSet = new Set([...new Set(oldTags)]);
  const newUnique = [...new Set(newTags)];
  const oldUnique = [...new Set(oldTags)];

  return {
    added: newUnique.filter((t) => !oldSet.has(t)),
    removed: oldUnique.filter((t) => !new Set(newUnique).has(t)),
  };
}

// ---------------------------------------------------------------------------
// Optimistic-lock conflict error
// ---------------------------------------------------------------------------

/** Thrown by `updateNote` when the optimistic-lock condition fails (concurrent PATCH). */
export class NoteConflictError extends Error {
  constructor(message = 'Note was modified concurrently') {
    super(message);
    this.name = 'NoteConflictError';
  }
}

// ---------------------------------------------------------------------------
// updateNote
// ---------------------------------------------------------------------------

export interface UpdateNoteInput {
  sub: string;
  noteId: string;
  title: string;
  /** Full NEW tag set, stored on the main item's `tags`. */
  tags: string[];
  status: NoteStatus;
  words: number;
  highlights: number;
  langPair: string;
  ocrConfidence: number;
  bodyS3Key: string;
  originalImageS3Key: string;
  /** Preserved from the existing item. */
  createdAt: string;
  groupId?: string;
  /** Tag-index items to create (PK=TAG#<tag>). */
  addedTags: string[];
  /** Tag-index items to delete. */
  removedTags: string[];
  /** Optimistic lock: the existing item's current `updatedAt`. */
  expectedUpdatedAt: string;
  /** New updatedAt; defaults to new Date().toISOString(). */
  updatedAt?: string;
}

/**
 * Updates an existing note in a single TransactWriteItems:
 *   - Put (overwrite) the main note item with bumped `updatedAt`, guarded by a
 *     ConditionExpression `updatedAt = :expected` (optimistic lock).
 *   - Delete one tag-index item per `removedTags` entry.
 *   - Put one tag-index item per `addedTags` entry.
 * Enforces max 20 tags on the new set, and that the transaction stays within
 * DynamoDB's 100-item cap (throws if exceeded).
 * Re-throws a `NoteConflictError` when the condition fails
 * (TransactionCanceledException with a ConditionalCheckFailed reason).
 * Returns the rebuilt NoteItem.
 */
export async function updateNote(input: UpdateNoteInput): Promise<NoteItem> {
  const uniqueTags = [...new Set(input.tags)];
  if (uniqueTags.length > 20) {
    throw new Error(
      `updateNote: a note may have at most 20 tags (${uniqueTags.length} provided).`,
    );
  }

  const totalItems = 1 + input.removedTags.length + input.addedTags.length;
  if (totalItems > 100) {
    throw new Error(
      `updateNote: transaction would exceed DynamoDB's 100-item cap (${totalItems} items).`,
    );
  }

  const updatedAt = input.updatedAt ?? new Date().toISOString();

  const noteItem = buildNoteItem({
    sub: input.sub,
    noteId: input.noteId,
    title: input.title,
    tags: uniqueTags,
    status: input.status,
    words: input.words,
    highlights: input.highlights,
    langPair: input.langPair,
    ocrConfidence: input.ocrConfidence,
    bodyS3Key: input.bodyS3Key,
    originalImageS3Key: input.originalImageS3Key,
    groupId: input.groupId,
    createdAt: input.createdAt,
    updatedAt,
  });

  const deleteItems = input.removedTags.map((tag) => ({
    Delete: {
      TableName: TableNames.Notes,
      Key: noteKeys.tagItem(tag, input.sub, input.noteId),
    },
  }));

  const addItems = input.addedTags.map((tag) => ({
    Put: {
      TableName: TableNames.Notes,
      Item: buildTagIndexItem({ tag, sub: input.sub, noteId: input.noteId }),
    },
  }));

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TableNames.Notes,
              Item: noteItem,
              ConditionExpression: 'updatedAt = :expected',
              ExpressionAttributeValues: { ':expected': input.expectedUpdatedAt },
            },
          },
          ...deleteItems,
          ...addItems,
        ],
      }),
    );
  } catch (err: unknown) {
    const e = err as {
      name?: string;
      CancellationReasons?: Array<{ Code?: string } | null>;
    };
    if (
      e.name === 'TransactionCanceledException' &&
      e.CancellationReasons?.some((r) => r?.Code === 'ConditionalCheckFailed')
    ) {
      throw new NoteConflictError();
    }
    throw err;
  }

  return noteItem;
}

// ---------------------------------------------------------------------------
// Token-index maintenance helpers (M6.2.3)
// ---------------------------------------------------------------------------

/**
 * Splits an array into consecutive chunks of at most `size` elements.
 *
 * @param arr  - Source array.
 * @param size - Maximum chunk length (must be > 0).
 * @returns Array of sub-arrays, each at most `size` long.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Retries a batch of `BatchWriteCommand` requests until `UnprocessedItems` is
 * empty, or up to `maxRetries` additional attempts after the first call.
 *
 * @param tableName   - DynamoDB table name to target.
 * @param requests    - Initial `RequestItems` value (already chunked to ≤25).
 * @param maxRetries  - Number of retry passes (default 3).
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

/**
 * Writes one token-index item per token for a given note.
 *
 * - No-op when `tokens` is empty.
 * - De-duplicates `tokens` before writing.
 * - Uses `BatchWriteItem` in chunks of 25 (DynamoDB limit) with up to 3
 *   retries for `UnprocessedItems`, so a throttled batch still completes.
 *
 * @param sub     - Cognito user sub.
 * @param noteId  - ULID note identifier.
 * @param tokens  - Normalised token strings to index.
 */
export async function putNoteTokens(
  sub: string,
  noteId: string,
  tokens: string[],
): Promise<void> {
  const unique = [...new Set(tokens)];
  if (unique.length === 0) return;

  const requests = unique.map((token) => ({
    PutRequest: { Item: buildTokenIndexItem({ token, sub, noteId }) },
  }));

  for (const batch of chunk(requests, 25)) {
    await batchWriteWithRetry(TableNames.Notes, batch as Record<string, unknown>[]);
  }
}

/**
 * Deletes one token-index item per token for a given note.
 *
 * - No-op when `tokens` is empty.
 * - De-duplicates `tokens` before deleting.
 * - Uses `BatchWriteItem` `DeleteRequest` in chunks of 25 with up to 3
 *   retries for `UnprocessedItems`.
 *
 * @param sub     - Cognito user sub.
 * @param noteId  - ULID note identifier.
 * @param tokens  - Normalised token strings to remove from the index.
 */
export async function deleteNoteTokens(
  sub: string,
  noteId: string,
  tokens: string[],
): Promise<void> {
  const unique = [...new Set(tokens)];
  if (unique.length === 0) return;

  const requests = unique.map((token) => ({
    DeleteRequest: { Key: noteKeys.tokenItemKey(sub, token, noteId) },
  }));

  for (const batch of chunk(requests, 25)) {
    await batchWriteWithRetry(TableNames.Notes, batch as Record<string, unknown>[]);
  }
}

/**
 * Incrementally synchronises a note's token index by diffing the old and new
 * token sets and issuing only the minimal add / remove operations.
 *
 * Uses `diffTokens` to compute `{ toAdd, toRemove }`, then:
 *   1. Deletes stale token-index items (`toRemove`).
 *   2. Writes new token-index items (`toAdd`).
 * Either step is skipped when the respective array is empty.
 *
 * @param sub        - Cognito user sub.
 * @param noteId     - ULID note identifier.
 * @param oldTokens  - Previously indexed tokens.
 * @param newTokens  - Freshly computed tokens.
 */
export async function syncNoteTokens(
  sub: string,
  noteId: string,
  oldTokens: string[],
  newTokens: string[],
): Promise<void> {
  const { toAdd, toRemove } = diffTokens(oldTokens, newTokens);

  if (toRemove.length > 0) {
    await deleteNoteTokens(sub, noteId, toRemove);
  }
  if (toAdd.length > 0) {
    await putNoteTokens(sub, noteId, toAdd);
  }
}

/**
 * Hard-deletes the complete DynamoDB footprint of a note:
 *   - The main note item (`USER#<sub>` / `NOTE#<noteId>`).
 *   - One tag-index item per tag (`TAG#<tag>` / `USER#<sub>#NOTE#<noteId>`).
 *   - One token-index item per token (`USER#<sub>` / `TOKEN#<token>#NOTE#<noteId>`).
 *
 * Builds a single list of `DeleteRequest` entries (de-duplicating `tags` and
 * `tokens` first), then BatchWrites them in chunks of 25 with up to 3 retries
 * for `UnprocessedItems`.
 *
 * @param sub     - Cognito user sub.
 * @param noteId  - ULID note identifier.
 * @param tags    - Tags associated with the note (drives tag-index cleanup).
 * @param tokens  - Tokens indexed for the note (drives token-index cleanup).
 */
export async function deleteNoteRecord(
  sub: string,
  noteId: string,
  tags: string[],
  tokens: string[],
): Promise<void> {
  const uniqueTags = [...new Set(tags)];
  const uniqueTokens = [...new Set(tokens)];

  const requests: Record<string, unknown>[] = [
    // Main note item
    { DeleteRequest: { Key: noteKeys.note(sub, noteId) } },
    // Tag-index items
    ...uniqueTags.map((tag) => ({
      DeleteRequest: { Key: noteKeys.tagItem(tag, sub, noteId) },
    })),
    // Token-index items
    ...uniqueTokens.map((token) => ({
      DeleteRequest: { Key: noteKeys.tokenItemKey(sub, token, noteId) },
    })),
  ];

  for (const batch of chunk(requests, 25)) {
    await batchWriteWithRetry(TableNames.Notes, batch);
  }
}

/**
 * Queries the base-table primary index for a user's notes, newest-first, capped at 20.
 *
 * Uses `noteKeys.noteListRecentQuery` (a `begins_with(sk, 'NOTE#')` on the base-table
 * primary index with `ScanIndexForward: false` and `Limit: 20`), rather than GSI1.
 * Returns an empty array if the user has no notes.
 */
export async function listRecentNotes(sub: string): Promise<NoteItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...noteKeys.noteListRecentQuery(sub),
    }),
  );
  return (Items ?? []) as NoteItem[];
}

/**
 * Fetches multiple note items by id in a single BatchGetItem, chunked at 100.
 * De-duplicates input ids. Retries UnprocessedKeys up to 3 times. Order not guaranteed.
 */
export async function batchGetNotes(sub: string, noteIds: string[]): Promise<NoteItem[]> {
  // De-duplicate
  const unique = [...new Set(noteIds)];
  if (unique.length === 0) return [];

  const results: NoteItem[] = [];
  // BatchGetItem max is 100 items per request
  const batches = chunk(unique, 100);

  for (const batch of batches) {
    let keys = noteKeys.noteMultiGetKeys(sub, batch);
    let retries = 0;

    while (keys.length > 0 && retries <= 3) {
      const result = await ddb.send(
        new BatchGetCommand({
          RequestItems: {
            [TableNames.Notes]: { Keys: keys },
          },
        }),
      );
      const fetched = (result.Responses?.[TableNames.Notes] ?? []) as NoteItem[];
      results.push(...fetched);

      const unprocessed = result.UnprocessedKeys?.[TableNames.Notes]?.Keys ?? [];
      keys = unprocessed as { pk: string; sk: string }[];
      retries++;
    }
  }

  return results;
}

/**
 * Lists all of a user's notes that belong to a given group (notebook), newest-first,
 * via GSI1 with a groupId FilterExpression. Returns [] if none. Used by the
 * multi-note generation flow to resolve a notebookId → its note ids server-side.
 */
export async function listNotesByGroup(sub: string, groupId: string): Promise<NoteItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...noteKeys.notesByGroupQuery(sub, groupId),
    }),
  );
  return (Items ?? []) as NoteItem[];
}
