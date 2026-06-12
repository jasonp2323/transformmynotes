import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetRateLimiter } from '@/lib/ratelimit';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const cognitoSendMock = vi.hoisted(() => vi.fn());
const getInviteByCodeMock = vi.hoisted(() => vi.fn());
const evaluateInviteMock = vi.hoisted(() => vi.fn());
const buildUserProfileItemMock = vi.hoisted(() => vi.fn());
const ddbSendMock = vi.hoisted(() => vi.fn());
const claimInviteMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-cognito-identity-provider', async () => {
  class FakeCognitoClient {
    send = cognitoSendMock;
  }
  class AdminCreateUserCommand {
    constructor(public input: unknown) {}
  }
  class AdminSetUserPasswordCommand {
    constructor(public input: unknown) {}
  }
  class AdminAddUserToGroupCommand {
    constructor(public input: unknown) {}
  }
  class AdminDeleteUserCommand {
    constructor(public input: unknown) {}
  }
  class UsernameExistsException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'UsernameExistsException';
    }
  }
  return {
    CognitoIdentityProviderClient: FakeCognitoClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand,
    AdminDeleteUserCommand,
    UsernameExistsException,
  };
});

vi.mock('@transformmynotes/core', () => ({
  getInviteByCode: getInviteByCodeMock,
  evaluateInvite: evaluateInviteMock,
  buildUserProfileItem: buildUserProfileItemMock,
  ddb: { send: ddbSendMock },
  TableNames: { UserData: 'UserData' },
  claimInvite: claimInviteMock,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: () => ({ ok: true }),
  resetRateLimiter: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_INVITE = {
  type: 'email',
  targetEmail: 'user@example.com',
  groupId: null,
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/invite/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  code: 'ABCD-EFGH',
  email: 'user@example.com',
  name: 'Test User',
  password: 'securepass123',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetRateLimiter();
  vi.clearAllMocks();
  process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'] = 'us-east-1_testpool';

  getInviteByCodeMock.mockResolvedValue(VALID_INVITE);
  evaluateInviteMock.mockReturnValue({ valid: true });
  buildUserProfileItemMock.mockReturnValue({ pk: 'USER#sub-123', sk: 'PROFILE' });
  ddbSendMock.mockResolvedValue({});
  claimInviteMock.mockResolvedValue({ ok: true });

  // Default: AdminCreateUser returns a sub; other commands succeed
  cognitoSendMock.mockImplementation((cmd: unknown) => {
    const name = (cmd as { constructor: { name: string } }).constructor.name;
    if (name === 'AdminCreateUserCommand') {
      return Promise.resolve({
        User: { Attributes: [{ Name: 'sub', Value: 'sub-123' }] },
      });
    }
    return Promise.resolve({});
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/invite/redeem', () => {
  describe('happy path', () => {
    it('returns 200 { ok: true } when all steps succeed', async () => {
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('calls claimInvite with the invite code', async () => {
      await POST(makeRequest(VALID_BODY));
      expect(claimInviteMock).toHaveBeenCalledWith('ABCD-EFGH');
    });
  });

  describe('rollback on post-create failure', () => {
    it('sends AdminDeleteUserCommand and returns 500 when AdminAddUserToGroupCommand throws', async () => {
      cognitoSendMock.mockImplementation((cmd: unknown) => {
        const name = (cmd as { constructor: { name: string } }).constructor.name;
        if (name === 'AdminCreateUserCommand') {
          return Promise.resolve({
            User: { Attributes: [{ Name: 'sub', Value: 'sub-123' }] },
          });
        }
        if (name === 'AdminAddUserToGroupCommand') {
          return Promise.reject(new Error('ResourceNotFoundException: Group does not exist'));
        }
        return Promise.resolve({});
      });

      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);

      // Verify rollback was attempted
      const deleteCalls = (cognitoSendMock.mock.calls as unknown[][]).filter(
        (args) => args[0] instanceof AdminDeleteUserCommand,
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('does not call claimInvite when post-create step fails', async () => {
      cognitoSendMock.mockImplementation((cmd: unknown) => {
        const name = (cmd as { constructor: { name: string } }).constructor.name;
        if (name === 'AdminCreateUserCommand') {
          return Promise.resolve({
            User: { Attributes: [{ Name: 'sub', Value: 'sub-123' }] },
          });
        }
        if (name === 'AdminAddUserToGroupCommand') {
          return Promise.reject(new Error('ResourceNotFoundException'));
        }
        return Promise.resolve({});
      });

      await POST(makeRequest(VALID_BODY));
      expect(claimInviteMock).not.toHaveBeenCalled();
    });
  });

  describe('UsernameExistsException', () => {
    it('returns 400 with invite-invalid error', async () => {
      const { UsernameExistsException } = await import('@aws-sdk/client-cognito-identity-provider');
      // The mock class accepts a plain string; cast through unknown to satisfy the
      // real type signature (which expects an ExceptionOptionType object).
      const ExnCtor = UsernameExistsException as unknown as new (msg: string) => Error;
      cognitoSendMock.mockRejectedValueOnce(new ExnCtor('User already exists'));

      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.error).toBe('This invite is no longer valid.');
    });
  });

  describe('validation', () => {
    it('returns 400 when code is missing', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, code: '' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, email: 'not-an-email' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when password is too short', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, password: 'short' }));
      expect(res.status).toBe(400);
    });
  });
});
