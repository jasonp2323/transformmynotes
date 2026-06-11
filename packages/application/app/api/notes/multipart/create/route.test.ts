import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const putUploadSessionMock = vi.hoisted(() => vi.fn());
const buildUploadSessionItemMock = vi.hoisted(() => vi.fn());
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
  buildUploadSessionItem: buildUploadSessionItemMock,
  putUploadSession: putUploadSessionMock,
  buildTranscriptionJobItem: buildTranscriptionJobItemMock,
  putTranscriptionJob: putTranscriptionJobMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: s3SendMock })),
  CreateMultipartUploadCommand: vi.fn((input) => ({ kind: 'CreateMultipartUpload', input })),
  UploadPartCommand: vi.fn((input) => ({ kind: 'UploadPart', input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const ulidMock = vi.hoisted(() => vi.fn());

vi.mock('ulid', () => ({
  ulid: ulidMock,
}));

import { POST } from './route';

const SUB = 'user-sub-1';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/notes/multipart/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // ulid is called twice per successful request: once for jobId, once for uploadToken
  ulidMock.mockReturnValueOnce('test-job-id').mockReturnValueOnce('test-upload-token');
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  buildUploadSessionItemMock.mockReturnValue({});
  putUploadSessionMock.mockResolvedValue(undefined);
  buildTranscriptionJobItemMock.mockReturnValue({});
  putTranscriptionJobMock.mockResolvedValue(undefined);
  s3SendMock.mockResolvedValue({ UploadId: 'mpu-id-test' });
  getSignedUrlMock.mockResolvedValue('https://s3.example.com/part-url');
});

describe('POST /api/notes/multipart/create', () => {
  describe('auth', () => {
    it('returns 401 when not authenticated', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: 6 * 1024 * 1024, parts: 2 }));
      expect(res.status).toBe(401);
    });
  });

  describe('10MB size guard', () => {
    it('returns 413 when size exceeds 10MB', async () => {
      const overLimit = 10 * 1024 * 1024 + 1;
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: overLimit, parts: 3 }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(413);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Payload too large.');
    });
  });

  describe('validation', () => {
    it('returns 400 for unsupported content type', async () => {
      const res = await POST(makeRequest({ contentType: 'image/webp', size: 6 * 1024 * 1024, parts: 2 }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when parts is missing', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: 6 * 1024 * 1024 }));
      expect(res.status).toBe(400);
    });
  });

  describe('success', () => {
    it('calls CreateMultipartUploadCommand', async () => {
      const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
      await POST(makeRequest({ contentType: 'image/jpeg', size: 6 * 1024 * 1024, parts: 2 }));
      expect(CreateMultipartUploadCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          ContentType: 'image/jpeg',
        }),
      );
    });

    it('returns uploadToken, uploadId, jobId, s3Key, partUrls', async () => {
      const res = await POST(makeRequest({ contentType: 'image/jpeg', size: 6 * 1024 * 1024, parts: 2 }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(typeof body.uploadToken).toBe('string');
      expect(typeof body.uploadId).toBe('string');
      expect(typeof body.jobId).toBe('string');
      expect(Array.isArray(body.partUrls)).toBe(true);
    });
  });
});
