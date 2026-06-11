import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getShareItemMock = vi.hoisted(() => vi.fn());
const revokeShareItemMock = vi.hoisted(() => vi.fn());
const listUserGroupsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getShareItem: getShareItemMock,
  revokeShareItem: revokeShareItemMock,
  listUserGroups: listUserGroupsMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { DELETE } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CALLER_SUB = 'caller-sub-1';
const OWNER_SUB = 'owner-sub-2';
const NOTE_ID = '01JABC';
const RECIPIENT_SUB = 'recipient-sub-3';
const GROUP_ID = 'group-id-1';
const OTHER_GROUP_ID = 'group-id-other';

const SHARE_ITEM = {
  pk: `USER#${OWNER_SUB}`,
  sk: `SHARE#${NOTE_ID}#RECIPIENT#${RECIPIENT_SUB}`,
  gsi4pk: `USER#${RECIPIENT_SUB}`,
  gsi4sk: 'SHARED_AT#2026-01-01T00:00:00.000Z',
  ownerSub: OWNER_SUB,
  ownerName: 'Owner Name',
  recipientSub: RECIPIENT_SUB,
  noteId: NOTE_ID,
  noteTitle: 'Test Note',
  groupId: GROUP_ID,
  permission: 'read' as const,
  sharedAt: '2026-01-01T00:00:00.000Z',
};

/** Build a Request for DELETE /api/notes/[noteId]/shares/[recipientSub] */
function makeRequest(opts?: {
  noteId?: string;
  recipientSub?: string;
  owner?: string;
}): [Request, { params: { noteId: string; recipientSub: string } }] {
  const nId = opts?.noteId ?? NOTE_ID;
  const rSub = opts?.recipientSub ?? RECIPIENT_SUB;
  const ownerQs = opts?.owner != null ? `?owner=${opts.owner}` : '';
  const req = new Request(
    `http://localhost/api/notes/${nId}/shares/${rSub}${ownerQs}`,
    { method: 'DELETE' },
  );
  return [req, { params: { noteId: nId, recipientSub: rSub } }];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(CALLER_SUB);
  revokeShareItemMock.mockResolvedValue(true);
  getShareItemMock.mockResolvedValue(SHARE_ITEM);
  listUserGroupsMock.mockResolvedValue([
    { groupId: GROUP_ID, role: 'admin', userSub: CALLER_SUB, pk: '', sk: '', gsi1pk: '', gsi1sk: '', joinedAt: '' },
  ]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/notes/[noteId]/shares/[recipientSub]', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeRequest();
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('request validation', () => {
    it('returns 400 when noteId is empty', async () => {
      const req = new Request('http://localhost/api/notes//shares/recipient', { method: 'DELETE' });
      const res = await DELETE(req, { params: { noteId: '', recipientSub: RECIPIENT_SUB } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid noteId.');
    });

    it('returns 400 when recipientSub is empty', async () => {
      const req = new Request(`http://localhost/api/notes/${NOTE_ID}/shares/`, { method: 'DELETE' });
      const res = await DELETE(req, { params: { noteId: NOTE_ID, recipientSub: '' } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid recipientSub.');
    });
  });

  describe('owner revoke (ownerSub === caller)', () => {
    it('returns 204 when owner revokes their own share', async () => {
      // No ?owner= param → ownerSub defaults to caller
      const [req, ctx] = makeRequest();
      const res = await DELETE(req, ctx);

      expect(res.status).toBe(204);
      // revokeShareItem should be called with callerSub as the ownerSub
      expect(revokeShareItemMock).toHaveBeenCalledWith(CALLER_SUB, NOTE_ID, RECIPIENT_SUB);
    });

    it('skips getShareItem and listUserGroups for owner revoke', async () => {
      const [req, ctx] = makeRequest();
      await DELETE(req, ctx);

      expect(getShareItemMock).not.toHaveBeenCalled();
      expect(listUserGroupsMock).not.toHaveBeenCalled();
    });

    it('returns 404 when revokeShareItem returns false (share not found)', async () => {
      revokeShareItemMock.mockResolvedValueOnce(false);

      const [req, ctx] = makeRequest();
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Share not found.');
    });
  });

  describe('admin revoke (ownerSub !== caller)', () => {
    it('returns 204 when caller is admin of the share group', async () => {
      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);

      expect(res.status).toBe(204);
      expect(getShareItemMock).toHaveBeenCalledWith(OWNER_SUB, NOTE_ID, RECIPIENT_SUB);
      expect(listUserGroupsMock).toHaveBeenCalledWith(CALLER_SUB);
      expect(revokeShareItemMock).toHaveBeenCalledWith(OWNER_SUB, NOTE_ID, RECIPIENT_SUB);
    });

    it('returns 403 when caller is admin of a DIFFERENT group', async () => {
      // Caller is admin, but of a different group
      listUserGroupsMock.mockResolvedValueOnce([
        { groupId: OTHER_GROUP_ID, role: 'admin', userSub: CALLER_SUB, pk: '', sk: '', gsi1pk: '', gsi1sk: '', joinedAt: '' },
      ]);

      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
      expect(revokeShareItemMock).not.toHaveBeenCalled();
    });

    it('returns 403 when caller is a plain member (non-admin) of the share group', async () => {
      listUserGroupsMock.mockResolvedValueOnce([
        { groupId: GROUP_ID, role: 'member', userSub: CALLER_SUB, pk: '', sk: '', gsi1pk: '', gsi1sk: '', joinedAt: '' },
      ]);

      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
      expect(revokeShareItemMock).not.toHaveBeenCalled();
    });

    it('returns 404 when getShareItem returns undefined', async () => {
      getShareItemMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Share not found.');
      expect(revokeShareItemMock).not.toHaveBeenCalled();
    });

    it('returns 404 when revokeShareItem returns false after admin auth passes', async () => {
      revokeShareItemMock.mockResolvedValueOnce(false);

      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Share not found.');
    });
  });

  describe('error handling', () => {
    it('returns 500 when revokeShareItem throws unexpectedly', async () => {
      revokeShareItemMock.mockRejectedValueOnce(new Error('DynamoDB timeout'));

      const [req, ctx] = makeRequest();
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not revoke share.');
    });

    it('returns 500 when getShareItem throws unexpectedly', async () => {
      getShareItemMock.mockRejectedValueOnce(new Error('DynamoDB connection error'));

      const [req, ctx] = makeRequest({ owner: OWNER_SUB });
      const res = await DELETE(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not revoke share.');
    });
  });
});
