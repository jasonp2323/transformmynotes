import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const getUserProfileBySubMock = vi.hoisted(() => vi.fn());
const updateUserStatusMock = vi.hoisted(() => vi.fn());
const sendRejectionEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@/lib/email', () => ({
  sendRejectionEmail: sendRejectionEmailMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getUserProfileBySub: getUserProfileBySubMock,
  updateUserStatus: updateUserStatusMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };

const PENDING_PROFILE = {
  sub: 'user-pending-001',
  email: 'pending@example.com',
  name: 'Pending User',
  status: 'pending',
  role: 'member',
  groupIds: [],
  noteCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/users/user-pending-001/reject', {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  getUserProfileBySubMock.mockResolvedValue(PENDING_PROFILE);
  updateUserStatusMock.mockResolvedValue({ ok: true, profile: { ...PENDING_PROFILE, status: 'disabled' } });
  sendRejectionEmailMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/[sub]/reject', () => {
  describe('auth', () => {
    it('returns 403 when getAdminApiUser returns null', async () => {
      getAdminApiUserMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('profile lookup', () => {
    it('returns 404 when user profile is not found', async () => {
      getUserProfileBySubMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest(), { params: { sub: 'nonexistent-sub' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('User not found.');
    });

    it('returns 409 when user status is not pending', async () => {
      getUserProfileBySubMock.mockResolvedValueOnce({ ...PENDING_PROFILE, status: 'active' });

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('User is not pending.');
    });

    it('returns 409 when user is already disabled', async () => {
      getUserProfileBySubMock.mockResolvedValueOnce({ ...PENDING_PROFILE, status: 'disabled' });

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(409);
      expect(body.ok).toBe(false);
    });
  });

  describe('success path', () => {
    it('returns ok:true and emailSent:true on full success', async () => {
      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.emailSent).toBe(true);
    });

    it('calls updateUserStatus with sub, "disabled", and auditNotes', async () => {
      await POST(makeRequest(), { params: { sub: 'user-pending-001' } });

      expect(updateUserStatusMock).toHaveBeenCalledWith(
        'user-pending-001',
        'disabled',
        { auditNotes: 'Rejected by admin' },
      );
    });

    it('calls sendRejectionEmail with profile email', async () => {
      await POST(makeRequest(), { params: { sub: 'user-pending-001' } });

      expect(sendRejectionEmailMock).toHaveBeenCalledWith('pending@example.com');
    });

    it('returns emailSent:false but ok:true when sendRejectionEmail throws', async () => {
      sendRejectionEmailMock.mockRejectedValueOnce(new Error('SMTP error'));

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.emailSent).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns 500 when getUserProfileBySub throws', async () => {
      getUserProfileBySubMock.mockRejectedValueOnce(new Error('DB error'));

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when updateUserStatus returns !ok', async () => {
      updateUserStatusMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

      const res = await POST(makeRequest(), { params: { sub: 'user-pending-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
