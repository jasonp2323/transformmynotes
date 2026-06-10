import { PutCommand, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
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
