import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetRateLimiter } from '@/lib/ratelimit';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const sendInviteEmailMock = vi.hoisted(() => vi.fn());
const generateInviteCodeMock = vi.hoisted(() => vi.fn());
const putInviteMock = vi.hoisted(() => vi.fn());
const getGroupMock = vi.hoisted(() => vi.fn());
const listInvitesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@/lib/email', () => ({
  sendInviteEmail: sendInviteEmailMock,
}));

vi.mock('@transformmynotes/core', () => ({
  generateInviteCode: generateInviteCodeMock,
  putInvite: putInviteMock,
  getGroup: getGroupMock,
  listInvites: listInvitesMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_USER = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };
const FIXED_CODE = 'ABCDEFGH'; // 8 chars → formatted as ABCD-EFGH

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetRateLimiter();
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN_USER);
  generateInviteCodeMock.mockReturnValue(FIXED_CODE);
  putInviteMock.mockResolvedValue({});
  getGroupMock.mockResolvedValue(undefined);
  sendInviteEmailMock.mockResolvedValue(undefined);
  listInvitesMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(search = ''): Request {
  return new Request(`http://localhost/api/admin/invites${search}`, {
    method: 'GET',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/invites', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest());
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('admin, no status — calls listInvites with undefined, returns { ok:true, invites }', async () => {
    const fakeInvites = [{ pk: 'INVITE#abc', status: 'pending' }];
    listInvitesMock.mockResolvedValueOnce(fakeInvites);

    const res = await GET(makeGetRequest());
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.invites).toEqual(fakeInvites);
    expect(listInvitesMock).toHaveBeenCalledWith(undefined);
  });

  it('admin, ?status=all — calls listInvites with undefined (list-all alias)', async () => {
    const res = await GET(makeGetRequest('?status=all'));
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(listInvitesMock).toHaveBeenCalledWith(undefined);
  });

  it('admin, ?status=pending — calls listInvites("pending")', async () => {
    const pendingInvites = [{ pk: 'INVITE#def', status: 'pending' }];
    listInvitesMock.mockResolvedValueOnce(pendingInvites);

    const res = await GET(makeGetRequest('?status=pending'));
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.invites).toEqual(pendingInvites);
    expect(listInvitesMock).toHaveBeenCalledWith('pending');
  });

  it('admin, ?status=bogus — returns 400', async () => {
    const res = await GET(makeGetRequest('?status=bogus'));
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid status filter.');
    expect(listInvitesMock).not.toHaveBeenCalled();
  });

  it('admin, listInvites throws — returns 500', async () => {
    listInvitesMock.mockRejectedValueOnce(new Error('DynamoDB connection error'));

    const res = await GET(makeGetRequest());
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Failed to list invites.');
  });
});

describe('POST /api/admin/invites', () => {
  describe('type=email', () => {
    it('returns 200 with codeDisplay, calls sendInviteEmail once with formatted code', async () => {
      const res = await POST(makeRequest({ type: 'email', email: 'user@example.com' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.codeDisplay).toBe('ABCD-EFGH');
      expect(body.emailSent).toBe(true);
      expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);

      // Verify formatted code is passed to email helper.
      const [toArg, codeArg] = sendInviteEmailMock.mock.calls[0] as [string, string, ...unknown[]];
      expect(toArg).toBe('user@example.com');
      expect(codeArg).toBe('ABCD-EFGH');
    });

    it('returns emailSent: false if sendInviteEmail throws (invite still created)', async () => {
      sendInviteEmailMock.mockRejectedValueOnce(new Error('SMTP timeout'));

      const res = await POST(makeRequest({ type: 'email', email: 'user@example.com' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.emailSent).toBe(false);
      expect(putInviteMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('type=code', () => {
    it('returns 200 without calling sendInviteEmail', async () => {
      const res = await POST(makeRequest({ type: 'code', label: 'Class batch A', maxUses: 25 }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.codeDisplay).toBe('ABCD-EFGH');
      expect(sendInviteEmailMock).not.toHaveBeenCalled();
    });

    it('includes expiresAt in the response', async () => {
      const res = await POST(makeRequest({ type: 'code', label: 'Batch' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(typeof body.expiresAt).toBe('string');
    });
  });

  describe('auth', () => {
    it('returns 403 when getAdminApiUser returns null', async () => {
      getAdminApiUserMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest({ type: 'code', label: 'Batch' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
    });
  });

  describe('validation', () => {
    it('returns 400 for an invalid body type', async () => {
      const res = await POST(makeRequest({ type: 'link', label: 'Batch' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it('returns 400 when email is missing for type=email', async () => {
      const res = await POST(makeRequest({ type: 'email' }));

      expect(res.status).toBe(400);
    });

    it('returns 400 when label is missing for type=code', async () => {
      const res = await POST(makeRequest({ type: 'code' }));

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is not valid JSON', async () => {
      const res = await POST(
        new Request('http://localhost/api/admin/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json {{{',
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('group resolution', () => {
    it('returns 400 when groupId is supplied but group is not found', async () => {
      getGroupMock.mockResolvedValueOnce(undefined);

      const res = await POST(
        makeRequest({ type: 'code', label: 'Batch', groupId: 'nonexistent-group' }),
      );
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it('includes group name in invite when group exists', async () => {
      getGroupMock.mockResolvedValueOnce({
        groupId: 'grp-1',
        name: 'Biology 101',
        pk: 'GROUP#grp-1',
        sk: 'META',
        createdBy: 'admin',
        createdAt: '2026-01-01T00:00:00.000Z',
        memberCount: 0,
      });

      await POST(makeRequest({ type: 'code', label: 'Batch', groupId: 'grp-1' }));

      expect(putInviteMock).toHaveBeenCalledWith(
        expect.objectContaining({ groupName: 'Biology 101', groupId: 'grp-1' }),
      );
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after 20 requests from the same admin sub within 60s', async () => {
      // Issue 20 allowed requests using a unique sub to avoid polluting other tests.
      const rateLimitedAdmin = { sub: 'admin-rate-limit-test', claims: { 'cognito:groups': ['admin'] } };
      getAdminApiUserMock.mockResolvedValue(rateLimitedAdmin);

      for (let i = 0; i < 20; i++) {
        await POST(makeRequest({ type: 'code', label: 'Batch' }));
      }

      // The 21st call should be rate-limited.
      const res = await POST(makeRequest({ type: 'code', label: 'Batch' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(429);
      expect(body.ok).toBe(false);
    });
  });
});
