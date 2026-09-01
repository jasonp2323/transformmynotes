/**
 * Integration test: `runStorageSnapshot` (M23.3.2) — DynamoDB round-trip
 * via dynalite.
 *
 * Exercises the real `ddb` DocumentClient, `userDataKeys`, `usageKeys`, and
 * the cost-math helpers against an in-memory DynamoDB. No mocks, no AWS
 * credentials, no network access needed.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, matching the pattern
 * used throughout the integration suite.
 *
 * NOTE ON UNIQUE SUBS: each describe block uses a unique sub prefix
 * (`ssnap-001`, `ssnap-002`, `ssnap-003`) to avoid collision with other
 * suites sharing the same dynalite instance.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { userDataKeys, usageKeys } from '../src/db/keys.js';
import { averageBytes, gbMonths, storageUsd } from '../src/usage/cost.js';
import { runStorageSnapshot } from '../../application/jobs/storage-snapshot.js';

// ---------------------------------------------------------------------------
// 1. Snapshot write + active-user filtering
// ---------------------------------------------------------------------------

describe('runStorageSnapshot — snapshot write + active-user filtering', () => {
  const DAY = '2026-06-20';

  // Two ACTIVE users.
  const ACTIVE_SUB_A = 'ssnap-001a';
  const ACTIVE_SUB_B = 'ssnap-001b';
  const BYTES_A = 5_000_000_000; // 5 GB
  const BYTES_B = 1_000_000;     // 1 MB

  // One DISABLED user — must NOT get a snapshot.
  const DISABLED_SUB = 'ssnap-001d';
  const BYTES_DISABLED = 2_000_000_000;

  it('seeds active and disabled users with gauges then runs the snapshot', async () => {
    const createdAt = '2026-01-01T00:00:00.000Z';

    // Seed two ACTIVE user profiles.
    for (const sub of [ACTIVE_SUB_A, ACTIVE_SUB_B]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: {
            ...userDataKeys.profile(sub),
            ...userDataKeys.statusIndex('active', createdAt),
            email: `${sub}@example.com`,
            role: 'member',
            status: 'active',
            createdAt,
          },
        }),
      );
    }

    // Seed one DISABLED user profile.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...userDataKeys.profile(DISABLED_SUB),
          ...userDataKeys.statusIndex('disabled', createdAt),
          email: `${DISABLED_SUB}@example.com`,
          role: 'member',
          status: 'disabled',
          createdAt,
        },
      }),
    );

    // Seed storage gauges for all three users.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: { ...usageKeys.storageGauge(ACTIVE_SUB_A), bytes: BYTES_A },
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: { ...usageKeys.storageGauge(ACTIVE_SUB_B), bytes: BYTES_B },
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: { ...usageKeys.storageGauge(DISABLED_SUB), bytes: BYTES_DISABLED },
      }),
    );

    // Run the snapshot.
    const result = await runStorageSnapshot({ day: DAY });

    // At least the 2 active users seeded in this suite were snapshotted.
    // (Other suites sharing the same dynalite instance may also have active users,
    // so we cannot assert an exact total of 2.)
    expect(result.snapshotted).toBeGreaterThanOrEqual(2);
  });

  it('active user A has a byteDayBytes aggregate equal to its gauge bytes', async () => {
    const { pk, sk } = usageKeys.dailyAggregate(ACTIVE_SUB_A, DAY, 'storage');
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk, sk },
      }),
    );
    expect(Item).toBeDefined();
    expect(Item!.byteDayBytes).toBe(BYTES_A);
  });

  it('active user B has a byteDayBytes aggregate equal to its gauge bytes', async () => {
    const { pk, sk } = usageKeys.dailyAggregate(ACTIVE_SUB_B, DAY, 'storage');
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk, sk },
      }),
    );
    expect(Item).toBeDefined();
    expect(Item!.byteDayBytes).toBe(BYTES_B);
  });

  it('disabled user has NO storage-snapshot aggregate', async () => {
    const { pk, sk } = usageKeys.dailyAggregate(DISABLED_SUB, DAY, 'storage');
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk, sk },
      }),
    );
    expect(Item).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Active user with no gauge yet → snapshot writes byteDayBytes === 0
// ---------------------------------------------------------------------------

describe('runStorageSnapshot — active user with no gauge writes byteDayBytes 0', () => {
  const DAY = '2026-06-21';
  const SUB = 'ssnap-002a';

  it('seeds an active user without a gauge, runs snapshot, asserts byteDayBytes 0', async () => {
    const createdAt = '2026-02-01T00:00:00.000Z';

    // Seed an active user profile — deliberately NO storage gauge.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...userDataKeys.profile(SUB),
          ...userDataKeys.statusIndex('active', createdAt),
          email: `${SUB}@example.com`,
          role: 'member',
          status: 'active',
          createdAt,
        },
      }),
    );

    const result = await runStorageSnapshot({ day: DAY });
    // At least this user was snapshotted (other suites may also run active users).
    expect(result.snapshotted).toBeGreaterThanOrEqual(1);

    const { pk: aggPk, sk: aggSk } = usageKeys.dailyAggregate(SUB, DAY, 'storage');
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk: aggPk, sk: aggSk },
      }),
    );

    expect(Item).toBeDefined();
    expect(Item!.byteDayBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. GB-month derivation using cost-math helpers
// ---------------------------------------------------------------------------

describe('GB-month derivation from daily byteDayBytes snapshots', () => {
  it('30 days of 5 GB/day yields ~5 GB-months and ~$0.115 at $0.023/GB-month', () => {
    const snapshots = Array.from({ length: 30 }, () => 5_000_000_000);

    const avgB = averageBytes(snapshots);
    expect(avgB).toBe(5_000_000_000);

    const gbm = gbMonths(avgB, snapshots.length);
    // (5e9 / 1e9) * (30 / 30) = 5.0
    expect(gbm).toBeCloseTo(5.0, 5);

    const usd = storageUsd(gbm, 0.023);
    // 5.0 * 0.023 = 0.115
    expect(usd).toBeCloseTo(0.115, 5);
  });

  it('averageBytes returns 0 for an empty snapshot array', () => {
    expect(averageBytes([])).toBe(0);
  });

  it('gbMonths returns 0 when periodDays is 0', () => {
    expect(gbMonths(5_000_000_000, 0)).toBe(0);
  });
});
