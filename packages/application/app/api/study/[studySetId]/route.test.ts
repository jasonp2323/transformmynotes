import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());
const deleteStudySetMock = vi.hoisted(() => vi.fn());
const batchGetNotesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
  deleteStudySet: deleteStudySetMock,
  batchGetNotes: batchGetNotesMock,
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: s3SendMock })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => input),
}));

import { GET, DELETE } from './route';

const FAKE_ITEM = {
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
const REQ = new Request('http://test/api/study/set-001');

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getStudySetMock.mockResolvedValue(FAKE_ITEM);
  deleteStudySetMock.mockResolvedValue(undefined);
  s3SendMock.mockResolvedValue({});
  batchGetNotesMock.mockResolvedValue([{ noteId: 'note-001', title: 'Note One' }]);
});

describe('GET /api/study/[studySetId]', () => {
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

  it('returns 200 with metadata on success', async () => {
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.studySetId).toBe('set-001');
    expect(body.type).toBe('flashcards');
    // Must not leak internal keys
    expect('pk' in body).toBe(false);
    expect('sk' in body).toBe(false);
    expect('bodyS3Key' in body).toBe(false);
    expect(body.noteTitles).toEqual({ 'note-001': 'Note One' });
  });

  it('returns noteTitles as {} when sourceNoteIds is empty', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...FAKE_ITEM, sourceNoteIds: [] });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.noteTitles).toEqual({});
    expect(batchGetNotesMock).not.toHaveBeenCalled();
  });

  it('returns noteTitles as {} when batchGetNotes returns no matching notes', async () => {
    batchGetNotesMock.mockResolvedValueOnce([]);
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.noteTitles).toEqual({});
  });
});

describe('DELETE /api/study/[studySetId]', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await DELETE(REQ, PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when study set not found', async () => {
    getStudySetMock.mockResolvedValueOnce(undefined);
    const res = await DELETE(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 204 and calls deleteStudySet on success', async () => {
    const res = await DELETE(REQ, PARAMS);
    expect(res.status).toBe(204);
    expect(deleteStudySetMock).toHaveBeenCalledWith('sub-1', 'set-001');
  });

  it('attempts S3 delete of bodyS3Key when present', async () => {
    await DELETE(REQ, PARAMS);
    expect(s3SendMock).toHaveBeenCalledTimes(1);
  });

  it('still returns 204 when S3 delete fails (best-effort)', async () => {
    s3SendMock.mockRejectedValueOnce(new Error('S3 error'));
    const res = await DELETE(REQ, PARAMS);
    expect(res.status).toBe(204);
    expect(deleteStudySetMock).toHaveBeenCalledWith('sub-1', 'set-001');
  });

  it('skips S3 delete when bodyS3Key is absent', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...FAKE_ITEM, bodyS3Key: undefined });
    await DELETE(REQ, PARAMS);
    expect(s3SendMock).not.toHaveBeenCalled();
    expect(deleteStudySetMock).toHaveBeenCalledTimes(1);
  });
});
