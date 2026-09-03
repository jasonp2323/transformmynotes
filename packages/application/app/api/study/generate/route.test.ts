import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Set required env BEFORE the route module is imported (it reads these at import
// time). vi.hoisted runs ahead of the hoisted static `import './route'`, whereas
// a plain top-level `process.env.X = ...` would run after it.
vi.hoisted(() => {
  process.env.MAX_CONCURRENT_STUDY_JOBS = '3';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getNoteMock = vi.hoisted(() => vi.fn());
const batchGetNotesMock = vi.hoisted(() => vi.fn());
const listNotesByGroupMock = vi.hoisted(() => vi.fn());
const putStudySetMock = vi.hoisted(() => vi.fn());
const countInFlightMock = vi.hoisted(() => vi.fn());
const buildStudySetItemMock = vi.hoisted(() => vi.fn((input: unknown) => ({ ...(input as object) })));
const resolveAiConfigMock = vi.hoisted(() => vi.fn());
const estimateTokensMock = vi.hoisted(() => vi.fn());
const resolveContextLimitMock = vi.hoisted(() => vi.fn());
const resolveMaxSourceNotesMock = vi.hoisted(() => vi.fn());
const getSourceMock = vi.hoisted(() => vi.fn());
const resolveSourceTextMock = vi.hoisted(() => vi.fn());
const getUserProfileBySubMock = vi.hoisted(() => vi.fn());
const assembleLearnerContextMock = vi.hoisted(() => vi.fn());

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn(),
}));

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getNote: getNoteMock,
  batchGetNotes: batchGetNotesMock,
  listNotesByGroup: listNotesByGroupMock,
  putStudySet: putStudySetMock,
  countInFlightStudySets: countInFlightMock,
  buildStudySetItem: buildStudySetItemMock,
  resolveAiConfig: resolveAiConfigMock,
  estimateTokens: estimateTokensMock,
  resolveContextLimit: resolveContextLimitMock,
  resolveMaxSourceNotes: resolveMaxSourceNotesMock,
  getSource: getSourceMock,
  resolveSourceText: resolveSourceTextMock,
  getUserProfileBySub: getUserProfileBySubMock,
  assembleLearnerContext: assembleLearnerContextMock,
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

