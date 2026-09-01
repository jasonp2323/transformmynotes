/**
 * Core logic for processing a transcription job.
 *
 * Extracted from the `/api/transcribe` route handler so this function can be
 * unit-tested in Node without a live HTTP server or real AWS credentials.
 *
 * The `deps` parameter lets callers inject every I/O dependency, allowing tests
 * to stub them out. All deps default to the real production implementations when
 * called from the route handler.
 */

import {
  shouldSkipTranscription,
  getTranscriptionJob,
  updateTranscriptionJobStatus,
  transcribeImage,
  postprocessMarkdown,
  putUsageEvent,
  storageKeys,
  buildActivityItem,
  putActivity,
  appendStepUpdate,
  type TranscriptionJobItem,
  type ActivityItem,
} from '@transformmynotes/core';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessJobResult {
  /** Discriminant for success vs. skip vs. error. */
  outcome: 'success' | 'skipped' | 'not_found' | 'error';
  /** Present on 'success'; the processed markdown and associated metadata. */
  data?: {
    markdown: string;
    wordCount: number;
    detectedLang: string;
    ocrConfidence: number;
    markdownS3Key: string;
  };
  /** Present on 'error'; the HTTP status code to return. */
  status?: number;
  /** Present on 'error'; the sanitized client-facing error message. */
  errorMessage?: string;
}

/**
 * Injectable dependencies for `processTranscriptionJob`.
 * Every field has a sensible default that points at real AWS / core services.
 */
export interface ProcessJobDeps {
  /** Fetch a job record from the store. Default: `getTranscriptionJob`. */
  getJob: (sub: string, jobId: string) => Promise<TranscriptionJobItem | null>;
  /** Update a job's status in the store. Default: `updateTranscriptionJobStatus`. */
  updateStatus: (input: {
    sub: string;
    jobId: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    errorMsg?: string;
  }) => Promise<void>;
  /**
   * Fetch the raw image bytes for the given job.
   * Default: reads from S3 using the `SST_RESOURCE_NotesBucket_name` env var.
   */
  getImageBytes: (sub: string, jobId: string) => Promise<Uint8Array>;
  /**
   * Run OCR on the image bytes.
   * Default: `transcribeImage` from `@transformmynotes/core`.
   */
  transcribe: (
    imageBytes: Uint8Array,
    onDelta?: (textDelta: string) => void,
  ) => Promise<{
    rawText: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    model?: string;
  }>;
  /**
   * Persist the processed markdown output.
   * Default: writes to S3 via PutObjectCommand.
   */
  putMarkdown: (sub: string, jobId: string, markdown: string) => Promise<void>;
  /** Fire-and-forget metering of the OCR call. Default: putUsageEvent from core. */
  emitUsage: (input: {
    sub: string;
    feature: 'ocr';
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) => Promise<void>;
  /** Create the ACTIVITY mirror record. Default: `putActivity` from core. */
  createActivity: (item: ActivityItem) => Promise<void>;
  /** Append a phase-transition step to the ACTIVITY record. Default: `appendStepUpdate` from core. */
  updateActivity: (input: Parameters<typeof appendStepUpdate>[0]) => Promise<ActivityItem>;
  /**
   * Persist the in-progress streaming transcript text.
   * Default: writes to S3 via PutObjectCommand (`text/plain`).
   */
  flushStream: (s3Key: string, text: string) => Promise<void>;
}

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

async function defaultGetImageBytes(sub: string, jobId: string): Promise<Uint8Array> {
  const bucket = requireBucketName();
  const s3 = new S3Client({});
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKeys.originalImage(sub, jobId),
    }),
  );
  return response.Body!.transformToByteArray();
}

async function defaultPutMarkdown(sub: string, jobId: string, markdown: string): Promise<void> {
  const bucket = requireBucketName();
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKeys.noteMarkdown(sub, jobId),
      Body: markdown,
      ContentType: 'text/markdown',
    }),
  );
}

async function defaultFlushStream(s3Key: string, text: string): Promise<void> {
  const bucket = requireBucketName();
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: text,
      ContentType: 'text/plain',
    }),
  );
}

const DEFAULT_DEPS: ProcessJobDeps = {
  getJob: getTranscriptionJob,
  updateStatus: updateTranscriptionJobStatus,
  getImageBytes: defaultGetImageBytes,
  transcribe: transcribeImage,
  putMarkdown: defaultPutMarkdown,
  emitUsage: putUsageEvent,
  createActivity: putActivity,
  updateActivity: appendStepUpdate,
  flushStream: defaultFlushStream,
};

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

/**
 * Processes a transcription job end-to-end:
 *   1. Fetches the job record — returns 'not_found' if absent.
 *   2. Idempotency guard — if status is 'done' or 'processing', returns 'skipped'.
 *   3. Marks the job 'processing'.
 *   4. Fetches image bytes, runs OCR, post-processes, writes markdown.
 *   5. Marks the job 'done'.
 *
 * On OCR/processing failure:
 *   - Logs the real error server-side.
 *   - Stores a SANITIZED error summary in DynamoDB (not the raw message).
 *   - Returns 'error' with a generic client-facing message.
 *
 * @param sub      The authenticated Cognito sub (owner of the job).
 * @param jobId    The ULID job identifier.
 * @param deps     Injected I/O dependencies (defaults to real implementations).
 */
