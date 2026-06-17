import { QueryCommand, GetCommand, UpdateCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { studySetKeys } from './keys.js';
import type { StudyMaterialType, StudySetStatus, StudyLanguage } from '../study/types.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** Public study-set shape returned by db query functions. */
export interface StudySet {
  studySetId: string;
  sourceNoteIds: string[];
  type: StudyMaterialType;
  title: string;
  status: StudySetStatus;
  language: StudyLanguage;
  model: string;
  promptVersion: string;
  error?: string;
  bodyS3Key?: string;
  /** Whole-assignment completion toggle (M16.2.2). Absent until first set. */
  completed?: boolean;
  /** True when the map-reduce code path was used (M17). */
  mapReduce?: boolean;
  /** Number of map-phase chunks executed (M17). */
  chunkCount?: number;
  /** length of sourceNoteIds at dispatch time (M17). */
  inputNoteCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Full DynamoDB item shape for a STUDYSET (includes PK/SK and GSI6/GSI7 keys). */
export interface StudySetItem extends StudySet {
  pk: string;
  sk: string;
  gsi6pk: string;
  gsi6sk: string;
  gsi7pk: string;
  gsi7sk: string;
}

// ---------------------------------------------------------------------------
// Pure item builder
// ---------------------------------------------------------------------------

/** Input for `buildStudySetItem`. */
export interface BuildStudySetItemInput {
  sub: string;
  studySetId: string;
  sourceNoteIds: string[];
  type: StudyMaterialType;
  title: string;
  status: StudySetStatus;
  language: StudyLanguage;
  model: string;
  promptVersion?: string;
  error?: string;
  bodyS3Key?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Builds a `StudySetItem` with all DynamoDB keys populated.
 *
 * Defaults:
 *   - `updatedAt`      → `createdAt` when not provided
 *   - `promptVersion`  → `''` when not provided
 *
 * `error` and `bodyS3Key` are omitted from the returned item when not supplied
 * so the attributes are absent in DynamoDB (rather than stored as `undefined`).
 */
export function buildStudySetItem(input: BuildStudySetItemInput): StudySetItem {
  const keys = studySetKeys.item(input.sub, input.studySetId);
  const sourceNoteId = input.sourceNoteIds[0];

  const item: StudySetItem = {
    pk: keys.pk,
    sk: keys.sk,
    gsi6pk: studySetKeys.gsi6pk(input.sub),
    gsi6sk: studySetKeys.gsi6sk(input.studySetId),
    gsi7pk: studySetKeys.gsi7pk(sourceNoteId),
    gsi7sk: studySetKeys.gsi7sk(input.sub, input.studySetId),
    studySetId: input.studySetId,
    sourceNoteIds: input.sourceNoteIds,
    type: input.type,
    title: input.title,
    status: input.status,
    language: input.language,
    model: input.model,
    promptVersion: input.promptVersion ?? '',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };

  if (input.error !== undefined) {
    item.error = input.error;
  }

  if (input.bodyS3Key !== undefined) {
    item.bodyS3Key = input.bodyS3Key;
  }

  return item;
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Lists all study sets for the given user by querying GSI6 (`StudySetsByUser`),
 * newest-first (descending ULID order), capped at `limit` (default 50).
 *
 * GSI6 is projection ALL so no follow-up GetItem is needed.
 * Returns an empty array when the user has no study sets.
 */
export async function listStudySetsByUser(sub: string, limit?: number): Promise<StudySet[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...studySetKeys.listByUser(sub, limit),
    }),
  );

  return (Items ?? []) as StudySet[];
}

/**
 * Lists all study sets derived from a given source note for the given user by
 * querying GSI7 (`StudySetsByNote`). The begins_with on gsi7sk restricts
 * results to the requesting user, preventing cross-user leakage.
 *
 * GSI7 is projection ALL so no follow-up GetItem is needed.
 * Returns an empty array when no study sets exist for that note.
 */
export async function listStudySetsByNote(sub: string, sourceNoteId: string): Promise<StudySet[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...studySetKeys.listByNote(sourceNoteId, sub),
    }),
  );

  return (Items ?? []) as StudySet[];
}

/**
 * Fetches a single study-set item by user sub and studySetId.
 *
 * Returns `undefined` when the study set does not exist.
 */
export async function getStudySet(
  sub: string,
  studySetId: string,
): Promise<StudySetItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(sub, studySetId),
    }),
  );
  return result.Item as StudySetItem | undefined;
}

/** Writes a STUDYSET item to the Notes table (used by POST /api/study/generate). */
export async function putStudySet(item: StudySetItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );
}

