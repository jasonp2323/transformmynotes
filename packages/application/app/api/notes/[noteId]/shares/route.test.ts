import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getNoteMock = vi.hoisted(() => vi.fn());
const getShareItemMock = vi.hoisted(() => vi.fn());
const putShareItemMock = vi.hoisted(() => vi.fn());
const listSharesForNoteMock = vi.hoisted(() => vi.fn());
const getUserProfileBySubMock = vi.hoisted(() => vi.fn());
const listUserGroupsMock = vi.hoisted(() => vi.fn());
const listGroupMembersMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getNote: getNoteMock,
  getShareItem: getShareItemMock,
  putShareItem: putShareItemMock,
  listSharesForNote: listSharesForNoteMock,
  getUserProfileBySub: getUserProfileBySubMock,
  listUserGroups: listUserGroupsMock,
  listGroupMembers: listGroupMembersMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST, GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_SUB = 'owner-sub-1';
const NOTE_ID = '01JABC';
const GROUP_ID = 'group-123';
const RECIPIENT_1 = 'recipient-sub-1';
const RECIPIENT_2 = 'recipient-sub-2';

const EXISTING_NOTE = {
  pk: `USER#${OWNER_SUB}`,
  sk: `NOTE#${NOTE_ID}`,
  noteId: NOTE_ID,
  sub: OWNER_SUB,
  title: 'My Note',
  tags: [],
  status: 'clean' as const,
  words: 10,
  highlights: 0,
  langPair: 'unknown',
  ocrConfidence: 100,
  bodyS3Key: `markdown/users/${OWNER_SUB}/${NOTE_ID}.md`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  groupId: GROUP_ID,
};

const OWNER_PROFILE = {
  sub: OWNER_SUB,
  email: 'owner@example.com',
  name: 'Owner Name',
};

const GROUP_MEMBERS = [
  { userSub: OWNER_SUB, groupId: GROUP_ID, role: 'admin' as const },
  { userSub: RECIPIENT_1, groupId: GROUP_ID, role: 'member' as const },
  { userSub: RECIPIENT_2, groupId: GROUP_ID, role: 'member' as const },
];

const OWNER_MEMBERSHIPS = [{ groupId: GROUP_ID, userSub: OWNER_SUB, role: 'admin' as const }];

