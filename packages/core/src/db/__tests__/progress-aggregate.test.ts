import { describe, it, expect } from 'vitest';
import {
  MASTERY_THRESHOLD_DAYS,
  dayHasActivity,
  isCorrectGrade,
  isMasteryTransition,
  deltaForEvent,
  foldEventsToDay,
  computeRetentionRate,
  computeAvgQuizScore,
  computeAvgEase,
  computeStreak,
} from '../progress-aggregate.js';
import type { StudyEvent } from '../progress.js';

// ─── dayHasActivity ──────────────────────────────────────────────────────────

describe('dayHasActivity', () => {
  it('returns false when all counters are zero', () => {
    expect(dayHasActivity({ reviews: 0, notesCreated: 0, quizAttempts: 0, studySetsCreated: 0 })).toBe(false);
  });

  it('returns true when reviews > 0', () => {
    expect(dayHasActivity({ reviews: 1, notesCreated: 0, quizAttempts: 0, studySetsCreated: 0 })).toBe(true);
  });

  it('returns true when notesCreated > 0', () => {
    expect(dayHasActivity({ reviews: 0, notesCreated: 2, quizAttempts: 0, studySetsCreated: 0 })).toBe(true);
  });

  it('returns true when quizAttempts > 0', () => {
    expect(dayHasActivity({ reviews: 0, notesCreated: 0, quizAttempts: 1, studySetsCreated: 0 })).toBe(true);
  });

  it('returns true when studySetsCreated > 0', () => {
    expect(dayHasActivity({ reviews: 0, notesCreated: 0, quizAttempts: 0, studySetsCreated: 3 })).toBe(true);
  });

  it('returns true when multiple counters are non-zero', () => {
    expect(dayHasActivity({ reviews: 5, notesCreated: 1, quizAttempts: 2, studySetsCreated: 0 })).toBe(true);
  });
});

// ─── isCorrectGrade ──────────────────────────────────────────────────────────

describe('isCorrectGrade', () => {
  it('returns false for grades 0, 1, 2 (failed)', () => {
    expect(isCorrectGrade(0)).toBe(false);
    expect(isCorrectGrade(1)).toBe(false);
    expect(isCorrectGrade(2)).toBe(false);
  });

  it('returns true for grades 3, 4, 5 (passed)', () => {
    expect(isCorrectGrade(3)).toBe(true);
    expect(isCorrectGrade(4)).toBe(true);
    expect(isCorrectGrade(5)).toBe(true);
  });
});

// ─── isMasteryTransition ─────────────────────────────────────────────────────

describe('isMasteryTransition', () => {
  it('returns true when interval crosses from below to at threshold', () => {
    expect(isMasteryTransition(20, 21)).toBe(true);
  });

  it('returns true when crossing from 1 to well above threshold', () => {
    expect(isMasteryTransition(6, 50)).toBe(true);
  });

  it('returns false when prev was already at or above threshold', () => {
    expect(isMasteryTransition(21, 42)).toBe(false);
    expect(isMasteryTransition(25, 30)).toBe(false);
  });

  it('returns false when new interval stays below threshold', () => {
    expect(isMasteryTransition(6, 15)).toBe(false);
  });

  it('returns false when both prev and new are below threshold', () => {
    expect(isMasteryTransition(1, 6)).toBe(false);
  });

  it('uses custom threshold correctly', () => {
    expect(isMasteryTransition(29, 30, 30)).toBe(true);
    expect(isMasteryTransition(30, 31, 30)).toBe(false);
  });

  it('MASTERY_THRESHOLD_DAYS is 21', () => {
    expect(MASTERY_THRESHOLD_DAYS).toBe(21);
  });
});

// ─── deltaForEvent ───────────────────────────────────────────────────────────

