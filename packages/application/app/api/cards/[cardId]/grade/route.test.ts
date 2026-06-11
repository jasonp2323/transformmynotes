import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getCardMock = vi.hoisted(() => vi.fn());
const scheduleMock = vi.hoisted(() => vi.fn());
const recordCardReviewMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getCard: getCardMock,
  schedule: scheduleMock,
  recordCardReview: recordCardReviewMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { PATCH } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const CARD_ID = 'card-01';

function buildFakeCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pk: `USER#${SUB}`,
    sk: `CARD#${CARD_ID}`,
    gsi5pk: `USER#${SUB}`,
    gsi5sk: 'DUE#2026-06-11',
    cardId: CARD_ID,
    sourceNoteId: 'note-01',
    front: 'What is the capital of France?',
    back: 'Paris',
    ease: 2.5,
    interval: 1,
    dueAt: '2026-06-11T00:00:00.000Z',
    lastReviewedAt: undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRequest(grade: unknown) {
  return new Request(`http://test/api/cards/${CARD_ID}/grade`, {
    method: 'PATCH',
    body: JSON.stringify({ grade }),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getCardMock.mockResolvedValue(buildFakeCard());
  scheduleMock.mockReturnValue({
    ease: 2.6,
    interval: 6,
    dueAt: '2026-07-01T00:00:00.000Z',
    lastReviewedAt: '2026-06-11T00:00:00.000Z',
  });
  recordCardReviewMock.mockResolvedValue({
    pk: `USER#${SUB}`,
    sk: `CARD#${CARD_ID}`,
    cardId: CARD_ID,
    sourceNoteId: 'note-01',
    front: 'What is the capital of France?',
    back: 'Paris',
    ease: 2.6,
    interval: 6,
    dueAt: '2026-07-01T00:00:00.000Z',
    lastReviewedAt: '2026-06-11T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/cards/[cardId]/grade', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const req = makeRequest(3);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('grade validation', () => {
    it('returns 400 when grade is missing', async () => {
      const req = makeRequest(undefined);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('grade must be an integer between 0 and 5.');
    });

    it('returns 400 when grade is not a number', async () => {
      const req = makeRequest('not-a-number');
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('grade must be an integer between 0 and 5.');
    });

    it('returns 400 when grade is not an integer', async () => {
      const req = makeRequest(2.5);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('grade must be an integer between 0 and 5.');
    });

    it('returns 400 when grade is below 0', async () => {
      const req = makeRequest(-1);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('grade must be an integer between 0 and 5.');
    });

    it('returns 400 when grade is above 5', async () => {
      const req = makeRequest(6);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('grade must be an integer between 0 and 5.');
    });

    it('accepts grade 0 as valid', async () => {
      const req = makeRequest(0);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });

      expect(res.status).toBe(200);
    });

    it('accepts grade 5 as valid', async () => {
      const req = makeRequest(5);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });

      expect(res.status).toBe(200);
    });
  });

  describe('request body validation', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const req = new Request(`http://test/api/cards/${CARD_ID}/grade`, {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });
  });

  describe('card lookup', () => {
    it('returns 404 when getCard returns undefined', async () => {
      getCardMock.mockResolvedValueOnce(undefined);

      const req = makeRequest(3);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Card not found.');
    });

    it('calls getCard with the authenticated sub and cardId', async () => {
      const req = makeRequest(3);
      await PATCH(req, { params: { cardId: CARD_ID } });

      expect(getCardMock).toHaveBeenCalledWith(SUB, CARD_ID);
    });
  });

  describe('success path', () => {
    it('returns 200 with updated scheduling fields', async () => {
      const req = makeRequest(4);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ease).toBe(2.6);
      expect(body.interval).toBe(6);
      expect(body.dueAt).toBe('2026-07-01T00:00:00.000Z');
      expect(body.lastReviewedAt).toBe('2026-06-11T00:00:00.000Z');
    });

    it('calls schedule with the card state and grade', async () => {
      const req = makeRequest(4);
      await PATCH(req, { params: { cardId: CARD_ID } });

      expect(scheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ease: 2.5,
          interval: 1,
          dueAt: '2026-06-11T00:00:00.000Z',
        }),
        4,
      );
    });

    it('calls recordCardReview with sub, cardId, and the schedule result', async () => {
      const req = makeRequest(3);
      await PATCH(req, { params: { cardId: CARD_ID } });

      expect(recordCardReviewMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: SUB,
          cardId: CARD_ID,
          result: expect.objectContaining({
            ease: 2.6,
            interval: 6,
            dueAt: '2026-07-01T00:00:00.000Z',
            lastReviewedAt: '2026-06-11T00:00:00.000Z',
          }),
        }),
      );
    });

    it('returns only the public scheduling fields (excludes pk/sk)', async () => {
      const req = makeRequest(4);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect('pk' in body).toBe(false);
      expect('sk' in body).toBe(false);
      expect('cardId' in body).toBe(false);
      expect('sourceNoteId' in body).toBe(false);
      expect('front' in body).toBe(false);
      expect('back' in body).toBe(false);
      expect('createdAt' in body).toBe(false);
      expect('updatedAt' in body).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns 500 when getCard throws', async () => {
      getCardMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const req = makeRequest(3);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not record review.');
    });

    it('returns 500 when recordCardReview throws', async () => {
      recordCardReviewMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const req = makeRequest(3);
      const res = await PATCH(req, { params: { cardId: CARD_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not record review.');
    });
  });
});
