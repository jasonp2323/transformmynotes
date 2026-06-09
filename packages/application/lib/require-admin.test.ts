import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/headers (cookies)
// ---------------------------------------------------------------------------

const cookieGetMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookieGetMock }),
}));

// ---------------------------------------------------------------------------
// Mock verifyIdToken
// ---------------------------------------------------------------------------

const verifyIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/verify-id-token', () => ({
  verifyIdToken: verifyIdTokenMock,
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { getAdminApiUser } from './require-admin';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ADMIN_CLAIMS = {
  sub: 'user-sub-123',
  'cognito:groups': ['admin', 'users'],
};

const NON_ADMIN_CLAIMS = {
  sub: 'user-sub-456',
  'cognito:groups': ['users'],
};

beforeEach(() => {
  cookieGetMock.mockReset();
  verifyIdTokenMock.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAdminApiUser', () => {
  it('returns { sub, claims } for a valid admin token', async () => {
    cookieGetMock.mockReturnValue({ value: 'valid-token' });
    verifyIdTokenMock.mockResolvedValue(ADMIN_CLAIMS);

    const result = await getAdminApiUser();

    expect(result).toEqual({ sub: 'user-sub-123', claims: ADMIN_CLAIMS });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
  });

  it('returns null when claims lack the admin group', async () => {
    cookieGetMock.mockReturnValue({ value: 'valid-token' });
    verifyIdTokenMock.mockResolvedValue(NON_ADMIN_CLAIMS);

    const result = await getAdminApiUser();

    expect(result).toBeNull();
  });

  it('returns null when no CognitoIdToken cookie is present', async () => {
    cookieGetMock.mockReturnValue(undefined);

    const result = await getAdminApiUser();

    expect(result).toBeNull();
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('returns null when verifyIdToken throws', async () => {
    cookieGetMock.mockReturnValue({ value: 'bad-token' });
    verifyIdTokenMock.mockRejectedValue(new Error('Invalid signature'));

    const result = await getAdminApiUser();

    expect(result).toBeNull();
  });

  it('returns null when sub is missing from claims', async () => {
    cookieGetMock.mockReturnValue({ value: 'valid-token' });
    verifyIdTokenMock.mockResolvedValue({ 'cognito:groups': ['admin'] });

    const result = await getAdminApiUser();

    expect(result).toBeNull();
  });

  it('returns null when sub is an empty string', async () => {
    cookieGetMock.mockReturnValue({ value: 'valid-token' });
    verifyIdTokenMock.mockResolvedValue({ sub: '', 'cognito:groups': ['admin'] });

    const result = await getAdminApiUser();

    expect(result).toBeNull();
  });
});
