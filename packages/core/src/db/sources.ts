import { QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { sourceKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

export type SourceStatus = 'uploading' | 'extracting' | 'ready' | 'failed';
export type SourceFormat = 'pdf' | 'docx' | 'epub' | 'txt' | 'md';

/** Public source shape returned by db query functions. */
export interface Source {
  sourceId: string;
  type: 'document' | 'web'; // 'web' reserved for M21
  title: string;
  status: SourceStatus;
  originalFormat: SourceFormat;
  originalS3Key: string;
  extractedTextS3Key?: string;
  pageCount?: number;
  wordCount?: number;
  byteSize: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Full DynamoDB item shape for a SOURCE (includes PK/SK and GSI9 keys). */
export interface SourceItem extends Source {
  pk: string;
  sk: string;
  gsi9pk: string;
  gsi9sk: string;
}

// ---------------------------------------------------------------------------
// Pure item builder
// ---------------------------------------------------------------------------

/** Input for `buildSourceItem`. */
export interface BuildSourceItemInput {
  sub: string;
  sourceId: string;
  type: 'document' | 'web';
  title: string;
  status: SourceStatus;
  originalFormat: SourceFormat;
  originalS3Key: string;
  extractedTextS3Key?: string;
  pageCount?: number;
  wordCount?: number;
  byteSize: number;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Builds a `SourceItem` with all DynamoDB keys populated.
 *
 * Defaults:
 *   - `updatedAt` → `createdAt` when not provided
 *
 * Optional fields (`extractedTextS3Key`, `pageCount`, `wordCount`, `error`) are
 * omitted from the returned item when not supplied so the attributes are absent
 * in DynamoDB (rather than stored as `undefined`).
 */
export function buildSourceItem(input: BuildSourceItemInput): SourceItem {
  const keys = sourceKeys.item(input.sub, input.sourceId);

  const item: SourceItem = {
    pk: keys.pk,
    sk: keys.sk,
    gsi9pk: sourceKeys.gsi9pk(input.sub),
    gsi9sk: sourceKeys.gsi9sk(input.sourceId),
    sourceId: input.sourceId,
    type: input.type,
    title: input.title,
    status: input.status,
    originalFormat: input.originalFormat,
    originalS3Key: input.originalS3Key,
    byteSize: input.byteSize,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };

  if (input.extractedTextS3Key !== undefined) {
    item.extractedTextS3Key = input.extractedTextS3Key;
  }
  if (input.pageCount !== undefined) {
    item.pageCount = input.pageCount;
  }
  if (input.wordCount !== undefined) {
    item.wordCount = input.wordCount;
  }
  if (input.error !== undefined) {
    item.error = input.error;
  }

  return item;
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/** Writes a SOURCE item to the Notes table. */
export async function putSource(item: SourceItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );
}

/**
 * Fetches a single source item by user sub and sourceId.
 *
 * Returns `undefined` when the source does not exist.
 */
export async function getSource(sub: string, sourceId: string): Promise<SourceItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: sourceKeys.item(sub, sourceId),
    }),
  );
  return result.Item as SourceItem | undefined;
}

/**
 * Lists all sources for the given user by querying GSI9 (`SourcesByUser`),
 * newest-first (descending ULID order), capped at `limit` (default 50).
 *
 * GSI9 is projection ALL so no follow-up GetItem is needed.
 * Returns an empty array when the user has no sources.
 * Strips DynamoDB key attributes (pk, sk, gsi9pk, gsi9sk) from the returned items.
 */
export async function listSourcesByUser(sub: string, limit?: number): Promise<Source[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...sourceKeys.listByUser(sub, limit),
    }),
  );

  return ((Items ?? []) as SourceItem[]).map((item) => {
    const { pk: _pk, sk: _sk, gsi9pk: _gsi9pk, gsi9sk: _gsi9sk, ...source } = item;
    return source as Source;
  });
}

/**
 * Counts the total number of sources for the given user by querying GSI9 with
 * Select: COUNT. Returns 0 when the user has no sources.
 */
export async function countSourcesByUser(sub: string): Promise<number> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...sourceKeys.countByUser(sub),
    }),
  );
  return result.Count ?? 0;
}
