import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listInFlightActivitiesMock = vi.hoisted(() => vi.fn());
const listActivitiesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

// toSummary is the real pure mapper; only the DB access functions are stubbed.
vi.mock('@transformmynotes/core', () => ({
  listInFlightActivities: listInFlightActivitiesMock,
  listActivities: listActivitiesMock,
  toSummary: (item: Record<string, unknown>) => ({
    activityId: item.activityId,
    kind: item.kind,
    status: item.status,
    phase: item.phase,
    phaseDetail: item.phaseDetail,
    progress: item.progress,
    title: item.title,
    updatedAt: item.updatedAt,
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures — full ActivityItems (with keys + steps) to prove the route maps
// them down to the summary subset.
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';

const RUNNING_ITEM = {
  pk: 'USER#user-sub-1',
  sk: 'ACTIVITY#01JRUNNING0000000000000000',
  activityId: '01JRUNNING0000000000000000',
  kind: 'study' as const,
  refId: 'studyset-1',
  status: 'running' as const,
  phase: 'generating',
  phaseDetail: 'Generating questions',
  progress: { current: 2, total: 5 },
  steps: [{ phase: 'queued', detail: 'Queued', at: '2026-06-20T10:00:00.000Z' }],
  title: 'My Study Set',
  ttl: 9999999999,
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-06-20T10:01:00.000Z',
};

const READY_ITEM = {
  pk: 'USER#user-sub-1',
  sk: 'ACTIVITY#01JREADY00000000000000000',
  activityId: '01JREADY00000000000000000',
  kind: 'tts' as const,
  refId: 'note-1',
  status: 'ready' as const,
  phase: 'done',
  phaseDetail: 'Audio ready',
  steps: [{ phase: 'queued', detail: 'Queued', at: '2026-06-20T09:00:00.000Z' }],
  title: 'My Note Audio',
  ttl: 9999999999,
  createdAt: '2026-06-20T09:00:00.000Z',
  updatedAt: '2026-06-20T09:05:00.000Z',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  listInFlightActivitiesMock.mockResolvedValue([RUNNING_ITEM]);
  listActivitiesMock.mockResolvedValue([RUNNING_ITEM, READY_ITEM]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/activity', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('does not call the data functions when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    await GET();

    expect(listInFlightActivitiesMock).not.toHaveBeenCalled();
    expect(listActivitiesMock).not.toHaveBeenCalled();
  });

  it('returns ok:true with inFlight + recent summaries', async () => {
    const res = await GET();
    const body = (await res.json()) as {
      ok: boolean;
      inFlight: Record<string, unknown>[];
      recent: Record<string, unknown>[];
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.inFlight).toHaveLength(1);
    expect(body.recent).toHaveLength(2);

    expect(listInFlightActivitiesMock).toHaveBeenCalledWith(SUB);
    expect(listActivitiesMock).toHaveBeenCalledWith(SUB, 25);
  });

  it('maps items to the summary subset (no steps/refId/keys)', async () => {
    const res = await GET();
    const body = (await res.json()) as {
      inFlight: Record<string, unknown>[];
      recent: Record<string, unknown>[];
    };

    const summary = body.inFlight[0];
    expect(summary.activityId).toBe('01JRUNNING0000000000000000');
    expect(summary.kind).toBe('study');
    expect(summary.status).toBe('running');
    expect(summary.phase).toBe('generating');
    expect(summary.phaseDetail).toBe('Generating questions');
    expect(summary.progress).toEqual({ current: 2, total: 5 });
    expect(summary.title).toBe('My Study Set');
    expect(summary.updatedAt).toBe('2026-06-20T10:01:00.000Z');

    // Summary must NOT carry detail/internal fields.
    expect(summary).not.toHaveProperty('steps');
    expect(summary).not.toHaveProperty('refId');
    expect(summary).not.toHaveProperty('pk');
    expect(summary).not.toHaveProperty('sk');
    expect(summary).not.toHaveProperty('createdAt');
  });

  it('returns empty arrays when the user has no activities', async () => {
    listInFlightActivitiesMock.mockResolvedValueOnce([]);
    listActivitiesMock.mockResolvedValueOnce([]);

    const res = await GET();
    const body = (await res.json()) as { ok: boolean; inFlight: unknown[]; recent: unknown[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.inFlight).toEqual([]);
    expect(body.recent).toEqual([]);
  });

  it('returns 500 when a data function throws', async () => {
    listActivitiesMock.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Could not load activity.');
  });

  it('calls console.error on DB failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listInFlightActivitiesMock.mockRejectedValueOnce(new Error('timeout'));

    await GET();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
