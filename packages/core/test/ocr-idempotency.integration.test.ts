/**
 * Integration test: OCR idempotency guard against a real dynalite DynamoDB.
 *
 * Writes job records with status 'done' or 'processing' via the real
 * `putTranscriptionJob` → reads them back via `getTranscriptionJob` →
 * asserts `shouldSkipTranscription(job.status)` returns true, confirming
 * the idempotency guard would short-circuit a re-invocation.
 *
 * This proves the guard works against live DynamoDB write→read round-trips,
 * not just as a pure unit test.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTranscriptionJobItem,
  putTranscriptionJob,
  getTranscriptionJob,
} from '../src/db/transcription-jobs.js';
import { shouldSkipTranscription } from '../src/ocr/retry.js';

// Alias to keep assertions readable.
const shouldSkipFromRetry = shouldSkipTranscription;

describe('OCR idempotency guard — write→read round-trip', () => {
  it('shouldSkipTranscription is true for a "done" job read from dynalite', async () => {
    const sub = 'idempotency-test-sub-done-001';
    const jobId = '01JIDEM0DONE00000000000001A';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'done',
    });
    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('done');

    // The idempotency guard should fire, preventing a re-invocation.
    expect(shouldSkipTranscription(fetched!.status)).toBe(true);
    expect(shouldSkipFromRetry(fetched!.status)).toBe(true);
  });

  it('shouldSkipTranscription is true for a "processing" job read from dynalite', async () => {
    const sub = 'idempotency-test-sub-proc-002';
    const jobId = '01JIDEM0PROC00000000000002B';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'processing',
    });
    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('processing');

    expect(shouldSkipTranscription(fetched!.status)).toBe(true);
    expect(shouldSkipFromRetry(fetched!.status)).toBe(true);
  });

  it('shouldSkipTranscription is false for a "pending" job — processing should proceed', async () => {
    const sub = 'idempotency-test-sub-pend-003';
    const jobId = '01JIDEM0PEND00000000000003C';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'pending',
    });
    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('pending');

    // Guard must NOT fire — processing should proceed.
    expect(shouldSkipTranscription(fetched!.status)).toBe(false);
    expect(shouldSkipFromRetry(fetched!.status)).toBe(false);
  });

  it('shouldSkipTranscription is false for an "error" job — re-processing is allowed', async () => {
    const sub = 'idempotency-test-sub-err-004';
    const jobId = '01JIDEM0ERR000000000000004D';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'error',
      errorMsg: 'OCR processing failed',
    });
    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('error');

    // 'error' jobs can be retried — guard must NOT fire.
    expect(shouldSkipTranscription(fetched!.status)).toBe(false);
    expect(shouldSkipFromRetry(fetched!.status)).toBe(false);
  });

  it('different users with the same jobId are isolated — guard evaluates per-user status', async () => {
    const jobId = '01JIDEM0SHARE0000000000005E';
    const subDone = 'idempotency-test-sub-usera-005';
    const subPending = 'idempotency-test-sub-userb-005';

    await putTranscriptionJob(
      buildTranscriptionJobItem({
        sub: subDone,
        jobId,
        s3Key: `images/users/${subDone}/${jobId}.jpg`,
        status: 'done',
      }),
    );

    await putTranscriptionJob(
      buildTranscriptionJobItem({
        sub: subPending,
        jobId,
        s3Key: `images/users/${subPending}/${jobId}.jpg`,
        status: 'pending',
      }),
    );

    const fetchedDone = await getTranscriptionJob(subDone, jobId);
    const fetchedPending = await getTranscriptionJob(subPending, jobId);

    expect(fetchedDone).not.toBeNull();
    expect(fetchedPending).not.toBeNull();

    // User A (done) → guard fires (skip).
    expect(shouldSkipTranscription(fetchedDone!.status)).toBe(true);
    // User B (pending) → guard does not fire (process).
    expect(shouldSkipTranscription(fetchedPending!.status)).toBe(false);
  });
});
