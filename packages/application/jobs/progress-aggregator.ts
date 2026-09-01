/**
 * M25.2 stream consumer: converts raw study-event INSERTs into atomic counter
 * increments on per-user daily snapshot (DAY#) items.
 *
 * At-least-once tolerance:
 *   The `ADD` expression in `incrementDaySnapshot` is NOT idempotent — if the
 *   stream delivers the same EVENT# INSERT twice, the counter will be
 *   over-counted by one. This is an accepted trade-off for M25 MVP. The nightly
 *   `progress-finalize` cron's `rederiveDaySnapshot` call is the self-healing
 *   backstop: it recomputes the day's totals from canonical raw EVENT# items and
 *   overwrites the snapshot, correcting any double-counts from prior redeliveries.
 *
 * UTC-day bucketing:
 *   Day boundaries are UTC calendar days (MVP). The event timestamp embedded in
 *   the sort key (`EVENT#<ISO-8601 ts>#<ulid>`) is always UTC, so slicing the
 *   first 10 characters of the timestamp gives the correct YYYY-MM-DD bucket.
 *   Per-user timezone support is deferred to a future iteration.
 *
 * Runs as a STANDALONE Lambda — must not use the `@/` path alias; imports only
 * from `@transformmynotes/core` and the AWS SDK.
 */

import {
  progressKeys,
  incrementDaySnapshot,
  deltaForEvent,
} from '@transformmynotes/core';
import type { StudyEvent } from '@transformmynotes/core';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

// ---------------------------------------------------------------------------
// Type: DynamoDB stream event (minimal subset sufficient for this consumer)
// ---------------------------------------------------------------------------

interface DynamoDBStreamRecord {
  eventName?: string;
  dynamodb?: {
    NewImage?: Record<string, AttributeValue>;
  };
}

interface DynamoDBStreamEvent {
  Records?: DynamoDBStreamRecord[];
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

/**
 * Processes each INSERT record from the StudyEvents DynamoDB stream.
 *
 * Per-record errors are caught and logged; a single bad record never fails
 * the entire batch (at-least-once delivery continues for the remaining records).
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  for (const record of event.Records ?? []) {
    try {
      // Defence-in-depth: skip non-INSERTs even though the subscription filter
      // already narrows to INSERT events with sk prefix EVENT#.
      if (record.eventName !== 'INSERT') continue;

      const newImage = record.dynamodb?.NewImage;
      if (!newImage) continue;

      // Unmarshall the raw DynamoDB image to a plain JS object.
      const item = unmarshall(newImage) as Record<string, unknown>;

      const pk = item['pk'];
      const sk = item['sk'];

      if (typeof pk !== 'string' || typeof sk !== 'string') continue;
      if (!sk.startsWith('EVENT#')) continue;

      const sub = pk.replace(/^USER#/, '');
      // Recover the UTC timestamp from the sort key: EVENT#<ISO-8601 ts>#<ulid>
      const { ts } = progressKeys.parseEventSk(sk);
      const day = ts.slice(0, 10); // YYYY-MM-DD

      const delta = deltaForEvent(item as unknown as StudyEvent);
      await incrementDaySnapshot(sub, day, delta);
    } catch (err) {
      console.error('[progress-aggregator] record processing failed', err);
      // Continue to next record — never throw the whole batch on one bad record.
    }
  }
}
