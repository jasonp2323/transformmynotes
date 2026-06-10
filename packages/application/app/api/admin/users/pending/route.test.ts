import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const listUserProfilesByStatusMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listUserProfilesByStatus: listUserProfilesByStatusMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };

const PENDING_USER = {
  sub: 'user-pending-001',
  email: 'pending@example.com',
  name: 'Pending User',
  status: 'pending',
  role: 'member',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  listUserProfilesByStatusMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/users/pending', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('returns ok:true with pending users list', async () => {
    listUserProfilesByStatusMock.mockResolvedValueOnce([PENDING_USER]);

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.users).toEqual([PENDING_USER]);
  });

  it('calls listUserProfilesByStatus with "pending"', async () => {
    await GET();
    expect(listUserProfilesByStatusMock).toHaveBeenCalledWith('pending');
    expect(listUserProfilesByStatusMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no pending users', async () => {
    listUserProfilesByStatusMock.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.users).toEqual([]);
  });

  it('returns 500 when listUserProfilesByStatus throws', async () => {
    listUserProfilesByStatusMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
