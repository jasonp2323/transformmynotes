import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const ddbSendMock = vi.hoisted(() => vi.fn());
const synthesizeSpeechMock = vi.hoisted(() => vi.fn());
const resolveAiConfigMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());
const getSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

// Tagged lib-dynamodb command factories so the ddb mock can branch on type.
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  GetCommand: vi.fn(function (input) { return { __type: 'Get', input }; }),
  PutCommand: vi.fn(function (input) { return { __type: 'Put', input }; }),
  QueryCommand: vi.fn(function (input) { return { __type: 'Query', input }; }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(function (input) { return { __type: 'PutObject', input }; }),
  GetObjectCommand: vi.fn(function (input) { return { __type: 'GetObject', input }; }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock('@transformmynotes/core', () => ({
  ddb: { send: ddbSendMock },
  TableNames: { UserData: 'UserData' },
  audioKeys: {
    pointer: (sub: string, hash: string) => ({ pk: `USER#${sub}`, sk: `AUDIO#${hash}` }),
    userAudioQuery: (sub: string) => ({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':skPrefix': 'AUDIO#' },
    }),
  },
  storageKeys: {
    audioMp3: (sub: string, hash: string) => `audio/users/${sub}/${hash}.mp3`,
  },
  // Deterministic fake hash so cache-key behaviour is observable in tests.
  audioHash: (t: string, v: string, e: string, r?: string) => `h-${t}-${v}-${e}-${r ?? ''}`,
  synthesizeSpeech: synthesizeSpeechMock,
  resolveAiConfig: resolveAiConfigMock,
  resolveVoiceEngine: (voiceId: string, preferred?: string) =>
    voiceId === 'Ricardo' ? 'standard' : (preferred ?? 'neural'),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/audio/synthesize', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Wire the ddb mock for the common case: empty daily-cap query, cache-miss
 * point-get, successful pointer write. Tests override individual branches.
 */
function defaultDdb(opts: { queryItems?: unknown[]; existingPointer?: unknown } = {}) {
  ddbSendMock.mockImplementation((cmd: { __type: string }) => {
    switch (cmd.__type) {
      case 'Query':
        return Promise.resolve({ Items: opts.queryItems ?? [], LastEvaluatedKey: undefined });
      case 'Get':
        return Promise.resolve({ Item: opts.existingPointer });
      case 'Put':
        return Promise.resolve({});
      default:
        return Promise.resolve({});
    }
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';

  getAuthenticatedSubMock.mockResolvedValue(SUB);
  resolveAiConfigMock.mockResolvedValue({
    pollyVoiceId: 'Camila',
    pollyEngine: 'neural',
    speedRate: 'medium',
  });
  synthesizeSpeechMock.mockResolvedValue({ audioBytes: new Uint8Array([1, 2, 3]), charCount: 5 });
  getSignedUrlMock.mockResolvedValue('https://signed.example/audio.mp3');
  s3SendMock.mockResolvedValue({});
  defaultDdb();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/audio/synthesize', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ text: 'olá' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(synthesizeSpeechMock).not.toHaveBeenCalled();
  });

  it('returns 400 when text is missing', async () => {
    const res = await POST(makeRequest({ voiceId: 'Camila' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing or invalid text.');
  });

  it('returns 400 when text is only whitespace', async () => {
    const res = await POST(makeRequest({ text: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when trimmed text exceeds 1000 chars', async () => {
    const res = await POST(makeRequest({ text: 'a'.repeat(1001) }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Text too long to play.');
    expect(synthesizeSpeechMock).not.toHaveBeenCalled();
  });

  it('returns 400 when voiceId is not in the allowed set', async () => {
    const res = await POST(makeRequest({ text: 'olá', voiceId: 'Joanna' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid voiceId.');
  });

  it('returns 400 when ssmlRate is not in the allowed set', async () => {
    const res = await POST(makeRequest({ text: 'olá', ssmlRate: '0.5' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid ssmlRate.');
  });

  it('cache MISS: synthesizes, writes S3 + pointer, returns cached:false with an https url', async () => {
    defaultDdb({ queryItems: [], existingPointer: undefined });

    const res = await POST(makeRequest({ text: 'olá' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.charCount).toBe(3);
    expect(typeof body.url).toBe('string');
    expect((body.url as string).startsWith('https://')).toBe(true);

    expect(synthesizeSpeechMock).toHaveBeenCalledTimes(1);
    // S3 PutObject for the MP3 bytes.
    const putObjectCalls = s3SendMock.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === 'PutObject',
    );
    expect(putObjectCalls).toHaveLength(1);
    // DynamoDB pointer write.
    const putItemCalls = ddbSendMock.mock.calls.filter(
      ([c]) => (c as { __type: string }).__type === 'Put',
    );
    expect(putItemCalls).toHaveLength(1);
  });

  it('cache HIT: skips synthesis and returns cached:true', async () => {
    defaultDdb({ queryItems: [], existingPointer: { pk: `USER#${SUB}`, sk: 'AUDIO#h', charCount: 3 } });

    const res = await POST(makeRequest({ text: 'olá' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(synthesizeSpeechMock).not.toHaveBeenCalled();
    // No S3 PutObject, no DynamoDB pointer write on a cache hit.
    expect(
      s3SendMock.mock.calls.filter(([c]) => (c as { __type: string }).__type === 'PutObject'),
    ).toHaveLength(0);
    expect(
      ddbSendMock.mock.calls.filter(([c]) => (c as { __type: string }).__type === 'Put'),
    ).toHaveLength(0);
  });

  it('returns 429 daily_limit_reached when today\'s char sum exceeds the cap (no Polly call)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    defaultDdb({
      queryItems: [
        { charCount: 30_000, createdAt: `${today}T01:00:00.000Z` },
        { charCount: 25_000, createdAt: `${today}T02:00:00.000Z` },
      ],
    });

    const res = await POST(makeRequest({ text: 'olá' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(429);
    expect(body.error).toBe('daily_limit_reached');
    expect(synthesizeSpeechMock).not.toHaveBeenCalled();
  });

  it('daily cap ignores pointer items from previous days', async () => {
    defaultDdb({
      queryItems: [{ charCount: 90_000, createdAt: '2000-01-01T00:00:00.000Z' }],
    });

    const res = await POST(makeRequest({ text: 'olá' }));
    expect(res.status).toBe(200);
    expect(synthesizeSpeechMock).toHaveBeenCalledTimes(1);
  });

  it('resolves the standard engine for the Ricardo voice on a cache miss', async () => {
    const res = await POST(makeRequest({ text: 'olá', voiceId: 'Ricardo' }));

    expect(res.status).toBe(200);
    expect(synthesizeSpeechMock).toHaveBeenCalledTimes(1);
    expect(synthesizeSpeechMock.mock.calls[0][2]).toBe('standard');
  });

  it('resolves the neural engine for the Thiago voice on a cache miss', async () => {
    const res = await POST(makeRequest({ text: 'olá', voiceId: 'Thiago' }));

    expect(res.status).toBe(200);
    expect(synthesizeSpeechMock).toHaveBeenCalledTimes(1);
    expect(synthesizeSpeechMock.mock.calls[0][2]).toBe('neural');
  });
});
