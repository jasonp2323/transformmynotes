import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getTranscriptionJobMock = vi.hoisted(() => vi.fn());
const updateTranscriptionJobStatusMock = vi.hoisted(() => vi.fn());
const transcribeImageMock = vi.hoisted(() => vi.fn());
const postprocessMarkdownMock = vi.hoisted(() => vi.fn());
const putUsageEventMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getTranscriptionJob: getTranscriptionJobMock,
  updateTranscriptionJobStatus: updateTranscriptionJobStatusMock,
  transcribeImage: transcribeImageMock,
  postprocessMarkdown: postprocessMarkdownMock,
  putUsageEvent: putUsageEventMock,
  // shouldSkipTranscription is used by process-job.ts
  shouldSkipTranscription: (status: string) => status === 'done' || status === 'processing',
  // M28: process-job.ts writes an ACTIVITY mirror record (best-effort) via these.
  buildActivityItem: (input: Record<string, unknown>) => ({ activityId: 'act-test-1', ...input }),
  putActivity: () => Promise.resolve(),
  appendStepUpdate: () => Promise.resolve({}),
  storageKeys: {
    originalImage: (s: string, i: string) => `images/users/${s}/${i}.jpg`,
    noteMarkdown: (s: string, i: string) => `markdown/users/${s}/${i}.md`,
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: s3SendMock })),
  GetObjectCommand: vi.fn((input) => ({ kind: 'GetObject', input })),
  PutObjectCommand: vi.fn((input) => ({ kind: 'PutObject', input })),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const JOB_ID = '01JABC';

