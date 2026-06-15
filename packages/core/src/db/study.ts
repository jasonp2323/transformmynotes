import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
