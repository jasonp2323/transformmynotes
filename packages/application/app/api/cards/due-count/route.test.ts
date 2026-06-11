import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const countCardsDueMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  countCardsDue: countCardsDueMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  countCardsDueMock.mockResolvedValue(5);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cards/due-count', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('success path', () => {
    it('returns 200 with a count field', async () => {
      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.count).toBe(5);
    });

    it('calls countCardsDue with the authenticated sub and a current ISO string', async () => {
      await GET();

      expect(countCardsDueMock).toHaveBeenCalledTimes(1);
      const [calledSub, calledIso] = countCardsDueMock.mock.calls[0] as [string, string];
      expect(calledSub).toBe(SUB);
      expect(typeof calledIso).toBe('string');
      expect(new Date(calledIso).getTime()).toBeGreaterThan(0);
    });

    it('sets Cache-Control header', async () => {
      const res = await GET();

      expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    });
  });

  describe('error handling', () => {
    it('returns 500 when countCardsDue throws', async () => {
      countCardsDueMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
