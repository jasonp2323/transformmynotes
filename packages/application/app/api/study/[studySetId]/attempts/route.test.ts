import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const listAttemptsForUserQuizMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  listAttemptsForUserQuiz: listAttemptsForUserQuizMock,
}));

import { GET } from './route';

function makeAttempt(id: string, gradedAt: string, resultCount = 3) {
  const results: Record<string, { correct: boolean; score: number }> = {};
  for (let i = 0; i < resultCount; i++) {
    results[`q${i}`] = { correct: true, score: 1 };
  }
  return {
    attemptId: id,
    quizId: 'set-001',
    answers: {},
    results,
    score: 1,
    gradedAt,
    pk: 'USER#sub-1',
    sk: `ATTEMPT#set-001#${id}`,
    gsi8pk: 'QUIZ#set-001',
    gsi8sk: `GRADEDAT#${gradedAt}`,
  };
}

const PARAMS = { params: { studySetId: 'set-001' } };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedSubMock.mockResolvedValue('sub-1');
  listAttemptsForUserQuizMock.mockResolvedValue([]);
});

describe('GET /api/study/[studySetId]/attempts', () => {
  it('returns 401 when unauthenticated', async () => {
    getAuthenticatedSubMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Unauthorized');
  });

  it('returns empty array when there are no attempts', async () => {
    listAttemptsForUserQuizMock.mockResolvedValueOnce([]);
    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempts: unknown[] };
    expect(body.attempts).toEqual([]);
  });

  it('returns attempts sorted newest-first by gradedAt', async () => {
    const a1 = makeAttempt('id-a', '2024-01-01T10:00:00.000Z');
    const a2 = makeAttempt('id-b', '2024-01-03T10:00:00.000Z');
    const a3 = makeAttempt('id-c', '2024-01-02T10:00:00.000Z');
    listAttemptsForUserQuizMock.mockResolvedValueOnce([a1, a2, a3]);

    const res = await GET(new Request('http://test'), PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempts: Array<{ attemptId: string }> };
    expect(body.attempts.map((a) => a.attemptId)).toEqual(['id-b', 'id-c', 'id-a']);
  });

  it('derives questionCount from Object.keys(results).length', async () => {
    const a = makeAttempt('id-a', '2024-01-01T10:00:00.000Z', 5);
    listAttemptsForUserQuizMock.mockResolvedValueOnce([a]);

    const res = await GET(new Request('http://test'), PARAMS);
    const body = (await res.json()) as { attempts: Array<{ questionCount: number }> };
    expect(body.attempts[0].questionCount).toBe(5);
  });

  it('caps at 10 attempts when more than 10 are returned', async () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      makeAttempt(`id-${i}`, `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
    );
    listAttemptsForUserQuizMock.mockResolvedValueOnce(items);

    const res = await GET(new Request('http://test'), PARAMS);
    const body = (await res.json()) as { attempts: unknown[] };
    expect(body.attempts).toHaveLength(10);
  });
});
