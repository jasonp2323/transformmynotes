import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { jobKeys, type TranscriptionJobStatus } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** A transcription job item (PK = `USER#<sub>`, SK = `JOB#<jobId>`). */
export interface TranscriptionJobItem {
  pk: string;       // USER#<sub>
  sk: string;       // JOB#<jobId>
  jobId: string;
  status: TranscriptionJobStatus;
  s3Key: string;    // images/users/<sub>/<jobId>.jpg
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
  errorMsg?: string;
}

// ---------------------------------------------------------------------------
// Pure item builders
// ---------------------------------------------------------------------------

/** Input for building a transcription job item. */
export interface BuildTranscriptionJobItemInput {
  sub: string;
  jobId: string;
  s3Key: string;
  /** Defaults to `'pending'` if omitted. */
  status?: TranscriptionJobStatus;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  createdAt?: string;
  /** Defaults to `createdAt` if omitted. */
  updatedAt?: string;
  errorMsg?: string;
}

/**
 * Builds a `TranscriptionJobItem` with all DynamoDB keys populated.
 * Populates pk/sk via `jobKeys.job(sub, jobId)`.
 * Only includes `errorMsg` when defined.
 */
export function buildTranscriptionJobItem(
  input: BuildTranscriptionJobItemInput,
): TranscriptionJobItem {
  const status = input.status ?? 'pending';
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const keys = jobKeys.job(input.sub, input.jobId);

  const item: TranscriptionJobItem = {
    pk: keys.pk,
    sk: keys.sk,
    jobId: input.jobId,
    status,
    s3Key: input.s3Key,
    createdAt,
    updatedAt,
  };

  if (input.errorMsg !== undefined) {
    item.errorMsg = input.errorMsg;
  }

  return item;
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Writes a transcription job item to the `UserData` table via PutCommand.
 */
export async function putTranscriptionJob(item: TranscriptionJobItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.UserData,
      Item: item,
    }),
  );
}

/**
 * Retrieves a transcription job item by sub + jobId.
 *
 * Returns `null` when no matching item is found.
 */
export async function getTranscriptionJob(
  sub: string,
  jobId: string,
): Promise<TranscriptionJobItem | null> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: jobKeys.job(sub, jobId),
    }),
  );

  return (Item as TranscriptionJobItem) ?? null;
}
