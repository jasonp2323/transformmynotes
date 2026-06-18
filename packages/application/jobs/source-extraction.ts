/**
 * Core logic for extracting text from an uploaded document source (M20).
 *
 * Runs as a STANDALONE Lambda consuming the Notes-table DynamoDB stream — NOT
 * through the Next.js bundler — so it must avoid the `@/` path alias and import
 * only from `@transformmynotes/core` and the AWS SDK.
 *
 * The `deps` parameter lets callers inject every I/O dependency, allowing tests
 * to stub them out. All deps default to the real production implementations when
 * invoked from the Lambda handler.
 */

import {
  getSource,
  markSourceReady,
  markSourceFailed,
  parseDocument,
  withTitleHeading,
  countWords,
  checkWordCount,
  storageKeys,
  sourceKeys,
  type SourceItem,
} from '@transformmynotes/core';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_NotesBucket_name: the S3 bucket name is not bound.',
    );
  }
  return value;
}

async function defaultGetOriginalBytes(source: SourceItem): Promise<Buffer> {
  const s3 = new S3Client({});
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: requireBucketName(),
      Key: source.originalS3Key,
    }),
  );
  return Buffer.from(await response.Body!.transformToByteArray());
}

async function defaultPutText(sub: string, sourceId: string, text: string): Promise<void> {
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: requireBucketName(),
      Key: storageKeys.sourceText(sub, sourceId),
      Body: text,
      ContentType: 'text/markdown',
    }),
  );
}

/**
 * Injectable dependencies for `processSourceExtraction`.
 * Every field has a sensible default that points at real AWS / core services.
 */
export interface ProcessSourceDeps {
  /** Fetch a source record from the store. Default: `getSource`. */
  getSource: (sub: string, sourceId: string) => Promise<SourceItem | undefined>;
  /**
   * Fetch the raw bytes of the original uploaded file from S3.
   * Default: reads from `SST_RESOURCE_NotesBucket_name` at `source.originalS3Key`.
   */
  getOriginalBytes: (source: SourceItem) => Promise<Buffer>;
  /** Parse document bytes into Markdown text. Default: `parseDocument`. */
  parse: (format: SourceItem['originalFormat'], buffer: Buffer) => Promise<string>;
  /**
   * Persist the extracted Markdown text to S3.
   * Default: writes to `storageKeys.sourceText(sub, sourceId)` in `SST_RESOURCE_NotesBucket_name`.
   */
  putText: (sub: string, sourceId: string, text: string) => Promise<void>;
  /** Mark a source as ready. Default: `markSourceReady`. */
  markReady: (input: {
    sub: string;
    sourceId: string;
    extractedTextS3Key: string;
    wordCount: number;
    pageCount?: number;
  }) => Promise<void>;
  /** Mark a source as failed with a sanitised message. Default: `markSourceFailed`. */
  markFailed: (input: { sub: string; sourceId: string; error: string }) => Promise<void>;
}

const DEFAULT_DEPS: ProcessSourceDeps = {
  getSource: getSource,
  getOriginalBytes: defaultGetOriginalBytes,
  parse: parseDocument,
  putText: defaultPutText,
  markReady: markSourceReady,
  markFailed: markSourceFailed,
};

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

/**
 * Processes a source document in the 'extracting' state end-to-end:
 *   1. Fetches the source — returns 'not_found' if absent.
 *   2. Idempotency guard — if status is not 'extracting', returns 'skipped'.
 *   3. Downloads the original file bytes from S3 and parses to Markdown.
 *   4. Prepends a title heading and counts words.
 *   5. Word-count cap: if exceeded, marks 'failed' and returns 'failed'.
 *   6. Persists the extracted text to S3 and marks the source 'ready'.
 *
 * On extraction failure:
 *   - Logs the real error server-side.
 *   - Stores a SANITISED error summary (error class only, no raw message).
 *   - Returns 'failed'.
 *
 * @param sub       The authenticated Cognito sub (owner of the source).
 * @param sourceId  The ULID source identifier.
 * @param deps      Injected I/O dependencies (defaults to real implementations).
 */
export async function processSourceExtraction(
  sub: string,
  sourceId: string,
  deps: Partial<ProcessSourceDeps> = {},
): Promise<{ outcome: 'ready' | 'failed' | 'skipped' | 'not_found' }> {
  const {
    getSource: _getSource,
    getOriginalBytes,
    parse,
    putText,
    markReady,
    markFailed,
  } = { ...DEFAULT_DEPS, ...deps };

  const source = await _getSource(sub, sourceId);
  if (!source) {
    return { outcome: 'not_found' };
  }

  if (source.status !== 'extracting') {
    return { outcome: 'skipped' };
  }

  try {
    const buffer = await getOriginalBytes(source);
    let text = withTitleHeading(await parse(source.originalFormat, buffer), source.title);
    const wordCount = countWords(text);
    const wc = checkWordCount(wordCount);

    if (!wc.ok) {
      await markFailed({ sub, sourceId, error: 'Document exceeds word limit' });
      return { outcome: 'failed' };
    }

    await putText(sub, sourceId, text);
    await markReady({
      sub,
      sourceId,
      extractedTextS3Key: storageKeys.sourceText(sub, sourceId),
      wordCount,
    });
    return { outcome: 'ready' };
  } catch (err) {
    // Log the REAL error server-side (CloudWatch), but never expose it.
    console.error('[source-extraction] extraction failed', err);

    const sanitised =
      err instanceof Error && err.name && err.name !== 'Error'
        ? `${err.name}: extraction failed`
        : 'extraction failed';

    try {
      await markFailed({ sub, sourceId, error: sanitised });
    } catch (statusErr) {
      console.error('[source-extraction] failed to mark source failed', statusErr);
    }

    return { outcome: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// Lambda handler — DynamoDB stream consumer
// ---------------------------------------------------------------------------

interface SourceStreamRecord {
  eventName?: string;
  dynamodb?: {
    Keys?: { pk?: { S?: string }; sk?: { S?: string } };
    NewImage?: { status?: { S?: string } };
  };
}

export async function handler(event: { Records?: SourceStreamRecord[] }): Promise<void> {
  for (const record of event.Records ?? []) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue;
    const pk = record.dynamodb?.Keys?.pk?.S;
    const sk = record.dynamodb?.Keys?.sk?.S;
    if (!pk || !sk || !sk.startsWith('SOURCE#')) continue;
    // Defensive check — stream filter already narrows, but double-check status.
    const status = record.dynamodb?.NewImage?.status?.S;
    if (status !== 'extracting') continue;
    const sub = pk.replace(/^USER#/, '');
    const sourceId = sk.replace(/^SOURCE#/, '');
    try {
      await processSourceExtraction(sub, sourceId);
    } catch (err) {
      console.error('[source-extraction] handler record failed', err);
    }
  }
}
