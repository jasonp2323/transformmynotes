import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const putTranscriptionJobMock = vi.hoisted(() => vi.fn());
const buildTranscriptionJobItemMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());
const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  storageKeys: {
    originalImage: (s: string, i: string) => `images/users/${s}/${i}.jpg`,
  },
  buildTranscriptionJobItem: buildTranscriptionJobItemMock,
  putTranscriptionJob: putTranscriptionJobMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(function (input) { return { kind: 'PutObject', input }; }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'test-job-id'),
}));

import { POST } from './route';

const SUB = 'user-sub-1';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/notes/upload-url', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  buildTranscriptionJobItemMock.mockReturnValue({ pk: `USER#${SUB}`, sk: 'JOB#test-job-id' });
  putTranscriptionJobMock.mockResolvedValue(undefined);
  getSignedUrlMock.mockResolvedValue('https://s3.example.com/presigned');
});

describe('POST /api/notes/upload-url', () => {
  describe('auth', () => {
    it('returns 401 when not authenticated', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);
      const res = await POST(makeRequest({ contentType: 'image/jpeg' }));
      expect(res.status).toBe(401);
    });
  });

  describe('10MB size guard', () => {
    it('returns 413 when size exceeds 10MB', async () => {
      const overLimit = 10 * 1024 * 1024 + 1;
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: overLimit }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(413);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Payload too large.');
    });

    it('returns 200 when size is exactly 10MB', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: 10 * 1024 * 1024 }));
      expect(res.status).toBe(200);
    });

    it('returns 200 when size is not provided', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg' }));
      expect(res.status).toBe(200);
    });
  });

  describe('content type validation', () => {
    it('returns 400 for unsupported content type', async () => {
      const res = await POST(makeRequest({ contentType: 'image/webp' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Unsupported content type.');
    });

    it('accepts image/jpeg', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg' }));
      expect(res.status).toBe(200);
    });

    it('accepts image/png', async () => {
      const res = await POST(makeRequest({ contentType: 'image/png' }));
      expect(res.status).toBe(200);
    });
  });

  describe('success', () => {
    it('returns presignedUrl, s3Key, jobId', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(typeof body.presignedUrl).toBe('string');
      expect(typeof body.s3Key).toBe('string');
      expect(typeof body.jobId).toBe('string');
    });
  });
});