export async function processTranscriptionJob(
  sub: string,
  jobId: string,
  deps: Partial<ProcessJobDeps> = {},
): Promise<ProcessJobResult> {
  const {
    getJob,
    updateStatus,
    getImageBytes,
    transcribe,
    putMarkdown,
    emitUsage,
    createActivity,
    updateActivity,
    flushStream,
  } = {
    ...DEFAULT_DEPS,
    ...deps,
  };

  // Step 1: look up the job.
  const job = await getJob(sub, jobId);
  if (!job) {
    return { outcome: 'not_found' };
  }

  // Step 2: idempotency guard — skip if already done or in-flight.
  if (shouldSkipTranscription(job.status)) {
    return { outcome: 'skipped' };
  }

  // Step 3: mark as processing.
  await updateStatus({ sub, jobId, status: 'processing' });

  const markdownS3Key = storageKeys.noteMarkdown(sub, jobId);

  // ACTIVITY mirror state — declared in the outer scope so the catch block can
  // best-effort mark the activity 'failed' (only when it was actually created).
  let activityId: string | undefined;
  let streamS3Key: string | undefined;

  try {
    // Create the ACTIVITY mirror record alongside the job's 'processing' status.
    const activityItem = buildActivityItem({
      sub,
      kind: 'transcription',
      refId: jobId,
      title: 'Transcribing a page',
      phase: 'queued',
      phaseDetail: 'Queued',
      status: 'running',
    });
    activityId = activityItem.activityId;
    streamS3Key = `activity/${sub}/${activityId}.stream.txt`;
    await createActivity(activityItem);

    // Throttled streaming flush: accumulate deltas, flush at most every
    // FLUSH_INTERVAL_MS (fire-and-forget; a flush failure never breaks the job).
    let streamBuffer = '';
    let lastFlush = 0;
    const FLUSH_INTERVAL_MS = 750;
    const flushKey = streamS3Key;
    const onDelta = (textDelta: string) => {
      streamBuffer += textDelta;
      const now = Date.now();
      if (now - lastFlush >= FLUSH_INTERVAL_MS) {
        lastFlush = now;
        void flushStream(flushKey, streamBuffer).catch((e) => {
          console.error('[processTranscriptionJob] stream flush failed', e);
        });
      }
    };

    // Step 4: fetch image, run OCR, post-process.
    await updateActivity({ sub, activityId, phase: 'uploading', phaseDetail: 'Loading the page' });
    const imageBytes = await getImageBytes(sub, jobId);

    await updateActivity({
      sub,
      activityId,
      phase: 'transcribing',
      phaseDetail: 'Reading your handwriting',
      stream: { s3Key: streamS3Key, done: false },
    });
    const { rawText, usage, model } = await transcribe(imageBytes, onDelta);

    // Forced final flush of the full transcript buffer (success path).
    await flushStream(flushKey, streamBuffer).catch((e) => {
      console.error('[processTranscriptionJob] stream flush failed', e);
    });

    // Meter the OCR call. Fire-and-forget — `emitUsage`/`putUsageEvent` never
    // throws, so it can never break the job.
    await emitUsage({
      sub,
      feature: 'ocr',
      model: model ?? 'unknown',
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    });

    const processed = postprocessMarkdown(rawText);

    // Step 5: persist markdown output.
    await putMarkdown(sub, jobId, processed.markdown);

    // Step 6: mark done.
    await updateStatus({ sub, jobId, status: 'done' });

    await updateActivity({ sub, activityId, phase: 'finalizing', phaseDetail: 'Finishing up' });
    await updateActivity({
      sub,
      activityId,
      phase: 'ready',
      phaseDetail: 'Done',
      status: 'ready',
      stream: { s3Key: streamS3Key, done: true },
    });

    return {
      outcome: 'success',
      data: {
        markdown: processed.markdown,
        wordCount: processed.wordCount,
        detectedLang: processed.detectedLang,
        ocrConfidence: processed.ocrConfidence,
        markdownS3Key,
      },
    };
  } catch (err) {
    // Log the REAL error server-side (CloudWatch), but never expose it to the client.
    console.error('[processTranscriptionJob] OCR/processing failed', err);

    // Store a SANITIZED summary in DynamoDB — error class only, no raw Bedrock message.
    const sanitizedErrorMsg =
      err instanceof Error && err.name && err.name !== 'Error'
        ? `${err.name}: OCR processing failed`
        : 'OCR processing failed';

    try {
      await updateStatus({ sub, jobId, status: 'error', errorMsg: sanitizedErrorMsg });
    } catch (statusErr) {
      console.error('[processTranscriptionJob] Failed to update job status to error', statusErr);
    }

    // Best-effort: mark the ACTIVITY mirror 'failed'. Guard on activityId — if
    // activity creation itself threw, there is nothing to update.
    if (activityId) {
      try {
        await updateActivity({
          sub,
          activityId,
          phase: 'failed',
          phaseDetail: 'Transcription failed',
          status: 'failed',
          error: sanitizedErrorMsg,
        });
      } catch (activityErr) {
        console.error('[processTranscriptionJob] Failed to update activity to failed', activityErr);
      }
    }

    return {
      outcome: 'error',
      status: 500,
      errorMessage: 'Transform failed. Please try again.',
    };
  }
}
