import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const aggregateUsageOverRangeMock = vi.hoisted(() => vi.fn());
const getPriceBookItemMock = vi.hoisted(() => vi.fn());
const listUserProfilesByStatusMock = vi.hoisted(() => vi.fn());
const getGroupMock = vi.hoisted(() => vi.fn());
const reduceByModelMock = vi.hoisted(() => vi.fn());
const reduceByFeatureMock = vi.hoisted(() => vi.fn());
const reduceByGroupMock = vi.hoisted(() => vi.fn());
const totalCostMock = vi.hoisted(() => vi.fn());
const totalStorageCostMock = vi.hoisted(() => vi.fn());
const buildDailyTrendMock = vi.hoisted(() => vi.fn());
const parseDateRangeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  aggregateUsageOverRange: aggregateUsageOverRangeMock,
  getPriceBookItem: getPriceBookItemMock,
  listUserProfilesByStatus: listUserProfilesByStatusMock,
  getGroup: getGroupMock,
  reduceByModel: reduceByModelMock,
  reduceByFeature: reduceByFeatureMock,
  reduceByGroup: reduceByGroupMock,
  totalCost: totalCostMock,
  totalStorageCost: totalStorageCostMock,
  buildDailyTrend: buildDailyTrendMock,
  parseDateRange: parseDateRangeMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-1', claims: {} };

const PRICE_BOOK = {
  models: { 'model-a': { inputPer1k: 0.003, outputPer1k: 0.015 } },
  defaultModel: { inputPer1k: 0.001, outputPer1k: 0.002 },
  s3PerGbMonth: 0.023,
};

const PRICE_BOOK_ITEM = {
  priceBook: PRICE_BOOK,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'admin-1',
  seeded: false,
};

const AI_AGGS = [
  {
    sub: 'user-1',
    day: '2026-01-01',
    feature: 'flashcards',
    model: 'model-a',
    inputTokens: 1000,
    outputTokens: 500,
    calls: 2,
  },
];

const STORAGE_AGGS = [
  { sub: 'user-1', day: '2026-01-01', byteDayBytes: 1024 },
];

const AI_TOTALS = { inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 };
const STORAGE_TOTALS = { avgBytes: 1024, gbMonths: 0.00001, usd: 0.001, users: 1 };
const MODEL_ROWS = [{ key: 'model-a', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];
const FEATURE_ROWS = [{ key: 'flashcards', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];
const GROUP_ROWS = [{ key: 'group-1', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];
const TREND = [{ day: '2026-01-01', aiUsd: 0.01, storageUsd: 0.001, usd: 0.011, inputTokens: 1000, outputTokens: 500, calls: 2, bytes: 1024 }];

const VALID_RANGE = { ok: true, from: '2026-01-01', to: '2026-01-30', days: Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`) };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  getAdminApiUserMock.mockResolvedValue(ADMIN);
  parseDateRangeMock.mockReturnValue(VALID_RANGE);
  aggregateUsageOverRangeMock.mockResolvedValue({ aiAggs: AI_AGGS, storageAggs: STORAGE_AGGS });
  getPriceBookItemMock.mockResolvedValue(PRICE_BOOK_ITEM);
  listUserProfilesByStatusMock.mockResolvedValue([
    { sub: 'user-1', email: 'u1@example.com', name: 'User One', status: 'active', role: 'user', groupIds: ['group-1'] },
  ]);
  getGroupMock.mockResolvedValue({ groupId: 'group-1', name: 'Group One' });
  reduceByModelMock.mockReturnValue(MODEL_ROWS);
  reduceByFeatureMock.mockReturnValue(FEATURE_ROWS);
  reduceByGroupMock.mockReturnValue(GROUP_ROWS);
  totalCostMock.mockReturnValue(AI_TOTALS);
  totalStorageCostMock.mockReturnValue(STORAGE_TOTALS);
  buildDailyTrendMock.mockReturnValue(TREND);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/cost/summary', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/admin/cost/summary');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 when date range is invalid', async () => {
    parseDateRangeMock.mockReturnValueOnce({ ok: false, error: 'Invalid date range' });

    const req = new Request('http://localhost/api/admin/cost/summary?from=bad');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid date range');
  });

  it('returns shaped summary payload on happy path', async () => {
    const req = new Request('http://localhost/api/admin/cost/summary');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const range = body.range as Record<string, unknown>;
    expect(range.from).toBe('2026-01-01');
    expect(range.to).toBe('2026-01-30');
    expect(range.days).toBe(30);

    const totals = body.totals as Record<string, unknown>;
    expect(totals.ai).toEqual(AI_TOTALS);
    expect(totals.storage).toEqual(STORAGE_TOTALS);
    expect(totals.usd).toBeCloseTo(AI_TOTALS.usd + STORAGE_TOTALS.usd);

    expect(body.byModel).toEqual(MODEL_ROWS);
    expect(body.byFeature).toEqual(FEATURE_ROWS);

    // byGroup should include resolved names
    const byGroup = body.byGroup as Array<Record<string, unknown>>;
    expect(byGroup[0].name).toBe('Group One');

    expect(body.trend).toEqual(TREND);
    expect(body.unpricedModels).toEqual([]); // model-a is in pb.models
    expect(body.priceUpdatedAt).toBe(PRICE_BOOK_ITEM.updatedAt);
  });

  it('priceUpdatedAt is null when seeded=true', async () => {
    getPriceBookItemMock.mockResolvedValueOnce({ ...PRICE_BOOK_ITEM, seeded: true });

    const req = new Request('http://localhost/api/admin/cost/summary');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.priceUpdatedAt).toBeNull();
  });

  it('unpricedModels lists models not in priceBook', async () => {
    aggregateUsageOverRangeMock.mockResolvedValueOnce({
      aiAggs: [{ ...AI_AGGS[0], model: 'unknown-model' }],
      storageAggs: STORAGE_AGGS,
    });

    const req = new Request('http://localhost/api/admin/cost/summary');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.unpricedModels).toContain('unknown-model');
  });

  it('returns 500 when aggregateUsageOverRange throws', async () => {
    aggregateUsageOverRangeMock.mockRejectedValueOnce(new Error('DB error'));

    const req = new Request('http://localhost/api/admin/cost/summary');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
