/**
 * Integration test: ATTEMPT item shape + `listAttemptsByQuiz` (GSI8
 * ByQuizAttempt) and `listAttemptsForUserQuiz` (base-table primary index)
 * for the M15 auto-graded quiz feature (issue #235).
 *
 * Exercises the real `ddb` DocumentClient, `attemptKeys` builders,
 * `buildAttemptItem`, `putAttempt`, `listAttemptsByQuiz`,
 * `listAttemptsForUserQuiz`, and `deleteAttempt` — no mocks. The dynalite
 * server is started by `dynalite-global.ts` (globalSetup, which recreates the
 * `infra/db.ts` tables incl. the new GSI8) and the production client is pointed
 * at it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import type { AttemptResult } from '../src/db/quiz-attempts.js';
import {
  buildAttemptItem,
  putAttempt,
  listAttemptsByQuiz,
  listAttemptsForUserQuiz,
  deleteAttempt,
} from '../src/db/quiz-attempts.js';

// ---------------------------------------------------------------------------
// Integration: write attempt items → GSI8 + base-table query round-trip
// ---------------------------------------------------------------------------

describe('quiz attempts — GSI8 (ByQuizAttempt) + base-table round-trip', () => {
  const QUIZ_ID = 'quiz-attempt-001';
  const SUB_A = 'sub-attempt-a';
  const SUB_B = 'sub-attempt-b';

  const RESULTS: Record<string, AttemptResult> = {
    q1: { correct: true, score: 1 },
    q2: { correct: false, score: 0, feedback: 'Review the chapter' },
  };

  // Three attempts for user A with DISTINCT, increasing gradedAt timestamps.
  const A_EARLY = {
    attemptId: 'attempt-a-early',
    gradedAt: '2026-01-01T00:00:00.000Z',
    score: 0.2,
  };
  const A_MID = {
    attemptId: 'attempt-a-mid',
    gradedAt: '2026-01-05T00:00:00.000Z',
    score: 0.5,
  };
  const A_LATE = {
    attemptId: 'attempt-a-late',
    gradedAt: '2026-01-10T00:00:00.000Z',
    score: 0.9,
  };

  // One attempt for user B on the same quiz.
  const B_ONLY = {
    attemptId: 'attempt-b-only',
    gradedAt: '2026-01-07T00:00:00.000Z',
    score: 0.6,
  };

  it('setup: writes 3 attempts for user A and 1 for user B (same quiz)', async () => {
    for (const a of [A_EARLY, A_MID, A_LATE]) {
      await putAttempt(
        buildAttemptItem({
          sub: SUB_A,
          quizId: QUIZ_ID,
          attemptId: a.attemptId,
          answers: { q1: '0', q2: 'text' },
          results: RESULTS,
          score: a.score,
          gradedAt: a.gradedAt,
        }),
      );
    }
    await putAttempt(
      buildAttemptItem({
        sub: SUB_B,
        quizId: QUIZ_ID,
        attemptId: B_ONLY.attemptId,
        answers: { q1: '1', q2: 'other' },
        results: RESULTS,
        score: B_ONLY.score,
        gradedAt: B_ONLY.gradedAt,
        durationMs: 30000,
      }),
    );
  });

  it('listAttemptsByQuiz returns all 4 attempts across both users via GSI8', async () => {
    const attempts = await listAttemptsByQuiz(QUIZ_ID);
    expect(attempts).toHaveLength(4);
  });

  it('listAttemptsByQuiz returns attempts newest-first (descending gradedAt)', async () => {
    const attempts = await listAttemptsByQuiz(QUIZ_ID);
    const gradedAts = attempts.map((a) => a.gradedAt);
    const sortedDesc = [...gradedAts].sort().reverse();
    expect(gradedAts).toEqual(sortedDesc);
    // Concretely: A_LATE, B_ONLY, A_MID, A_EARLY.
    expect(gradedAts).toEqual([
      A_LATE.gradedAt,
      B_ONLY.gradedAt,
      A_MID.gradedAt,
      A_EARLY.gradedAt,
    ]);
  });

  it('GSI8 results filtered to user A yield exactly the 3 user-A attempts', async () => {
    const attempts = await listAttemptsByQuiz(QUIZ_ID);
    const userA = attempts.filter((a) => a.pk.startsWith(`USER#${SUB_A}`));
    expect(userA).toHaveLength(3);
    const ids = userA.map((a) => a.attemptId).sort();
    expect(ids).toEqual(
      [A_EARLY.attemptId, A_MID.attemptId, A_LATE.attemptId].sort(),
    );
  });

  it('GSI8 results for user A do NOT include user B attempt', async () => {
    const attempts = await listAttemptsByQuiz(QUIZ_ID);
    const userA = attempts.filter((a) => a.pk.startsWith(`USER#${SUB_A}`));
    const ids = userA.map((a) => a.attemptId);
    expect(ids).not.toContain(B_ONLY.attemptId);
  });

  it('listAttemptsForUserQuiz (base table) returns the same 3 user-A attempts', async () => {
    const attempts = await listAttemptsForUserQuiz(SUB_A, QUIZ_ID);
    expect(attempts).toHaveLength(3);
    const ids = attempts.map((a) => a.attemptId).sort();
    expect(ids).toEqual(
      [A_EARLY.attemptId, A_MID.attemptId, A_LATE.attemptId].sort(),
    );
  });

  it('after deleting one user-A attempt, GSI8 (filtered to A) returns 2', async () => {
    await deleteAttempt(SUB_A, QUIZ_ID, A_MID.attemptId);

    const attempts = await listAttemptsByQuiz(QUIZ_ID);
    const userA = attempts.filter((a) => a.pk.startsWith(`USER#${SUB_A}`));
    expect(userA).toHaveLength(2);
    const ids = userA.map((a) => a.attemptId).sort();
    expect(ids).toEqual([A_EARLY.attemptId, A_LATE.attemptId].sort());
  });
});
