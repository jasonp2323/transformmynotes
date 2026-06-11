import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listSharesForRecipientMock = vi.hoisted(() => vi.fn());
const getGroupMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listSharesForRecipient: listSharesForRecipientMock,
  getGroup: getGroupMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'recipient-sub-1';

const SHARE_ITEM_1 = {
  pk: 'USER#owner-sub-1',
  sk: 'SHARE#note-1#RECIPIENT#recipient-sub-1',
  gsi4pk: 'USER#recipient-sub-1',
  gsi4sk: 'SHARED_AT#2026-06-01T10:00:00.000Z',
  ownerSub: 'owner-sub-1',
  ownerName: 'Alice Owner',
  recipientSub: 'recipient-sub-1',
  noteId: 'note-1',
  noteTitle: 'My Shared Note',
  groupId: 'group-abc',
  permission: 'read' as const,
  sharedAt: '2026-06-01T10:00:00.000Z',
};

const SHARE_ITEM_2 = {
  pk: 'USER#owner-sub-2',
  sk: 'SHARE#note-2#RECIPIENT#recipient-sub-1',
  gsi4pk: 'USER#recipient-sub-1',
  gsi4sk: 'SHARED_AT#2026-06-02T12:00:00.000Z',
  ownerSub: 'owner-sub-2',
  ownerName: 'Bob Owner',
  recipientSub: 'recipient-sub-1',
  noteId: 'note-2',
  noteTitle: 'Another Shared Note',
  groupId: 'group-xyz',
  permission: 'read' as const,
  sharedAt: '2026-06-02T12:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  listSharesForRecipientMock.mockResolvedValue([SHARE_ITEM_1, SHARE_ITEM_2]);
  getGroupMock.mockImplementation(async (gid: string) =>
    gid === 'group-abc' ? { groupId: gid, name: 'Spanish 201' } :
    gid === 'group-xyz' ? { groupId: gid, name: 'History 101' } :
    undefined,
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/shared', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const req = new Request('http://localhost/api/shared', { method: 'GET' });
      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('does not call listSharesForRecipient when unauthenticated', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      await GET();

      expect(listSharesForRecipientMock).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('returns mapped SharedNoteSummary[] with ok:true', async () => {
      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.notes).toHaveLength(2);
    });

    it('maps all required projected fields including ownerSub', async () => {
      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      const first = body.notes[0];
      expect(first.noteId).toBe('note-1');
      expect(first.noteTitle).toBe('My Shared Note');
      expect(first.ownerSub).toBe('owner-sub-1');
      expect(first.ownerName).toBe('Alice Owner');
      expect(first.groupId).toBe('group-abc');
      expect(first.groupName).toBe('Spanish 201');
      expect(first.sharedAt).toBe('2026-06-01T10:00:00.000Z');
    });

    it('does not expose internal DynamoDB keys (pk, sk, gsi4pk, gsi4sk)', async () => {
      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      const first = body.notes[0];
      expect(first.pk).toBeUndefined();
      expect(first.sk).toBeUndefined();
      expect(first.gsi4pk).toBeUndefined();
      expect(first.gsi4sk).toBeUndefined();
    });

    it('does not expose permission or recipientSub fields', async () => {
      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      const first = body.notes[0];
      expect(first.permission).toBeUndefined();
      expect(first.recipientSub).toBeUndefined();
    });

    it('sets Cache-Control: private, max-age=30 header', async () => {
      const res = await GET();

      expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    });

    it('calls listSharesForRecipient with the authenticated sub', async () => {
      await GET();

      expect(listSharesForRecipientMock).toHaveBeenCalledWith(SUB);
      expect(listSharesForRecipientMock).toHaveBeenCalledTimes(1);
    });

    it('preserves ordering returned by listSharesForRecipient', async () => {
      // The route must pass through whatever the mock returns in order.
      listSharesForRecipientMock.mockResolvedValueOnce([SHARE_ITEM_2, SHARE_ITEM_1]);

      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      expect(body.notes[0].noteId).toBe('note-2');
      expect(body.notes[1].noteId).toBe('note-1');
    });

    it('falls back to empty groupName when getGroup returns undefined', async () => {
      getGroupMock.mockResolvedValue(undefined);

      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: Record<string, unknown>[] };

      expect(body.notes[0].groupName).toBe('');
      expect(body.notes[1].groupName).toBe('');
    });
  });

  describe('empty result', () => {
    it('returns { ok: true, notes: [] } when recipient has no shares', async () => {
      listSharesForRecipientMock.mockResolvedValueOnce([]);

      const res = await GET();
      const body = await res.json() as { ok: boolean; notes: unknown[] };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.notes).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('returns 500 when listSharesForRecipient throws', async () => {
      listSharesForRecipientMock.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not fetch shared notes.');
    });

    it('calls console.error on DB failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      listSharesForRecipientMock.mockRejectedValueOnce(new Error('timeout'));

      await GET();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });
});
