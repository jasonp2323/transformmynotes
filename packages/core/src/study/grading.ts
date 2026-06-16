/**
 * M15.2.2 — Pure MCQ grading.
 *
 * MCQ grading is deterministic (no LLM): compare the chosen option index
 * against the question's `correctIndex`. Short-answer grading lives in
 * `judgeShortAnswer.ts` (LLM-as-judge).
 */

import type { MCQQuestion } from './quiz.js';
import type { AttemptResult } from '../db/quiz-attempts.js';

/** Pure MCQ grading. `answer` is the chosen option index as a string. */
export function gradeMcq(question: MCQQuestion, answer: string | undefined): AttemptResult {
  const chosen = Number.parseInt(answer ?? '', 10);
  const correct = chosen === question.correctIndex;
  return { correct, score: correct ? 1 : 0 };
}
