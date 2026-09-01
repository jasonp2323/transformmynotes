/**
 * Unit tests for processTranscriptionJob.
 *
 * All I/O (DynamoDB, S3, Bedrock) is injected via the `deps` parameter so
 * these tests run fully offline with no AWS credentials.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTranscriptionJob } from '../process-job';
import type { TranscriptionJobItem } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<TranscriptionJobItem> = {}): TranscriptionJobItem {
  return {
    pk: 'USER#sub-123',
    sk: 'JOB#job-abc',
    jobId: 'job-abc',
    status: 'pending',
    s3Key: 'images/users/sub-123/job-abc.jpg',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);
const RAW_TEXT = '# My Notes\nHello world.';
const PROCESSED_MARKDOWN = '# My Notes\nHello world.';

/** Minimal stub for postprocessMarkdown output. */
const POSTPROCESS_RESULT = {
  markdown: PROCESSED_MARKDOWN,
  wordCount: 3,
  detectedLang: 'en',
  ocrConfidence: 0.97,
};

// ---------------------------------------------------------------------------
// Default stub factories
// ---------------------------------------------------------------------------

function makeHappyPathDeps() {
  return {
    getJob: vi.fn().mockResolvedValue(makeJob()),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    getImageBytes: vi.fn().mockResolvedValue(IMAGE_BYTES),
    transcribe: vi.fn().mockResolvedValue({ rawText: RAW_TEXT }),
    putMarkdown: vi.fn().mockResolvedValue(undefined),
    emitUsage: vi.fn().mockResolvedValue(undefined),
    createActivity: vi.fn().mockResolvedValue(undefined),
    updateActivity: vi.fn().mockResolvedValue({}),
    flushStream: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — happy path', () => {
  it('returns outcome "success" with markdown data', async () => {
    const deps = makeHappyPathDeps();
    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(result.data).toBeDefined();
    // postprocessMarkdown is real (not injected) — just assert it produced output
    expect(typeof result.data!.markdown).toBe('string');
    expect(result.data!.markdown.length).toBeGreaterThan(0);
    expect(result.data!.wordCount).toBeGreaterThan(0);
    expect(result.data!.markdownS3Key).toBe('markdown/users/sub-123/job-abc.md');
  });

  it('calls updateStatus with "processing" then "done"', async () => {
    const deps = makeHappyPathDeps();
    await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(deps.updateStatus).toHaveBeenCalledTimes(2);
    expect(deps.updateStatus).toHaveBeenNthCalledWith(1, {
      sub: 'sub-123',
      jobId: 'job-abc',
      status: 'processing',
    });
    expect(deps.updateStatus).toHaveBeenNthCalledWith(2, {
      sub: 'sub-123',
      jobId: 'job-abc',
      status: 'done',
    });
  });

  it('passes image bytes to transcribe and then persists the markdown', async () => {
    const deps = makeHappyPathDeps();
    await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(deps.getImageBytes).toHaveBeenCalledWith('sub-123', 'job-abc');
    expect(deps.transcribe).toHaveBeenCalledWith(IMAGE_BYTES, expect.any(Function));
    // putMarkdown should be called with the processed markdown (exact value depends on
    // postprocessMarkdown's real implementation, so just assert it was called).
    expect(deps.putMarkdown).toHaveBeenCalledOnce();
    const [putSub, putJobId, putMd] = (deps.putMarkdown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
    expect(putSub).toBe('sub-123');
    expect(putJobId).toBe('job-abc');
    expect(typeof putMd).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// AI usage metering (M23.2.1)
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — AI usage metering', () => {
  it('emits one "ocr" usage event with the model + token counts from transcribe', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi
        .fn()
        .mockResolvedValue({ rawText: '# hi', usage: { inputTokens: 123, outputTokens: 45 }, model: 'my-model' }),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(deps.emitUsage).toHaveBeenCalledOnce();
    expect(deps.emitUsage).toHaveBeenCalledWith({
      sub: 'sub-123',
      feature: 'ocr',
      model: 'my-model',
      inputTokens: 123,
      outputTokens: 45,
    });
  });

  it('falls back to model "unknown" and zero tokens when usage/model are undefined', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockResolvedValue({ rawText: '# hi' }),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(deps.emitUsage).toHaveBeenCalledOnce();
    expect(deps.emitUsage).toHaveBeenCalledWith({
      sub: 'sub-123',
      feature: 'ocr',
      model: 'unknown',
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — job not found', () => {
  it('returns outcome "not_found" when getJob returns null', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      getJob: vi.fn().mockResolvedValue(null),
    };

    const result = await processTranscriptionJob('sub-123', 'no-such-job', deps);

    expect(result.outcome).toBe('not_found');
    expect(deps.updateStatus).not.toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Idempotency guard
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — idempotency guard', () => {
  it('returns "skipped" when job status is "done" and NEVER calls transcribe', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      getJob: vi.fn().mockResolvedValue(makeJob({ status: 'done' })),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('skipped');
    // Bedrock must NOT be called — this is the core idempotency requirement.
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.updateStatus).not.toHaveBeenCalled();
    expect(deps.getImageBytes).not.toHaveBeenCalled();
    expect(deps.putMarkdown).not.toHaveBeenCalled();
  });

  it('returns "skipped" when job status is "processing" and NEVER calls transcribe', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      getJob: vi.fn().mockResolvedValue(makeJob({ status: 'processing' })),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('skipped');
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.updateStatus).not.toHaveBeenCalled();
  });

  it('does NOT skip when job status is "pending"', async () => {
    const deps = makeHappyPathDeps(); // status is 'pending' by default
    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(deps.transcribe).toHaveBeenCalledOnce();
  });

  it('does NOT skip when job status is "error" (allows re-try)', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      getJob: vi.fn().mockResolvedValue(makeJob({ status: 'error' })),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(deps.transcribe).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// OCR failure — sanitized error handling
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — OCR failure', () => {
  const SECRET_RAW_MESSAGE = 'SECRET BEDROCK INTERNAL xyz ARN=arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet';

  it('returns outcome "error" when transcribe throws', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error(SECRET_RAW_MESSAGE)),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('error');
    expect(result.status).toBe(500);
  });

  it('returns the generic client message "Transform failed. Please try again."', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error(SECRET_RAW_MESSAGE)),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.errorMessage).toBe('Transform failed. Please try again.');
    // The raw internal message must NOT appear in the error message returned to callers.
    expect(result.errorMessage).not.toContain(SECRET_RAW_MESSAGE);
    expect(result.errorMessage).not.toContain('SECRET');
    expect(result.errorMessage).not.toContain('arn:aws');
  });

  it('stores a SANITIZED errorMsg in DynamoDB — raw Bedrock message is absent', async () => {
    const capturedStatusCalls: Array<{ errorMsg?: string }> = [];
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error(SECRET_RAW_MESSAGE)),
      updateStatus: vi.fn().mockImplementation((input: { errorMsg?: string }) => {
        capturedStatusCalls.push({ errorMsg: input.errorMsg });
        return Promise.resolve();
      }),
    };

    await processTranscriptionJob('sub-123', 'job-abc', deps);

    // The 'error' status update should carry an errorMsg.
    const errorUpdate = capturedStatusCalls.find((c) => c.errorMsg !== undefined);
    expect(errorUpdate).toBeDefined();
    // It must NOT contain any part of the raw Bedrock internal error.
    expect(errorUpdate!.errorMsg).not.toContain(SECRET_RAW_MESSAGE);
    expect(errorUpdate!.errorMsg).not.toContain('SECRET');
    expect(errorUpdate!.errorMsg).not.toContain('arn:aws');
  });

  it('stores a sanitized error summary for a named error class (e.g. ThrottlingException)', async () => {
    const throttleErr = Object.assign(new Error('Throttled by Bedrock after 3 retries with details=xyz'), {
      name: 'ThrottlingException',
    });
    const capturedStatuses: Array<{ status: string; errorMsg?: string }> = [];
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(throttleErr),
      updateStatus: vi.fn().mockImplementation((input: { status: string; errorMsg?: string }) => {
        capturedStatuses.push({ status: input.status, errorMsg: input.errorMsg });
        return Promise.resolve();
      }),
    };

    await processTranscriptionJob('sub-123', 'job-abc', deps);

    const errorUpdate = capturedStatuses.find((c) => c.status === 'error');
    expect(errorUpdate).toBeDefined();
    // The sanitized msg should contain the class name but not the raw internal detail.
    expect(errorUpdate!.errorMsg).toContain('ThrottlingException');
    expect(errorUpdate!.errorMsg).not.toContain('xyz');
    expect(errorUpdate!.errorMsg).not.toContain('Throttled by Bedrock after 3 retries');
  });

  it('marks the job status "error" in DynamoDB when transcribe throws', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error('boom')),
    };

    await processTranscriptionJob('sub-123', 'job-abc', deps);

    // updateStatus should have been called with 'processing' then 'error'.
    expect(deps.updateStatus).toHaveBeenCalledTimes(2);
    const calls = (deps.updateStatus as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ status: string; errorMsg?: string }]
    >;
    expect(calls[0][0].status).toBe('processing');
    expect(calls[1][0].status).toBe('error');
  });

  it('logs the real error to console.error server-side', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error(SECRET_RAW_MESSAGE)),
    };

    await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ACTIVITY mirror