const DEFAULT_AI_CONFIG = {
  generationEnabled: true,
  enabledMaterialTypes: {
    flashcards: true,
    quiz: true,
    assignment: true,
    summary: true,
    glossary: true,
    study_guide: true,
  },
  modelId: 'us.anthropic.test-model',
  modelOverrides: {},
  baseSystemPrompt: 'You are a study assistant.',
  promptOverrides: {},
  maxTokens: 4096,
  temperature: 0.5,
  topP: 0.9,
  languageDefault: 'auto' as const,
  perUserDailyGenerationCap: 100,
  maxNotesPerRun: 25,
  tokenBudget: 8192,
  pollyVoiceId: 'Camila',
  pollyEngine: 'neural' as const,
  speedRate: 'medium',
  version: 1,
  updatedBy: 'system',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('user-sub-1');
  // getNote is no longer used by the route (kept for backward-compat reference);
  // batchGetNotes is the new ownership-check function.
  getNoteMock.mockResolvedValue({ noteId: 'note-1', title: 'My Note', bodyS3Key: 'markdown/note-1.md' });
  batchGetNotesMock.mockResolvedValue([{ noteId: 'note-1', title: 'My Note', bodyS3Key: 'markdown/note-1.md' }]);
  listNotesByGroupMock.mockResolvedValue([{ noteId: 'note-1', title: 'My Note', bodyS3Key: 'markdown/note-1.md' }]);
  countInFlightMock.mockResolvedValue(0);
  putStudySetMock.mockResolvedValue(undefined);
  resolveAiConfigMock.mockResolvedValue({ ...DEFAULT_AI_CONFIG });
  estimateTokensMock.mockReturnValue(100);
  resolveContextLimitMock.mockReturnValue(60000);
  resolveMaxSourceNotesMock.mockReturnValue(50);
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
  s3SendMock.mockResolvedValue({
    Body: { transformToString: async () => 'note body content' },
  });
  getSourceMock.mockResolvedValue({
    sourceId: 'doc-1',
    title: 'Doc One',
    status: 'ready',
    extractedTextS3Key: 'sources/users/user-sub-1/doc-1.md',
  });
  resolveSourceTextMock.mockResolvedValue({ text: 'doc text', provenanceLabel: 'Doc One' });
  // Default: no profile (null) so unrelated tests are unaffected.
  getUserProfileBySubMock.mockResolvedValue(null);
  assembleLearnerContextMock.mockReturnValue(undefined);
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

  it('returns 404 when the note is not found (or owned by another user)', async () => {
    // batchGetNotes returns an empty array when no notes match the caller's partition.
    batchGetNotesMock.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('One or more notes not found.');
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

  it('returns 403 when generationEnabled is false (global kill switch)', async () => {
    resolveAiConfigMock.mockResolvedValueOnce({ ...DEFAULT_AI_CONFIG, generationEnabled: false });

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('AI generation is currently disabled.');
    expect(putStudySetMock).not.toHaveBeenCalled();
  });

  it('returns 403 when enabledMaterialTypes[type] is false (per-type toggle)', async () => {
    resolveAiConfigMock.mockResolvedValueOnce({
      ...DEFAULT_AI_CONFIG,
      enabledMaterialTypes: { ...DEFAULT_AI_CONFIG.enabledMaterialTypes, flashcards: false },
    });

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Flashcards generation is currently disabled.');
    expect(putStudySetMock).not.toHaveBeenCalled();
  });

  it('dryRun returns estimatedTokens, rateLimitRemaining and does not write', async () => {
    countInFlightMock.mockResolvedValue(1); // remaining = 3 - 1 = 2
    estimateTokensMock.mockReturnValue(5000);
    resolveContextLimitMock.mockReturnValue(60000);

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', dryRun: true }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.estimatedTokens).toBe(5000);
    expect(body.noteCount).toBe(1);
    expect(body.rateLimitRemaining).toBe(2);
    expect(body.truncatedFrom).toBeUndefined();
    expect(putStudySetMock).not.toHaveBeenCalled();
  });

  it('dryRun rateLimitRemaining is 0 when at the cap', async () => {
    countInFlightMock.mockResolvedValue(3); // at cap (MAX=3)

    const res = await POST(makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', dryRun: true }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.rateLimitRemaining).toBe(0);
  });

  it('returns 422 too_many_notes when sourceNoteIds exceeds the cap', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `note-${String(i).padStart(3, '0')}`);

    const res = await POST(makeRequest({ sourceNoteIds: ids, type: 'flashcards' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(body.error).toBe('too_many_notes');
    expect(body.max).toBe(50);
    expect(putStudySetMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M20.3 — document sources (route-level unit tests)
// ---------------------------------------------------------------------------

describe('document sources (M20.3)', () => {
  it('POST with document-only sourceRefs enqueues and persists sourceRefs', async () => {
    // No notes — document only; batchGetNotes returns [] for empty id list
    batchGetNotesMock.mockResolvedValueOnce([]);

    const res = await POST(
      makeRequest({ sourceRefs: [{ type: 'document', id: 'doc-1' }], type: 'flashcards' }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(202);
    expect(typeof body.studySetId).toBe('string');
    expect(putStudySetMock).toHaveBeenCalledTimes(1);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRefs: expect.arrayContaining([{ type: 'document', id: 'doc-1' }]),
      }),
    );
  });

  it('returns 422 source_not_ready when the document source is still extracting', async () => {
    batchGetNotesMock.mockResolvedValueOnce([]);
    getSourceMock.mockResolvedValueOnce({ sourceId: 'doc-1', status: 'extracting' });

    const res = await POST(
      makeRequest({ sourceRefs: [{ type: 'document', id: 'doc-1' }], type: 'flashcards' }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(body.error).toBe('source_not_ready');
  });

  it('returns 404 when the document source is not found', async () => {
    batchGetNotesMock.mockResolvedValueOnce([]);
    getSourceMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      makeRequest({ sourceRefs: [{ type: 'document', id: 'doc-1' }], type: 'flashcards' }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('Source not found.');
  });

  it('dryRun with a document ref calls resolveSourceText and reflects it in token estimate', async () => {
    batchGetNotesMock.mockResolvedValueOnce([]);
    // estimate > context limit → mapReduceNeeded = true
    estimateTokensMock.mockReturnValueOnce(70000);
    resolveContextLimitMock.mockReturnValueOnce(60000);

    const res = await POST(
      makeRequest({ sourceRefs: [{ type: 'document', id: 'doc-1' }], type: 'flashcards', dryRun: true }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.mapReduceNeeded).toBe(true);
    expect(resolveSourceTextMock).toHaveBeenCalledWith('user-sub-1', { type: 'document', id: 'doc-1' });
  });
});

// ---------------------------------------------------------------------------
// M24.2 — language precedence + learnerContext snapshot
// ---------------------------------------------------------------------------

describe('M24.2 — language precedence + learnerContext snapshot', () => {
  it('explicit request language wins over profile preferredLanguage', async () => {
    // Profile says bilingual, request says pt-BR → pt-BR wins.
    getUserProfileBySubMock.mockResolvedValueOnce({
      aiProfile: { preferredLanguage: 'bilingual', updatedAt: '2025-01-01T00:00:00.000Z' },
    });
    assembleLearnerContextMock.mockReturnValueOnce(undefined);

    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', language: 'pt-BR' }),
    );

    expect(res.status).toBe(202);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'pt-BR' }),
    );
  });

  it('omitted language falls back to profile preferredLanguage', async () => {
    // No request language, profile says bilingual → bilingual.
    getUserProfileBySubMock.mockResolvedValueOnce({
      aiProfile: { preferredLanguage: 'bilingual', updatedAt: '2025-01-01T00:00:00.000Z' },
    });
    assembleLearnerContextMock.mockReturnValueOnce(undefined);

    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }),
    );

    expect(res.status).toBe(202);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'bilingual' }),
    );
  });

  it('omitted language + no profile falls back to auto', async () => {
    // getUserProfileBySub returns null (default) → language must be 'auto'.
    getUserProfileBySubMock.mockResolvedValueOnce(null);
    assembleLearnerContextMock.mockReturnValueOnce(undefined);

    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }),
    );

    expect(res.status).toBe(202);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'auto' }),
    );
  });

  it('buildStudySetItem receives learnerContext when profile yields one', async () => {
    const context = 'Learner context (user-provided preferences …): focus: Math; level: Advanced';
    getUserProfileBySubMock.mockResolvedValueOnce({
      aiProfile: { focus: 'Math', level: 'Advanced', updatedAt: '2025-01-01T00:00:00.000Z' },
    });
    assembleLearnerContextMock.mockReturnValueOnce(context);

    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }),
    );

    expect(res.status).toBe(202);
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ learnerContext: context }),
    );
  });

  it('buildStudySetItem receives undefined learnerContext when profile is null', async () => {
    getUserProfileBySubMock.mockResolvedValueOnce(null);
    assembleLearnerContextMock.mockReturnValueOnce(undefined);

    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards' }),
    );

    expect(res.status).toBe(202);
    // learnerContext key should be undefined (not present or explicitly undefined).
    expect(buildStudySetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ learnerContext: undefined }),
    );
  });

  it('dryRun does NOT call getUserProfileBySub', async () => {
    const res = await POST(
      makeRequest({ sourceNoteId: 'note-1', type: 'flashcards', dryRun: true }),
    );

    expect(res.status).toBe(200);
    expect(getUserProfileBySubMock).not.toHaveBeenCalled();
  });
});
