import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getNoteMock = vi.hoisted(() => vi.fn());
const computeTagDeltaMock = vi.hoisted(() => vi.fn());
const updateNoteMock = vi.hoisted(() => vi.fn());
const postprocessMarkdownMock = vi.hoisted(() => vi.fn());
const countHighlightsMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());
const syncNoteTokensMock = vi.hoisted(() => vi.fn());
const syncCardsForNoteMock = vi.hoisted(() => vi.fn());
const deleteNoteRecordMock = vi.hoisted(() => vi.fn());
const tokeniseMock = vi.hoisted(() => vi.fn());
const authoriseNoteReadMock = vi.hoisted(() => vi.fn());
const revokeAllSharesForNoteMock = vi.hoisted(() => vi.fn());
const putStorageDeltaEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

// Define NoteConflictError inside the mock factory so instanceof works correctly.
vi.mock('@transformmynotes/core', () => {
  class NoteConflictError extends Error {
    constructor(message = 'Note was modified concurrently') {
      super(message);
      this.name = 'NoteConflictError';
    }
  }

  return {
    getNote: getNoteMock,
    computeTagDelta: computeTagDeltaMock,
    updateNote: updateNoteMock,
    postprocessMarkdown: postprocessMarkdownMock,
    countHighlights: countHighlightsMock,
    storageKeys: {
      originalImage: (s: string, i: string) => `images/users/${s}/${i}.jpg`,
      noteMarkdown: (s: string, i: string) => `markdown/users/${s}/${i}.md`,
    },
    NoteConflictError,
    syncNoteTokens: syncNoteTokensMock,
    syncCardsForNote: syncCardsForNoteMock,
    deleteNoteRecord: deleteNoteRecordMock,
    tokenise: tokeniseMock,
    authoriseNoteRead: authoriseNoteReadMock,
    revokeAllSharesForNote: revokeAllSharesForNoteMock,
    putStorageDeltaEvent: putStorageDeltaEventMock,
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(function (input) { return { kind: 'PutObject', input }; }),
  GetObjectCommand: vi.fn(function (input) { return { kind: 'GetObject', input }; }),
  DeleteObjectCommand: vi.fn(function (input) { return { kind: 'DeleteObject', input }; }),
  HeadObjectCommand: vi.fn(function (input) { return { kind: 'HeadObject', input }; }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { PATCH, GET, DELETE } from './route';

// We need the mocked NoteConflictError to throw in the conflict test.
import { NoteConflictError } from '@transformmynotes/core';

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
  title: 'Old Title',
  tags: ['oldTag'],
  status: 'clean' as const,
  words: 5,
  highlights: 0,
  langPair: 'unknown',
  ocrConfidence: 100,
  bodyS3Key: `markdown/users/${SUB}/${NOTE_ID}.md`,
  originalImageS3Key: `images/users/${SUB}/${NOTE_ID}.jpg`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const UPDATED_NOTE = {
  ...EXISTING_NOTE,
  title: 'New Title',
  tags: ['newTag'],
  words: 2,
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const DEFAULT_BODY = {
  markdown: '## Hello World',
  title: 'New Title',
  tags: ['newTag'],
};

function makeRequest(
  body: unknown = DEFAULT_BODY,
  noteId = NOTE_ID,
): [Request, { params: { noteId: string } }] {
  const req = new Request(`http://localhost/api/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return [req, { params: { noteId } }];
}

function makeGetRequest(
  noteId = NOTE_ID,
  ownerSub?: string,
): [Request, { params: { noteId: string } }] {
  const url = ownerSub
    ? `http://localhost/api/notes/${noteId}?owner=${ownerSub}`
    : `http://localhost/api/notes/${noteId}`;
  const req = new Request(url, { method: 'GET' });
  return [req, { params: { noteId } }];
}

function makeDeleteRequest(noteId = NOTE_ID): [Request, { params: { noteId: string } }] {
  const req = new Request(`http://localhost/api/notes/${noteId}`, { method: 'DELETE' });
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
  computeTagDeltaMock.mockReturnValue({ added: ['newTag'], removed: ['oldTag'] });
  postprocessMarkdownMock.mockReturnValue({
    markdown: '## Hello World',
    wordCount: 2,
    detectedLang: 'unknown',
    ocrConfidence: 100,
  });
  countHighlightsMock.mockReturnValue(0);
  updateNoteMock.mockResolvedValue(UPDATED_NOTE);
  s3SendMock.mockResolvedValue({ Body: { transformToString: vi.fn().mockResolvedValue('old body text') } });
  syncNoteTokensMock.mockResolvedValue(undefined);
  syncCardsForNoteMock.mockResolvedValue({ created: 0, deleted: 0, unchanged: 0 });
  deleteNoteRecordMock.mockResolvedValue(undefined);
  tokeniseMock.mockReturnValue(['hello', 'world']);
  authoriseNoteReadMock.mockResolvedValue(true);
  revokeAllSharesForNoteMock.mockResolvedValue(0);
  putStorageDeltaEventMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/notes/[noteId]', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('request validation', () => {
    it('returns 400 on invalid JSON body', async () => {
      const req = new Request(`http://localhost/api/notes/${NOTE_ID}`, {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      });

      const res = await PATCH(req, { params: { noteId: NOTE_ID } });
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });

    it('returns 400 when markdown is missing', async () => {
      const [req, ctx] = makeRequest({ title: 'Title', tags: [] });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid markdown.');
    });

    it('returns 400 when markdown is not a string', async () => {
      const [req, ctx] = makeRequest({ markdown: 42, title: 'Title', tags: [] });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid markdown.');
    });

    it('returns 400 when title is not a string', async () => {
      const [req, ctx] = makeRequest({ markdown: '## Hi', title: 42, tags: [] });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid title.');
    });

    it('returns 400 when tags contains non-string entries', async () => {
      const [req, ctx] = makeRequest({ markdown: '## Hi', title: 'Title', tags: [1, 2] });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid tags.');
    });

    it('returns 400 when more than 20 unique tags are provided', async () => {
      const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const [req, ctx] = makeRequest({ markdown: '## Hi', title: 'Title', tags: manyTags });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('A note may have at most 20 tags.');
    });

    it('returns 400 when baseUpdatedAt is not a string', async () => {
      const [req, ctx] = makeRequest({ ...DEFAULT_BODY, baseUpdatedAt: 12345 });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid baseUpdatedAt.');
    });
  });

  describe('note lookup', () => {
    it('returns 404 when getNote returns undefined', async () => {
      getNoteMock.mockResolvedValueOnce(undefined);

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Note not found.');
    });
  });

  describe('success path', () => {
    it('returns 200 with expected payload', async () => {
      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.noteId).toBe(NOTE_ID);
      expect(body.title).toBe('New Title');
      expect(body.wordCount).toBe(2);
      expect(body.highlights).toBe(0);
      expect(body.langPair).toBe('unknown');
      expect(body.ocrConfidence).toBe(100);
      expect(body.updatedAt).toBe(UPDATED_NOTE.updatedAt);
    });

    it('calls updateNote with correct delta, expectedUpdatedAt, and preserved createdAt (no baseUpdatedAt → backward-compat)', async () => {
      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: SUB,
          noteId: NOTE_ID,
          title: 'New Title',
          addedTags: ['newTag'],
          removedTags: ['oldTag'],
          expectedUpdatedAt: EXISTING_NOTE.updatedAt,
          createdAt: EXISTING_NOTE.createdAt,
        }),
      );
    });

    it('uses supplied baseUpdatedAt as expectedUpdatedAt when present', async () => {
      const clientBaseline = '2026-01-01T00:00:00.000Z'; // same as EXISTING_NOTE.updatedAt here
      const [req, ctx] = makeRequest({ ...DEFAULT_BODY, baseUpdatedAt: clientBaseline });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.updatedAt).toBe(UPDATED_NOTE.updatedAt);
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: clientBaseline }),
      );
    });

    it('falls back to existing.updatedAt when baseUpdatedAt is absent', async () => {
      // No baseUpdatedAt in the request body — backward-compat path.
      const [req, ctx] = makeRequest({ markdown: '## Hi', title: 'Title', tags: [] });
      await PATCH(req, ctx);

      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: EXISTING_NOTE.updatedAt }),
      );
    });

    it('falls back to existing.updatedAt when baseUpdatedAt is an empty string', async () => {
      const [req, ctx] = makeRequest({ ...DEFAULT_BODY, baseUpdatedAt: '' });
      await PATCH(req, ctx);

      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: EXISTING_NOTE.updatedAt }),
      );
    });

    it('calls PutObjectCommand with the markdown body and correct key', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: `markdown/users/${SUB}/${NOTE_ID}.md`,
          Body: '## Hello World',
          ContentType: 'text/markdown',
        }),
      );
    });

    it('calls getNote with sub and noteId', async () => {
      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(getNoteMock).toHaveBeenCalledWith(SUB, NOTE_ID);
    });

    it('defaults title to "Untitled note" when title is an empty string', async () => {
      const [req, ctx] = makeRequest({ markdown: '## Hi', title: '', tags: [] });
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      // updateNote should be called with title = 'Untitled note'
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Untitled note' }),
      );
      // Response should also reflect the default title
      expect(body.title).toBe('Untitled note');
    });

    it('de-duplicates tags before passing them to updateNote', async () => {
      const [req, ctx] = makeRequest({
        markdown: '## Hi',
        title: 'Title',
        tags: ['a', 'b', 'a'],
      });
      await PATCH(req, ctx);

      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['a', 'b'] }),
      );
    });
  });

  describe('conflict handling', () => {
    it('returns 409 with conflict:true and server state when updateNote throws NoteConflictError', async () => {
      updateNoteMock.mockRejectedValueOnce(new NoteConflictError());

      // After the conflict, the handler re-fetches the current server note.
      // getNote is called twice: once for the initial lookup, once for the conflict re-fetch.
      const SERVER_NOTE = {
        ...EXISTING_NOTE,
        title: 'Server Title',
        tags: ['serverTag'],
        words: 10,
        highlights: 1,
        langPair: 'en-fr',
        ocrConfidence: 95,
        updatedAt: '2026-06-01T00:00:00.000Z',
      };
      getNoteMock
        .mockResolvedValueOnce(EXISTING_NOTE)   // initial lookup
        .mockResolvedValueOnce(SERVER_NOTE);    // conflict re-fetch

      // s3SendMock: first call is GetObject for old body (token diff),
      // second call is GetObject for server body in conflict re-fetch.
      s3SendMock
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('old body text') } })
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('server body text') } });

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const resBody = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(409);
      expect(resBody.ok).toBe(false);
      expect(resBody.conflict).toBe(true);
      expect(resBody.error).toBe('This note was changed elsewhere since you started editing.');

      const server = resBody.server as Record<string, unknown>;
      expect(server.updatedAt).toBe(SERVER_NOTE.updatedAt);
      expect(server.title).toBe(SERVER_NOTE.title);
      expect(server.tags).toEqual(SERVER_NOTE.tags);
      expect(server.markdown).toBe('server body text');
      expect(server.words).toBe(SERVER_NOTE.words);
      expect(server.highlights).toBe(SERVER_NOTE.highlights);
      expect(server.langPair).toBe(SERVER_NOTE.langPair);
      expect(server.ocrConfidence).toBe(SERVER_NOTE.ocrConfidence);
    });

    it('does NOT send PutObjectCommand for the new body on a conflict (S3 body is not clobbered)', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      updateNoteMock.mockRejectedValueOnce(new NoteConflictError());

      // Second getNote call for server re-fetch
      getNoteMock
        .mockResolvedValueOnce(EXISTING_NOTE)
        .mockResolvedValueOnce(EXISTING_NOTE);

      s3SendMock
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('old body text') } })
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('server body') } });

      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      // PutObjectCommand must NOT have been called — no S3 write on conflict.
      expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    it('returns 409 with baseUpdatedAt matching server (stale client guard)', async () => {
      // Client sends a stale baseUpdatedAt; updateNote sees mismatch and throws.
      updateNoteMock.mockRejectedValueOnce(new NoteConflictError());

      getNoteMock
        .mockResolvedValueOnce(EXISTING_NOTE)
        .mockResolvedValueOnce(EXISTING_NOTE);

      s3SendMock
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('old body text') } })
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('server body') } });

      const [req, ctx] = makeRequest({
        ...DEFAULT_BODY,
        baseUpdatedAt: '2025-01-01T00:00:00.000Z', // stale
      });
      const res = await PATCH(req, ctx);
      const resBody = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(409);
      expect(resBody.conflict).toBe(true);
      // updateNote must have been called with the client's stale baseUpdatedAt as expectedUpdatedAt
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: '2025-01-01T00:00:00.000Z' }),
      );
    });
  });

  describe('error handling', () => {
    it('returns 500 when updateNote rejects with a generic error', async () => {
      updateNoteMock.mockRejectedValueOnce(new Error('DynamoDB timeout'));

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not update note.');
    });

    it('returns 500 when SST_RESOURCE_NotesBucket_name is unset', async () => {
      delete process.env['SST_RESOURCE_NotesBucket_name'];

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
    });

    it('returns 500 when S3 PutObject fails', async () => {
      // First send is GetObject (for old body) — best-effort, succeeds.
      // Second send is PutObject — this is the one that fails.
      s3SendMock
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('old body') } })
        .mockRejectedValueOnce(new Error('S3 access denied'));

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not update note.');
    });
  });

  describe('PATCH token wiring', () => {
    it('calls syncNoteTokens after a successful update', async () => {
      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(syncNoteTokensMock).toHaveBeenCalledTimes(1);
    });

    it('calls syncCardsForNote with sub, noteId, and markdown after a successful update', async () => {
      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(syncCardsForNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: SUB,
          noteId: NOTE_ID,
          markdownBody: DEFAULT_BODY.markdown,
        }),
      );
    });

    it('returns 200 even when syncCardsForNote rejects (best-effort)', async () => {
      syncCardsForNoteMock.mockRejectedValueOnce(new Error('card sync error'));

      const [req, ctx] = makeRequest();
      const res = await PATCH(req, ctx);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.noteId).toBe(NOTE_ID);
    });

    it('reads old body from S3 via GetObjectCommand before writing', async () => {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');

      const [req, ctx] = makeRequest();
      await PATCH(req, ctx);

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: EXISTING_NOTE.bodyS3Key }),
      );
    });
  });
});

