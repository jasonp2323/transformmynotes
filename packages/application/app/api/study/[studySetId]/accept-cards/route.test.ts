import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must run before the route module is imported.
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());
const createAiCardsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
  createAiCards: createAiCardsMock,
}));

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STUDY_SET_ITEM = {
  studySetId: 'set-001',
  sourceNoteIds: ['note-001'],
  type: 'flashcards' as const,
  title: 'Test Flashcards',
  status: 'ready' as const,
  language: 'pt-BR' as const,
  model: 'test-model',
  promptVersion: 'v1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  pk: 'USER#sub-1',
  sk: 'STUDYSET#set-001',
  gsi6pk: 'USER#sub-1',
  gsi6sk: 'STUDYSET#set-001',
  gsi7pk: 'NOTE#note-001',
  gsi7sk: 'USER#sub-1#STUDYSET#set-001',
};

const VALID_ACCEPTED = [
  { front: 'What is photosynthesis?', back: 'The process by which plants make food.' },
  { front: 'Define osmosis.', back: 'Movement of water across a membrane.' },
];

const PARAMS = { params: { studySetId: 'set-001' } };

function makeRequest(body: unknown): Request {
  return new Request('http://test/api/study/set-001/accept-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getStudySetMock.mockResolvedValue(STUDY_SET_ITEM);
  createAiCardsMock.mockResolvedValue({ created: VALID_ACCEPTED.length });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/study/[studySetId]/accept-cards', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when accepted is empty', async () => {
    const res = await POST(makeRequest({ accepted: [] }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 400 when accepted has more than 20 items', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      front: `Q${i}`,
      back: `A${i}`,
    }));
    const res = await POST(makeRequest({ accepted: tooMany }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 400 when a card has an empty front', async () => {
    const res = await POST(
      makeRequest({ accepted: [{ front: '', back: 'valid back' }] }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when study set is not found', async () => {
    getStudySetMock.mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 400 when study set type is not flashcards', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...STUDY_SET_ITEM, type: 'quiz' });
    const res = await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Study set is not flashcards.');
  });

  it('returns 200 with { created: N } on the happy path', async () => {
    const res = await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.created).toBe(VALID_ACCEPTED.length);
  });

  it('calls createAiCards with the correct arguments on the happy path', async () => {
    await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(createAiCardsMock).toHaveBeenCalledTimes(1);
    expect(createAiCardsMock).toHaveBeenCalledWith({
      sub: 'sub-1',
      studySetId: 'set-001',
      sourceNoteId: 'note-001',
      accepted: VALID_ACCEPTED,
    });
  });

  it('returns 500 when createAiCards throws', async () => {
    createAiCardsMock.mockRejectedValueOnce(new Error('DynamoDB error'));
    const res = await POST(makeRequest({ accepted: VALID_ACCEPTED }), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Could not save cards.');
  });
});
