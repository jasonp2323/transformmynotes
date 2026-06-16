import { describe, it, expect } from 'vitest';
import { attemptKeys } from '../../src/db/keys';
import {
  buildAttemptItem,
  type AttemptResult,
} from '../../src/db/quiz-attempts';

describe('attemptKeys — pure builder checks', () => {
  it('attemptItemKey returns USER#<sub> / ATTEMPT#<quizId>#<attemptId>', () => {
    const key = attemptKeys.attemptItemKey('subA', 'Q1', 'A1');
    expect(key).toEqual({ pk: 'USER#subA', sk: 'ATTEMPT#Q1#A1' });
  });

  it('gsi8pk returns QUIZ#<quizId>', () => {
    expect(attemptKeys.gsi8pk('Q1')).toBe('QUIZ#Q1');
  });

  it('gsi8sk returns GRADEDAT#<gradedAt>', () => {
    expect(attemptKeys.gsi8sk('2026-01-02T03:04:05Z')).toBe(
      'GRADEDAT#2026-01-02T03:04:05Z',
    );
  });

  it('listAttemptsByQuizQuery uses GSI8 newest-first capped at 20', () => {
    const params = attemptKeys.listAttemptsByQuizQuery('Q1');
    expect(params.IndexName).toBe('GSI8');
    expect(params.KeyConditionExpression).toBe('gsi8pk = :pk');
    expect(params.ExpressionAttributeValues[':pk']).toBe('QUIZ#Q1');
    expect(params.ScanIndexForward).toBe(false);
    expect(params.Limit).toBe(20);
  });

  it('listAttemptsForUserQuizQuery uses base-table prefix on ATTEMPT#<quizId>#', () => {
    const params = attemptKeys.listAttemptsForUserQuizQuery('subA', 'Q1');
    expect(params.KeyConditionExpression).toBe(
      'pk = :pk AND begins_with(sk, :sk)',
    );
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#subA');
    expect(params.ExpressionAttributeValues[':sk']).toBe('ATTEMPT#Q1#');
  });
});

describe('buildAttemptItem — pure builder checks', () => {
  const RESULTS: Record<string, AttemptResult> = {
    q1: { correct: true, score: 1 },
    q2: { correct: false, score: 0, feedback: 'Not quite' },
  };

  const BASE_INPUT = {
    sub: 'subA',
    quizId: 'Q1',
    attemptId: 'A1',
    answers: { q1: '0', q2: 'photosynthesis' },
    results: RESULTS,
    score: 0.5,
    gradedAt: '2026-01-02T03:04:05Z',
  };

  it('populates pk / sk / gsi8pk / gsi8sk correctly', () => {
    const item = buildAttemptItem(BASE_INPUT);
    expect(item.pk).toBe('USER#subA');
    expect(item.sk).toBe('ATTEMPT#Q1#A1');
    expect(item.gsi8pk).toBe('QUIZ#Q1');
    expect(item.gsi8sk).toBe('GRADEDAT#2026-01-02T03:04:05Z');
  });

  it('carries through answers, results, score, gradedAt', () => {
    const item = buildAttemptItem(BASE_INPUT);
    expect(item.attemptId).toBe('A1');
    expect(item.quizId).toBe('Q1');
    expect(item.answers).toEqual(BASE_INPUT.answers);
    expect(item.results).toEqual(RESULTS);
    expect(item.score).toBe(0.5);
    expect(item.gradedAt).toBe('2026-01-02T03:04:05Z');
  });

  it('omits durationMs from the item when not provided', () => {
    const item = buildAttemptItem(BASE_INPUT);
    expect('durationMs' in item).toBe(false);
  });

  it('includes durationMs when provided', () => {
    const item = buildAttemptItem({ ...BASE_INPUT, durationMs: 42000 });
    expect(item.durationMs).toBe(42000);
  });
});
