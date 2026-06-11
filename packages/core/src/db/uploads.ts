import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { uploadKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** An upload session item (PK = `USER#<sub>`, SK = `UPLOAD#<uploadToken>`). */
export interface UploadSessionItem {
  pk: string;            // USER#<sub>
  sk: string;            // UPLOAD#<uploadToken>
  uploadToken: string;
  uploadId: string;      // S3 multipart UploadId
  s3Key: string;
  jobId: string;
  createdAt: string;     // ISO-8601
  updatedAt: string;     // ISO-8601
}

// ---------------------------------------------------------------------------
// Pure item builders
// ---------------------------------------------------------------------------

/** Input for building an upload session item. */
export interface BuildUploadSessionItemInput {
  sub: string;
  uploadToken: string;
  uploadId: string;
  s3Key: string;
  jobId: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  createdAt?: string;
  /** Defaults to `createdAt` if omitted. */
  updatedAt?: string;
}

/**
 * Builds an `UploadSessionItem` with all DynamoDB keys populated.
 * Populates pk/sk via `uploadKeys.uploadSession(sub, uploadToken)`.
 */
export function buildUploadSessionItem(
  input: BuildUploadSessionItemInput,
): UploadSessionItem {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const keys = uploadKeys.uploadSession(input.sub, input.uploadToken);

  return {
    pk: keys.pk,
    sk: keys.sk,
    uploadToken: input.uploadToken,
    uploadId: input.uploadId,
    s3Key: input.s3Key,
    jobId: input.jobId,
    createdAt,
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Writes an upload session item to the `UserData` table via PutCommand.
 */
export async function putUploadSession(item: UploadSessionItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.UserData,
      Item: item,
    }),
  );
}

/**
 * Retrieves an upload session item by sub + uploadToken.
 * Returns `null` when no matching item is found.
 */
export async function getUploadSession(
  sub: string,
  uploadToken: string,
): Promise<UploadSessionItem | null> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: uploadKeys.uploadSession(sub, uploadToken),
    }),
  );

  return (Item as UploadSessionItem) ?? null;
}
