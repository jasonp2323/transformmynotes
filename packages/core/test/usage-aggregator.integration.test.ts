/**
 * Integration test: `usage-aggregator` Lambda logic (M23.3.1).
 *
 * Exercises `recomputeAiAggregate`, `applyStorageDelta`, and
 * `processUsageStreamRecord` from the aggregator job against the real `ddb`
 * DocumentClient and `TableNames.Usage` via dynalite — no mocks, no AWS.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems —
 * all items are written with individual PutCommands.
 *
 * NOTE ON UNIQUE SUBS: each describe block uses a unique sub prefix
 * (`uagg-001`, `uagg-002`, `uagg-003`) to avoid collisions with other suites
 * sharing the same dynalite instance.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { usageKeys } from '../src/db/keys.js';
import {
  recomputeAiAggregate,
  applyStorageDelta,
  processUsageStreamRecord,
} from '../../application/jobs/usage-aggregator.js';

// ---------------------------------------------------------------------------
// 1. AI aggregate — recompute-and-PUT idempotency
// ---------------------------------------------------------------------------

describe('recomputeAiAggregate — idempotency via recompute-and-PUT', () => {
  const SUB = 'uagg-001';
  const DAY = '2026-06-19';
  const MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';
  const FEATURE = 'ocr';
  // Decoy: different model, must NOT contribute to the aggregate.
  const DECOY_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  // Decoy: different feature.
  const DECOY_FEATURE = 'study';

  it('setup: seeds two matching raw events and one decoy', async () => {
    // Event A — matches (ocr, MODEL).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB, DAY, '01UAGG001AAAAAAAAAAAAAAAA'),
          feature: FEATURE,
          model: MODEL,
          inputTokens: 100,
          outputTokens: 20,
          ts: `${DAY}T10:00:00.000Z`,
          expiresAt: 1900000000,
          // Deliberately NO gsi1 keys — raw events are sparse on GSI1.
        },
      }),
    );

    // Event B — matches (ocr, MODEL).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB, DAY, '01UAGG001BBBBBBBBBBBBBBB'),
          feature: FEATURE,
          model: MODEL,
          inputTokens: 200,
          outputTokens: 40,
          ts: `${DAY}T11:00:00.000Z`,
          expiresAt: 1900000000,
        },
      }),
    );

    // Decoy — different model, same day.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB, DAY, '01UAGG001CCCCCCCCCCCCCCC'),
          feature: DECOY_FEATURE,
          model: DECOY_MODEL,
          inputTokens: 999,
          outputTokens: 999,
          ts: `${DAY}T12:00:00.000Z`,
          expiresAt: 1900000000,
        },
      }),
    );
  });

  it('first call writes the aggregate with the correct totals', async () => {
    await recomputeAiAggregate(SUB, DAY, FEATURE, MODEL);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk: `USER#${SUB}`, sk: `DAY#${DAY}#${FEATURE}#${MODEL}` },
      }),
    );

    expect(result.Item).toBeDefined();
    const item = result.Item!;
    // Sum of event A + event B only.
    expect(item.inputTokens).toBe(300);
    expect(item.outputTokens).toBe(60);
    expect(item.calls).toBe(2);
  });

  it('second call (redelivery) produces the same totals — no double-count', async () => {
    await recomputeAiAggregate(SUB, DAY, FEATURE, MODEL);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk: `USER#${SUB}`, sk: `DAY#${DAY}#${FEATURE}#${MODEL}` },
      }),
    );

    const item = result.Item!;
    // Must still equal the sum of two events — NOT doubled.
    expect(item.inputTokens).toBe(300);
    expect(item.outputTokens).toBe(60);
    expect(item.calls).toBe(2);
  });

  it('decoy model/feature aggregate is absent (not written by this call)', async () => {
    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk: `USER#${SUB}`, sk: `DAY#${DAY}#${DECOY_FEATURE}#${DECOY_MODEL}` },
      }),
    );
    // We never called recomputeAiAggregate for the decoy — it must be absent.
    expect(result.Item).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Storage gauge — processed-marker dedupe
// ---------------------------------------------------------------------------

describe('applyStorageDelta — processed-marker dedupe', () => {
  const SUB = 'uagg-002';
  const ULID_A = '01UAGG002AAAAAAAAAAAAAAAA';
  const ULID_B = '01UAGG002BBBBBBBBBBBBBBB';

  it('first call with ulidA adds +1000 to the gauge', async () => {
    await applyStorageDelta(SUB, ULID_A, 1000);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    expect(result.Item).toBeDefined();
    expect(result.Item!.bytes).toBe(1000);
  });

  it('second call with the SAME ulidA is deduped — gauge stays at 1000', async () => {
    await applyStorageDelta(SUB, ULID_A, 1000);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    expect(result.Item!.bytes).toBe(1000);
  });

  it('call with ulidB (-300) is applied — gauge becomes 700', async () => {
    await applyStorageDelta(SUB, ULID_B, -300);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    expect(result.Item!.bytes).toBe(700);
  });

  it('processed-marker items exist for both ulids', async () => {
    const markerA = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageProcessedMarker(SUB, ULID_A),
      }),
    );
    const markerB = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageProcessedMarker(SUB, ULID_B),
      }),
    );

    expect(markerA.Item).toBeDefined();
    expect(markerB.Item).toBeDefined();
  });

  it('zero delta is a no-op — gauge unchanged', async () => {
    const before = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    await applyStorageDelta(SUB, '01UAGG002CCCCCCCCCCCCCCC', 0);

    const after = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    expect(after.Item!.bytes).toBe(before.Item!.bytes);
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-end: processUsageStreamRecord
// ---------------------------------------------------------------------------

describe('processUsageStreamRecord — end-to-end stream record handling', () => {
  const SUB = 'uagg-003';
  const DAY = '2026-06-20';
  const MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  const FEATURE = 'study';
  const ULID_AI = '01UAGG003AAAAAAAAAAAAAAAA';
  const ULID_STORAGE = '01UAGG003BBBBBBBBBBBBBBB';

  it('setup: seeds a raw AI event for the E2E test', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB, DAY, ULID_AI),
          feature: FEATURE,
          model: MODEL,
          inputTokens: 500,
          outputTokens: 100,
          ts: `${DAY}T09:00:00.000Z`,
          expiresAt: 1900000000,
        },
      }),
    );
  });

  it('INSERT with AI event SK triggers aggregate write', async () => {
    const fakeRecord = {
      eventName: 'INSERT',
      dynamodb: {
        Keys: {
          pk: { S: `USER#${SUB}` },
          sk: { S: `EVT#${DAY}#${ULID_AI}` },
        },
        NewImage: {
          feature: { S: FEATURE },
          model: { S: MODEL },
          inputTokens: { N: '500' },
          outputTokens: { N: '100' },
        },
      },
    };

    await processUsageStreamRecord(fakeRecord);

    const aggKeys = usageKeys.dailyAggregate(SUB, DAY, FEATURE, MODEL);
    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: { pk: aggKeys.pk, sk: aggKeys.sk },
      }),
    );

    expect(result.Item).toBeDefined();
    expect(result.Item!.inputTokens).toBe(500);
    expect(result.Item!.outputTokens).toBe(100);
    expect(result.Item!.calls).toBe(1);
  });

  it('INSERT with storage event SK triggers gauge update', async () => {
    const fakeRecord = {
      eventName: 'INSERT',
      dynamodb: {
        Keys: {
          pk: { S: `USER#${SUB}` },
          sk: { S: `EVT#${DAY}#${ULID_STORAGE}` },
        },
        NewImage: {
          feature: { S: 'storage' },
          bytesDelta: { N: '2048' },
        },
      },
    };

    await processUsageStreamRecord(fakeRecord);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    expect(result.Item).toBeDefined();
    expect(result.Item!.bytes).toBe(2048);
  });

  it('non-EVT# SK is silently ignored', async () => {
    const fakeRecord = {
      eventName: 'INSERT',
      dynamodb: {
        Keys: {
          pk: { S: `USER#${SUB}` },
          sk: { S: 'STORAGE#CURRENT' },
        },
        NewImage: {
          feature: { S: 'storage' },
        },
      },
    };

    // Should not throw, and gauge should remain at 2048 from previous test.
    await processUsageStreamRecord(fakeRecord);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: usageKeys.storageGauge(SUB),
      }),
    );

    // Gauge unchanged — the non-EVT# record was skipped.
    expect(result.Item!.bytes).toBe(2048);
  });

  it('MODIFY event is silently ignored', async () => {
    const fakeRecord = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          pk: { S: `USER#${SUB}` },
          sk: { S: `EVT#${DAY}#${ULID_AI}` },
        },
        NewImage: {
          feature: { S: FEATURE },
          model: { S: MODEL },
        },
      },
    };

    // Should not throw; aggregate from earlier test remains.
    await processUsageStreamRecord(fakeRecord);
  });
});
