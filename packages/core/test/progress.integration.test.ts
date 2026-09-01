/**
 * Integration test: StudyEvents access patterns via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, the per-kind event-item
 * builders, `appendStudyEvent`, and `progressKeys` — no mocks. The dynalite
 * server is started by `dynalite-global.ts` (globalSetup) and the production
 * client is pointed at it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { progressKeys } from '../src/db/keys.js';
import {
  buildReviewEventItem,
  buildQuizAttemptEventItem,
  buildNoteCreatedEventItem,
  appendStudyEvent,
  newEventId,
  type StudyEventItem,
  type ReviewEvent,
  type QuizAttemptEvent,
  type NoteCreatedEvent,
} from '../src/db/progress.js';

describe('appendStudyEvent — write/read round-trips', () => {
  it('(a) appends multiple events and retrieves them all via eventScanForDay', async () => {
    const sub = 'progress-int-001';
    const day = '2026-06-20';
    const ts1 = `${day}T10:00:00.000Z`;
    const ts2 = `${day}T10:01:00.000Z`;
    const ts3 = `${day}T10:02:00.000Z`;

    const reviewItem = buildReviewEventItem(
      sub,
      {
        cardId: 'card-abc',
        grade: 4,
        prevEase: 2.5,
        newEase: 2.6,
        prevIntervalDays: 1,
        newIntervalDays: 4,
        reviewedAt: ts1,
      },
      ts1,
      newEventId(),
    );

    const quizItem = buildQuizAttemptEventItem(
      sub,
      {
        quizId: 'quiz-xyz',
        score: 0.8,
        durationMs: 45000,
        gradedAt: ts2,
      },
      ts2,
      newEventId(),
    );

    const noteItem = buildNoteCreatedEventItem(
      sub,
      {
        noteId: 'note-111',
        tags: ['math', 'algebra'],
      },
      ts3,
      newEventId(),
    );

    await appendStudyEvent(reviewItem);
    await appendStudyEvent(quizItem);
    await appendStudyEvent(noteItem);

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.eventScanForDay(sub, day),
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.length).toBe(3);

    const kinds = (Items as StudyEventItem[]).map((item) => item.kind).sort();
    expect(kinds).toEqual(['NOTE_CREATED', 'QUIZATTEMPT', 'REVIEW']);

    const review = (Items as StudyEventItem[]).find((item): item is ReviewEvent & { pk: string; sk: string; expiresAt: number } => item.kind === 'REVIEW')!;
    expect(review.cardId).toBe('card-abc');
    expect(review.grade).toBe(4);
    expect(review.prevEase).toBe(2.5);
    expect(review.newEase).toBe(2.6);
    expect(review.prevIntervalDays).toBe(1);
    expect(review.newIntervalDays).toBe(4);
    expect(review.reviewedAt).toBe(ts1);
    expect(typeof review.expiresAt).toBe('number');

    const quiz = (Items as StudyEventItem[]).find((item): item is QuizAttemptEvent & { pk: string; sk: string; expiresAt: number } => item.kind === 'QUIZATTEMPT')!;
    expect(quiz.quizId).toBe('quiz-xyz');
    expect(quiz.score).toBe(0.8);
    expect(quiz.durationMs).toBe(45000);
    expect(quiz.gradedAt).toBe(ts2);

    const note = (Items as StudyEventItem[]).find((item): item is NoteCreatedEvent & { pk: string; sk: string; expiresAt: number } => item.kind === 'NOTE_CREATED')!;
    expect(note.noteId).toBe('note-111');
    expect(note.tags).toEqual(['math', 'algebra']);
  });

  it('(b) events from a different user do not appear in the scan', async () => {
    const sub = 'progress-int-002';
    const otherSub = 'progress-int-002-other';
    const day = '2026-06-20';
    const ts = `${day}T11:00:00.000Z`;

    const myEvent = buildNoteCreatedEventItem(
      sub,
      { noteId: 'note-mine', tags: [] },
      ts,
      newEventId(),
    );
    const otherEvent = buildNoteCreatedEventItem(
      otherSub,
      { noteId: 'note-other', tags: [] },
      ts,
      newEventId(),
    );

    await appendStudyEvent(myEvent);
    await appendStudyEvent(otherEvent);

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.eventScanForDay(sub, day),
      }),
    );

    const noteIds = (Items ?? [])
      .filter((item): item is NoteCreatedEvent & { pk: string; sk: string; expiresAt: number } => (item as StudyEventItem).kind === 'NOTE_CREATED')
      .map((item) => item.noteId);
    expect(noteIds).toContain('note-mine');
    expect(noteIds).not.toContain('note-other');
  });
});

describe('progressKeys.dayRangeQuery — DAY# snapshot range queries', () => {
  it('(c) returns in-range DAY# items in chronological order and excludes out-of-range items', async () => {
    const sub = 'progress-int-003';

    const daysToWrite = [
      { date: '2026-06-17', reviews: 5, cardsReviewed: 5, correctReviews: 4, easeSum: 12.5, easeCount: 5, quizAttempts: 1, quizScoreSum: 0.9, notesCreated: 2, studySetsCreated: 1 },
      { date: '2026-06-18', reviews: 3, cardsReviewed: 3, correctReviews: 3, easeSum: 7.5, easeCount: 3, quizAttempts: 0, quizScoreSum: 0,   notesCreated: 1, studySetsCreated: 0 },
      { date: '2026-06-19', reviews: 8, cardsReviewed: 8, correctReviews: 6, easeSum: 20.0, easeCount: 8, quizAttempts: 2, quizScoreSum: 1.6, notesCreated: 0, studySetsCreated: 2 },
      { date: '2026-06-20', reviews: 1, cardsReviewed: 1, correctReviews: 1, easeSum: 2.5,  easeCount: 1, quizAttempts: 0, quizScoreSum: 0,   notesCreated: 3, studySetsCreated: 0 },
    ];

    for (const day of daysToWrite) {
      const keys = progressKeys.dayItem(sub, day.date);
      await ddb.send(
        new PutCommand({
          TableName: TableNames.StudyEvents,
          Item: {
            ...keys,
            reviews: day.reviews,
            cardsReviewed: day.cardsReviewed,
            correctReviews: day.correctReviews,
            easeSum: day.easeSum,
            easeCount: day.easeCount,
            quizAttempts: day.quizAttempts,
            quizScoreSum: day.quizScoreSum,
            notesCreated: day.notesCreated,
            studySetsCreated: day.studySetsCreated,
          },
        }),
      );
    }

    // Query the inclusive range [2026-06-18, 2026-06-19] — should include
    // those two days and exclude 2026-06-17 and 2026-06-20.
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.dayRangeQuery(sub, '2026-06-18', '2026-06-19'),
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.length).toBe(2);

    // Items should come back in ascending date order (ScanIndexForward: true).
    const dates = Items!.map((item) => {
      const sk = (item as { pk: string; sk: string }).sk;
      return sk.replace('DAY#', '');
    });
    expect(dates).toEqual(['2026-06-18', '2026-06-19']);

    // Verify counters on the first returned item.
    const june18 = Items![0] as { pk: string; sk: string; reviews: number; notesCreated: number };
    expect(june18.reviews).toBe(3);
    expect(june18.notesCreated).toBe(1);

    // Out-of-range dates must not appear.
    expect(dates).not.toContain('2026-06-17');
    expect(dates).not.toContain('2026-06-20');
  });

  it('(d) returns empty array when no DAY# items exist in range', async () => {
    const sub = 'progress-int-004';

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.dayRangeQuery(sub, '2026-01-01', '2026-01-31'),
      }),
    );

    expect(Items ?? []).toHaveLength(0);
  });
});
