import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getTranscriptionJobMock = vi.hoisted(() => vi.fn());
const processTranscriptionJobMock = vi.hoisted(() => vi.fn());
const postprocessMarkdownMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getTranscriptionJob: getTranscriptionJobMock,
  postprocessMarkdown: postprocessMarkdownMock,
  storageKeys: {
    originalImage: (s: string, i: string) => `images/users/${s}/${i}.jpg`,
    noteMarkdown: (s: string, i: string) => `markdown/users/${s}/${i}.md`,
  },
  stitchPages: (pages: { markdown: string; wordCount: number }[]) => {
    const nonEmpty = pages.filter((p) => p.markdown.trim() !== '');
    return {
      markdown: nonEmpty.map((p) => p.markdown).join('\n\n---\n\n'),
      wordCount: pages.reduce((s, p) => s + p.wordCount, 0),
      pageCount: pages.length,
    };
  },
}));

vi.mock('@/lib/transcribe/process-job', () => ({
  processTranscriptionJob: processTranscriptionJobMock,
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

const SOME_JOB = {
  pk: `USER#${SUB}`,
  sk: `JOB#jobA`,
  jobId: 'jobA',
  status: 'pending' as const,
  s3Key: `images/users/${SUB}/jobA.jpg`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/transcribe/batch', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
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
  getTranscriptionJobMock.mockResolvedValue(SOME_JOB);

  processTranscriptionJobMock.mockResolvedValue({
    outcome: 'success',
    data: {
      markdown: 'page',
      wordCount: 1,
      detectedLang: 'unknown',
      ocrConfidence: 100,
      markdownS3Key: 'x',
    },
  });

  s3SendMock.mockImplementation((cmd: { kind: string }) => {
    if (cmd.kind === 'GetObject') {
      return Promise.resolve({
        Body: {
          transformToString: async () => '## stored',
        },
      });
    }
    return Promise.resolve({});
  });

  postprocessMarkdownMock.mockReturnValue({
    markdown: '## stored',
    wordCount: 2,
    detectedLang: 'unknown',
    ocrConfidence: 100,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/transcribe/batch', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest({ jobIds: ['jobA'] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('request validation', () => {
    it('returns 400 on invalid JSON body', async () => {
      const res = await POST(makeRequest('not-json'));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });

    it('returns 400 when jobIds is missing', async () => {
      const res = await POST(makeRequest({}));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobIds.');
    });

    it('returns 400 when jobIds is empty array', async () => {
      const res = await POST(makeRequest({ jobIds: [] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobIds.');
    });

    it('returns 400 when jobIds contains a non-string element', async () => {
      const res = await POST(makeRequest({ jobIds: ['a', 42] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobIds.');
    });

    it('returns 422 when jobIds length exceeds 20', async () => {
      const ids = Array.from({ length: 21 }, (_, i) => `job${i}`);
      const res = await POST(makeRequest({ jobIds: ids }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(422);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Too many pages (max 20).');
    });
  });

  describe('ownership preflight', () => {
    it('returns 404 and does NOT call processTranscriptionJob when any job is not found', async () => {
      getTranscriptionJobMock
        .mockResolvedValueOnce(SOME_JOB) // first job: found
        .mockResolvedValueOnce(null); // second job: not found

      const res = await POST(makeRequest({ jobIds: ['jobA', 'jobB'] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Job not found.');
      expect(processTranscriptionJobMock).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('returns 200 with stitched result, primary detectedLang/ocrConfidence, and correct jobId', async () => {
      processTranscriptionJobMock
        .mockResolvedValueOnce({
          outcome: 'success',
          data: {
            markdown: '# Page one',
            wordCount: 2,
            detectedLang: 'en',
            ocrConfidence: 99,
            markdownS3Key: 'x',
          },
        })
        .mockResolvedValueOnce({
          outcome: 'success',
          data: {
            markdown: '# Page two',
            wordCount: 3,
            detectedLang: 'unknown',
            ocrConfidence: 100,
            markdownS3Key: 'x',
          },
        });

      const res = await POST(makeRequest({ jobIds: ['jobA', 'jobB'] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.jobId).toBe('jobA');
      expect(body.pageCount).toBe(2);
      expect(body.markdown).toContain('# Page one\n\n---\n\n# Page two');
      expect(body.detectedLang).toBe('en');
      expect(body.ocrConfidence).toBe(99);
    });

    it('writes stitched markdown to S3 at the primary job key', async () => {
      processTranscriptionJobMock
        .mockResolvedValueOnce({
          outcome: 'success',
          data: {
            markdown: '# Page one',
            wordCount: 2,
            detectedLang: 'en',
            ocrConfidence: 99,
            markdownS3Key: 'x',
          },
        })
        .mockResolvedValueOnce({
          outcome: 'success',
          data: {
            markdown: '# Page two',
            wordCount: 3,
            detectedLang: 'unknown',
            ocrConfidence: 100,
            markdownS3Key: 'x',
          },
        });

      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      await POST(makeRequest({ jobIds: ['jobA', 'jobB'] }));

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: `markdown/users/${SUB}/jobA.md`,
          ContentType: 'text/markdown',
        }),
      );
    });
  });

  describe('error path', () => {
    it('returns error status and does NOT write stitched markdown when any job fails', async () => {
      processTranscriptionJobMock
        .mockResolvedValueOnce({
          outcome: 'success',
          data: {
            markdown: '# Page one',
            wordCount: 2,
            detectedLang: 'en',
            ocrConfidence: 99,
            markdownS3Key: 'x',
          },
        })
        .mockResolvedValueOnce({
          outcome: 'error',
          status: 500,
          errorMessage: 'Transform failed. Please try again.',
        });

      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const res = await POST(makeRequest({ jobIds: ['jobA', 'jobB'] }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.error).toBe('Transform failed. Please try again.');
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });
  });
});
