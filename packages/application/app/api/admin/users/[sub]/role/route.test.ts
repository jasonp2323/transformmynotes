import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const updateUserRoleMock = vi.hoisted(() => vi.fn());
const cognitoSendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  updateUserRole: updateUserRoleMock,
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(function () { return { send: cognitoSendMock }; }),
  AdminAddUserToGroupCommand: vi.fn(function (input) { return { kind: 'AddToGroup', input }; }),
  AdminRemoveUserFromGroupCommand: vi.fn(function (input) { return { kind: 'RemoveFromGroup', input }; }),
  AdminDeleteUserCommand: vi.fn(function (input) { return { kind: 'DeleteUser', input }; }),
  UserNotFoundException: class UserNotFoundException extends Error { name = 'UserNotFoundException'; },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { PATCH } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/users/user-001/role', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'] = 'pool-test';
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  updateUserRoleMock.mockResolvedValue({ ok: true });
  cognitoSendMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/[sub]/role', () => {
  describe('auth', () => {
    it('returns 403 when getAdminApiUser returns null', async () => {
      getAdminApiUserMock.mockResolvedValueOnce(null);

      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('validation', () => {
    it('returns 400 for invalid role value', async () => {
      const res = await PATCH(makeRequest({ role: 'superuser' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid role.');
    });

    it('returns 400 when role is missing', async () => {
      const res = await PATCH(makeRequest({}), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it('returns 400 and makes NO cognito/DB calls on self-demotion (sub===admin.sub, role=member)', async () => {
      const res = await PATCH(makeRequest({ role: 'member' }), { params: { sub: 'admin-sub-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('You cannot remove your own admin role.');
      expect(cognitoSendMock).not.toHaveBeenCalled();
      expect(updateUserRoleMock).not.toHaveBeenCalled();
    });

    it('allows self-promotion to admin (sub===admin.sub, role=admin)', async () => {
      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'admin-sub-001' } });
      const body = await res.json() as Record<string, unknown>;

      // Self-promotion is allowed (already admin, but not blocked)
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('role:admin', () => {
    it('calls AdminAddUserToGroupCommand with GroupName:admin', async () => {
      const { AdminAddUserToGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');

      await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });

      expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith(
        expect.objectContaining({ GroupName: 'admin', Username: 'user-001' }),
      );
      expect(cognitoSendMock).toHaveBeenCalledTimes(1);
    });

    it('calls updateUserRole with sub and "admin"', async () => {
      await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });

      expect(updateUserRoleMock).toHaveBeenCalledWith('user-001', 'admin');
    });
  });

  describe('role:member', () => {
    it('calls AdminRemoveUserFromGroupCommand with GroupName:admin', async () => {
      const { AdminRemoveUserFromGroupCommand } = await import('@aws-sdk/client-cognito-identity-provider');

      await PATCH(makeRequest({ role: 'member' }), { params: { sub: 'user-001' } });

      expect(AdminRemoveUserFromGroupCommand).toHaveBeenCalledWith(
        expect.objectContaining({ GroupName: 'admin', Username: 'user-001' }),
      );
      expect(cognitoSendMock).toHaveBeenCalledTimes(1);
    });

    it('calls updateUserRole with sub and "member"', async () => {
      await PATCH(makeRequest({ role: 'member' }), { params: { sub: 'user-001' } });

      expect(updateUserRoleMock).toHaveBeenCalledWith('user-001', 'member');
    });
  });

  describe('success', () => {
    it('returns ok:true on success', async () => {
      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 404 when updateUserRole returns reason:not_found', async () => {
      updateUserRoleMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when updateUserRole returns !ok without not_found reason', async () => {
      updateUserRoleMock.mockResolvedValueOnce({ ok: false });

      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when pool id is not set', async () => {
      delete process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];

      const res = await PATCH(makeRequest({ role: 'admin' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