// ---------------------------------------------------------------------------

describe('processTranscriptionJob — ACTIVITY mirror', () => {
  it('creates one activity and updates it through the phase sequence', async () => {
    const deps = makeHappyPathDeps();
    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(deps.createActivity).toHaveBeenCalledOnce();

    const updateCalls = deps.updateActivity.mock.calls as Array<[{ phase: string }]>;
    const phases = updateCalls.map((c) => c[0].phase);
    expect(phases).toEqual(['uploading', 'transcribing', 'finalizing', 'ready']);

    const transcribingCall = updateCalls.find((c) => c[0].phase === 'transcribing')![0] as {
      phase: string;
      stream?: { s3Key: string; done: boolean };
    };
    expect(transcribingCall.stream).toBeDefined();
    expect(typeof transcribingCall.stream!.s3Key).toBe('string');
    expect(transcribingCall.stream!.s3Key.length).toBeGreaterThan(0);
    expect(transcribingCall.stream!.done).toBe(false);

    const readyCall = updateCalls.find((c) => c[0].phase === 'ready')![0] as {
      phase: string;
      status?: string;
      stream?: { s3Key: string; done: boolean };
    };
    expect(readyCall.status).toBe('ready');
    expect(readyCall.stream!.done).toBe(true);
  });

  it('passes an onDelta function to transcribe and tolerates it being invoked', async () => {
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockImplementation((_bytes: Uint8Array, onDelta?: (d: string) => void) => {
        // Exercise the streaming callback to ensure it never throws.
        onDelta?.('chunk');
        return Promise.resolve({ rawText: RAW_TEXT });
      }),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    expect(result.outcome).toBe('success');
    expect(typeof deps.transcribe.mock.calls[0][1]).toBe('function');
  });

  it('marks the activity "failed" with an error when transcribe throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      ...makeHappyPathDeps(),
      transcribe: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const result = await processTranscriptionJob('sub-123', 'job-abc', deps);

    // Existing status flow intact: processing → error.
    expect(result.outcome).toBe('error');
    expect(deps.updateStatus).toHaveBeenCalledTimes(2);
    const statusCalls = deps.updateStatus.mock.calls as Array<[{ status: string }]>;
    expect(statusCalls[0][0].status).toBe('processing');
    expect(statusCalls[1][0].status).toBe('error');

    // The activity mirror should be marked failed with an error field.
    const failedCall = (deps.updateActivity.mock.calls as Array<[{ phase: string; status?: string; error?: string }]>).find(
      (c) => c[0].phase === 'failed',
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![0].status).toBe('failed');
    expect(typeof failedCall![0].error).toBe('string');
    expect(failedCall![0].error!.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
