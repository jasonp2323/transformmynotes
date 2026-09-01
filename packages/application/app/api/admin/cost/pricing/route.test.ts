import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const getPriceBookItemMock = vi.hoisted(() => vi.fn());
const putPriceBookMock = vi.hoisted(() => vi.fn());
const validatePriceBookInputMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getPriceBookItem: getPriceBookItemMock,
  putPriceBook: putPriceBookMock,
  validatePriceBookInput: validatePriceBookInputMock,
  DEFAULT_PRICE_BOOK: {
    models: {},
    defaultModel: { inputPer1k: 0.001, outputPer1k: 0.002 },
    s3PerGbMonth: 0.023,
  },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET, PUT } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-1', claims: {} };

const PRICE_BOOK = {
  models: { 'claude-3-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 } },
  defaultModel: { inputPer1k: 0.001, outputPer1k: 0.002 },
  s3PerGbMonth: 0.023,
};

const PRICE_BOOK_ITEM = {
  priceBook: PRICE_BOOK,
  updatedAt: '2026-01-15T10:00:00.000Z',
  updatedBy: 'admin-1',
  seeded: false,
};

function putReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/cost/pricing', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  getAdminApiUserMock.mockResolvedValue(ADMIN);
  getPriceBookItemMock.mockResolvedValue(PRICE_BOOK_ITEM);
  putPriceBookMock.mockResolvedValue(undefined);
  validatePriceBookInputMock.mockReturnValue({ ok: true, value: PRICE_BOOK });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/cost/pricing', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('returns price book with metadata on happy path', async () => {
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.priceBook).toEqual(PRICE_BOOK);
    expect(body.updatedAt).toBe(PRICE_BOOK_ITEM.updatedAt);
    expect(body.updatedBy).toBe(PRICE_BOOK_ITEM.updatedBy);
    expect(body.seeded).toBe(false);
    expect(body.defaults).toBeTruthy();
  });

  it('returns 500 when getPriceBookItem throws', async () => {
    getPriceBookItemMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/admin/cost/pricing', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await PUT(putReq(PRICE_BOOK));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
    expect(putPriceBookMock).not.toHaveBeenCalled();
  });

  it('returns 400 when validatePriceBookInput fails', async () => {
    validatePriceBookInputMock.mockReturnValueOnce({ ok: false, error: 'models must be an object' });

    const res = await PUT(putReq({ invalid: true }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('models must be an object');
    expect(putPriceBookMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not valid JSON', async () => {
    validatePriceBookInputMock.mockReturnValueOnce({ ok: false, error: 'Invalid input' });

    const req = new Request('http://localhost/api/admin/cost/pricing', {
      method: 'PUT',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });

    // validatePriceBookInput receives null when JSON.parse fails
    const res = await PUT(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('calls putPriceBook with priceBook and admin.sub on valid input', async () => {
    const res = await PUT(putReq(PRICE_BOOK));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(putPriceBookMock).toHaveBeenCalledTimes(1);
    expect(putPriceBookMock).toHaveBeenCalledWith(PRICE_BOOK, ADMIN.sub);
  });

  it('returns 500 when putPriceBook throws', async () => {
    putPriceBookMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await PUT(putReq(PRICE_BOOK));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
