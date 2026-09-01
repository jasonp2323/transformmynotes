/**
 * Integration test: M25.2 Study Progress rollup helpers via the real production
 * client (dynalite — real ddb, real TableNames, no mocks).
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildUserProfileItem } from '../src/auth/profile.js';
import { getUserProfileBySub, updateProgressProfile } from '../src/db/users.js';
import {
  buildReviewEventItem,
  buildQuizAttemptEventItem,
  appendStudyEvent,
  newEventId,
  incrementDaySnapshot,
  getDaySnapshot,
  listDaySnapshots,
  rederiveDaySnapshot,
} from '../src/db/progress.js';
import { computeRetentionRate, computeAvgQuizScore } from '../src/db/progress-aggregate.js';

// ─── Suite 1: incrementDaySnapshot / getDaySnapshot / listDaySnapshots ────────

describe('incrementDaySnapshot / getDaySnapshot / listDaySnapshots', () => {
  it('accumulates counters across two increments and reads them back', async () => {
    const sub = 'rollup-int-001';
    const day = '2026-06-20';

    await incrementDaySnapshot(sub, day, {
      reviews: 3,
      cardsReviewed: 3,
      correctReviews: 2,
      easeSum: 7.5,
      easeCount: 3,
      cardsMastered: 1,
    });
    await incrementDaySnapshot(sub, day, {
      reviews: 2,
      cardsReviewed: 2,
      correctReviews: 2,
      easeSum: 5.0,
      easeCount: 2,
      cardsMastered: 0,
    });

    const snapshot = await getDaySnapshot(sub, day);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.reviews).toBe(5);
    expect(snapshot!.cardsReviewed).toBe(5);
    expect(snapshot!.correctReviews).toBe(4);
    expect(snapshot!.easeSum).toBeCloseTo(12.5);
    expect(snapshot!.easeCount).toBe(5);
    expect(snapshot!.cardsMastered).toBe(1);
  });

  it('listDaySnapshots returns items in chronological order', async () => {
    const sub = 'rollup-int-001';
    const day2 = '2026-06-21';

    await incrementDaySnapshot(sub, day2, { reviews: 1, cardsReviewed: 1, correctReviews: 1 });

    const snapshots = await listDaySnapshots(sub, '2026-06-20', '2026-06-21');
    expect(snapshots.length).toBe(2);
    // Verify ascending order via sk parse
    expect(snapshots[0].sk).toBe('DAY#2026-06-20');
    expect(snapshots[1].sk).toBe('DAY#2026-06-21');
  });

  it('listDaySnapshots returns empty for a range with no data', async () => {
    const sub = 'rollup-int-001';
    const snapshots = await listDaySnapshots(sub, '2026-06-19', '2026-06-19');
    expect(snapshots.length).toBe(0);
  });

  it('getDaySnapshot returns null for a day with no data', async () => {
    const sub = 'rollup-int-001';
    const snapshot = await getDaySnapshot(sub, '2026-06-22');
    expect(snapshot).toBeNull();
  });
});

// ─── Suite 2: rederiveDaySnapshot self-heal ───────────────────────────────────

describe('rederiveDaySnapshot — self-heal from raw events', () => {
  it('recomputes counters and derived fields from EVENT# items', async () => {
    const sub = 'rollup-int-002';
    const day = '2026-06-15';

    // REVIEW 1: grade 4 (pass), 10→25 (crosses mastery threshold 21)
    await appendStudyEvent(
      buildReviewEventItem(
        sub,
        {
          cardId: 'c1',
          grade: 4,
          prevEase: 2.5,
          newEase: 2.6,
          prevIntervalDays: 10,
          newIntervalDays: 25,
          reviewedAt: '2026-06-15T10:00:00.000Z',
        },
        '2026-06-15T10:00:00.000Z',
        newEventId(),
      ),
    );

    // REVIEW 2: grade 2 (fail), 1→1 (no mastery)
    await appendStudyEvent(
      buildReviewEventItem(
        sub,
        {
          cardId: 'c2',
          grade: 2,
          prevEase: 2.5,
          newEase: 2.5,
          prevIntervalDays: 1,
          newIntervalDays: 1,
          reviewedAt: '2026-06-15T11:00:00.000Z',
        },
        '2026-06-15T11:00:00.000Z',
        newEventId(),
      ),
    );

    // QUIZATTEMPT: score 0.8
    await appendStudyEvent(
      buildQuizAttemptEventItem(
        sub,
        {
          quizId: 'q1',
          score: 0.8,
          gradedAt: '2026-06-15T12:00:00.000Z',
        },
        '2026-06-15T12:00:00.000Z',
        newEventId(),
      ),
    );

    const snapshot = await rederiveDaySnapshot(sub, day);

    expect(snapshot.reviews).toBe(2);
    expect(snapshot.cardsReviewed).toBe(2);
    expect(snapshot.correctReviews).toBe(1); // grade 2 fails
    expect(snapshot.cardsMastered).toBe(1);  // c1: 10→25 crosses 21
    expect(snapshot.quizAttempts).toBe(1);
    expect(snapshot.quizScoreSum).toBeCloseTo(0.8);

    const expectedRetentionRate = computeRetentionRate(1, 2);
    const expectedAvgQuizScore = computeAvgQuizScore(0.8, 1);
    expect(snapshot.retentionRate).toBeCloseTo(expectedRetentionRate!);
    expect(snapshot.avgQuizScore).toBeCloseTo(expectedAvgQuizScore!);

    // Verify the snapshot was actually persisted
    const persisted = await getDaySnapshot(sub, day);
    expect(persisted).not.toBeNull();
    expect(persisted!.reviews).toBe(2);
    expect(persisted!.cardsMastered).toBe(1);
    expect(persisted!.quizAttempts).toBe(1);
  });
});

// ─── Suite 3: updateProgressProfile ──────────────────────────────────────────

describe('updateProgressProfile — lifetime/streak fields', () => {
  it('writes all six fields and reads them back', async () => {
    const sub = 'rollup-int-003';

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: buildUserProfileItem({
          sub,
          email: 'rollup-int-003@example.com',
          status: 'active',
          role: 'member',
        }),
      }),
    );

    const result = await updateProgressProfile(sub, {
      studyStreakDays: 5,
      longestStreakDays: 10,
      lastStudyDay: '2026-06-20',
      totalReviewsLifetime: 42,
      totalCardsMastered: 7,
      totalQuizAttemptsLifetime: 3,
    });

    expect(result.ok).toBe(true);

    const fetched = await getUserProfileBySub(sub);
    expect(fetched).not.toBeNull();
    expect(fetched!.studyStreakDays).toBe(5);
    expect(fetched!.longestStreakDays).toBe(10);
    expect(fetched!.lastStudyDay).toBe('2026-06-20');
    expect(fetched!.totalReviewsLifetime).toBe(42);
    expect(fetched!.totalCardsMastered).toBe(7);
    expect(fetched!.totalQuizAttemptsLifetime).toBe(3);
  });

  it('returns not_found for a non-existent sub', async () => {
    const result = await updateProgressProfile('rollup-int-nonexistent', {
      studyStreakDays: 1,
      longestStreakDays: 1,
      lastStudyDay: null,
      totalReviewsLifetime: 0,
      totalCardsMastered: 0,
      totalQuizAttemptsLifetime: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('omits lastStudyDay attribute when null is passed', async () => {
    const sub = 'rollup-int-004';

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: buildUserProfileItem({
          sub,
          email: 'rollup-int-004@example.com',
          status: 'active',
          role: 'member',
        }),
      }),
    );

    const result = await updateProgressProfile(sub, {
      studyStreakDays: 0,
      longestStreakDays: 0,
      lastStudyDay: null,
      totalReviewsLifetime: 0,
      totalCardsMastered: 0,
      totalQuizAttemptsLifetime: 0,
    });

    expect(result.ok).toBe(true);

    const fetched = await getUserProfileBySub(sub);
    expect(fetched).not.toBeNull();
    expect(fetched!.lastStudyDay).toBeUndefined();
  });
});
