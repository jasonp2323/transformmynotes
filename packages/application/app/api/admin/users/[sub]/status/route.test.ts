import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const updateUserStatusMock = vi.hoisted(() => vi.fn());
const cognitoSendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  updateUserStatus: updateUserStatusMock,
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: cognitoSendMock })),
  AdminDisableUserCommand: vi.fn((input) => ({ kind: 'DisableUser', input })),
  AdminEnableUserCommand: vi.fn((input) => ({ kind: 'EnableUser', input })),
  AdminAddUserToGroupCommand: vi.fn((input) => ({ kind: 'AddToGroup', input })),
  AdminRemoveUserFromGroupCommand: vi.fn((input) => ({ kind: 'RemoveFromGroup', input })),
  AdminDeleteUserCommand: vi.fn((input) => ({ kind: 'DeleteUser', input })),
  UserNotFoundException: class UserNotFoundException extends Error { name = 'UserNotFoundException'; },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { PATCH } from './route';
import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };
const USER_POOL_ID = 'us-east-1_testpool';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/users/user-001/status', {
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
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  updateUserStatusMock.mockResolvedValue({ ok: true });
  cognitoSendMock.mockResolvedValue({});
  process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'] = USER_POOL_ID;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/[sub]/status', () => {
  describe('auth', () => {
    it('returns 403 when getAdminApiUser returns null', async () => {
      getAdminApiUserMock.mockResolvedValueOnce(null);

      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('validation', () => {
    it('returns 400 for invalid status value', async () => {
      const res = await PATCH(makeRequest({ status: 'pending' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid status.');
    });

    it('returns 400 when status is missing', async () => {
      const res = await PATCH(makeRequest({}), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it('returns 400 on self-disable (sub===admin.sub, status=disabled)', async () => {
      const res = await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'admin-sub-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('You cannot disable your own account.');
    });

    it('allows self-activation (sub===admin.sub, status=active)', async () => {
      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'admin-sub-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('success path', () => {
    it('returns ok:true when status is "active"', async () => {
      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('returns ok:true when status is "disabled"', async () => {
      const res = await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('calls updateUserStatus with sub and status', async () => {
      await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'user-001' } });

      expect(updateUserStatusMock).toHaveBeenCalledWith('user-001', 'disabled');
    });

    it('sends AdminDisableUserCommand to Cognito when disabling', async () => {
      await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'user-001' } });

      expect(AdminDisableUserCommand).toHaveBeenCalledWith({
        UserPoolId: USER_POOL_ID,
        Username: 'user-001',
      });
      expect(cognitoSendMock).toHaveBeenCalledTimes(1);
    });

    it('sends AdminEnableUserCommand to Cognito when enabling', async () => {
      await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });

      expect(AdminEnableUserCommand).toHaveBeenCalledWith({
        UserPoolId: USER_POOL_ID,
        Username: 'user-001',
      });
      expect(cognitoSendMock).toHaveBeenCalledTimes(1);
    });

    it('tolerates UserNotFoundException from Cognito (idempotent success)', async () => {
      const UserNotFound = new UserNotFoundException({ message: 'User not found', $metadata: {} });
      cognitoSendMock.mockRejectedValueOnce(UserNotFound);

      const res = await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 404 when updateUserStatus returns reason:not_found', async () => {
      updateUserStatusMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when updateUserStatus returns !ok without not_found reason', async () => {
      updateUserStatusMock.mockResolvedValueOnce({ ok: false });

      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set', async () => {
      delete process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];

      const res = await PATCH(makeRequest({ status: 'active' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Server configuration error.');
    });

    it('returns 500 when Cognito send throws a non-UserNotFoundException error', async () => {
      cognitoSendMock.mockRejectedValueOnce(new Error('Network failure'));

      const res = await PATCH(makeRequest({ status: 'disabled' }), { params: { sub: 'user-001' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