describe('GET /api/notes/[noteId]', () => {
  it('returns 401 when not authenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when note not found', async () => {
    getNoteMock.mockResolvedValueOnce(undefined);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Note not found.');
  });

  it('returns metadata, body, and isOwner:true for owner (no ?owner param)', async () => {
    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.body).toBe('old body text');
    expect(body.isOwner).toBe(true);

    const metadata = body.metadata as Record<string, unknown>;
    expect(metadata.noteId).toBe(NOTE_ID);
    expect(metadata.title).toBe(EXISTING_NOTE.title);
    // Internal DynamoDB keys must not be exposed
    expect(metadata.pk).toBeUndefined();
    expect(metadata.sk).toBeUndefined();
    expect(metadata.bodyS3Key).toBeUndefined();
    expect(metadata.originalImageS3Key).toBeUndefined();
  });

  it('defaults body to empty string when S3 throws', async () => {
    s3SendMock.mockRejectedValueOnce(new Error('NoSuchKey'));

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.body).toBe('');
    expect(body.isOwner).toBe(true);
    const metadata = body.metadata as Record<string, unknown>;
    expect(metadata.noteId).toBe(NOTE_ID);
  });

  it('returns 403 when authoriseNoteRead returns false', async () => {
    authoriseNoteReadMock.mockResolvedValueOnce(false);

    const [req, ctx] = makeGetRequest(NOTE_ID, 'ownerX');
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
    // getNote must NOT be called when authorisation fails
    expect(getNoteMock).not.toHaveBeenCalled();
  });

  it('calls getNote with ownerSub from ?owner param for recipients', async () => {
    const OWNER_SUB = 'ownerX';
    // Return a note fixture keyed by the owner
    const ownerNote = { ...EXISTING_NOTE, pk: `USER#${OWNER_SUB}`, sub: OWNER_SUB };
    getNoteMock.mockResolvedValueOnce(ownerNote);

    const [req, ctx] = makeGetRequest(NOTE_ID, OWNER_SUB);
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(getNoteMock).toHaveBeenCalledWith(OWNER_SUB, NOTE_ID);
    expect(body.isOwner).toBe(false);
    const metadata = body.metadata as Record<string, unknown>;
    expect(metadata.noteId).toBe(NOTE_ID);
  });

  it('returns 404 when authorised but note not found', async () => {
    getNoteMock.mockResolvedValueOnce(undefined);

    const [req, ctx] = makeGetRequest(NOTE_ID, SUB);
    const res = await GET(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Note not found.');
  });
});

