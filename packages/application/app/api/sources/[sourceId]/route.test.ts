import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getSourceMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getSource: getSourceMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(sourceId: string): [Request, { params: { sourceId: string } }] {
  return [
    new Request(`http://test/api/sources/${sourceId}`, { method: 'GET' }),
    { params: { sourceId } },
  ];
}

/** A full SourceItem with all DynamoDB key fields present. */
const MOCK_SOURCE_ITEM = {
  pk: 'USER#user-sub-1',
  sk: 'SOURCE#src-abc',
  gsi9pk: 'USER#user-sub-1',
  gsi9sk: 'SOURCE#01JTEST0000000000000000000',
  sourceId: 'src-abc',
  type: 'document' as const,
  title: 'My Document',
  status: 'ready' as const,
  originalFormat: 'pdf' as const,
  originalS3Key: 'sources/users/user-sub-1/src-abc.pdf',
  byteSize: 4096,
  wordCount: 500,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  getSourceMock.mockResolvedValue(MOCK_SOURCE_ITEM);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sources/[sourceId]', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('src-abc');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when getSource returns undefined', async () => {
    getSourceMock.mockResolvedValueOnce(undefined);

    const [req, ctx] = makeRequest('src-missing');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 200 with source stripped of pk/sk/gsi9pk/gsi9sk', async () => {
    const [req, ctx] = makeRequest('src-abc');
    const res = await GET(req, ctx);
    const body = (await res.json()) as { source: Record<string, unknown> };

    expect(res.status).toBe(200);

    // Key fields must be absent
    expect(body.source).not.toHaveProperty('pk');
    expect(body.source).not.toHaveProperty('sk');
    expect(body.source).not.toHaveProperty('gsi9pk');
    expect(body.source).not.toHaveProperty('gsi9sk');

    // Public fields must be present
    expect(body.source.sourceId).toBe('src-abc');
    expect(body.source.title).toBe('My Document');
    expect(body.source.status).toBe('ready');
    expect(body.source.wordCount).toBe(500);

    expect(getSourceMock).toHaveBeenCalledWith('user-sub-1', 'src-abc');
  });

  it('returns 500 when getSource throws', async () => {
    getSourceMock.mockRejectedValueOnce(new Error('DynamoDB error'));

    const [req, ctx] = makeRequest('src-abc');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('Could not load source.');
  });
});
