import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Set required env BEFORE the route module is imported (it reads these at import
// time via resolveMaxSourceFileBytes / resolveMaxSourcesPerUser).
vi.hoisted(() => {
  process.env.SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value = '52428800'; // 50 MB
  process.env.SST_RESOURCE_MAX_SOURCES_PER_USER_value = '100';
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const countSourcesByUserMock = vi.hoisted(() => vi.fn());
const putSourceMock = vi.hoisted(() => vi.fn());
const buildSourceItemMock = vi.hoisted(() => vi.fn((input: unknown) => ({ ...(input as object) })));
const checkMimeTypeMock = vi.hoisted(() => vi.fn());
const checkFileSizeMock = vi.hoisted(() => vi.fn());
const checkSourceCountMock = vi.hoisted(() => vi.fn());
const resolveMaxSourceFileBytesMock = vi.hoisted(() => vi.fn(() => 52428800));
const resolveMaxSourcesPerUserMock = vi.hoisted(() => vi.fn(() => 100));

const getSignedUrlMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(),
}));

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  storageKeys: {
    sourceOriginal: vi.fn((sub: string, id: string, ext: string) => `sources/users/${sub}/${id}.${ext}`),
  },
  buildSourceItem: buildSourceItemMock,
  putSource: putSourceMock,
  countSourcesByUser: countSourcesByUserMock,
  checkMimeType: checkMimeTypeMock,
  checkFileSize: checkFileSizeMock,
  checkSourceCount: checkSourceCountMock,
  resolveMaxSourceFileBytes: resolveMaxSourceFileBytesMock,
  resolveMaxSourcesPerUser: resolveMaxSourcesPerUserMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://test/api/sources/upload-url', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  countSourcesByUserMock.mockResolvedValue(0);
  putSourceMock.mockResolvedValue(undefined);
  checkMimeTypeMock.mockReturnValue({ ok: true, format: 'pdf' });
  checkFileSizeMock.mockReturnValue({ ok: true });
  checkSourceCountMock.mockReturnValue({ ok: true });
  resolveMaxSourceFileBytesMock.mockReturnValue(52428800);
  resolveMaxSourcesPerUserMock.mockReturnValue(100);
  getSignedUrlMock.mockResolvedValue('https://s3.example.com/presigned-url');
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/sources/upload-url', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ contentType: 'application/pdf', byteSize: 1000 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for a disallowed MIME type (image/jpeg)', async () => {
    checkMimeTypeMock.mockReturnValueOnce({ ok: false, status: 400, error: 'unsupported_type' });

    const res = await POST(makeRequest({ contentType: 'image/jpeg', byteSize: 1000 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('unsupported_type');
  });

  it('returns 400 when contentType is missing from the body', async () => {
    const res = await POST(makeRequest({ byteSize: 1000 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
  });

  it('returns 422 source_limit_reached when countSourcesByUser >= cap', async () => {
    checkSourceCountMock.mockReturnValueOnce({ ok: false, status: 422, error: 'source_limit_reached' });

    const res = await POST(makeRequest({ contentType: 'application/pdf', byteSize: 1000 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(body.error).toBe('source_limit_reached');
  });

  it('returns 422 file_too_large when byteSize exceeds the cap', async () => {
    checkFileSizeMock.mockReturnValueOnce({ ok: false, status: 422, error: 'file_too_large' });

    const res = await POST(makeRequest({ contentType: 'application/pdf', byteSize: 999999999 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(body.error).toBe('file_too_large');
  });

  it('returns presignedUrl, s3Key, sourceId for an allowed type on the happy path', async () => {
    const res = await POST(
      makeRequest({ contentType: 'application/pdf', byteSize: 1024, title: 'My Doc' }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(typeof body.presignedUrl).toBe('string');
    expect(typeof body.s3Key).toBe('string');
    expect(typeof body.sourceId).toBe('string');
    expect(putSourceMock).toHaveBeenCalledTimes(1);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('uses Untitled document when title is absent', async () => {
    await POST(makeRequest({ contentType: 'application/pdf', byteSize: 1024 }));

    expect(buildSourceItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Untitled document' }),
    );
  });

  it('uses provided title when non-empty', async () => {
    await POST(makeRequest({ contentType: 'application/pdf', byteSize: 1024, title: 'My Report' }));

    expect(buildSourceItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Report' }),
    );
  });
});
