/**
 * M25.2 nightly cron: finalises per-user progress profile fields (streak,
 * lifetime totals) by rolling up all daily snapshots for every active user.
 *
 * Self-healing:
 *   Before aggregating, the cron calls `rederiveDaySnapshot` for both today and
 *   yesterday to correct any missed or double-counted stream events in the
 *   rolling 2-day window where stream redelivery is most likely.
 *
 * Idempotency:
 *   `rederiveDaySnapshot` always overwrites the DAY# snapshot from canonical
 *   raw EVENT# items. `updateProgressProfile` is a recompute-and-SET — repeated
 *   runs for the same day produce the same result.
 *
 * Runs as a STANDALONE Lambda off the daily `sst.aws.Cron` schedule — NOT
 * through the Next.js bundler — so it must avoid the `@/` path alias and import
 * only from `@transformmynotes/core` and the AWS SDK.
 */

import { ddb, TableNames, userDataKeys, progressKeys } from '@transformmynotes/core';
import {
  listDaySnapshots,
  rederiveDaySnapshot,
  updateProgressProfile,
} from '@transformmynotes/core';
import { dayHasActivity, computeStreak } from '@transformmynotes/core';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Core logic (exported for testability)
// ---------------------------------------------------------------------------

/**
 * For each active user: self-heal the rolling 2-day window, recompute streak
 * and lifetime totals from all daily snapshots, and write the result back to
 * the user's profile.
 *
 * @param opts.today - UTC date string (YYYY-MM-DD). Defaults to today.
 * @returns The count of users whose profiles were successfully updated.
 */
export async function runProgressFinalize(
  opts?: { today?: string },
): Promise<{ finalized: number }> {
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);

  // yesterday = today minus 1 UTC calendar day
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);

  // ── Enumerate all ACTIVE users via UserData GSI1 (paginated) ─────────────
  const profiles: Array<{ pk: string }> = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...userDataKeys.listByStatus('active'),
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    for (const item of result.Items ?? []) {
      profiles.push(item as { pk: string });
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  // ── Finalize each user ────────────────────────────────────────────────────
  let finalized = 0;

  for (const profile of profiles) {
    const sub = (profile.pk as string).replace(/^USER#/, '');

    try {
      // SELF-HEAL: recompute today's and yesterday's snapshots from raw events,
      // correcting any missed or double-counted stream deliveries in the 2-day
      // window where at-least-once redelivery is most likely.
      await rederiveDaySnapshot(sub, today);
      await rederiveDaySnapshot(sub, yesterday);

      // Load all daily snapshots for this user across all time.
      const days = await listDaySnapshots(sub, '2000-01-01', today);

      // Determine which days had at least one unit of activity.
      const activeDays = days
        .filter((d) => dayHasActivity(d))
        .map((d) => progressKeys.parseDaySk(d.sk).date);

      // Compute current + longest streak.
      const streak = computeStreak(activeDays, today);

      // Compute lifetime totals by summing across all day snapshots.
      let totalReviewsLifetime = 0;
      let totalQuizAttemptsLifetime = 0;
      let totalCardsMastered = 0;

      for (const day of days) {
        totalReviewsLifetime += day.reviews ?? 0;
        totalQuizAttemptsLifetime += day.quizAttempts ?? 0;
        totalCardsMastered += day.cardsMastered ?? 0;
      }

      // Write the recomputed progress fields back to the user profile.
      // updateProgressProfile returns { ok:false, reason:'not_found' } for users
      // without a profile — skip those rather than throwing.
      const result = await updateProgressProfile(sub, {
        studyStreakDays: streak.current,
        longestStreakDays: streak.longest,
        lastStudyDay: streak.lastStudyDay,
        totalReviewsLifetime,
        totalCardsMastered,
        totalQuizAttemptsLifetime,
      });

      if (!result.ok) {
        // Profile missing — user may have been deleted between enumeration and
        // now, or was never fully onboarded. Skip silently.
        console.warn('[progress-finalize] profile not found for user', { sub });
        continue;
      }

      finalized += 1;
    } catch (err) {
      console.error('[progress-finalize] failed to finalize user', { sub, today }, err);
    }
  }

  return { finalized };
}

// ---------------------------------------------------------------------------
// Lambda handler — daily cron
// ---------------------------------------------------------------------------

/**
 * Lambda entry-point invoked by the daily `sst.aws.Cron` (wired in infra
 * separately). Surfaces errors normally — there is no upstream caller to protect.
 */
export async function handler(): Promise<void> {
  const result = await runProgressFinalize();
  console.log('[progress-finalize] finalized', result.finalized, 'active users');
}