function makePostRequest(
  body: unknown,
  noteId = NOTE_ID,
): [Request, { params: { noteId: string } }] {
  const req = new Request(`http://localhost/api/notes/${noteId}/shares`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return [req, { params: { noteId } }];
}

function makeGetRequest(noteId = NOTE_ID): [Request, { params: { noteId: string } }] {
  const req = new Request(`http://localhost/api/notes/${noteId}/shares`, { method: 'GET' });
  return [req, { params: { noteId } }];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  getAuthenticatedSubMock.mockResolvedValue(OWNER_SUB);
  getNoteMock.mockResolvedValue(EXISTING_NOTE);
  getShareItemMock.mockResolvedValue(undefined); // no existing share by default
  putShareItemMock.mockResolvedValue(undefined);
  listSharesForNoteMock.mockResolvedValue([]);
  getUserProfileBySubMock.mockResolvedValue(OWNER_PROFILE);
  listUserGroupsMock.mockResolvedValue(OWNER_MEMBERSHIPS);
  listGroupMembersMock.mockResolvedValue(GROUP_MEMBERS);
});

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe('POST /api/notes/[noteId]/shares', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makePostRequest({});
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('note lookup (owner check)', () => {
    it('returns 404 when getNote returns undefined (non-owner)', async () => {
      getNoteMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makePostRequest({});
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Note not found.');
    });
  });

  describe('group scope validation', () => {
    it('returns 400 when note has no groupId and body has no groupId', async () => {
      getNoteMock.mockResolvedValueOnce({ ...EXISTING_NOTE, groupId: undefined });

      const [req, ctx] = makePostRequest({});
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('A note must belong to a group to be shared.');
    });

    it('uses body groupId when note has no groupId', async () => {
      getNoteMock.mockResolvedValueOnce({ ...EXISTING_NOTE, groupId: undefined });

      const [req, ctx] = makePostRequest({ groupId: GROUP_ID, recipientSubs: [RECIPIENT_1] });
      const res = await POST(req, ctx);

      expect(res.status).toBe(201);
    });
  });

  describe('group membership check', () => {
    it('returns 403 when owner is not a member of the resolved group', async () => {
      listUserGroupsMock.mockResolvedValueOnce([]); // owner has no group memberships

      const [req, ctx] = makePostRequest({});
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden.');
    });
  });

  describe('group fan-out', () => {
    it('creates one share per member excluding the owner', async () => {
      const [req, ctx] = makePostRequest({}); // no recipientSubs → whole-group fan-out
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.created).toBe(2); // RECIPIENT_1 and RECIPIENT_2, not OWNER_SUB

      // putShareItem called twice, never with owner sub
      expect(putShareItemMock).toHaveBeenCalledTimes(2);
      const calls = putShareItemMock.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).recipientSub);
      expect(calls).toContain(RECIPIENT_1);
      expect(calls).toContain(RECIPIENT_2);
      expect(calls).not.toContain(OWNER_SUB);
    });
  });

  describe('specific-sub share', () => {
    it('creates exactly one share when recipientSubs is a single-element array', async () => {
      const [req, ctx] = makePostRequest({ recipientSubs: [RECIPIENT_1] });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.created).toBe(1);

      expect(putShareItemMock).toHaveBeenCalledTimes(1);
      expect(putShareItemMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerSub: OWNER_SUB,
          recipientSub: RECIPIENT_1,
          noteId: NOTE_ID,
          noteTitle: EXISTING_NOTE.title,
          groupId: GROUP_ID,
        }),
      );
    });

    it('excludes the owner sub from an explicit recipientSubs list', async () => {
      const [req, ctx] = makePostRequest({ recipientSubs: [OWNER_SUB, RECIPIENT_1] });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(201);
      expect(body.created).toBe(1);
      expect(putShareItemMock).toHaveBeenCalledTimes(1);
      const call = putShareItemMock.mock.calls[0][0] as Record<string, unknown>;
      expect(call.recipientSub).toBe(RECIPIENT_1);
    });
  });

  describe('idempotency', () => {
    it('skips an existing active share (no revokedAt)', async () => {
      // RECIPIENT_1 already has an active share
      getShareItemMock.mockImplementation(
        (_ownerSub: string, _noteId: string, recipientSub: string) => {
          if (recipientSub === RECIPIENT_1) {
            return Promise.resolve({
              ownerSub: OWNER_SUB,
              recipientSub: RECIPIENT_1,
              noteId: NOTE_ID,
              sharedAt: '2026-01-01T00:00:00.000Z',
              // no revokedAt → active
            });
          }
          return Promise.resolve(undefined);
        },
      );

      const [req, ctx] = makePostRequest({ recipientSubs: [RECIPIENT_1] });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(201);
      expect(body.created).toBe(0); // skipped
      expect(putShareItemMock).not.toHaveBeenCalled();
    });

    it('re-shares a previously revoked recipient (revokedAt set)', async () => {
      // RECIPIENT_1 has a revoked share
      getShareItemMock.mockResolvedValueOnce({
        ownerSub: OWNER_SUB,
        recipientSub: RECIPIENT_1,
        noteId: NOTE_ID,
        sharedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: '2026-01-02T00:00:00.000Z', // revoked
      });

      const [req, ctx] = makePostRequest({ recipientSubs: [RECIPIENT_1] });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(201);
      expect(body.created).toBe(1); // re-shared
      expect(putShareItemMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('request body validation', () => {
    it('returns 400 on invalid JSON body', async () => {
      const req = new Request(`http://localhost/api/notes/${NOTE_ID}/shares`, {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req, { params: { noteId: NOTE_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });

    it('returns 400 when recipientSubs is not an array', async () => {
      const [req, ctx] = makePostRequest({ recipientSubs: 'not-an-array' });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('recipientSubs must be an array of strings.');
    });

    it('returns 400 when recipientSubs contains non-string entries', async () => {
      const [req, ctx] = makePostRequest({ recipientSubs: [1, 2, 3] });
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('recipientSubs must be an array of strings.');
    });
  });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe('GET /api/notes/[noteId]/shares', () => {
  describe('auth', () => {
    it('returns 401 when not authenticated', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('note lookup (owner check)', () => {
    it('returns 404 when getNote returns undefined', async () => {
      getNoteMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Note not found.');
    });
  });

  describe('success path', () => {
    it('returns only active shares (filters out revoked)', async () => {
      const activeShare = {
        ownerSub: OWNER_SUB,
        ownerName: 'Owner Name',
        recipientSub: RECIPIENT_1,
        noteId: NOTE_ID,
        noteTitle: 'My Note',
        groupId: GROUP_ID,
        sharedAt: '2026-01-01T00:00:00.000Z',
        // no revokedAt → active
      };
      const revokedShare = {
        ownerSub: OWNER_SUB,
        ownerName: 'Owner Name',
        recipientSub: RECIPIENT_2,
        noteId: NOTE_ID,
        noteTitle: 'My Note',
        groupId: GROUP_ID,
        sharedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: '2026-01-02T00:00:00.000Z', // revoked
      };

      listSharesForNoteMock.mockResolvedValueOnce([activeShare, revokedShare]);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      const shares = body.shares as Array<Record<string, unknown>>;
      expect(shares).toHaveLength(1);
      expect(shares[0].recipientSub).toBe(RECIPIENT_1);
      expect(shares[0].ownerName).toBe('Owner Name');
      expect(shares[0].noteTitle).toBe('My Note');
      expect(shares[0].groupId).toBe(GROUP_ID);
      expect(shares[0].sharedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns empty array when no active shares exist', async () => {
      listSharesForNoteMock.mockResolvedValueOnce([]);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.shares).toEqual([]);
    });

    it('calls listSharesForNote with owner sub and noteId', async () => {
      const [req, ctx] = makeGetRequest();
      await GET(req, ctx);

      expect(listSharesForNoteMock).toHaveBeenCalledWith(OWNER_SUB, NOTE_ID);
    });
  });
});
