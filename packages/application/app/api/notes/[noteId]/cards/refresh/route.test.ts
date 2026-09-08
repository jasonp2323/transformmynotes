import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getNoteMock = vi.hoisted(() => vi.fn());
const syncCardsForNoteMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getNote: getNoteMock,
  syncCardsForNote: syncCardsForNoteMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn(function (input) { return { kind: 'GetObject', input }; }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const NOTE_ID = '01JABC';

const EXISTING_NOTE = {
  pk: `USER#${SUB}`,
  sk: `NOTE#${NOTE_ID}`,
  noteId: NOTE_ID,
  sub: SUB,
  title: 'My Note',
  tags: [],
  status: 'clean' as const,
  words: 10,
  highlights: 2,
  langPair: 'unknown',
  ocrConfidence: 100,
  bodyS3Key: `markdown/users/${SUB}/${NOTE_ID}.md`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const MARKDOWN_BODY = '## Notes\n\nSome ==highlighted== content here.';

function makeBody(text: string) {
  return {
    transformToString: () => Promise.resolve(text),
  };
}

function makeRequest(noteId = NOTE_ID): [Request, { params: { noteId: string } }] {
  const req = new Request(`http://localhost/api/notes/${noteId}/cards/refresh`, {
    method: 'POST',
  });
  return [req, { params: { noteId } }];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';

  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getNoteMock.mockResolvedValue(EXISTING_NOTE);
  s3SendMock.mockResolvedValue({ Body: makeBody(MARKDOWN_BODY) });
  syncCardsForNoteMock.mockResolvedValue({ created: 1, deleted: 0, unchanged: 0 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/notes/[noteId]/cards/refresh', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('ownership check', () => {
    it('returns 403 when getNote returns undefined (non-owner or missing)', async () => {
      getNoteMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('success path', () => {
    it('returns the syncCardsForNote result { created, deleted, unchanged }', async () => {
      syncCardsForNoteMock.mockResolvedValueOnce({ created: 3, deleted: 1, unchanged: 2 });

      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.created).toBe(3);
      expect(body.deleted).toBe(1);
      expect(body.unchanged).toBe(2);
    });

    it('calls getNote with sub and noteId', async () => {
      const [req, ctx] = makeRequest();
      await POST(req, ctx);

      expect(getNoteMock).toHaveBeenCalledWith(SUB, NOTE_ID);
    });

    it('calls syncCardsForNote with sub, noteId, and fetched body', async () => {
      const [req, ctx] = makeRequest();
      await POST(req, ctx);

      expect(syncCardsForNoteMock).toHaveBeenCalledWith({
        sub: SUB,
        noteId: NOTE_ID,
        markdownBody: MARKDOWN_BODY,
      });
    });

    it('fetches the S3 body using the note bodyS3Key from the correct bucket', async () => {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');

      const [req, ctx] = makeRequest();
      await POST(req, ctx);

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: EXISTING_NOTE.bodyS3Key,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('returns 500 when syncCardsForNote throws', async () => {
      syncCardsForNoteMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not refresh cards.');
    });

    it('returns 500 when S3 fetch throws', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('S3 error'));

      const [req, ctx] = makeRequest();
      const res = await POST(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not refresh cards.');
    });
  });
});
