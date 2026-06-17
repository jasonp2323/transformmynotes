import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());
const getAttemptMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
  getAttempt: getAttemptMock,
  toClientQuestions: (quiz: { questions: Array<{ type: string; id: string; stem?: string; options?: string[]; prompt?: string }> }) =>
    quiz.questions.map((q) => {
      if (q.type === 'mcq') {
        return { type: 'mcq', id: q.id, stem: q.stem, options: q.options };
      }
      return { type: 'short-answer', id: q.id, prompt: q.prompt };
    }),
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: s3SendMock })),
  GetObjectCommand: vi.fn().mockImplementation((input) => input),
}));

import { GET } from './route';

const READY_QUIZ_ITEM = {
  studySetId: 'set-001',
  sourceNoteIds: ['note-001'],
  type: 'quiz' as const,
  title: 'Test Quiz',
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

const MIXED_QUIZ = {
  questions: [
    {
      type: 'mcq',
      id: 'm1',
      stem: 'What is 2 + 2?',
      options: ['1', '2', '3', '4'],
      correctIndex: 3,
      explanation: 'Because math.',
    },
    {
      type: 'short-answer',
      id: 's1',
      prompt: 'Explain photosynthesis.',
      modelAnswer: 'Plants convert light to energy.',
      acceptableAnswers: ['light energy'],
      explanation: 'Standard biology.',
    },
  ],
};

const ATTEMPT_ITEM = {
  attemptId: 'attempt-001',
  quizId: 'set-001',
  answers: { m1: '3', s1: 'Plants use light.' },
  results: {
    m1: { correct: true, score: 1 },
    s1: { correct: true, score: 1, feedback: 'Great answer.' },
  },
  score: 1,
  gradedAt: '2024-01-01T12:00:00.000Z',
  durationMs: 60000,
  pk: 'USER#sub-1',
  sk: 'ATTEMPT#set-001#attempt-001',
  gsi8pk: 'QUIZ#set-001',
  gsi8sk: 'GRADEDAT#2024-01-01T12:00:00.000Z',
};

const PARAMS = { params: { studySetId: 'set-001', attemptId: 'attempt-001' } };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getAttemptMock.mockResolvedValue(ATTEMPT_ITEM);
  getStudySetMock.mockResolvedValue(READY_QUIZ_ITEM);
  s3SendMock.mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(MIXED_QUIZ) },
  });
});

describe('GET /api/study/[studySetId]/attempts/[attemptId]', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when attempt not found', async () => {
    getAttemptMock.mockResolvedValueOnce(undefined);
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 400 when study set type is not quiz', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_QUIZ_ITEM, type: 'flashcards' });
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not a quiz.');
  });

  it('returns 200 with client-safe questions (no answer keys) and revealed results', async () => {
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      attemptId: string;
      score: number;
      gradedAt: string;
      durationMs: number;
      questions: Array<Record<string, unknown>>;
      answers: Record<string, string>;
      results: Array<Record<string, unknown>>;
    };

    expect(body.attemptId).toBe('attempt-001');
    expect(body.score).toBe(1);
    expect(body.gradedAt).toBe('2024-01-01T12:00:00.000Z');
    expect(body.durationMs).toBe(60000);
    expect(body.answers).toEqual({ m1: '3', s1: 'Plants use light.' });

    // questions must be client-safe — no answer key fields
    for (const q of body.questions) {
      expect(q).not.toHaveProperty('correctIndex');
      expect(q).not.toHaveProperty('modelAnswer');
      expect(q).not.toHaveProperty('acceptableAnswers');
      expect(q).not.toHaveProperty('explanation');
    }

    // results reveal answer keys
    const mcqResult = body.results.find((r) => r.type === 'mcq')!;
    expect(mcqResult).toBeDefined();
    expect(mcqResult.questionId).toBe('m1');
    expect(mcqResult.correctIndex).toBe(3);
    expect(mcqResult.explanation).toBe('Because math.');
    expect(mcqResult.correct).toBe(true);

    const saResult = body.results.find((r) => r.type === 'short-answer')!;
    expect(saResult).toBeDefined();
    expect(saResult.questionId).toBe('s1');
    expect(saResult.modelAnswer).toBe('Plants convert light to energy.');
    expect(saResult.explanation).toBe('Standard biology.');
    expect(saResult.feedback).toBe('Great answer.');
    expect(saResult.correct).toBe(true);
  });
});
