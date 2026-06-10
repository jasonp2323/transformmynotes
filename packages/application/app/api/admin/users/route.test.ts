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
// Import modules under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };

const ACTIVE_USER = {
  sub: 'user-active-001',
  email: 'active@example.com',
  name: 'Active User',
  status: 'active',
  role: 'member',
};

const DISABLED_USER = {
  sub: 'user-disabled-001',
  email: 'disabled@example.com',
  name: 'Disabled User',
  status: 'disabled',
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

describe('GET /api/admin/users', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('concatenates active and disabled users and returns ok:true', async () => {
    listUserProfilesByStatusMock
      .mockResolvedValueOnce([ACTIVE_USER])
      .mockResolvedValueOnce([DISABLED_USER]);

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const users = body.users as unknown[];
    expect(users).toHaveLength(2);
    expect(users).toContainEqual(ACTIVE_USER);
    expect(users).toContainEqual(DISABLED_USER);
  });

  it('calls listUserProfilesByStatus for both active and disabled', async () => {
    listUserProfilesByStatusMock.mockResolvedValue([]);

    await GET();

    expect(listUserProfilesByStatusMock).toHaveBeenCalledWith('active');
    expect(listUserProfilesByStatusMock).toHaveBeenCalledWith('disabled');
    expect(listUserProfilesByStatusMock).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when listUserProfilesByStatus throws', async () => {
    listUserProfilesByStatusMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
