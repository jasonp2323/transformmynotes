/**
 * Integration test: storage delta events (`putStorageDeltaEvent`).
 *
 * Exercises the REAL `putStorageDeltaEvent` helper (from `../src/usage/capture.js`)
 * against the live `ddb` DocumentClient and `TableNames.Usage` — no mocks. It
 * writes raw EVT# events and asserts they round-trip, that a zero delta is a
 * silent no-op, and that the emitted deltas reconcile to the correct value when
 * applied to a `STORAGE#CURRENT` gauge via an atomic `ADD` counter.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles).
 *
 * NOTE ON UNIQUE SUBS: this suite uses a unique sub prefix (`stg-delta-001`) to
 * avoid collision with other suites sharing the same dynalite instance.
 */

import { describe, it, expect } from 'vitest';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { usageKeys } from '../src/db/keys.js';
import { putStorageDeltaEvent } from '../src/usage/capture.js';

describe('storage delta events (putStorageDeltaEvent) — integration', () => {
  const SUB = 'stg-delta-001';

  // Query for this user's raw EVT# items on the base table.
  const evtQuery = () =>
    new QueryCommand({
      TableName: TableNames.Usage,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :evt)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': `USER#${SUB}`, ':evt': 'EVT#' },
    });

  it('writes one EVT# item per non-zero delta and silently skips a zero delta', async () => {
    // Two real deltas: an upload (+1000) and a delete (-300).
    await putStorageDeltaEvent({ sub: SUB, bytesDelta: 1000 });
    await putStorageDeltaEvent({ sub: SUB, bytesDelta: -300 });

    const result = await ddb.send(evtQuery());
    const items = result.Items ?? [];

    // Exactly the two events we emitted.
    expect(items.length).toBe(2);

    // Every event is tagged as a storage event.
    for (const item of items) {
      expect(item.feature).toBe('storage');
    }

    // The exact set of signed deltas is {1000, -300}.
    const deltas = items.map((i) => i.bytesDelta as number).sort((a, b) => a - b);
    expect(deltas).toEqual([-300, 1000]);

    // Each item carries a numeric epoch-seconds TTL and an ISO `ts` string.
    for (const item of items) {
      expect(typeof item.expiresAt).toBe('number');
      expect(typeof item.ts).toBe('string');
      expect(Number.isNaN(Date.parse(item.ts as string))).toBe(false);
    }

    // No-op guard: a zero delta must not write anything.
    await putStorageDeltaEvent({ sub: SUB, bytesDelta: 0 });

    const after = await ddb.send(evtQuery());
    expect((after.Items ?? []).length).toBe(2);
  });

  it('reconciles the emitted deltas to the correct STORAGE#CURRENT gauge value', async () => {
    const key = usageKeys.storageGauge(SUB);

    // Apply the same deltas (+1000 then -300) to the atomic gauge.
    for (const delta of [1000, -300]) {
      await ddb.send(
        new UpdateCommand({
          TableName: TableNames.Usage,
          Key: key,
          UpdateExpression: 'ADD #b :delta',
          ExpressionAttributeNames: { '#b': 'bytes' },
          ExpressionAttributeValues: { ':delta': delta },
        }),
      );
    }

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: key,
      }),
    );

    expect(result.Item).toBeDefined();
    // 1000 - 300 = 700.
    expect(result.Item!.bytes).toBe(700);
  });
});
