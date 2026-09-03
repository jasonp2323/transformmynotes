import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn().mockImplementation(function (input) { return input; }),
}));

import { GET } from './route';

const READY_ITEM = {
  studySetId: 'set-001',
  sourceNoteIds: ['note-001'],
  type: 'flashcards' as const,
  title: 'Test Set',
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
  bodyS3Key: 'study/users/sub-1/set-001.json',
};

const PARAMS = { params: { studySetId: 'set-001' } };
const REQ = new Request('http://test/api/study/set-001/body');

const FAKE_PAYLOAD = { cards: [{ front: 'Q', back: 'A' }] };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getStudySetMock.mockResolvedValue(READY_ITEM);
  s3SendMock.mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(FAKE_PAYLOAD) },
  });
});

describe('GET /api/study/[studySetId]/body', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when study set not found', async () => {
    getStudySetMock.mockResolvedValueOnce(undefined);
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 400 and does not call S3 when item type is quiz', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_ITEM, type: 'quiz' });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Use /questions for quizzes.');
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it('returns 404 when status is not ready', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_ITEM, status: 'queued', bodyS3Key: undefined });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Body not ready.');
  });

  it('returns 404 when status is ready but bodyS3Key is missing', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_ITEM, bodyS3Key: undefined });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Body not ready.');
  });

  it('returns 200 with type and payload on success', async () => {
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json() as { type: string; payload: unknown };
    expect(body.type).toBe('flashcards');
    expect(body.payload).toEqual(FAKE_PAYLOAD);
  });

  it('returns 500 when S3 fetch fails', async () => {
    s3SendMock.mockRejectedValueOnce(new Error('S3 error'));
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Could not load body.');
  });
});
