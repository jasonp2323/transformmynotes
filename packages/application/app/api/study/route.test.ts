import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listStudySetsByUserMock = vi.hoisted(() => vi.fn());
const listStudySetsByNoteMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listStudySetsByUser: listStudySetsByUserMock,
  listStudySetsByNote: listStudySetsByNoteMock,
}));

import { GET } from './route';

const FAKE_SET = {
  studySetId: 'set-001',
  sourceNoteIds: ['note-001'],
  type: 'flashcards',
  title: 'Test Set',
  status: 'ready',
  language: 'pt-BR',
  model: 'test-model',
  promptVersion: 'v1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  // Internal DynamoDB fields that must be stripped:
  pk: 'USER#sub-1',
  sk: 'STUDYSET#set-001',
  gsi6pk: 'USER#sub-1',
  gsi6sk: 'STUDYSET#set-001',
  gsi7pk: 'NOTE#note-001',
  gsi7sk: 'USER#sub-1#STUDYSET#set-001',
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  listStudySetsByUserMock.mockResolvedValue([FAKE_SET]);
  listStudySetsByNoteMock.mockResolvedValue([FAKE_SET]);
});

describe('GET /api/study', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://test/api/study'));
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('calls listStudySetsByUser when no noteId param', async () => {
    const res = await GET(new Request('http://test/api/study'));
    expect(res.status).toBe(200);
    expect(listStudySetsByUserMock).toHaveBeenCalledWith('sub-1');
    expect(listStudySetsByNoteMock).not.toHaveBeenCalled();
  });

  it('calls listStudySetsByNote when noteId param is present', async () => {
    const res = await GET(new Request('http://test/api/study?noteId=note-001'));
    expect(res.status).toBe(200);
    expect(listStudySetsByNoteMock).toHaveBeenCalledWith('sub-1', 'note-001');
    expect(listStudySetsByUserMock).not.toHaveBeenCalled();
  });

  it('maps metadata fields correctly and strips internal DynamoDB keys', async () => {
    const res = await GET(new Request('http://test/api/study'));
    const body = await res.json() as { studySets: Record<string, unknown>[] };
    expect(body.studySets).toHaveLength(1);
    const s = body.studySets[0];
    expect(s.studySetId).toBe('set-001');
    expect(s.sourceNoteIds).toEqual(['note-001']);
    expect(s.type).toBe('flashcards');
    expect(s.title).toBe('Test Set');
    expect(s.status).toBe('ready');
    expect(s.language).toBe('pt-BR');
    expect(s.model).toBe('test-model');
    expect(s.promptVersion).toBe('v1');
    expect(s.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(s.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    // Must not leak internal keys
    expect('pk' in s).toBe(false);
    expect('sk' in s).toBe(false);
    expect('gsi6pk' in s).toBe(false);
    expect('gsi6sk' in s).toBe(false);
    expect('gsi7pk' in s).toBe(false);
    expect('gsi7sk' in s).toBe(false);
    expect('bodyS3Key' in s).toBe(false);
  });

  it('includes error field when set has an error', async () => {
    listStudySetsByUserMock.mockResolvedValueOnce([{ ...FAKE_SET, status: 'failed', error: 'Generation failed' }]);
    const res = await GET(new Request('http://test/api/study'));
    const body = await res.json() as { studySets: Record<string, unknown>[] };
    expect(body.studySets[0].error).toBe('Generation failed');
  });

  it('returns 500 when the DB call throws', async () => {
    listStudySetsByUserMock.mockRejectedValueOnce(new Error('DB error'));
    const res = await GET(new Request('http://test/api/study'));
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Could not list study sets.');
  });
});
