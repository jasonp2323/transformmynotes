import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listSourcesByUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listSourcesByUser: listSourcesByUserMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): Request {
  return new Request('http://test/api/sources', { method: 'GET' });
}


const MOCK_SOURCES = [
  {
    sourceId: 'src-1',
    type: 'document' as const,
    title: 'Doc 1',
    status: 'ready' as const,
    originalFormat: 'pdf' as const,
    originalS3Key: 'sources/users/user-sub-1/src-1.pdf',
    byteSize: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    sourceId: 'src-2',
    type: 'document' as const,
    title: 'Doc 2',
    status: 'extracting' as const,
    originalFormat: 'docx' as const,
    originalS3Key: 'sources/users/user-sub-1/src-2.docx',
    byteSize: 2048,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  listSourcesByUserMock.mockResolvedValue(MOCK_SOURCES);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sources', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with sources array and calls listSourcesByUser with (sub, 20)', async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as { sources: unknown[] };

    expect(res.status).toBe(200);
    expect(body.sources).toEqual(MOCK_SOURCES);
    expect(listSourcesByUserMock).toHaveBeenCalledTimes(1);
    expect(listSourcesByUserMock).toHaveBeenCalledWith('user-sub-1', 20);
  });

  it('returns 500 when listSourcesByUser throws', async () => {
    listSourcesByUserMock.mockRejectedValueOnce(new Error('DynamoDB error'));

    const res = await GET(makeRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('Could not list sources.');
  });
});
