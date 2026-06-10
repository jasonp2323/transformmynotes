import {
  PutCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { noteKeys, type NoteStatus } from './keys.js';

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
