/**
 * Aggregator Lambda — consumes the `Usage` DynamoDB stream and materialises
 * two kinds of aggregates from raw `EVT#` INSERT records:
 *
 *   AI events   → `DAY#<date>#<feature>#<model>` daily aggregate
 *                 Idempotency: **recompute-and-PUT** — the aggregator re-sums
 *                 every matching raw event in the day's bucket and overwrites
 *                 the aggregate item. Re-delivering the same INSERT re-sums the
 *                 same set and PUTs the same value, so no double-counting occurs.
 *
 *   Storage δ   → `STORAGE#CURRENT` running gauge (atomic ADD)
 *                 Idempotency: **processed-marker dedupe** — before applying the
 *                 ADD the aggregator conditionally writes a `STORAGEPROC#<ulid>`
 *                 marker item. A `ConditionalCheckFailedException` on that write
 *                 means the event was already processed; the ADD is skipped.
 *                 Markers are TTL'd (same 90-day window as the raw event).
 *
 * Only `INSERT` events with SK prefix `EVT#` are processed. All other records
 * (DAY#, STORAGE#, CONFIG, STORAGEPROC# markers) are silently skipped.
 *
 * Runs as a STANDALONE Lambda — must not use the `@/` path alias; imports only
 * from `@transformmynotes/core` and the AWS SDK.
 */

import { ddb, TableNames, usageKeys, USAGE_EVENT_TTL_DAYS } from '@transformmynotes/core';
import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Type definitions for the stream record shape
// ---------------------------------------------------------------------------

interface AttributeStringValue {
  S?: string;
}
interface AttributeNumberValue {
  N?: string;
}

interface UsageStreamRecord {
  eventName?: string;
  dynamodb?: {
    Keys?: {
      pk?: AttributeStringValue;
      sk?: AttributeStringValue;
    };
    NewImage?: {
      feature?: AttributeStringValue;
      model?: AttributeStringValue;
      bytesDelta?: AttributeNumberValue;
      inputTokens?: AttributeNumberValue;
      outputTokens?: AttributeNumberValue;
    };
  };
}

// ---------------------------------------------------------------------------
// AI aggregate: recompute-and-PUT (idempotent by design)
// ---------------------------------------------------------------------------

/**
 * Re-sums all raw AI events for `(sub, day, feature, model)` from the base
 * table and overwrites the daily aggregate item with the fresh total.
 *
 * Idempotency: because we recompute from the canonical set of raw events each
 * time, re-processing the same INSERT produces the same aggregate value —
 * there is no double-counting.
 */
export async function recomputeAiAggregate(
  sub: string,
  day: string,
  feature: string,
  model: string,
): Promise<void> {
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Usage,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :evt)',
        FilterExpression: '#feature = :f AND #model = :m',
        ExpressionAttributeNames: {
          '#feature': 'feature',
          '#model': 'model',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${sub}`,
          ':evt': `EVT#${day}#`,
          ':f': feature,
          ':m': model,
        },
        ExclusiveStartKey: lastKey as Record<string, unknown> | undefined,
      }),
    );

    for (const item of result.Items ?? []) {
      inputTokens += Number(item.inputTokens ?? 0);
      outputTokens += Number(item.outputTokens ?? 0);
      calls += 1;
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Usage,
      Item: {
        ...usageKeys.dailyAggregate(sub, day, feature, model),
        inputTokens,
        outputTokens,
        calls,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Storage gauge: processed-marker dedupe (idempotent via conditional write)
// ---------------------------------------------------------------------------

/**
 * Applies a signed storage byte delta to the `STORAGE#CURRENT` gauge.
 *
 * Idempotency: a `STORAGEPROC#<ulid>` marker item is conditionally written
 * before the gauge ADD. If the marker already exists
 * (`ConditionalCheckFailedException`) the event was already processed and the
 * ADD is skipped. Any other error is re-thrown.
 *
 * A zero (or non-finite) delta is silently ignored.
 */
export async function applyStorageDelta(
  sub: string,
  ulid: string,
  bytesDelta: number,
): Promise<void> {
  if (!Number.isFinite(bytesDelta) || bytesDelta === 0) return;

  const markerKey = usageKeys.storageProcessedMarker(sub, ulid);
  const expiresAt = Math.floor(Date.now() / 1000) + USAGE_EVENT_TTL_DAYS * 86400;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: { ...markerKey, expiresAt },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      // Already processed — skip the ADD.
      return;
    }
    throw err;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Usage,
      Key: usageKeys.storageGauge(sub),
      UpdateExpression: 'ADD #b :delta',
      ExpressionAttributeNames: { '#b': 'bytes' },
      ExpressionAttributeValues: { ':delta': bytesDelta },
    }),
  );
}

// ---------------------------------------------------------------------------
// Per-record processor
// ---------------------------------------------------------------------------

/**
 * Processes a single stream record. Only `INSERT` events with SK prefix `EVT#`
 * are handled; all others are silently skipped.
 */
export async function processUsageStreamRecord(record: UsageStreamRecord): Promise<void> {
  if (record.eventName !== 'INSERT') return;

  const pk = record.dynamodb?.Keys?.pk?.S;
  const sk = record.dynamodb?.Keys?.sk?.S;

  if (!pk || !sk || !sk.startsWith('EVT#')) return;

  const sub = pk.replace(/^USER#/, '');
  const { day, ulid } = usageKeys.parseRawEventSk(sk);
  const feature = record.dynamodb?.NewImage?.feature?.S;

  if (!feature) return;

  if (feature === 'storage') {
    const bytesDelta = Number(record.dynamodb?.NewImage?.bytesDelta?.N ?? '0');
    await applyStorageDelta(sub, ulid, bytesDelta);
  } else {
    const model = record.dynamodb?.NewImage?.model?.S;
    if (!model) return;
    await recomputeAiAggregate(sub, day, feature, model);
  }
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export async function handler(event: { Records?: UsageStreamRecord[] }): Promise<void> {
  for (const record of event.Records ?? []) {
    try {
      await processUsageStreamRecord(record);
    } catch (err) {
      console.error('[usage-aggregator] record processing failed', err);
    }
  }
}
