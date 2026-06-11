import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listCardsDueMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listCardsDue: listCardsDueMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';

const CARD_1 = {
  cardId: 'card-01',
  sourceNoteId: 'note-01',
  front: 'What is osmosis?',
  back: 'Osmosis is the movement of water across a membrane.',
  ease: 2.5,
  interval: 1,
  dueAt: '2026-06-11T00:00:00.000Z',
  lastReviewedAt: undefined,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CARD_2 = {
  cardId: 'card-02',
  sourceNoteId: 'note-01',
  front: 'What is diffusion?',
  back: 'Diffusion is the movement of particles from high to low concentration.',
  ease: 2.5,
  interval: 1,
  dueAt: '2026-06-11T01:00:00.000Z',
  lastReviewedAt: undefined,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  listCardsDueMock.mockResolvedValue([CARD_1, CARD_2]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cards/due', () => {
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
    it('returns 200 with a cards array and total count', async () => {
      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(Array.isArray(body.cards)).toBe(true);
      expect(body.total).toBe(2);
    });

    it('maps cards to the public Card shape', async () => {
      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      const cards = body.cards as Array<Record<string, unknown>>;
      expect(cards).toHaveLength(2);

      const first = cards[0];
      expect(first.cardId).toBe(CARD_1.cardId);
      expect(first.sourceNoteId).toBe(CARD_1.sourceNoteId);
      expect(first.front).toBe(CARD_1.front);
      expect(first.back).toBe(CARD_1.back);
      expect(first.ease).toBe(CARD_1.ease);
      expect(first.interval).toBe(CARD_1.interval);
      expect(first.dueAt).toBe(CARD_1.dueAt);
      expect(first.createdAt).toBe(CARD_1.createdAt);
      expect(first.updatedAt).toBe(CARD_1.updatedAt);
      // Internal DynamoDB keys must not leak
      expect('pk' in first).toBe(false);
      expect('sk' in first).toBe(false);
    });

    it('caps the result at 20 cards', async () => {
      // Provide 25 cards from the mock
      const manyCards = Array.from({ length: 25 }, (_, i) => ({
        ...CARD_1,
        cardId: `card-${String(i).padStart(2, '0')}`,
      }));
      listCardsDueMock.mockResolvedValueOnce(manyCards);

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      const cards = body.cards as unknown[];
      expect(cards).toHaveLength(20);
      expect(body.total).toBe(20);
    });

    it('calls listCardsDue with the authenticated sub and a current ISO string', async () => {
      await GET();

      expect(listCardsDueMock).toHaveBeenCalledTimes(1);
      const [calledSub, calledIso] = listCardsDueMock.mock.calls[0] as [string, string];
      expect(calledSub).toBe(SUB);
      expect(typeof calledIso).toBe('string');
      expect(new Date(calledIso).getTime()).toBeGreaterThan(0);
    });

    it('returns an empty array when no cards are due', async () => {
      listCardsDueMock.mockResolvedValueOnce([]);

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.cards).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('error handling', () => {
    it('returns 500 when listCardsDue throws', async () => {
      listCardsDueMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const res = await GET();
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });
  });
});
