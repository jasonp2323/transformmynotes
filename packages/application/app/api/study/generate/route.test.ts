import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Set required env BEFORE the route module is imported (it reads these at import
// time). vi.hoisted runs ahead of the hoisted static `import './route'`, whereas
// a plain top-level `process.env.X = ...` would run after it.
vi.hoisted(() => {
  process.env.MAX_CONCURRENT_STUDY_JOBS = '3';
  process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value = 'us.anthropic.test-model';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getNoteMock = vi.hoisted(() => vi.fn());
const putStudySetMock = vi.hoisted(() => vi.fn());
const countInFlightMock = vi.hoisted(() => vi.fn());
const buildStudySetItemMock = vi.hoisted(() => vi.fn((input: unknown) => ({ ...(input as object) })));

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getNote: getNoteMock,
  putStudySet: putStudySetMock,
  countInFlightStudySets: countInFlightMock,
  buildStudySetItem: buildStudySetItemMock,
  MATERIAL_TYPES: ['flashcards', 'quiz', 'assignment', 'summary', 'glossary', 'study_guide'],
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://test/api/study/generate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  getNoteMock.mockResolvedValue({ title: 'My Note' });
  countInFlightMock.mockResolvedValue(0);
  putStudySetMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/study/generate', () => {
  it('returns 401 when getAuthenticatedSub returns null', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for an invalid JSON body', async () => {
    const res = await POST(makeRequest('not json'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request body.');
  });

  it('returns 400 when sourceNoteId is missing', async () => {
    const res = await POST(makeRequest({ type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing or invalid sourceNoteId.');
  });

  it('returns 400 when type is invalid', async () => {
    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'bogus' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing or invalid type.');
  });

  it('returns 400 when language is invalid', async () => {
    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', language: 'fr' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid language.');
  });

  it('returns 404 when the note is not found', async () => {
    getNoteMock.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('Note not found.');
  });

  it('returns 429 when the in-flight cap is reached', async () => {
    countInFlightMock.mockResolvedValueOnce(3);

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(429);
    expect(body.ok).toBe(false);
  });

  it('returns 202 and enqueues a study set on the happy path', async () => {
    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(202);
    expect(typeof body.studySetId).toBe('string');
    expect(putStudySetMock).toHaveBeenCalledTimes(1);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        language: 'auto',
        sourceNoteIds: ['note-1'],
        model: 'us.anthropic.test-model',
      }),
    );
  });

  it('passes a valid language through to buildStudySetItem', async () => {
    await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', language: 'bilingual' }));

    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'bilingual' }),
    );
  });
});