describe('deltaForEvent', () => {
  it('REVIEW (passing grade) → reviews+1, cardsReviewed+1, correctReviews+1, easeSum+newEase, easeCount+1', () => {
    const event: StudyEvent = {
      kind: 'REVIEW',
      cardId: 'c1',
      grade: 4,
      prevEase: 2.5,
      newEase: 2.6,
      prevIntervalDays: 6,
      newIntervalDays: 15,
      reviewedAt: '2026-06-20T00:00:00.000Z',
    };
    expect(deltaForEvent(event)).toEqual({
      reviews: 1,
      cardsReviewed: 1,
      correctReviews: 1,
      easeSum: 2.6,
      easeCount: 1,
      cardsMastered: 0,
    });
  });

  it('REVIEW (failing grade) → correctReviews 0', () => {
    const event: StudyEvent = {
      kind: 'REVIEW',
      cardId: 'c1',
      grade: 1,
      prevEase: 2.5,
      newEase: 2.5,
      prevIntervalDays: 6,
      newIntervalDays: 1,
      reviewedAt: '2026-06-20T00:00:00.000Z',
    };
    const delta = deltaForEvent(event);
    expect(delta.correctReviews).toBe(0);
    expect(delta.reviews).toBe(1);
  });

  it('REVIEW crossing mastery threshold → cardsMastered: 1', () => {
    const event: StudyEvent = {
      kind: 'REVIEW',
      cardId: 'c1',
      grade: 4,
      prevEase: 2.5,
      newEase: 2.6,
      prevIntervalDays: 20,
      newIntervalDays: 21,
      reviewedAt: '2026-06-20T00:00:00.000Z',
    };
    expect(deltaForEvent(event).cardsMastered).toBe(1);
  });

  it('REVIEW already above mastery threshold → cardsMastered: 0', () => {
    const event: StudyEvent = {
      kind: 'REVIEW',
      cardId: 'c1',
      grade: 4,
      prevEase: 2.5,
      newEase: 2.6,
      prevIntervalDays: 21,
      newIntervalDays: 42,
      reviewedAt: '2026-06-20T00:00:00.000Z',
    };
    expect(deltaForEvent(event).cardsMastered).toBe(0);
  });

  it('QUIZATTEMPT → quizAttempts+1, quizScoreSum+score', () => {
    const event: StudyEvent = {
      kind: 'QUIZATTEMPT',
      quizId: 'q1',
      score: 0.75,
      gradedAt: '2026-06-20T00:00:00.000Z',
    };
    expect(deltaForEvent(event)).toEqual({
      quizAttempts: 1,
      quizScoreSum: 0.75,
    });
  });

  it('NOTE_CREATED → notesCreated+1', () => {
    const event: StudyEvent = {
      kind: 'NOTE_CREATED',
      noteId: 'n1',
      tags: [],
    };
    expect(deltaForEvent(event)).toEqual({ notesCreated: 1 });
  });

  it('STUDYSET_CREATED → studySetsCreated+1', () => {
    const event: StudyEvent = {
      kind: 'STUDYSET_CREATED',
      studySetId: 'ss1',
      type: 'flashcards',
    };
    expect(deltaForEvent(event)).toEqual({ studySetsCreated: 1 });
  });
});

// ─── foldEventsToDay ─────────────────────────────────────────────────────────

describe('foldEventsToDay', () => {
  it('returns all-zero counters for an empty array', () => {
    expect(foldEventsToDay([])).toEqual({
      reviews: 0,
      cardsReviewed: 0,
      correctReviews: 0,
      easeSum: 0,
      easeCount: 0,
      quizAttempts: 0,
      quizScoreSum: 0,
      notesCreated: 0,
      studySetsCreated: 0,
      cardsMastered: 0,
    });
  });

  it('folds multiple events of different kinds', () => {
    const events: StudyEvent[] = [
      {
        kind: 'REVIEW',
        cardId: 'c1',
        grade: 4,
        prevEase: 2.5,
        newEase: 2.6,
        prevIntervalDays: 6,
        newIntervalDays: 15,
        reviewedAt: '2026-06-20T00:00:00.000Z',
      },
      {
        kind: 'REVIEW',
        cardId: 'c2',
        grade: 2,
        prevEase: 2.5,
        newEase: 2.5,
        prevIntervalDays: 1,
        newIntervalDays: 1,
        reviewedAt: '2026-06-20T01:00:00.000Z',
      },
      {
        kind: 'QUIZATTEMPT',
        quizId: 'q1',
        score: 0.8,
        gradedAt: '2026-06-20T02:00:00.000Z',
      },
      {
        kind: 'NOTE_CREATED',
        noteId: 'n1',
        tags: ['math'],
      },
      {
        kind: 'STUDYSET_CREATED',
        studySetId: 'ss1',
        type: 'quiz',
      },
    ];

    expect(foldEventsToDay(events)).toEqual({
      reviews: 2,
      cardsReviewed: 2,
      correctReviews: 1,   // grade 4 passes; grade 2 fails
      easeSum: 2.6 + 2.5,
      easeCount: 2,
      quizAttempts: 1,
      quizScoreSum: 0.8,
      notesCreated: 1,
      studySetsCreated: 1,
      cardsMastered: 0,   // both reviews have intervals below 21: 6→15 and 1→1
    });
  });
});

