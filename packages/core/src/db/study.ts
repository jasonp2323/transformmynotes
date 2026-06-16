import { QueryCommand, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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
 * body key and the prompt version used.
 */
export async function markStudySetReady(input: {
  sub: string;
  studySetId: string;
  bodyS3Key: string;
  promptVersion: string;
  updatedAt?: string;
}): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: studySetKeys.item(input.sub, input.studySetId),
      UpdateExpression:
        'SET #status = :status, bodyS3Key = :bodyS3Key, promptVersion = :promptVersion, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'ready',
        ':bodyS3Key': input.bodyS3Key,
        ':promptVersion': input.promptVersion,
        ':updatedAt': input.updatedAt ?? new Date().toISOString(),
      },
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
