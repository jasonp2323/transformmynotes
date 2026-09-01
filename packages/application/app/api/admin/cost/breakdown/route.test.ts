import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const aggregateUsageOverRangeMock = vi.hoisted(() => vi.fn());
const getPriceBookMock = vi.hoisted(() => vi.fn());
const listUserProfilesByStatusMock = vi.hoisted(() => vi.fn());
const getGroupMock = vi.hoisted(() => vi.fn());
const reduceByModelMock = vi.hoisted(() => vi.fn());
const reduceByFeatureMock = vi.hoisted(() => vi.fn());
const reduceByGroupMock = vi.hoisted(() => vi.fn());
const parseDateRangeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  aggregateUsageOverRange: aggregateUsageOverRangeMock,
  getPriceBook: getPriceBookMock,
  listUserProfilesByStatus: listUserProfilesByStatusMock,
  getGroup: getGroupMock,
  reduceByModel: reduceByModelMock,
  reduceByFeature: reduceByFeatureMock,
  reduceByGroup: reduceByGroupMock,
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

const MODEL_ROWS = [{ key: 'model-a', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];
const FEATURE_ROWS = [{ key: 'flashcards', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];
const GROUP_ROWS = [{ key: 'group-1', inputTokens: 1000, outputTokens: 500, calls: 2, usd: 0.01, unpriced: 0 }];

const VALID_RANGE = {
  ok: true,
  from: '2026-01-01',
  to: '2026-01-30',
  days: Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  getAdminApiUserMock.mockResolvedValue(ADMIN);
  parseDateRangeMock.mockReturnValue(VALID_RANGE);
  aggregateUsageOverRangeMock.mockResolvedValue({ aiAggs: AI_AGGS, storageAggs: [] });
  getPriceBookMock.mockResolvedValue(PRICE_BOOK);
  listUserProfilesByStatusMock.mockResolvedValue([
    { sub: 'user-1', email: 'u1@example.com', name: 'User One', status: 'active', role: 'user', groupIds: ['group-1'] },
  ]);
  getGroupMock.mockResolvedValue({ groupId: 'group-1', name: 'Group One' });
  reduceByModelMock.mockReturnValue(MODEL_ROWS);
  reduceByFeatureMock.mockReturnValue(FEATURE_ROWS);
  reduceByGroupMock.mockReturnValue(GROUP_ROWS);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/cost/breakdown', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/admin/cost/breakdown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 when unknown dimension is provided', async () => {
    const req = new Request('http://localhost/api/admin/cost/breakdown?dimension=unknown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('unknown');
  });

  it('returns 400 when date range is invalid', async () => {
    parseDateRangeMock.mockReturnValueOnce({ ok: false, error: 'Date range exceeds maximum' });

    const req = new Request('http://localhost/api/admin/cost/breakdown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('returns model breakdown by default (no dimension param)', async () => {
    const req = new Request('http://localhost/api/admin/cost/breakdown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dimension).toBe('model');
    expect(body.rows).toEqual(MODEL_ROWS);
    expect(reduceByModelMock).toHaveBeenCalledTimes(1);
  });

  it('returns feature breakdown when dimension=feature', async () => {
    const req = new Request('http://localhost/api/admin/cost/breakdown?dimension=feature');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.dimension).toBe('feature');
    expect(body.rows).toEqual(FEATURE_ROWS);
    expect(reduceByFeatureMock).toHaveBeenCalledTimes(1);
  });

  it('returns group breakdown with resolved names when dimension=group', async () => {
    const req = new Request('http://localhost/api/admin/cost/breakdown?dimension=group');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.dimension).toBe('group');
    const rows = body.rows as Array<Record<string, unknown>>;
    expect(rows[0].key).toBe('group-1');
    expect(rows[0].name).toBe('Group One');
  });

  it('includes range shape in response', async () => {
    const req = new Request('http://localhost/api/admin/cost/breakdown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    const range = body.range as Record<string, unknown>;
    expect(range.from).toBe('2026-01-01');
    expect(range.to).toBe('2026-01-30');
    expect(range.days).toBe(30);
  });

  it('returns 500 when aggregateUsageOverRange throws', async () => {
    aggregateUsageOverRangeMock.mockRejectedValueOnce(new Error('DB down'));

    const req = new Request('http://localhost/api/admin/cost/breakdown');
    const res = await GET(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
