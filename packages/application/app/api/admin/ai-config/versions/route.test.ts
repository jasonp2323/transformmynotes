import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const listAiConfigVersionsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', async (importActual) => ({
  ...(await importActual<typeof import('@transformmynotes/core')>()),
  listAiConfigVersions: listAiConfigVersionsMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-1', claims: {} };

const VERSIONS = [
  { version: 2, updatedBy: 'admin-2', updatedAt: '2026-06-16T10:00:00.000Z' },
  { version: 1, updatedBy: 'admin-1', updatedAt: '2026-06-15T09:00:00.000Z' },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  listAiConfigVersionsMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/ai-config/versions', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(listAiConfigVersionsMock).not.toHaveBeenCalled();
  });

  it('returns the descending version list', async () => {
    listAiConfigVersionsMock.mockResolvedValueOnce(VERSIONS);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.versions).toEqual(VERSIONS);
  });

  it('returns 500 when listAiConfigVersions throws', async () => {
    listAiConfigVersionsMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
