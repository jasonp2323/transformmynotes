import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them.
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getActivityMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getActivity: getActivityMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn(function (input: unknown) { return { kind: 'GetObject', input }; }),
}));

// ---------------------------------------------------------------------------
// Fake timers — skip the real 800 ms poll interval so tests run instantly.
// ---------------------------------------------------------------------------
vi.useFakeTimers();

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const ACTIVITY_ID = '01JSTREAM0000000000000000';

/** Builds a minimal ActivityItem with an optional stream field. */
function makeActivityItem(streamField?: { s3Key: string; done: boolean }) {
  return {
    pk: `USER#${SUB}`,
    sk: `ACTIVITY#${ACTIVITY_ID}`,
    activityId: ACTIVITY_ID,
    kind: 'study' as const,
    refId: 'studyset-1',
    status: 'running' as const,
    phase: 'generating',
    phaseDetail: 'Generating',
    steps: [],
    title: 'My Study',
    ttl: 9999999999,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:01:00.000Z',
    ...(streamField !== undefined ? { stream: streamField } : {}),
  };
}

/** Builds a (Request, params) pair for the GET handler. */
function makeRequest(id = ACTIVITY_ID): [Request, { params: { id: string } }] {
  const controller = new AbortController();
  const req = new Request(`http://test/api/activity/${id}/stream`, {
    method: 'GET',
    signal: controller.signal,
  });
  return [req, { params: { id } }];
}

/**
 * Reads the response ReadableStream to completion and returns all concatenated
 * text.  Because the route's internal setTimeout is controlled by fake timers
 * we advance them while the stream drains so the poll loop runs without
 * actually waiting.
 */
async function drainStream(res: Response): Promise<string> {
  if (!res.body) return '';
  const decoder = new TextDecoder();
  let result = '';
  const reader = res.body.getReader();

  const pump = async (): Promise<void> => {
    const { value, done } = await reader.read();
    if (done) return;
    result += decoder.decode(value, { stream: true });
    return pump();
  };

  // Run the pump and the fake-timer advancement concurrently.
  await Promise.all([
    pump(),
    // Advance fake timers enough to tick through the poll loop.
    (async () => {
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
    })(),
  ]);

  return result;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getActivityMock.mockResolvedValue(makeActivityItem({ s3Key: `activity/${SUB}/${ACTIVITY_ID}.stream.txt`, done: false }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/activity/[id]/stream', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Unauthorized');
    });

    it('does not call getActivity when unauthenticated', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeRequest();
      await GET(req, ctx);

      expect(getActivityMock).not.toHaveBeenCalled();
    });
  });

  describe('activity lookup', () => {
    it('returns 404 when getActivity resolves undefined', async () => {
      getActivityMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe('Not found');
      expect(getActivityMock).toHaveBeenCalledWith(SUB, ACTIVITY_ID);
    });

    it('returns 404 when the activity has no stream field', async () => {
      // Activity with NO stream field (e.g. a TTS activity).
      getActivityMock.mockResolvedValueOnce(makeActivityItem(/* no stream */));

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe('Not found');
    });
  });

  describe('SSE happy path', () => {
    it('returns text/event-stream with buffered text and terminal done event', async () => {
      const s3Key = `activity/${SUB}/${ACTIVITY_ID}.stream.txt`;
      const bufferText = 'Hello, world! This is a streamed token.';

      // First getActivity call (initial fetch) → stream.done: false
      // Subsequent getActivity calls (periodic refetch) → stream.done: true
      getActivityMock
        .mockResolvedValueOnce(makeActivityItem({ s3Key, done: false }))
        .mockResolvedValue(makeActivityItem({ s3Key, done: true }));

      // S3 always returns the full buffer.
      s3SendMock.mockResolvedValue({
        Body: { transformToString: async () => bufferText },
      });

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
      expect(res.headers.get('Connection')).toBe('keep-alive');

      const body = await drainStream(res);

      // The buffer text must appear as a JSON-encoded data frame.
      expect(body).toContain(`data: ${JSON.stringify(bufferText)}\n\n`);

      // The terminal event must be present.
      expect(body).toContain('event: done\n');
      expect(body).toContain('data: "end"\n\n');
    });

    it('JSON-encodes the suffix so embedded newlines in tokens are safe', async () => {
      const s3Key = `activity/${SUB}/${ACTIVITY_ID}.stream.txt`;
      // Buffer contains a newline in the middle — must be JSON-escaped.
      const bufferText = 'line one\nline two';

      getActivityMock
        .mockResolvedValueOnce(makeActivityItem({ s3Key, done: false }))
        .mockResolvedValue(makeActivityItem({ s3Key, done: true }));

      s3SendMock.mockResolvedValue({
        Body: { transformToString: async () => bufferText },
      });

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);
      const body = await drainStream(res);

      // The raw newline must NOT appear bare inside a `data:` line value.
      // JSON.stringify('line one\nline two') === '"line one\\nline two"'
      expect(body).toContain(`data: ${JSON.stringify(bufferText)}\n\n`);
    });

    it('only emits new suffix bytes each iteration (no re-emitting already-sent text)', async () => {
      const s3Key = `activity/${SUB}/${ACTIVITY_ID}.stream.txt`;

      // Simulate growing buffer: first read → partial, second read → full.
      s3SendMock
        .mockResolvedValueOnce({ Body: { transformToString: async () => 'Hello' } })
        .mockResolvedValue({ Body: { transformToString: async () => 'Hello world' } });

      // First fetch → done: false; second → done: true
      getActivityMock
        .mockResolvedValueOnce(makeActivityItem({ s3Key, done: false }))
        .mockResolvedValue(makeActivityItem({ s3Key, done: true }));

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);
      const body = await drainStream(res);

      // First chunk emitted: 'Hello'
      expect(body).toContain(`data: ${JSON.stringify('Hello')}\n\n`);
      // Second chunk emitted: ' world' (suffix only)
      expect(body).toContain(`data: ${JSON.stringify(' world')}\n\n`);
      // The full string 'Hello world' must NOT appear as a single data frame.
      expect(body).not.toContain(`data: ${JSON.stringify('Hello world')}\n\n`);
    });

    it('skips a tick gracefully when S3 returns NoSuchKey', async () => {
      const s3Key = `activity/${SUB}/${ACTIVITY_ID}.stream.txt`;

      // First S3 read → NoSuchKey; second → content + done.
      const noSuchKeyErr = Object.assign(new Error('NoSuchKey'), { Code: 'NoSuchKey' });
      s3SendMock
        .mockRejectedValueOnce(noSuchKeyErr)
        .mockResolvedValue({ Body: { transformToString: async () => 'token' } });

      getActivityMock
        .mockResolvedValueOnce(makeActivityItem({ s3Key, done: false }))
        .mockResolvedValue(makeActivityItem({ s3Key, done: true }));

      const [req, ctx] = makeRequest();
      const res = await GET(req, ctx);
      const body = await drainStream(res);

      // Eventually the text and done event appear.
      expect(body).toContain(`data: ${JSON.stringify('token')}\n\n`);
      expect(body).toContain('event: done\n');
    });
  });
});
