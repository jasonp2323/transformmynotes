import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getStudySetMock = vi.hoisted(() => vi.fn());
const putAttemptMock = vi.hoisted(() => vi.fn());
const judgeShortAnswerMock = vi.hoisted(() => vi.fn());

vi.mock('ulid', () => ({ ulid: () => 'attempt-fixed-id' }));

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getStudySet: getStudySetMock,
  buildAttemptItem: (input: unknown) => input,
  putAttempt: putAttemptMock,
  gradeMcq: (q: { correctIndex: number }, answer: string | undefined) => {
    const chosen = Number.parseInt(answer ?? '', 10);
    const correct = chosen === q.correctIndex;
    return { correct, score: correct ? 1 : 0 };
  },
  judgeShortAnswer: judgeShortAnswerMock,
}));

const s3SendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () { return { send: s3SendMock }; }),
  GetObjectCommand: vi.fn().mockImplementation(function (input) { return input; }),
}));

import { POST } from './route';

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

const ALL_MCQ_QUIZ = {
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
      type: 'mcq',
      id: 'm2',
      stem: 'What is the sky colour?',
      options: ['Green', 'Blue', 'Red'],
      correctIndex: 1,
      explanation: 'Rayleigh scattering.',
    },
  ],
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
      acceptableAnswers: ['light energy', 'chlorophyll'],
      explanation: 'Standard biology.',
    },
  ],
};

function postReq(answers: Record<string, string>, durationMs?: number) {
  return new Request('http://test/api/study/set-001/attempt', {
    method: 'POST',
    body: JSON.stringify(durationMs === undefined ? { answers } : { answers, durationMs }),
  });
}

const PARAMS = { params: { studySetId: 'set-001' } };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  getStudySetMock.mockResolvedValue(READY_QUIZ_ITEM);
  s3SendMock.mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(ALL_MCQ_QUIZ) },
  });
  judgeShortAnswerMock.mockResolvedValue({ correct: true, score: 1, feedback: 'ok' });
});

describe('POST /api/study/[studySetId]/attempt', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ m1: '3', m2: '1' }), PARAMS);
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when study set not found', async () => {
    getStudySetMock.mockResolvedValueOnce(undefined);
    const res = await POST(postReq({ m1: '3', m2: '1' }), PARAMS);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not found.');
  });

  it('returns 400 when item type is not quiz', async () => {
    getStudySetMock.mockResolvedValueOnce({ ...READY_QUIZ_ITEM, type: 'flashcards' });
    const res = await POST(postReq({ m1: '3', m2: '1' }), PARAMS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not a quiz.');
  });

  it('returns 400 when answers are missing for some questions', async () => {
    const res = await POST(postReq({ m1: '0' }), PARAMS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Missing answers for some questions.');
  });

  it('returns 200 and grades an all-MCQ quiz without invoking the short-answer judge', async () => {
    const res = await POST(postReq({ m1: '3', m2: '0' }), PARAMS);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      attemptId: string;
      score: number;
      results: Array<Record<string, unknown>>;
    };

    expect(body.attemptId).toBe('attempt-fixed-id');
    expect(typeof body.score).toBe('number');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(2);

    for (const r of body.results) {
      expect(r.type).toBe('mcq');
      expect(r).toHaveProperty('correctIndex');
      expect(r).toHaveProperty('explanation');
    }

    // m1 correct (3 === 3), m2 wrong (0 !== 1) → mean score 0.5
    expect(body.score).toBe(0.5);

    expect(judgeShortAnswerMock).not.toHaveBeenCalled();
    expect(putAttemptMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 and grades a mixed quiz, judging the short-answer question once', async () => {
    s3SendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(MIXED_QUIZ) },
    });
    judgeShortAnswerMock.mockResolvedValueOnce({ correct: true, score: 1, feedback: 'great' });

    const res = await POST(postReq({ m1: '3', s1: 'answer' }), PARAMS);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      attemptId: string;
      score: number;
      results: Array<Record<string, unknown>>;
    };

    expect(body.results).toHaveLength(2);

    const sa = body.results.find((r) => r.type === 'short-answer')!;
    expect(sa).toBeDefined();
    expect(sa.modelAnswer).toBe('Plants convert light to energy.');
    expect(sa.explanation).toBe('Standard biology.');
    expect(sa.feedback).toBe('great');

    expect(judgeShortAnswerMock).toHaveBeenCalledTimes(1);
    expect(putAttemptMock).toHaveBeenCalledTimes(1);
  });
});
