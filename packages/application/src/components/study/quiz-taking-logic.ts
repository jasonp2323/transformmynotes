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

// --- M15.3 score-report helpers ----------------------------------------------

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type GradeTone = 'success' | 'warning' | 'danger';

export interface LetterBand {
  letter: GradeLetter;
  tone: GradeTone;
}

/**
 * Maps a 0–100 percentage to a letter grade and a DS colour tone.
 *
 * A ≥ 90 → success
 * B ≥ 75 → warning
 * C ≥ 60 → warning
 * D ≥ 45 → danger
 * F < 45 → danger
 */
export function letterBand(percent: number): LetterBand {
  if (percent >= 90) return { letter: 'A', tone: 'success' };
  if (percent >= 75) return { letter: 'B', tone: 'warning' };
  if (percent >= 60) return { letter: 'C', tone: 'warning' };
  if (percent >= 45) return { letter: 'D', tone: 'danger' };
  return { letter: 'F', tone: 'danger' };
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * Examples: 90000 → "1m 30s", 5000 → "5s", 0/undefined → null.
 */
export function formatDuration(ms: number | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Formats an ISO-8601 date string to a compact, locale-tolerant display string.
 *
 * Pure: uses only the Date constructor + toLocaleDateString/toLocaleTimeString.
 * Example output: "Jun 17, 2026, 3:45 PM" (locale-dependent).
 */
export function formatAttemptDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
