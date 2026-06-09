/**
 * Integration test: TranscriptionJob access functions (putTranscriptionJob /
 * getTranscriptionJob) via the real production client.
 *
 * Uses `putTranscriptionJob` and `getTranscriptionJob` from
 * `packages/core/src/db/transcription-jobs.ts` — no raw DynamoDB commands.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles).
 *
 * TranscriptionJob items live in the `UserData` table under the user's own
 * partition (PK = `USER#<sub>`, SK = `JOB#<jobId>`). No GSI — fetched by
 * PK+SK only.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTranscriptionJobItem,
  putTranscriptionJob,
  getTranscriptionJob,
} from '../src/db/transcription-jobs.js';

describe('TranscriptionJob — putTranscriptionJob / getTranscriptionJob round-trip', () => {
  it('reads back the exact item that was written (pending status)', async () => {
    const sub = 'fns-test-sub-a1b2c3d4';
    const jobId = '01JFNS001234567890ABCDEFGH';
    const now = '2024-07-01T10:00:00.000Z';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched).toEqual(item);
    expect(fetched!.status).toBe('pending');
    expect(fetched!.pk).toBe(`USER#${sub}`);
    expect(fetched!.sk).toBe(`JOB#${jobId}`);
  });

  it('reads back a job with status "done"', async () => {
    const sub = 'fns-test-sub-b2c3d4e5';
    const jobId = '01JFNS002345678901BCDEFGHI';
    const createdAt = '2024-07-02T11:00:00.000Z';
    const updatedAt = '2024-07-02T11:05:00.000Z';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'done',
      createdAt,
      updatedAt,
    });

    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('done');
    expect(fetched!.createdAt).toBe(createdAt);
    expect(fetched!.updatedAt).toBe(updatedAt);
  });

  it('reads back a job with an errorMsg', async () => {
    const sub = 'fns-test-sub-c3d4e5f6';
    const jobId = '01JFNS003456789012CDEFGHIJ';
    const errorMsg = 'OCR service unavailable';

    const item = buildTranscriptionJobItem({
      sub,
      jobId,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      status: 'error',
      errorMsg,
    });

    await putTranscriptionJob(item);

    const fetched = await getTranscriptionJob(sub, jobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('error');
    expect(fetched!.errorMsg).toBe(errorMsg);
  });

  it('returns null for a job that does not exist', async () => {
    const sub = 'fns-test-sub-missing-xyz';
    const jobId = '01JFNS-NONEXISTENT-JOB-001';

    const result = await getTranscriptionJob(sub, jobId);
    expect(result).toBeNull();
  });

  it('jobs for different users do not collide (same jobId, different subs)', async () => {
    const subA = 'fns-test-sub-user-alpha';
    const subB = 'fns-test-sub-user-beta';
    const jobId = '01JFNS-SHARED-JOB-ID-00001';
    const now = '2024-07-03T12:00:00.000Z';

    const itemA = buildTranscriptionJobItem({
      sub: subA,
      jobId,
      s3Key: `images/users/${subA}/${jobId}.jpg`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const itemB = buildTranscriptionJobItem({
      sub: subB,
      jobId,
      s3Key: `images/users/${subB}/${jobId}.jpg`,
      status: 'processing',
      createdAt: now,
      updatedAt: now,
    });

    await putTranscriptionJob(itemA);
    await putTranscriptionJob(itemB);

    const fetchedA = await getTranscriptionJob(subA, jobId);
    const fetchedB = await getTranscriptionJob(subB, jobId);

    expect(fetchedA).not.toBeNull();
    expect(fetchedB).not.toBeNull();
    expect(fetchedA!.pk).toBe(`USER#${subA}`);
    expect(fetchedB!.pk).toBe(`USER#${subB}`);
    expect(fetchedA!.status).toBe('pending');
    expect(fetchedB!.status).toBe('processing');
  });
});
