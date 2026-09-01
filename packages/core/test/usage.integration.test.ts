/**
 * Integration test: `Usage` table access patterns (M23).
 *
 * Exercises four access patterns against the real `ddb` DocumentClient and
 * `TableNames.Usage`, using `usageKeys` key builders — no mocks.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * all items are written with individual PutCommands.
 *
 * NOTE ON UNIQUE SUBS: each describe block uses a unique sub prefix (`usg-001a`,
 * `usg-002a`, etc.) to avoid collision with other suites sharing the same
 * dynalite instance.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { usageKeys } from '../src/db/keys.js';

// ---------------------------------------------------------------------------
// 1. Raw event round-trip (base table)
// ---------------------------------------------------------------------------

describe('Usage — raw event round-trip (base table)', () => {
  const SUB = 'usg-001a';
  const DAY = '2026-06-19';
  // ULID that contains no special characters — safe for SK embedding.
  const ULID = '01JYK5P000000000000RAWEVT';
  // Model id containing `:` and `.` to prove keys aren't mangled.
  const MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  const INPUT_TOKENS = 512;
  const OUTPUT_TOKENS = 128;
  const TS = '2026-06-19T10:00:00.000Z';
  const EXPIRES_AT = 1782000000; // arbitrary future epoch seconds

  it('puts a raw AI event item and gets it back by the same key', async () => {
    const keys = usageKeys.rawEvent(SUB, DAY, ULID);

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...keys,
          feature: 'ocr',
          model: MODEL,
          inputTokens: INPUT_TOKENS,
          outputTokens: OUTPUT_TOKENS,
          ts: TS,
          expiresAt: EXPIRES_AT,
          // Deliberately NO gsi1pk/gsi1sk — raw events are sparse on GSI1.
        },
      }),
    );

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: keys,
      }),
    );

    expect(result.Item).toBeDefined();
    const item = result.Item!;

    // Primary key round-trip.
    expect(item.pk).toBe(`USER#${SUB}`);
    expect(item.sk).toBe(`EVT#${DAY}#${ULID}`);

    // Attributes survive marshalling (including model id with `:` and `.`).
    expect(item.feature).toBe('ocr');
    expect(item.model).toBe(MODEL);
    expect(item.inputTokens).toBe(INPUT_TOKENS);
    expect(item.outputTokens).toBe(OUTPUT_TOKENS);
    expect(item.ts).toBe(TS);
    expect(item.expiresAt).toBe(EXPIRES_AT);

    // Raw events are sparse on GSI1 — gsi1pk/gsi1sk must be absent.
    expect(item.gsi1pk).toBeUndefined();
    expect(item.gsi1sk).toBeUndefined();
  });

  it('parseRawEventSk recovers day and ulid from the stored sk', async () => {
    const keys = usageKeys.rawEvent(SUB, DAY, ULID);

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: keys,
      }),
    );

    const parsed = usageKeys.parseRawEventSk(result.Item!.sk as string);
    expect(parsed.day).toBe(DAY);
    expect(parsed.ulid).toBe(ULID);
  });
});

// ---------------------------------------------------------------------------
// 2. Daily aggregate read-back via base table (per-user range query)
// ---------------------------------------------------------------------------

describe('Usage — daily aggregate range query (base table)', () => {
  const SUB = 'usg-002a';

  // Days used in this suite.
  const DAY_A = '2026-06-17'; // in range
  const DAY_B = '2026-06-18'; // in range
  const DAY_C = '2026-06-19'; // in range
  const DAY_OUT = '2026-06-16'; // outside the [DAY_A, DAY_C] range

  // Model id with `:` and `.`.
  const MODEL_OCR = 'anthropic.claude-3-haiku-20240307-v1:0';
  const MODEL_STUDY = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

  it('writes daily-aggregate items and range-queries them', async () => {
    // Three AI feature aggregates inside the range.
    const aggregates = [
      { day: DAY_A, feature: 'ocr' as const, model: MODEL_OCR, inputTokens: 100, outputTokens: 20, calls: 1 },
      { day: DAY_B, feature: 'study' as const, model: MODEL_STUDY, inputTokens: 200, outputTokens: 50, calls: 2 },
      { day: DAY_C, feature: 'ocr' as const, model: MODEL_OCR, inputTokens: 150, outputTokens: 30, calls: 1 },
    ];

    for (const agg of aggregates) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Usage,
          Item: {
            ...usageKeys.dailyAggregate(SUB, agg.day, agg.feature, agg.model),
            inputTokens: agg.inputTokens,
            outputTokens: agg.outputTokens,
            calls: agg.calls,
          },
        }),
      );
    }

    // One storage-snapshot aggregate (no model) inside the range.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB, DAY_B, 'storage'),
          byteDayBytes: 1024 * 1024,
        },
      }),
    );

    // One aggregate OUTSIDE the range — must be excluded from the query.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB, DAY_OUT, 'ocr', MODEL_OCR),
          inputTokens: 999,
          outputTokens: 999,
          calls: 99,
        },
      }),
    );

    // One STORAGE#CURRENT gauge — must be excluded (different SK prefix).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.storageGauge(SUB),
          bytes: 2048,
        },
      }),
    );

    // One raw event (EVT#) — must be excluded (different SK prefix).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB, DAY_B, '01JYK5P000000000RAWEVT002'),
          feature: 'ocr',
          model: MODEL_OCR,
          inputTokens: 1,
          outputTokens: 1,
          ts: '2026-06-18T00:00:00.000Z',
          expiresAt: 1782000000,
        },
      }),
    );

    // Query the range [DAY_A, DAY_C].
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        ...usageKeys.listUserAggregatesByRange(SUB, DAY_A, DAY_C),
      }),
    );

    const items = result.Items ?? [];

    // Expect exactly the 4 aggregates inside the range (3 AI + 1 storage snapshot).
    expect(items.length).toBe(4);

    // All must have DAY# SK prefix (no EVT# or STORAGE# items).
    for (const item of items) {
      expect((item.sk as string).startsWith('DAY#')).toBe(true);
    }

    // The out-of-range item must NOT appear.
    const sks = items.map((i) => i.sk as string);
    expect(sks.some((sk) => sk.includes(DAY_OUT))).toBe(false);
  });

  it('parseDailyAggregateSk recovers feature and model (including undefined model for storage)', async () => {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        ...usageKeys.listUserAggregatesByRange(SUB, DAY_A, DAY_C),
      }),
    );

    const items = result.Items ?? [];
    const parsed = items.map((i) => usageKeys.parseDailyAggregateSk(i.sk as string));

    // Every item must parse without throwing.
    expect(parsed.length).toBe(4);

    // The storage-snapshot aggregate must parse with feature='storage', model=undefined.
    const storageParsed = parsed.find((p) => p.feature === 'storage');
    expect(storageParsed).toBeDefined();
    expect(storageParsed!.model).toBeUndefined();

    // AI aggregates must parse with a defined model.
    const aiParsed = parsed.filter((p) => p.feature !== 'storage');
    expect(aiParsed.every((p) => p.model !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-user by-day GSI query (UsageByDay — GSI1)
// ---------------------------------------------------------------------------

describe('Usage — cross-user by-day GSI1 query (UsageByDay)', () => {
  const SUB_X = 'usg-003x';
  const SUB_Y = 'usg-003y';
  const DAY = '2026-06-20';

  // Model id with special chars to prove gsi1sk encoding is safe.
  const MODEL = 'anthropic.claude-3-5-haiku-20241022-v1:0';

  it('writes aggregates for two users on the same day and queries both via GSI1', async () => {
    // Write aggregate for user X.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_X, DAY, 'ocr', MODEL),
          inputTokens: 400,
          outputTokens: 80,
          calls: 4,
        },
      }),
    );

    // Write aggregate for user Y.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_Y, DAY, 'study', MODEL),
          inputTokens: 600,
          outputTokens: 120,
          calls: 3,
        },
      }),
    );

    // Write a raw event for the same day — it must NOT appear in the GSI
    // because raw events carry no gsi1 keys (sparse index).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB_X, DAY, '01JYK5P000000000RAWEVT003'),
          feature: 'ocr',
          model: MODEL,
          inputTokens: 1,
          outputTokens: 1,
          ts: `${DAY}T00:00:00.000Z`,
          expiresAt: 1782000000,
          // Deliberately NO gsi1pk/gsi1sk.
        },
      }),
    );

    // Query GSI1 for the day.
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        ...usageKeys.byDayQuery(DAY),
      }),
    );

    const items = result.Items ?? [];

    // Both users' aggregates must appear.
    const gsi1sks = items.map((i) => i.gsi1sk as string);
    const subXPresent = gsi1sks.some((k) => k.startsWith(`USER#${SUB_X}#`));
    const subYPresent = gsi1sks.some((k) => k.startsWith(`USER#${SUB_Y}#`));
    expect(subXPresent).toBe(true);
    expect(subYPresent).toBe(true);

    // Raw events must NOT appear (they have no gsi1pk/gsi1sk so they're absent
    // from the GSI — verify none of the returned items is an EVT# base-table item).
    for (const item of items) {
      expect((item.sk as string).startsWith('EVT#')).toBe(false);
    }
  });

  it('parseUsageByDayGsi1sk recovers sub, feature, and model from both users', async () => {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        ...usageKeys.byDayQuery(DAY),
      }),
    );

    const items = result.Items ?? [];

    for (const item of items) {
      const parsed = usageKeys.parseUsageByDayGsi1sk(item.gsi1sk as string);
      expect(parsed.sub).toBeTruthy();
      expect(parsed.feature).toBeTruthy();
      expect(parsed.model).toBe(MODEL);
    }

    // User X row: feature=ocr.
    const xItems = items.filter((i) => (i.gsi1sk as string).includes(SUB_X));
    expect(xItems.length).toBe(1);
    expect(usageKeys.parseUsageByDayGsi1sk(xItems[0].gsi1sk as string).feature).toBe('ocr');

    // User Y row: feature=study.
    const yItems = items.filter((i) => (i.gsi1sk as string).includes(SUB_Y));
    expect(yItems.length).toBe(1);
    expect(usageKeys.parseUsageByDayGsi1sk(yItems[0].gsi1sk as string).feature).toBe('study');
  });
});

// ---------------------------------------------------------------------------
// 4. Storage gauge atomic-counter round-trip (UpdateCommand ADD)
// ---------------------------------------------------------------------------

describe('Usage — storage gauge atomic counter (UpdateCommand ADD)', () => {
  const SUB = 'usg-004a';

  it('increments and decrements the bytes counter and reads back the correct total', async () => {
    const key = usageKeys.storageGauge(SUB);

    // First ADD: +1000 bytes.
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Usage,
        Key: key,
        UpdateExpression: 'ADD #b :delta',
        ExpressionAttributeNames: { '#b': 'bytes' },
        ExpressionAttributeValues: { ':delta': 1000 },
      }),
    );

    // Second ADD: -300 bytes.
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Usage,
        Key: key,
        UpdateExpression: 'ADD #b :delta',
        ExpressionAttributeNames: { '#b': 'bytes' },
        ExpressionAttributeValues: { ':delta': -300 },
      }),
    );

    const result = await ddb.send(
      new GetCommand({
        TableName: TableNames.Usage,
        Key: key,
      }),
    );

    expect(result.Item).toBeDefined();
    expect(result.Item!.pk).toBe(`USER#${SUB}`);
    expect(result.Item!.sk).toBe('STORAGE#CURRENT');
    // 1000 - 300 = 700.
    expect(result.Item!.bytes).toBe(700);
  });
});