/**
 * Atomically claims a queued study set for processing by flipping status
 * 'queued' → 'running' under a ConditionExpression `#status = :queued`.
 * Returns true if the claim succeeded; false if the condition failed (another
 * invocation already claimed it, or it is no longer queued) — the idempotency
 * guard for the stream consumer. Re-throws any non-conditional error.
 */
export async function claimStudySet(
  sub: string,
  studySetId: string,
  updatedAt?: string,
): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Notes,
        Key: studySetKeys.item(sub, studySetId),
        UpdateExpression: 'SET #status = :running, updatedAt = :updatedAt',
        ConditionExpression: '#status = :queued',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':running': 'running',
          ':queued': 'queued',
          ':updatedAt': updatedAt ?? new Date().toISOString(),
        },
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw err;
  }
}

/**
 * Marks a study set as successfully generated: status → 'ready', plus the S3
 * body key and the prompt version used. Optionally records M17 map-reduce
 * metadata (`mapReduce`, `chunkCount`, `inputNoteCount`) when provided; omitted
 * fields are not written to DynamoDB (SET clause built dynamically).
 */
export async function markStudySetReady(input: {
  sub: string;
  studySetId: string;
  bodyS3Key: string;
  promptVersion: string;
  updatedAt?: string;
  /** True when the map-reduce code path was used (M17). */
  mapReduce?: boolean;
  /** Number of map-phase chunks executed (M17). */
  chunkCount?: number;
  /** length of sourceNoteIds at dispatch time (M17). */
  inputNoteCount?: number;
}): Promise<void> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  // Build the SET clause dynamically so optional M17 fields are only written
  // when explicitly provided (avoids storing `undefined` as DynamoDB NULL).
  const setClauses = [
    '#status = :status',
    'bodyS3Key = :bodyS3Key',
    'promptVersion = :promptVersion',
    'updatedAt = :updatedAt',
  ];
  const expressionValues: Record<string, unknown> = {
    ':status': 'ready',
    ':bodyS3Key': input.bodyS3Key,
    ':promptVersion': input.promptVersion,
    ':updatedAt': updatedAt,
  };

  if (input.mapReduce !== undefined) {
    setClauses.push('mapReduce = :mapReduce');
    expressionValues[':mapReduce'] = input.mapReduce;
  }
  if (input.chunkCount !== undefined) {
    setClauses.push('chunkCount = :chunkCount');
    expressionValues[':chunkCount'] = input.chunkCount;
  }
  if (input.inputNoteCount !== undefined) {
    setClauses.push('inputNoteCount = :inputNoteCount');
    expressionValues[':inputNoteCount'] = input.inputNoteCount;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(input.sub, input.studySetId),
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: expressionValues,
    }),
  );
}

/** Marks a study set failed: status → 'failed' with a (sanitised) error message. */
export async function markStudySetFailed(input: {
  sub: string;
  studySetId: string;
  error: string;
  updatedAt?: string;
}): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(input.sub, input.studySetId),
      UpdateExpression: 'SET #status = :status, #error = :error, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':error': input.error,
        ':updatedAt': input.updatedAt ?? new Date().toISOString(),
      },
    }),
  );
}

/**
 * Marks a study set as rejected for being too large to process: status → 'too_large'.
 * No Bedrock call was made. Mirrors markStudySetFailed but with a dedicated status.
 */
export async function markStudySetTooLarge(input: {
  sub: string;
  studySetId: string;
  updatedAt?: string;
}): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(input.sub, input.studySetId),
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'too_large',
        ':updatedAt': input.updatedAt ?? new Date().toISOString(),
      },
    }),
  );
}

/**
 * Counts a user's in-flight study sets (status 'queued' or 'running') via GSI6,
 * used for the per-user concurrency rate limit in POST /api/study/generate.
 */
export async function countInFlightStudySets(sub: string): Promise<number> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...studySetKeys.inFlightByUser(sub),
    }),
  );
  return (Items ?? []).length;
}

/**
 * Sets the whole-assignment `completed` toggle on a STUDYSET item (M16.2.2).
 * Uses a `ConditionExpression: attribute_exists(pk)` so it throws
 * `ConditionalCheckFailedException` when no item exists for that (sub, studySetId)
 * — the PK is user-scoped, so this also guards against non-owners.
 */
export async function setStudySetCompleted(
  sub: string,
  studySetId: string,
  completed: boolean,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(sub, studySetId),
      UpdateExpression: 'SET completed = :completed, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: {
        ':completed': completed,
        ':updatedAt': new Date().toISOString(),
      },
    }),
  );
}

/**
 * Deletes a STUDYSET item from the Notes table by (sub, studySetId).
 * Used by DELETE /api/study/[studySetId] after the S3 body has been removed.
 */
export async function deleteStudySet(sub: string, studySetId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TableNames.Notes, Key: studySetKeys.item(sub, studySetId) }));
}
