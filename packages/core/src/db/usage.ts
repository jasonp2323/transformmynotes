/**
 * DynamoDB read/write helpers for the usage metering table (M23.4).
 *
 * Impure — uses the shared `ddb` DocumentClient and `TableNames.Usage`.
 * All pure cost-math logic lives in `packages/core/src/usage/`.
 */

import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { usageKeys } from './keys.js';
import { DEFAULT_PRICE_BOOK } from '../usage/price-book.js';
import type { PriceBook, DailyAiAggregate, DailyStorageAggregate } from '../usage/types.js';

// ---------------------------------------------------------------------------
// Price-book helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the stored price book from the CONFIG/PRICING item.
 *
 * Falls back to `DEFAULT_PRICE_BOOK` when no item exists (first run).
 * Strips the DynamoDB pk/sk attributes — returns a clean `PriceBook`.
 */
export async function getPriceBook(): Promise<PriceBook> {
  const result = await getPriceBookItem();
  return result.priceBook;
}

/**
 * Fetches the price book with metadata (updatedAt, updatedBy, seeded flag).
 *
 * `seeded: true` means no custom item was found — the default was returned.
 */
export async function getPriceBookItem(): Promise<{
  priceBook: PriceBook;
  updatedAt?: string;
  updatedBy?: string;
  seeded: boolean;
}> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Usage,
      Key: usageKeys.priceBook(),
    }),
  );

  if (!result.Item) {
    return { priceBook: DEFAULT_PRICE_BOOK, seeded: true };
  }

  // Strip DynamoDB primary-key attributes; return the PriceBook shape.
  const { pk: _pk, sk: _sk, updatedAt, updatedBy, ...rest } = result.Item as Record<string, unknown>;
  const priceBook: PriceBook = {
    models: (rest['models'] as PriceBook['models']) ?? {},
    defaultModel: (rest['defaultModel'] as PriceBook['defaultModel']) ?? DEFAULT_PRICE_BOOK.defaultModel,
    s3PerGbMonth: typeof rest['s3PerGbMonth'] === 'number' ? rest['s3PerGbMonth'] : DEFAULT_PRICE_BOOK.s3PerGbMonth,
  };

  return {
    priceBook,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined,
    updatedBy: typeof updatedBy === 'string' ? updatedBy : undefined,
    seeded: false,
  };
}

/**
 * Writes the price book to the CONFIG/PRICING item.
 *
 * Stamps `updatedAt` (ISO-8601) and `updatedBy` (caller-supplied admin sub).
 */
export async function putPriceBook(priceBook: PriceBook, updatedBy: string): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Usage,
      Item: {
        ...usageKeys.priceBook(),
        models: priceBook.models,
        defaultModel: priceBook.defaultModel,
        s3PerGbMonth: priceBook.s3PerGbMonth,
        updatedBy,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Aggregate range reader
// ---------------------------------------------------------------------------

/**
 * Queries the UsageByDay GSI (GSI1) for every day in `days`, returning all
 * daily-aggregate items across all users for those days.
 *
 * Only items whose sk begins with `DAY#` are included; price-book/gauge/marker
 * items are filtered out defensively.
 *
 * Pagination is handled automatically (loops on LastEvaluatedKey).
 * All days are queried concurrently (bounded by Promise.all; <=92 days).
 */
export async function aggregateUsageOverRange(days: string[]): Promise<{
  aiAggs: DailyAiAggregate[];
  storageAggs: DailyStorageAggregate[];
}> {
  if (days.length === 0) {
    return { aiAggs: [], storageAggs: [] };
  }

  // Query each day concurrently.
  const perDayResults = await Promise.all(days.map((day) => queryDay(day)));

  const aiAggs: DailyAiAggregate[] = [];
  const storageAggs: DailyStorageAggregate[] = [];

  for (const items of perDayResults) {
    for (const item of items) {
      // Defensive: skip items whose sk doesn't begin with DAY#.
      const sk = item.sk as string | undefined;
      if (!sk || !sk.startsWith('DAY#')) continue;

      // Extract sub from pk: USER#<sub>
      const pk = item.pk as string | undefined;
      if (!pk || !pk.startsWith('USER#')) continue;
      const sub = pk.slice('USER#'.length);

      const parsed = usageKeys.parseDailyAggregateSk(sk);

      if (parsed.feature === 'storage') {
        storageAggs.push({
          sub,
          day: parsed.day,
          byteDayBytes: Number(item['byteDayBytes']) || 0,
        });
      } else {
        aiAggs.push({
          sub,
          day: parsed.day,
          feature: parsed.feature,
          model: parsed.model ?? '',
          inputTokens: Number(item['inputTokens']) || 0,
          outputTokens: Number(item['outputTokens']) || 0,
          calls: Number(item['calls']) || 0,
        });
      }
    }
  }

  return { aiAggs, storageAggs };
}

/** Queries GSI1 for a single day, handling pagination. */
async function queryDay(day: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        ...usageKeys.byDayQuery(day),
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );

    for (const item of result.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}
