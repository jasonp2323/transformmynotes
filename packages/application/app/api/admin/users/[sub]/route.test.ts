import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const deleteUserProfileWithAuditMock = vi.hoisted(() => vi.fn());
const cognitoSendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  deleteUserProfileWithAudit: deleteUserProfileWithAuditMock,
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

import { DELETE } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/users/user-001', {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'] = 'pool-test';
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  deleteUserProfileWithAuditMock.mockResolvedValue({ ok: true });
  cognitoSendMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/users/[sub]', () => {
  describe('auth', () => {
    it('returns 403 when getAdminApiUser returns null', async () => {
      getAdminApiUserMock.mockResolvedValueOnce(null);

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('self-guard', () => {
    it('returns 400 when attempting to delete own account', async () => {
      const res = await DELETE(makeRequest(), { params: { sub: 'admin-sub-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('You cannot remove your own account.');
    });

    it('does NOT call Cognito or DB when self-deleting', async () => {
      await DELETE(makeRequest(), { params: { sub: 'admin-sub-001' } });

      expect(cognitoSendMock).not.toHaveBeenCalled();
      expect(deleteUserProfileWithAuditMock).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('returns ok:true on successful deletion', async () => {
      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('calls AdminDeleteUserCommand with UserPoolId and Username:sub', async () => {
      const { AdminDeleteUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');

      await DELETE(makeRequest(), { params: { sub: 'user-001' } });

      expect(AdminDeleteUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({ UserPoolId: 'pool-test', Username: 'user-001' }),
      );
      expect(cognitoSendMock).toHaveBeenCalledTimes(1);
    });

    it('calls deleteUserProfileWithAudit with sub and deletedBy:admin.sub', async () => {
      await DELETE(makeRequest(), { params: { sub: 'user-001' } });

      expect(deleteUserProfileWithAuditMock).toHaveBeenCalledWith(
        'user-001',
        { deletedBy: 'admin-sub-001' },
      );
    });

    it('returns ok:true when UserNotFoundException is thrown by Cognito (idempotent)', async () => {
      // The mock replaces UserNotFoundException with a plain Error subclass (see vi.mock above).
      // Cast through unknown to satisfy TypeScript while using the mock constructor at runtime.
      const { UserNotFoundException } = await import('@aws-sdk/client-cognito-identity-provider');
      const notFoundErr = new (UserNotFoundException as unknown as new (msg: string) => Error)('User not found');
      cognitoSendMock.mockRejectedValueOnce(notFoundErr);

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      // DB deletion still proceeds
      expect(deleteUserProfileWithAuditMock).toHaveBeenCalledTimes(1);
    });

    it('returns ok:true when deleteUserProfileWithAudit returns reason:not_found (idempotent)', async () => {
      deleteUserProfileWithAuditMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 500 when pool id is not set', async () => {
      delete process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when Cognito throws a non-UserNotFoundException error', async () => {
      cognitoSendMock.mockRejectedValueOnce(new Error('Network error'));

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when deleteUserProfileWithAudit returns !ok without not_found reason', async () => {
      deleteUserProfileWithAuditMock.mockResolvedValueOnce({ ok: false });

      const res = await DELETE(makeRequest(), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
