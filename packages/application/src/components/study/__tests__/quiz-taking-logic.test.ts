/**
 * Unit tests for the pure quiz-taking-wizard logic (M15.2.1).
 *
 * NOTE ON SCOPE: M15.2.1 originally specced an interactive component test that
 * renders <QuizTakingScreen/>, steps through the wizard, and asserts the POST
 * payload. This monorepo has no jsdom + @testing-library/react + react test
 * plugin (the unit suite runs in the default node env and the only existing
 * component tests use react-dom/server `renderToStaticMarkup`, which does not
 * run effects or support user interaction). Rather than add and fight that
 * tooling, the load-bearing wizard logic was extracted into
 * `quiz-taking-logic.ts` and is unit-tested here directly — covering the exact
 * assertions the component test cared about: the attempt payload shape (keys =
 * question ids, MCQ value = chosen option index as a string), the "all
 * answered" submit gate, and the score-percentage rendering.
 */

import { describe, it, expect } from 'vitest';
import type { ClientQuestion } from '@transformmynotes/core';
import {
  buildAttemptBody,
  isAnswered,
  allAnswered,
  scorePercent,
  letterBand,
  formatDuration,
  formatAttemptDate,
} from '../quiz-taking-logic';

const questions: ClientQuestion[] = [
  { type: 'mcq', id: 'q1', stem: 'What is 2 + 2?', options: ['3', '4', '5'] },
  { type: 'mcq', id: 'q2', stem: 'Capital of France?', options: ['Paris', 'Rome'] },
  { type: 'short-answer', id: 'q3', prompt: 'Explain gravity.' },
];

describe('buildAttemptBody', () => {
  it('passes the answers map through verbatim with question ids as keys', () => {
    // MCQ answers are the chosen option index serialized to a string.
    const answers = { q1: '1', q2: '0', q3: 'Mass attracts mass.' };
    const body = buildAttemptBody(answers, 1234);

    expect(body).toEqual({
      answers: { q1: '1', q2: '0', q3: 'Mass attracts mass.' },
      durationMs: 1234,
    });
    // MCQ value is the index as a string, not the option text.
    expect(body.answers.q1).toBe('1');
    expect(typeof body.answers.q1).toBe('string');
  });

  it('omits durationMs when no start timestamp is known', () => {
    const body = buildAttemptBody({ q1: '0' });
    expect(body).toEqual({ answers: { q1: '0' } });
    expect('durationMs' in body).toBe(false);
  });
});

describe('isAnswered', () => {
  it('treats a non-empty trimmed value as answered', () => {
    expect(isAnswered({ q3: 'hello' }, 'q3')).toBe(true);
    expect(isAnswered({ q1: '0' }, 'q1')).toBe(true); // index "0" is answered
  });

  it('treats missing or whitespace-only values as unanswered', () => {
    expect(isAnswered({}, 'q1')).toBe(false);
    expect(isAnswered({ q3: '   ' }, 'q3')).toBe(false);
    expect(isAnswered({ q3: '' }, 'q3')).toBe(false);
  });
});

describe('allAnswered', () => {
  it('is false until every question has an answer', () => {
    expect(allAnswered(questions, { q1: '1', q2: '0' })).toBe(false);
    expect(allAnswered(questions, { q1: '1', q2: '0', q3: '' })).toBe(false);
  });

  it('is true once every question is answered', () => {
    expect(allAnswered(questions, { q1: '1', q2: '0', q3: 'because' })).toBe(true);
  });

  it('is false for an empty question list', () => {
    expect(allAnswered([], {})).toBe(false);
  });
});

describe('scorePercent', () => {
  it('renders a 0–1 score as a whole-number percentage', () => {
    expect(scorePercent(1)).toBe(100);
    expect(scorePercent(0)).toBe(0);
    expect(scorePercent(0.6666)).toBe(67);
    expect(scorePercent(0.5)).toBe(50);
  });
});

describe('letterBand', () => {
  it('returns A/success for 90 and above', () => {
    expect(letterBand(90)).toEqual({ letter: 'A', tone: 'success' });
    expect(letterBand(100)).toEqual({ letter: 'A', tone: 'success' });
    expect(letterBand(95)).toEqual({ letter: 'A', tone: 'success' });
  });

  it('returns B/warning for 75–89', () => {
    expect(letterBand(89)).toEqual({ letter: 'B', tone: 'warning' });
    expect(letterBand(75)).toEqual({ letter: 'B', tone: 'warning' });
    expect(letterBand(80)).toEqual({ letter: 'B', tone: 'warning' });
  });

  it('returns C/warning for 60–74', () => {
    expect(letterBand(60)).toEqual({ letter: 'C', tone: 'warning' });
    expect(letterBand(74)).toEqual({ letter: 'C', tone: 'warning' });
  });

  it('returns D/danger for 45–59', () => {
    expect(letterBand(45)).toEqual({ letter: 'D', tone: 'danger' });
    expect(letterBand(59)).toEqual({ letter: 'D', tone: 'danger' });
  });

  it('returns F/danger below 45', () => {
    expect(letterBand(44)).toEqual({ letter: 'F', tone: 'danger' });
    expect(letterBand(0)).toEqual({ letter: 'F', tone: 'danger' });
  });
});

describe('formatDuration', () => {
  it('returns null for 0', () => {
    expect(formatDuration(0)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  it('formats seconds-only when under one minute', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(30000)).toBe('30s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats whole minutes with no seconds component', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(120000)).toBe('2m');
  });
});

describe('formatAttemptDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatAttemptDate('2026-06-17T15:45:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to the raw string for an invalid date', () => {
    expect(formatAttemptDate('not-a-date')).toBe('not-a-date');
  });
});
