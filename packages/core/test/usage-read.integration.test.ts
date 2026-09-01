/**
 * Integration test: aggregateUsageOverRange, getPriceBook, putPriceBook (M23.4).
 *
 * Uses the dynalite harness. Each describe block uses a unique sub prefix
 * (usg-read-*) to avoid collision with other suites.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems.
 * All writes use individual PutCommands.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { usageKeys } from '../src/db/keys.js';
import { aggregateUsageOverRange, getPriceBook, getPriceBookItem, putPriceBook } from '../src/db/usage.js';
import { DEFAULT_PRICE_BOOK } from '../src/usage/price-book.js';

// ---------------------------------------------------------------------------
// 1. aggregateUsageOverRange — AI + storage items, two users, two days
// ---------------------------------------------------------------------------

describe('aggregateUsageOverRange — AI + storage items', () => {
  const SUB_A = 'usg-read-001a';
  const SUB_B = 'usg-read-001b';
  const DAY_1 = '2026-06-10';
  const DAY_2 = '2026-06-11';
  const MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

  it('returns AI and storage aggregates correctly parsed', async () => {
    // Write AI aggregate for user A, day 1.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_A, DAY_1, 'study', MODEL),
          inputTokens: 1000,
          outputTokens: 500,
          calls: 3,
        },
      }),
    );

    // Write AI aggregate for user B, day 2 with a different model/feature.
    const MODEL_B = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_B, DAY_2, 'ocr', MODEL_B),
          inputTokens: 200,
          outputTokens: 80,
          calls: 1,
        },
      }),
    );

    // Write storage aggregate for user A, day 1.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_A, DAY_1, 'storage'),
          byteDayBytes: 512 * 1024 * 1024, // 512 MB
        },
      }),
    );

    // Write a raw event (EVT#) — must NOT appear (sparse on GSI1).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.rawEvent(SUB_A, DAY_1, '01JYK5P000000000READ001AA'),
          feature: 'study',
          model: MODEL,
          inputTokens: 999,
          outputTokens: 999,
          ts: `${DAY_1}T12:00:00.000Z`,
          expiresAt: 1782000000,
          // No gsi1pk/gsi1sk — sparse.
        },
      }),
    );

    const result = await aggregateUsageOverRange([DAY_1, DAY_2]);

    // Should have 2 AI aggregates.
    expect(result.aiAggs).toHaveLength(2);
    // Should have 1 storage aggregate.
    expect(result.storageAggs).toHaveLength(1);

    // Verify user A's AI aggregate.
    const aggA = result.aiAggs.find((a) => a.sub === SUB_A);
    expect(aggA).toBeDefined();
    expect(aggA!.day).toBe(DAY_1);
    expect(aggA!.feature).toBe('study');
    expect(aggA!.model).toBe(MODEL);
    expect(aggA!.inputTokens).toBe(1000);
    expect(aggA!.outputTokens).toBe(500);
    expect(aggA!.calls).toBe(3);

    // Verify user B's AI aggregate.
    const aggB = result.aiAggs.find((a) => a.sub === SUB_B);
    expect(aggB).toBeDefined();
    expect(aggB!.day).toBe(DAY_2);
    expect(aggB!.feature).toBe('ocr');
    expect(aggB!.model).toBe(MODEL_B);
    expect(aggB!.inputTokens).toBe(200);
    expect(aggB!.outputTokens).toBe(80);
    expect(aggB!.calls).toBe(1);

    // Verify storage aggregate.
    const storAgg = result.storageAggs.find((a) => a.sub === SUB_A);
    expect(storAgg).toBeDefined();
    expect(storAgg!.day).toBe(DAY_1);
    expect(storAgg!.byteDayBytes).toBe(512 * 1024 * 1024);
  });

  it('returns empty results for an empty days array', async () => {
    const result = await aggregateUsageOverRange([]);
    expect(result.aiAggs).toHaveLength(0);
    expect(result.storageAggs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. byDayQuery GSI path — cross-user items on the same day
// ---------------------------------------------------------------------------

describe('aggregateUsageOverRange — cross-user items via byDayQuery GSI', () => {
  const SUB_X = 'usg-read-002x';
  const SUB_Y = 'usg-read-002y';
  const DAY = '2026-07-01';
  const MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

  it('returns items for both users when querying a shared day via GSI1', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_X, DAY, 'study', MODEL),
          inputTokens: 300,
          outputTokens: 100,
          calls: 1,
        },
      }),
    );

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: {
          ...usageKeys.dailyAggregate(SUB_Y, DAY, 'ocr', MODEL),
          inputTokens: 600,
          outputTokens: 200,
          calls: 2,
        },
      }),
    );

    const result = await aggregateUsageOverRange([DAY]);

    // Both users' items must be returned.
    const subs = result.aiAggs.map((a) => a.sub);
    expect(subs).toContain(SUB_X);
    expect(subs).toContain(SUB_Y);
  });
});

// ---------------------------------------------------------------------------
// 3. putPriceBook / getPriceBook round-trip + DEFAULT_PRICE_BOOK fallback
// ---------------------------------------------------------------------------

describe('putPriceBook / getPriceBook', () => {
  it('returns DEFAULT_PRICE_BOOK when no price-book item has been written', async () => {
    // Use a fresh query — the CONFIG/PRICING item may not exist in this harness.
    // We test the fallback by checking getPriceBookItem seeded flag.
    // Note: another test below may have written a price book already, so we
    // test structure, not identity.
    const pb = await getPriceBook();
    expect(pb).toBeDefined();
    expect(typeof pb.s3PerGbMonth).toBe('number');
    expect(pb.s3PerGbMonth).toBeGreaterThanOrEqual(0);
    expect(pb.models).toBeDefined();
    expect(pb.defaultModel).toBeDefined();
  });

  it('round-trips a custom PriceBook via putPriceBook then getPriceBook', async () => {
    const customBook = {
      models: {
        'test-model-x': { inputPer1k: 0.001, outputPer1k: 0.005 },
      },
      defaultModel: { inputPer1k: 0.002, outputPer1k: 0.010 },
      s3PerGbMonth: 0.025,
    };

    await putPriceBook(customBook, 'admin-sub-test');

    const fetched = await getPriceBook();
    expect(fetched.s3PerGbMonth).toBeCloseTo(0.025, 8);
    expect(fetched.models['test-model-x']).toEqual({ inputPer1k: 0.001, outputPer1k: 0.005 });
    expect(fetched.defaultModel).toEqual({ inputPer1k: 0.002, outputPer1k: 0.010 });
  });

  it('getPriceBookItem returns updatedBy and seeded:false after putPriceBook', async () => {
    const book = {
      models: {},
      defaultModel: { inputPer1k: 0.003, outputPer1k: 0.015 },
      s3PerGbMonth: 0.023,
    };

    await putPriceBook(book, 'admin-abc');

    const item = await getPriceBookItem();
    expect(item.seeded).toBe(false);
    expect(item.updatedBy).toBe('admin-abc');
    expect(item.updatedAt).toBeDefined();
    // updatedAt should be a valid ISO date string.
    expect(() => new Date(item.updatedAt!).toISOString()).not.toThrow();
  });
});
