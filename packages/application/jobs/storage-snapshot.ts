/**
 * Daily cron: samples each active user's `STORAGE#CURRENT` gauge into a
 * `DAY#<date>#storage` aggregate so GB-month cost can be derived as an average
 * of daily byte snapshots.
 *
 * Runs as a STANDALONE Lambda off the daily `sst.aws.Cron` schedule (wired in
 * infra separately) — NOT through the Next.js bundler — so it must avoid the
 * `@/` path alias and import only from `@transformmynotes/core` and the AWS SDK.
 */

import { ddb, TableNames, usageKeys, userDataKeys } from '@transformmynotes/core';
import { QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Enumerates all ACTIVE users and writes a `DAY#<day>#storage` daily aggregate
 * item to the `Usage` table for each one, sampling the user's current
 * `STORAGE#CURRENT` byte gauge. Running the function a second time for the
 * same day is idempotent — it overwrites the same item.
 *
 * @param opts.day - UTC date string (YYYY-MM-DD). Defaults to today.
 * @returns The count of users for whom a snapshot was written.
 */
export async function runStorageSnapshot(
  opts?: { day?: string },
): Promise<{ snapshotted: number }> {
  const day = opts?.day ?? new Date().toISOString().slice(0, 10);

  // ── Enumerate all ACTIVE users via GSI1 (paginated) ────────────────────────
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

  // ── Snapshot each user ──────────────────────────────────────────────────────
  let snapshotted = 0;

  for (const profile of profiles) {
    const sub = (profile.pk as string).replace(/^USER#/, '');

    try {
      // Read the current storage gauge (may be absent if the user has no data yet).
      const gaugeResult = await ddb.send(
        new GetCommand({
          TableName: TableNames.Usage,
          Key: usageKeys.storageGauge(sub),
        }),
      );
      const bytes = Number(gaugeResult.Item?.bytes ?? 0);

      // Write the daily aggregate (idempotent — same day overwrites same item).
      const aggKeys = usageKeys.dailyAggregate(sub, day, 'storage');
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Usage,
          Item: {
            ...aggKeys,
            byteDayBytes: bytes,
          },
        }),
      );

      snapshotted += 1;
    } catch (err) {
      console.error('[storage-snapshot] failed to snapshot user', { sub, day }, err);
    }
  }

  return { snapshotted };
}

// ---------------------------------------------------------------------------
// Lambda handler — daily cron
// ---------------------------------------------------------------------------

/**
 * Lambda entry-point invoked by the daily `sst.aws.Cron` (wired in infra
 * separately). Surfaces errors normally — there is no upstream caller to protect.
 */
export async function handler(): Promise<void> {
  const result = await runStorageSnapshot();
  console.log('[storage-snapshot] snapshotted', result.snapshotted, 'active users');
}
