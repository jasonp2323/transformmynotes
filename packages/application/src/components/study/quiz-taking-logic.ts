/**
 * Pure, framework-free helpers for the M15 quiz-taking wizard
 * (`QuizTakingScreen`). Extracted so the load-bearing logic — the attempt
 * payload shape and the wizard's "answered" gating — can be unit-tested
 * directly without a DOM/testing-library harness (the app has no jsdom +
 * @testing-library setup; component tests use static rendering only).
 */

import type { ClientQuestion } from '@transformmynotes/core';

/** Body POSTed to `/api/study/[studySetId]/attempt`. */
export interface AttemptRequestBody {
  answers: Record<string, string>;
  durationMs?: number;
}

/**
 * Build the attempt request body from the user's answers map.
 *
 * MCQ answers are stored as the chosen option *index* serialized to a string
 * (e.g. "0", "2"); short-answer answers are the raw text. We pass the map
 * through verbatim (keys = question ids) and attach the elapsed duration when
 * a start timestamp is known.
 */
export function buildAttemptBody(
  answers: Record<string, string>,
  durationMs?: number,
): AttemptRequestBody {
  return durationMs != null ? { answers, durationMs } : { answers };
}

/** A non-empty (after trim) answer counts as answered. */
export function isAnswered(
  answers: Record<string, string>,
  questionId: string,
): boolean {
  return (answers[questionId]?.trim() ?? '') !== '';
}

/** True only when every question has a non-empty answer. */
export function allAnswered(
  questions: Pick<ClientQuestion, 'id'>[],
  answers: Record<string, string>,
): boolean {
  return questions.length > 0 && questions.every((q) => isAnswered(answers, q.id));
}

/** Score (0–1) rendered as a whole-number percentage. */
export function scorePercent(score: number): number {
  return Math.round(score * 100);
}
