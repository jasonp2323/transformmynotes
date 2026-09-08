import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

// Mock @transformmynotes/core with a real-ish toClientQuestions implementation that strips
// answer-key fields (correctIndex, modelAnswer, acceptableAnswers, explanation) so the test
// exercises the stripping behaviour exercised by the route.
vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
  toClientQuestions: (quiz: {
    questions: Array<{
      type: string;
      id: string;
      stem?: string;
      options?: string[];
      prompt?: string;
      correctIndex?: number;
      modelAnswer?: string;
      acceptableAnswers?: string[];
      explanation?: string;
    }>;
  }) =>
    quiz.questions.map((q) => {
      if (q.type === 'mcq') {
        return { type: q.type, id: q.id, stem: q.stem, options: q.options };
      }
      // short-answer
      return { type: q.type, id: q.id, prompt: q.prompt };
    }),
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn().mockImplementation(function (input) { return input; }),
}));

import { GET } from './route';

const READY_QUIZ_ITEM = {
  studySetId: 'set-001',
  sourceNoteIds: ['note-001'],
  type: 'quiz' as const,
  title: 'Test Quiz Set',
  status: 'ready' as const,
  language: 'en' as const,
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

// A GeneratedQuiz payload stored in S3 — includes answer-key fields that must be stripped.
const FAKE_QUIZ = {
  questions: [
    {
      type: 'mcq',
      id: 'q-001',
      stem: 'What is 2 + 2?',
      options: ['1', '2', '3', '4'],
      correctIndex: 3,
      explanation: 'Because math.',
    },
    {
      type: 'short-answer',
      id: 'q-002',
      prompt: 'Explain photosynthesis.',
      modelAnswer: 'Plants convert light to energy.',
      acceptableAnswers: ['light energy', 'chlorophyll'],
      explanation: 'Standard biology.',
    },
  ],
};

const PARAMS = { params: { studySetId: 'set-001' } };
const REQ = new Request('http://test/api/study/set-001/questions');

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getStudySetMock.mockResolvedValue(READY_QUIZ_ITEM);
  s3SendMock.mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(FAKE_QUIZ) },
  });
});

describe('GET /api/study/[studySetId]/questions', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when study set not found', async () => {
    getStudySetMock.mockResolvedValueOnce(undefined);
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 400 when item type is not quiz (e.g. flashcards)', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_QUIZ_ITEM, type: 'flashcards' });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not a quiz.');
  });

  it('returns 404 when status is not ready', async () => {
    getStudySetMock.mockResolvedValueOnce({
      ...READY_QUIZ_ITEM,
      status: 'queued',
      bodyS3Key: undefined,
    });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Body not ready.');
  });

  it('returns 404 when status is ready but bodyS3Key is missing', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_QUIZ_ITEM, bodyS3Key: undefined });
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Body not ready.');
  });

  it('returns 200 with stripped questions on success and no answer-key fields', async () => {
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(200);

    const body = await res.json() as {
      type: string;
      studySetId: string;
      questions: Array<Record<string, unknown>>;
    };

    expect(body.type).toBe('quiz');
    expect(body.studySetId).toBe('set-001');
    expect(body.questions).toHaveLength(2);

    // Verify answer-key fields are entirely absent from the serialised response.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('correctIndex');
    expect(serialised).not.toContain('modelAnswer');
    expect(serialised).not.toContain('acceptableAnswers');
    expect(serialised).not.toContain('explanation');

    // Verify MCQ client question shape.
    const mcq = body.questions[0];
    expect(mcq.type).toBe('mcq');
    expect(mcq.id).toBe('q-001');
    expect(mcq.stem).toBe('What is 2 + 2?');
    expect(Array.isArray(mcq.options)).toBe(true);

    // Verify short-answer client question shape.
    const sa = body.questions[1];
    expect(sa.type).toBe('short-answer');
    expect(sa.id).toBe('q-002');
    expect(sa.prompt).toBe('Explain photosynthesis.');
  });

  it('returns 500 when S3 fetch throws', async () => {
    s3SendMock.mockRejectedValueOnce(new Error('S3 error'));
    const res = await GET(REQ, PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Could not load questions.');
  });
});
