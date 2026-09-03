import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that reference them
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const assertUrlSafeMock = vi.hoisted(() => vi.fn());
const safeFetchMock = vi.hoisted(() => vi.fn());
const extractArticleMock = vi.hoisted(() => vi.fn());
const findSourceByUrlHashMock = vi.hoisted(() => vi.fn());
const hitSourceFetchWindowMock = vi.hoisted(() => vi.fn());
const hitSourceDailyCapMock = vi.hoisted(() => vi.fn());
const buildSourceItemMock = vi.hoisted(() => vi.fn(function (input: unknown) { return { ...(input as object) }; }));
const putSourceMock = vi.hoisted(() => vi.fn());
const markSourceReadyMock = vi.hoisted(() => vi.fn());
const markSourceFailedMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());

// Export a real UrlSafetyError class from the mock factory so instanceof works.
const { UrlSafetyErrorClass } = vi.hoisted(() => {
  class UrlSafetyErrorClass extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = 'UrlSafetyError';
      this.reason = reason;
    }
  }
  return { UrlSafetyErrorClass };
});

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(function (input) { return { __type: 'PutObject', input }; }),
}));

vi.mock('@transformmynotes/core', () => ({
  assertUrlSafe: assertUrlSafeMock,
  safeFetch: safeFetchMock,
  extractArticle: extractArticleMock,
  UrlSafetyError: UrlSafetyErrorClass,
  findSourceByUrlHash: findSourceByUrlHashMock,
  hitSourceFetchWindow: hitSourceFetchWindowMock,
  hitSourceDailyCap: hitSourceDailyCapMock,
  buildSourceItem: buildSourceItemMock,
  putSource: putSourceMock,
  markSourceReady: markSourceReadyMock,
  markSourceFailed: markSourceFailedMock,
  storageKeys: {
    sourceText: (sub: string, id: string) => `sources/users/${sub}/${id}.md`,
  },
  utcDateString: (now: number) => new Date(now).toISOString().slice(0, 10),
  nextMidnightUtcEpochSeconds: (now: number) => {
    const d = new Date(now);
    d.setUTCHours(24, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const VALID_URL = 'https://example.com/article';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/sources/from-url', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';
  // Disable rate limiting in tests by default so they're not affected by it.
  process.env['RATE_LIMIT_DISABLED'] = '1';

  getAuthenticatedSubMock.mockResolvedValue(SUB);
  assertUrlSafeMock.mockResolvedValue({ resolvedIp: '93.184.216.34' });
  safeFetchMock.mockResolvedValue({ body: '<html><body>article</body></html>', contentType: 'text/html' });
  extractArticleMock.mockReturnValue({ title: 'T', markdown: '# body', wordCount: 2 });
  findSourceByUrlHashMock.mockResolvedValue(undefined);
  hitSourceFetchWindowMock.mockResolvedValue({ count: 1 });
  hitSourceDailyCapMock.mockResolvedValue({ count: 1 });
  putSourceMock.mockResolvedValue(undefined);
  markSourceReadyMock.mockResolvedValue(undefined);
  markSourceFailedMock.mockResolvedValue(undefined);
  s3SendMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/sources/from-url', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(assertUrlSafeMock).not.toHaveBeenCalled();
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when url is missing from body', async () => {
    const res = await POST(makeRequest({}));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request body.');
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when url exceeds 2048 chars', async () => {
    const res = await POST(makeRequest({ url: 'https://example.com/' + 'a'.repeat(2048) }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request body.');
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/sources/from-url', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request body.');
  });

  it('returns 400 when assertUrlSafe throws UrlSafetyError', async () => {
    assertUrlSafeMock.mockRejectedValueOnce(
      new UrlSafetyErrorClass('loopback-ip', 'loopback blocked'),
    );

    const res = await POST(makeRequest({ url: 'http://127.0.0.1/' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('blocked_url');
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('happy path: returns 200 with sourceId and status ready, calls S3 PutObject and markSourceReady', async () => {
    // Rate limiting disabled in this test via RATE_LIMIT_DISABLED=1
    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(typeof body.sourceId).toBe('string');
    expect(body.status).toBe('ready');
    expect(body.title).toBe('T');
    expect(body.deduplicated).toBeUndefined();

    // S3 PutObject should have been called with the text key.
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const putObjectCall = s3SendMock.mock.calls[0]?.[0] as { __type: string; input: Record<string, unknown> };
    expect(putObjectCall.__type).toBe('PutObject');
    expect(typeof putObjectCall.input.Key).toBe('string');
    expect((putObjectCall.input.Key as string).endsWith('.md')).toBe(true);

    // markSourceReady called with correct title.
    expect(markSourceReadyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'T', wordCount: 2 }),
    );
  });

  it('dedup: returns 200 with deduplicated:true when an existing ready source is found', async () => {
    findSourceByUrlHashMock.mockResolvedValueOnce({ sourceId: 'existing-id', status: 'ready', title: 'Existing' });

    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.sourceId).toBe('existing-id');
    expect(body.title).toBe('Existing');
    expect(body.deduplicated).toBe(true);
    // safeFetch must NOT be called for deduplicated responses.
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('429 window: returns 429 with Retry-After when window count exceeds 10', async () => {
    // Enable rate limiting for this test.
    delete process.env['RATE_LIMIT_DISABLED'];
    hitSourceFetchWindowMock.mockResolvedValueOnce({ count: 11 });

    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(429);
    expect(body.error).toBe('Rate limit exceeded.');
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(safeFetchMock).not.toHaveBeenCalled();

    // Restore.
    process.env['RATE_LIMIT_DISABLED'] = '1';
  });

  it('429 daily: returns 429 with Retry-After when daily count exceeds 50', async () => {
    // Enable rate limiting for this test.
    delete process.env['RATE_LIMIT_DISABLED'];
    hitSourceFetchWindowMock.mockResolvedValueOnce({ count: 1 });
    hitSourceDailyCapMock.mockResolvedValueOnce({ count: 51 });

    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(429);
    expect(body.error).toBe('Rate limit exceeded.');
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(safeFetchMock).not.toHaveBeenCalled();

    // Restore.
    process.env['RATE_LIMIT_DISABLED'] = '1';
  });

  it('500 path: returns 500 and calls markSourceFailed when safeFetch rejects', async () => {
    safeFetchMock.mockRejectedValueOnce(new Error('Network failure'));

    const res = await POST(makeRequest({ url: VALID_URL }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('Something went wrong.');
    expect(markSourceFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Network failure') }),
    );
  });
});