describe('DELETE /api/notes/[noteId]', () => {
  it('returns 401 when not authenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const [req, ctx] = makeDeleteRequest();
    const res = await DELETE(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when note not found', async () => {
    getNoteMock.mockResolvedValueOnce(undefined);

    const [req, ctx] = makeDeleteRequest();
    const res = await DELETE(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Note not found.');
  });

  it('returns { ok: true } on success', async () => {
    const [req, ctx] = makeDeleteRequest();
    const res = await DELETE(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('calls deleteNoteRecord with sub, noteId, tags, tokens', async () => {
    const [req, ctx] = makeDeleteRequest();
    await DELETE(req, ctx);

    expect(deleteNoteRecordMock).toHaveBeenCalledWith(
      SUB,
      NOTE_ID,
      EXISTING_NOTE.tags,
      expect.any(Array),
    );
  });

  it('calls DeleteObjectCommand for bodyS3Key and originalImageS3Key', async () => {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    const [req, ctx] = makeDeleteRequest();
    await DELETE(req, ctx);

    expect(DeleteObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: EXISTING_NOTE.bodyS3Key }),
    );
    expect(DeleteObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: EXISTING_NOTE.originalImageS3Key }),
    );
  });

  it('still returns { ok: true } if S3 DeleteObject fails', async () => {
    // Send sequence: (1) GetObject (token reconstruction) succeeds,
    // (2) HeadObject (image size for metering) succeeds,
    // (3) & (4) DeleteObject calls fail.
    s3SendMock
      .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('old body text') } }) // GetObject
      .mockResolvedValueOnce({ ContentLength: 123 }) // HeadObject (image size) — new
      .mockRejectedValueOnce(new Error('S3 access denied')) // DeleteObject body
      .mockRejectedValueOnce(new Error('S3 access denied')); // DeleteObject image

    const [req, ctx] = makeDeleteRequest();
    const res = await DELETE(req, ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('calls revokeAllSharesForNote with sub and noteId after deleteNoteRecord', async () => {
    const [req, ctx] = makeDeleteRequest();
    await DELETE(req, ctx);

    expect(revokeAllSharesForNoteMock).toHaveBeenCalledWith(SUB, NOTE_ID);
    // Ensure it is called after deleteNoteRecord (both called exactly once)
    expect(deleteNoteRecordMock).toHaveBeenCalledTimes(1);
    expect(revokeAllSharesForNoteMock).toHaveBeenCalledTimes(1);
  });
});
