import { describe, it, expect } from 'vitest';
import {
  buildReviewEventItem,
  buildQuizAttemptEventItem,
  buildNoteCreatedEventItem,
  buildStudySetCreatedEventItem,
  STUDY_EVENT_TTL_DAYS,
} from '../progress.js';

const SUB = 'sub-test-123';
const TS = '2026-06-20T03:26:49.123Z';
const ID = '01HWXYZTEST';
const NOW = new Date('2026-06-20T03:26:49.123Z');

// ─── buildReviewEventItem ────────────────────────────────────────────────────

describe('buildReviewEventItem', () => {
  const input = {
    cardId: 'card-abc',
    grade: 4 as const,
    prevEase: 2.5,
    newEase: 2.6,
    prevIntervalDays: 6,
    newIntervalDays: 15,
    reviewedAt: TS,
  };

  it('builds an item with the correct pk, sk, and kind', () => {
    const item = buildReviewEventItem(SUB, input, TS, ID, NOW);
    expect(item.pk).toBe(`USER#${SUB}`);
    expect(item.sk).toBe(`EVENT#${TS}#${ID}`);
    expect(item.kind).toBe('REVIEW');
  });

  it('includes all REVIEW fields', () => {
    const item = buildReviewEventItem(SUB, input, TS, ID, NOW);
    expect(item).toMatchObject({
      cardId: 'card-abc',
      grade: 4,
      prevEase: 2.5,
      newEase: 2.6,
      prevIntervalDays: 6,
      newIntervalDays: 15,
      reviewedAt: TS,
    });
  });

  it('sets expiresAt approximately 400 days out', () => {
    const item = buildReviewEventItem(SUB, input, TS, ID, NOW);
    const expectedTtl = Math.floor(NOW.getTime() / 1000) + STUDY_EVENT_TTL_DAYS * 24 * 60 * 60;
    // Allow ±2 seconds for floating-point / rounding
    expect(item.expiresAt).toBeGreaterThanOrEqual(expectedTtl - 2);
    expect(item.expiresAt).toBeLessThanOrEqual(expectedTtl + 2);
  });

  it('expiresAt is in epoch seconds (not milliseconds)', () => {
    const item = buildReviewEventItem(SUB, input, TS, ID, NOW);
    // Epoch seconds for 2026-06-20 + 400 days ≈ 1.8e9, far below 1e12 (milliseconds range)
    expect(item.expiresAt).toBeLessThan(1e12);
    expect(item.expiresAt).toBeGreaterThan(1e9);
  });
});

// ─── buildQuizAttemptEventItem ───────────────────────────────────────────────

describe('buildQuizAttemptEventItem', () => {
  const input = {
    quizId: 'quiz-xyz',
    score: 0.85,
    durationMs: 12345,
    gradedAt: TS,
  };

  it('builds an item with kind QUIZATTEMPT', () => {
    const item = buildQuizAttemptEventItem(SUB, input, TS, ID, NOW);
    expect(item.kind).toBe('QUIZATTEMPT');
    expect(item.pk).toBe(`USER#${SUB}`);
    expect(item.sk).toBe(`EVENT#${TS}#${ID}`);
  });

  it('includes quizId, score, durationMs, gradedAt', () => {
    const item = buildQuizAttemptEventItem(SUB, input, TS, ID, NOW);
    expect(item).toMatchObject({
      quizId: 'quiz-xyz',
      score: 0.85,
      durationMs: 12345,
      gradedAt: TS,
    });
  });

  it('works without optional durationMs', () => {
    const { durationMs: _, ...inputNoDuration } = input;
    const item = buildQuizAttemptEventItem(SUB, inputNoDuration, TS, ID, NOW);
    expect((item as { durationMs?: number }).durationMs).toBeUndefined();
  });

  it('sets expiresAt ~400 days out', () => {
    const item = buildQuizAttemptEventItem(SUB, input, TS, ID, NOW);
    const expectedTtl = Math.floor(NOW.getTime() / 1000) + STUDY_EVENT_TTL_DAYS * 24 * 60 * 60;
    expect(item.expiresAt).toBeCloseTo(expectedTtl, -1);
  });
});

// ─── buildNoteCreatedEventItem ───────────────────────────────────────────────

describe('buildNoteCreatedEventItem', () => {
  const input = { noteId: 'note-abc', tags: ['math', 'algebra'] };

  it('builds an item with kind NOTE_CREATED', () => {
    const item = buildNoteCreatedEventItem(SUB, input, TS, ID, NOW);
    expect(item.kind).toBe('NOTE_CREATED');
    expect(item.pk).toBe(`USER#${SUB}`);
  });

  it('includes noteId and tags', () => {
    const item = buildNoteCreatedEventItem(SUB, input, TS, ID, NOW);
    expect(item).toMatchObject({ noteId: 'note-abc', tags: ['math', 'algebra'] });
  });

  it('preserves empty tags array', () => {
    const item = buildNoteCreatedEventItem(SUB, { noteId: 'n', tags: [] }, TS, ID, NOW);
    expect((item as { tags: string[] }).tags).toEqual([]);
  });
});

// ─── buildStudySetCreatedEventItem ───────────────────────────────────────────

describe('buildStudySetCreatedEventItem', () => {
  const input = { studySetId: 'ss-xyz', type: 'flashcards' as const };

  it('builds an item with kind STUDYSET_CREATED', () => {
    const item = buildStudySetCreatedEventItem(SUB, input, TS, ID, NOW);
    expect(item.kind).toBe('STUDYSET_CREATED');
    expect(item.pk).toBe(`USER#${SUB}`);
  });

  it('includes studySetId and type', () => {
    const item = buildStudySetCreatedEventItem(SUB, input, TS, ID, NOW);
    expect(item).toMatchObject({ studySetId: 'ss-xyz', type: 'flashcards' });
  });

  it('accepts all StudyMaterialType variants', () => {
    const types = ['flashcards', 'quiz', 'assignment', 'summary', 'glossary', 'study_guide'] as const;
    for (const type of types) {
      const item = buildStudySetCreatedEventItem(SUB, { studySetId: 'ss', type }, TS, ID, NOW);
      expect((item as { type: string }).type).toBe(type);
    }
  });
});