// ─── computeRetentionRate ────────────────────────────────────────────────────

describe('computeRetentionRate', () => {
  it('returns undefined when reviews is 0', () => {
    expect(computeRetentionRate(0, 0)).toBeUndefined();
  });

  it('returns 1 when all reviews are correct', () => {
    expect(computeRetentionRate(10, 10)).toBe(1);
  });

  it('returns 0 when no reviews are correct', () => {
    expect(computeRetentionRate(0, 10)).toBe(0);
  });

  it('returns the correct fraction', () => {
    expect(computeRetentionRate(7, 10)).toBeCloseTo(0.7);
  });
});

// ─── computeAvgQuizScore ─────────────────────────────────────────────────────

describe('computeAvgQuizScore', () => {
  it('returns undefined when quizAttempts is 0', () => {
    expect(computeAvgQuizScore(0, 0)).toBeUndefined();
  });

  it('returns the correct average', () => {
    expect(computeAvgQuizScore(1.6, 2)).toBeCloseTo(0.8);
  });

  it('returns 1 for a perfect score', () => {
    expect(computeAvgQuizScore(3, 3)).toBe(1);
  });
});

// ─── computeAvgEase ──────────────────────────────────────────────────────────

describe('computeAvgEase', () => {
  it('returns undefined when easeCount is 0', () => {
    expect(computeAvgEase(0, 0)).toBeUndefined();
  });

  it('returns the correct average', () => {
    expect(computeAvgEase(5.0, 2)).toBeCloseTo(2.5);
  });
});

// ─── computeStreak ───────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns zeros and null lastStudyDay for empty input', () => {
    expect(computeStreak([], '2026-06-20')).toEqual({
      current: 0,
      longest: 0,
      lastStudyDay: null,
    });
  });

  it('current streak is 1 when today is the only active day', () => {
    const result = computeStreak(['2026-06-20'], '2026-06-20');
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
    expect(result.lastStudyDay).toBe('2026-06-20');
  });

  it('current streak is 1 when only yesterday was active (streak not yet broken)', () => {
    const result = computeStreak(['2026-06-19'], '2026-06-20');
    expect(result.current).toBe(1);
  });

  it('current streak is 0 when last active day was two days ago (fully broken)', () => {
    const result = computeStreak(['2026-06-18'], '2026-06-20');
    expect(result.current).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const days = ['2026-06-18', '2026-06-19', '2026-06-20'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('counts consecutive days ending yesterday (streak not yet broken)', () => {
    const days = ['2026-06-17', '2026-06-18', '2026-06-19'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.current).toBe(3);
  });

  it('longest streak can be greater than current', () => {
    // Longest: Jun 1–5 (5 days). Current: only Jun 19 active = 1 day.
    const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-19'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.longest).toBe(5);
    expect(result.current).toBe(1);  // yesterday active
  });

  it('handles duplicates in activeDays', () => {
    const days = ['2026-06-20', '2026-06-20', '2026-06-19'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  it('lastStudyDay is the most recent active day', () => {
    const days = ['2026-06-15', '2026-06-19', '2026-06-20'];
    const result = computeStreak(days, '2026-06-21');
    expect(result.lastStudyDay).toBe('2026-06-20');
  });

  it('handles a long streak crossing month boundary', () => {
    const days = ['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02'];
    const result = computeStreak(days, '2026-06-02');
    expect(result.current).toBe(4);
    expect(result.longest).toBe(4);
  });

  it('handles a long streak crossing year boundary', () => {
    const days = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'];
    const result = computeStreak(days, '2026-01-02');
    expect(result.current).toBe(4);
    expect(result.longest).toBe(4);
  });

  it('two separate streaks — longest wins', () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-10', '2026-06-11', '2026-06-12'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.longest).toBe(3);
    expect(result.current).toBe(0);  // last active was Jun 12, today is Jun 20
  });

  it('input order is irrelevant — handles unsorted activeDays', () => {
    const days = ['2026-06-20', '2026-06-18', '2026-06-19'];
    const result = computeStreak(days, '2026-06-20');
    expect(result.current).toBe(3);
  });
});
