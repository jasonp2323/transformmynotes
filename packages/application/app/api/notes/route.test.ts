import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listRecentNotesMock = vi.hoisted(() => vi.fn());
const listNoteIdsByTokenMock = vi.hoisted(() => vi.fn());
const batchGetNotesMock = vi.hoisted(() => vi.fn());
const tokeniseMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listRecentNotes: listRecentNotesMock,
  listNoteIdsByToken: listNoteIdsByTokenMock,
  batchGetNotes: batchGetNotesMock,
  tokenise: tokeniseMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';

const NOTE_1 = {
  pk: `USER#${SUB}`,
  sk: 'NOTE#01JNOTE001',
  gsi1pk: `USER#${SUB}`,
  gsi1sk: 'NOTE#01JNOTE001',
  noteId: '01JNOTE001',
  title: 'Biology Notes',
  tags: ['bio'],
  status: 'clean' as const,
  words: 100,
  highlights: 2,
  langPair: 'pt-BR → en',
  ocrConfidence: 90,
  bodyS3Key: 'markdown/01.md',
  originalImageS3Key: 'images/01.jpg',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const NOTE_2 = {
  ...NOTE_1,
  sk: 'NOTE#01JNOTE002',
  gsi1sk: 'NOTE#01JNOTE002',
  noteId: '01JNOTE002',
  title: 'Chemistry Notes',
  tags: ['chem'],
  updatedAt: '2026-01-03T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(q?: string): Request {
  const url = q
    ? `http://localhost/api/notes?q=${encodeURIComponent(q)}`
    : 'http://localhost/api/notes';
  return new Request(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue(SUB);
  listRecentNotesMock.mockResolvedValue([NOTE_1, NOTE_2]);
  listNoteIdsByTokenMock.mockResolvedValue([]);
  batchGetNotesMock.mockResolvedValue([NOTE_1, NOTE_2]);
  tokeniseMock.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/notes', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const res = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('recent-list path (no q param)', () => {
    it('calls listRecentNotes with the authenticated sub', async () => {
      await GET(makeRequest());

      expect(listRecentNotesMock).toHaveBeenCalledWith(SUB);
    });

    it('returns 200 with a notes array', async () => {
      const res = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(Array.isArray(body.notes)).toBe(true);
      expect((body.notes as unknown[]).length).toBe(2);
    });

    it('strips raw DynamoDB keys and S3 keys from each note', async () => {
      const res = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>;
      const notes = body.notes as Record<string, unknown>[];

      for (const note of notes) {
        expect(note).toHaveProperty('noteId');
        expect(note).toHaveProperty('title');
        expect(note).toHaveProperty('tags');
        expect(note).not.toHaveProperty('pk');
        expect(note).not.toHaveProperty('sk');
        expect(note).not.toHaveProperty('gsi1pk');
        expect(note).not.toHaveProperty('gsi1sk');
        expect(note).not.toHaveProperty('bodyS3Key');
        expect(note).not.toHaveProperty('originalImageS3Key');
      }
    });

    it('does not call listNoteIdsByToken or batchGetNotes', async () => {
      await GET(makeRequest());

      expect(listNoteIdsByTokenMock).not.toHaveBeenCalled();
      expect(batchGetNotesMock).not.toHaveBeenCalled();
    });
  });

  describe('search path', () => {
    it('calls tokenise with the raw term and then listNoteIdsByToken with the token', async () => {
      tokeniseMock.mockReturnValue(['bio']);
      listNoteIdsByTokenMock.mockResolvedValue([{ noteId: NOTE_1.noteId }]);
      batchGetNotesMock.mockResolvedValue([NOTE_1]);

      await GET(makeRequest('bio'));

      expect(tokeniseMock).toHaveBeenCalledWith('bio');
      expect(listNoteIdsByTokenMock).toHaveBeenCalledWith(SUB, 'bio');
      expect(batchGetNotesMock).toHaveBeenCalledWith(SUB, [NOTE_1.noteId]);
    });

    it('returns mapped notes without raw DynamoDB/S3 keys', async () => {
      tokeniseMock.mockReturnValue(['bio']);
      listNoteIdsByTokenMock.mockResolvedValue([{ noteId: NOTE_1.noteId }]);
      batchGetNotesMock.mockResolvedValue([NOTE_1]);

      const res = await GET(makeRequest('bio'));
      const body = await res.json() as Record<string, unknown>;
      const notes = body.notes as Record<string, unknown>[];

      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0]).not.toHaveProperty('pk');
      expect(notes[0]).not.toHaveProperty('sk');
      expect(notes[0]).not.toHaveProperty('bodyS3Key');
      expect(notes[0]).not.toHaveProperty('originalImageS3Key');
      expect(notes[0]).toHaveProperty('noteId');
    });

    it('returns { notes: [] } when tokenise produces no tokens for every term', async () => {
      tokeniseMock.mockReturnValue([]);

      const res = await GET(makeRequest('the'));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.notes).toEqual([]);
    });

    it('returns { notes: [] } when listNoteIdsByToken returns empty for all terms', async () => {
      tokeniseMock.mockReturnValue(['bio']);
      listNoteIdsByTokenMock.mockResolvedValue([]);

      const res = await GET(makeRequest('bio'));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.notes).toEqual([]);
    });

    it('applies title-prefix boost: note whose title starts with search term appears first', async () => {
      // NOTE_2 has a newer updatedAt so it would normally sort first,
      // but NOTE_1.title.toLowerCase() starts with 'bio' so it gets boosted.
      const newerNote2 = { ...NOTE_2, updatedAt: '2026-06-01T00:00:00.000Z' };

      tokeniseMock.mockReturnValue(['bio']);
      listNoteIdsByTokenMock.mockResolvedValue([
        { noteId: NOTE_1.noteId },
        { noteId: newerNote2.noteId },
      ]);
      batchGetNotesMock.mockResolvedValue([NOTE_1, newerNote2]);

      const res = await GET(makeRequest('bio'));
      const body = await res.json() as Record<string, unknown>;
      const notes = body.notes as Record<string, unknown>[];

      expect(notes[0]?.noteId).toBe(NOTE_1.noteId);
    });
  });

  describe('error handling', () => {
    it('returns 500 when listRecentNotes throws', async () => {
      listRecentNotesMock.mockRejectedValueOnce(new Error('DynamoDB error'));

      const res = await GET(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not list notes.');
    });
  });
});
