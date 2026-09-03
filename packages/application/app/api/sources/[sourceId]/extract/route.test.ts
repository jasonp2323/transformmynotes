import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getSourceMock = vi.hoisted(() => vi.fn());
const markSourceExtractingMock = vi.hoisted(() => vi.fn());
const markSourceReadyMock = vi.hoisted(() => vi.fn());
const markSourceFailedMock = vi.hoisted(() => vi.fn());
const parseDocumentMock = vi.hoisted(() => vi.fn());
const withTitleHeadingMock = vi.hoisted(() => vi.fn((text: string, _title: string) => text));
const countWordsMock = vi.hoisted(() => vi.fn(() => 100));
const checkWordCountMock = vi.hoisted(() => vi.fn(() => ({ ok: true })));

const s3SendMock = vi.hoisted(() => vi.fn());

// Track which command class was last instantiated so the send mock can discriminate.
// vi.fn() constructors don't have named .constructor.name so we track via call order.
let lastCommandType = vi.hoisted(() => ({ value: '' }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn().mockImplementation(function () {
    lastCommandType.value = 'GetObjectCommand';
    return {};
  }),
  HeadObjectCommand: vi.fn().mockImplementation(function () {
    lastCommandType.value = 'HeadObjectCommand';
    return {};
  }),
  PutObjectCommand: vi.fn().mockImplementation(function () {
    lastCommandType.value = 'PutObjectCommand';
    return {};
  }),
}));

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  storageKeys: {
    sourceText: vi.fn((sub: string, id: string) => `sources/users/${sub}/${id}.md`),
  },
  getSource: getSourceMock,
  markSourceExtracting: markSourceExtractingMock,
  markSourceReady: markSourceReadyMock,
  markSourceFailed: markSourceFailedMock,
  parseDocument: parseDocumentMock,
  withTitleHeading: withTitleHeadingMock,
  countWords: countWordsMock,
  checkWordCount: checkWordCountMock,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/epub+zip',
    'text/plain',
    'text/markdown',
  ],
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): Request {
  return new Request('http://test/api/sources/test-source-id/extract', { method: 'POST' });
}

function makeParams(sourceId: string) {
  return { params: { sourceId } };
}

const SMALL_SOURCE = {
  sourceId: 'source-123',
  sub: 'user-sub-1',
  type: 'document' as const,
  title: 'My Document',
  status: 'uploading' as const,
  originalFormat: 'pdf' as const,
  originalS3Key: 'sources/users/user-sub-1/source-123.pdf',
  byteSize: 512 * 1024, // 512 KB — below 2 MB inline threshold
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  pk: 'USER#user-sub-1',
  sk: 'SOURCE#source-123',
  gsi9pk: 'USER#user-sub-1',
  gsi9sk: 'SOURCE#source-123',
};

const LARGE_SOURCE = {
  ...SMALL_SOURCE,
  byteSize: 3 * 1024 * 1024, // 3 MB — above 2 MB inline threshold
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  getSourceMock.mockResolvedValue(SMALL_SOURCE);
  markSourceExtractingMock.mockResolvedValue(undefined);
  markSourceReadyMock.mockResolvedValue(undefined);
  markSourceFailedMock.mockResolvedValue(undefined);
  parseDocumentMock.mockResolvedValue('Extracted document text');
  withTitleHeadingMock.mockImplementation((text: string) => `# Title\n\n${text}`);
  countWordsMock.mockReturnValue(500);
  checkWordCountMock.mockReturnValue({ ok: true });

  // S3: discriminate by lastCommandType (tracked in the constructor mock above).
  s3SendMock.mockImplementation(() => {
    const type = lastCommandType.value;
    if (type === 'GetObjectCommand') {
      return Promise.resolve({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      });
    }
    if (type === 'HeadObjectCommand') {
      return Promise.resolve({ ContentType: 'application/pdf' });
    }
    // PutObjectCommand and others
    return Promise.resolve({});
  });

  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/sources/[sourceId]/extract', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams('source-123'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when getSource returns undefined (source not found or owned by another user)', async () => {
    getSourceMock.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(), makeParams('nonexistent-source'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('not_found');
  });

  it('returns 200 status:ready and calls markSourceReady for a small inline file', async () => {
    const res = await POST(makeRequest(), makeParams('source-123'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ready');
    expect(typeof body.wordCount).toBe('number');
    expect(markSourceReadyMock).toHaveBeenCalledTimes(1);
    expect(markSourceReadyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-sub-1',
        sourceId: 'source-123',
        wordCount: 500,
      }),
    );
    expect(markSourceExtractingMock).not.toHaveBeenCalled();
  });

  it('returns 202 status:extracting and calls markSourceExtracting for an oversized file (> 2MB)', async () => {
    getSourceMock.mockResolvedValueOnce(LARGE_SOURCE);

    const res = await POST(makeRequest(), makeParams('source-123'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('extracting');
    expect(markSourceExtractingMock).toHaveBeenCalledTimes(1);
    expect(markSourceExtractingMock).toHaveBeenCalledWith('user-sub-1', 'source-123');
    expect(markSourceReadyMock).not.toHaveBeenCalled();
  });

  it('returns 422 word_limit_exceeded and calls markSourceFailed when word count is over cap', async () => {
    checkWordCountMock.mockReturnValueOnce({ ok: false, error: 'word_limit_exceeded' } as unknown as { ok: boolean });

    const res = await POST(makeRequest(), makeParams('source-123'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(body.error).toBe('word_limit_exceeded');
    expect(markSourceFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-sub-1', sourceId: 'source-123' }),
    );
    expect(markSourceReadyMock).not.toHaveBeenCalled();
  });

  it('returns 500 extraction_failed and calls markSourceFailed when parseDocument throws', async () => {
    parseDocumentMock.mockRejectedValueOnce(new Error('parse error'));

    const res = await POST(makeRequest(), makeParams('source-123'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('extraction_failed');
    expect(markSourceFailedMock).toHaveBeenCalledTimes(1);
    expect(markSourceReadyMock).not.toHaveBeenCalled();
  });
});