const PENDING_JOB = {
  pk: `USER#${SUB}`,
  sk: `JOB#${JOB_ID}`,
  jobId: JOB_ID,
  status: 'pending' as const,
  s3Key: `images/users/${SUB}/${JOB_ID}.jpg`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeRequest(body: unknown = { jobId: JOB_ID }): Request {
  return new Request('http://localhost/api/transcribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';
  process.env['SST_RESOURCE_BEDROCK_MODEL_ID_value'] = 'us.test.model';

  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getTranscriptionJobMock.mockResolvedValue(PENDING_JOB);
  updateTranscriptionJobStatusMock.mockResolvedValue(undefined);
  transcribeImageMock.mockResolvedValue({ rawText: '## Notes' });
  putUsageEventMock.mockResolvedValue(undefined);
  postprocessMarkdownMock.mockReturnValue({
    markdown: '## Notes',
    wordCount: 1,
    detectedLang: 'unknown',
    ocrConfidence: 100,
  });

  // s3SendMock: GetObject returns a Body with transformToByteArray, PutObject returns {}
  s3SendMock.mockImplementation((cmd: { kind: string }) => {
    if (cmd.kind === 'GetObject') {
      return Promise.resolve({
        Body: {
          transformToByteArray: async () => new Uint8Array([1, 2, 3]),
        },
      });
    }
    return Promise.resolve({});
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/transcribe', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('request validation', () => {
    it('returns 400 on invalid JSON body', async () => {
      const req = new Request('http://localhost/api/transcribe', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });

    it('returns 400 when jobId is missing', async () => {
      const res = await POST(makeRequest({}));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });

    it('returns 400 when jobId is not a string', async () => {
      const res = await POST(makeRequest({ jobId: 42 }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });

    it('returns 400 when jobId is an empty string', async () => {
      const res = await POST(makeRequest({ jobId: '' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });
  });

  describe('job lookup', () => {
    it('returns 404 when getTranscriptionJob returns null', async () => {
      getTranscriptionJobMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Job not found.');
    });
  });

  describe('idempotency guard', () => {
    it('returns 200 ok:true skipped:true when job status is "done"', async () => {
      getTranscriptionJobMock.mockResolvedValueOnce({ ...PENDING_JOB, status: 'done' });

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.skipped).toBe(true);
      // Bedrock must NOT be called.
      expect(transcribeImageMock).not.toHaveBeenCalled();
    });

    it('returns 200 ok:true skipped:true when job status is "processing"', async () => {
      getTranscriptionJobMock.mockResolvedValueOnce({ ...PENDING_JOB, status: 'processing' });

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.skipped).toBe(true);
      expect(transcribeImageMock).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('returns 200 with markdown, wordCount, detectedLang, ocrConfidence, markdownS3Key', async () => {
      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.markdown).toBe('## Notes');
      expect(body.wordCount).toBe(1);
      expect(body.detectedLang).toBe('unknown');
      expect(body.ocrConfidence).toBe(100);
      expect(body.markdownS3Key).toBe(`markdown/users/${SUB}/${JOB_ID}.md`);
    });

    it('calls updateTranscriptionJobStatus with "processing" then "done"', async () => {
      await POST(makeRequest());

      expect(updateTranscriptionJobStatusMock).toHaveBeenCalledTimes(2);
      expect(updateTranscriptionJobStatusMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'processing' }),
      );
      expect(updateTranscriptionJobStatusMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'done' }),
      );
    });

    it('calls PutObjectCommand with the markdown key and body', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      await POST(makeRequest());

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: `markdown/users/${SUB}/${JOB_ID}.md`,
          Body: '## Notes',
          ContentType: 'text/markdown',
        }),
      );
    });

    it('calls getTranscriptionJob with sub and jobId', async () => {
      await POST(makeRequest());

      expect(getTranscriptionJobMock).toHaveBeenCalledWith(SUB, JOB_ID);
    });
  });

  describe('failure path', () => {
    it('returns 500 with generic "Transform failed. Please try again." message when transcribeImage rejects', async () => {
      const bedrockError = new Error('Bedrock quota exceeded — secret internal message');
      transcribeImageMock.mockRejectedValueOnce(bedrockError);

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      // New generic error message — raw Bedrock error MUST NOT be exposed.
      expect(body.error).toBe('Transform failed. Please try again.');
      expect(JSON.stringify(body)).not.toContain('Bedrock quota exceeded');
      expect(JSON.stringify(body)).not.toContain('secret internal message');

      // Should have called processing first, then error.
      expect(updateTranscriptionJobStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'processing' }),
      );
      expect(updateTranscriptionJobStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'error' }),
      );
    });

    it('does NOT expose the raw Bedrock error in the errorMsg stored to DynamoDB', async () => {
      const rawMsg = 'SECRET Bedrock quota exceeded — internal detail';
      transcribeImageMock.mockRejectedValueOnce(new Error(rawMsg));

      await POST(makeRequest());

      // Collect all updateStatus calls.
      const errorCall = (updateTranscriptionJobStatusMock.mock.calls as Array<[Record<string, unknown>]>)
        .map(([arg]) => arg)
        .find((a) => a.status === 'error');

      expect(errorCall).toBeDefined();
      // The stored errorMsg must NOT contain the raw internal message.
      expect(String(errorCall!.errorMsg ?? '')).not.toContain(rawMsg);
      expect(String(errorCall!.errorMsg ?? '')).not.toContain('SECRET');
    });

    it('returns 500 and marks job error when S3 GetObject fails', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('S3 access denied'));

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.error).toBe('Transform failed. Please try again.');
      expect(updateTranscriptionJobStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'error' }),
      );
    });

    it('returns 500 with generic message for non-Error throws', async () => {
      transcribeImageMock.mockRejectedValueOnce('string error');

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.error).toBe('Transform failed. Please try again.');
    });
  });

  describe('env var validation', () => {
    it('returns 500 when SST_RESOURCE_BEDROCK_MODEL_ID_value is unset', async () => {
      delete process.env['SST_RESOURCE_BEDROCK_MODEL_ID_value'];

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when SST_RESOURCE_NotesBucket_name is unset', async () => {
      delete process.env['SST_RESOURCE_NotesBucket_name'];

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
