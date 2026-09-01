import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getActivityMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

// toDetail is the real pure mapper; only the DB access function is stubbed.
vi.mock('@transformmynotes/core', () => ({
  getActivity: getActivityMock,
  toDetail: (item: Record<string, unknown>) => ({
    activityId: item.activityId,
    kind: item.kind,
    status: item.status,
    phase: item.phase,
    phaseDetail: item.phaseDetail,
    progress: item.progress,
    title: item.title,
    updatedAt: item.updatedAt,
    steps: item.steps,
    stream: item.stream,
    error: item.error,
    refId: item.refId,
    createdAt: item.createdAt,
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Helpers + fixtures
// ---------------------------------------------------------------------------

function makeRequest(id: string): [Request, { params: { id: string } }] {
  return [
    new Request(`http://test/api/activity/${id}`, { method: 'GET' }),
    { params: { id } },
  ];
}

const SUB = 'user-sub-1';

const MOCK_ACTIVITY_ITEM = {
  pk: 'USER#user-sub-1',
  sk: 'ACTIVITY#01JACTIVITY000000000000000',
  activityId: '01JACTIVITY000000000000000',
  kind: 'study' as const,
  refId: 'studyset-1',
  status: 'running' as const,
  phase: 'generating',
  phaseDetail: 'Generating questions',
  progress: { current: 2, total: 5 },
  steps: [
    { phase: 'queued', detail: 'Queued', at: '2026-06-20T10:00:00.000Z' },
    { phase: 'generating', detail: 'Generating questions', at: '2026-06-20T10:01:00.000Z' },
  ],
  title: 'My Study Set',
  ttl: 9999999999,
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-06-20T10:01:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getActivityMock.mockResolvedValue(MOCK_ACTIVITY_ITEM);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/activity/[id]', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('01JACTIVITY000000000000000');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('does not call getActivity when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('01JACTIVITY000000000000000');
    await GET(req, ctx);

    expect(getActivityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when getActivity resolves undefined', async () => {
    getActivityMock.mockResolvedValueOnce(undefined);

    const [req, ctx] = makeRequest('missing-id');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Not found');
    expect(getActivityMock).toHaveBeenCalledWith(SUB, 'missing-id');
  });

  it('returns ok:true with the detail shape (incl. steps) on success', async () => {
    const [req, ctx] = makeRequest('01JACTIVITY000000000000000');
    const res = await GET(req, ctx);
    const body = (await res.json()) as { ok: boolean; activity: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const a = body.activity;
    expect(a.activityId).toBe('01JACTIVITY000000000000000');
    expect(a.kind).toBe('study');
    expect(a.status).toBe('running');
    expect(a.phase).toBe('generating');
    expect(a.phaseDetail).toBe('Generating questions');
    expect(a.progress).toEqual({ current: 2, total: 5 });
    expect(a.title).toBe('My Study Set');
    expect(a.updatedAt).toBe('2026-06-20T10:01:00.000Z');

    // Detail-only fields must be present.
    expect(a.steps).toHaveLength(2);
    expect(a.refId).toBe('studyset-1');
    expect(a.createdAt).toBe('2026-06-20T10:00:00.000Z');

    // Internal DynamoDB keys must NOT leak.
    expect(a).not.toHaveProperty('pk');
    expect(a).not.toHaveProperty('sk');
    expect(a).not.toHaveProperty('ttl');

    expect(getActivityMock).toHaveBeenCalledWith(SUB, '01JACTIVITY000000000000000');
  });

  it('returns 500 when getActivity throws', async () => {
    getActivityMock.mockRejectedValueOnce(new Error('DynamoDB error'));

    const [req, ctx] = makeRequest('01JACTIVITY000000000000000');
    const res = await GET(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Could not load activity.');
  });

  it('calls console.error on DB failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getActivityMock.mockRejectedValueOnce(new Error('timeout'));

    const [req, ctx] = makeRequest('01JACTIVITY000000000000000');
    await GET(req, ctx);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
