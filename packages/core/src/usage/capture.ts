import { ulid } from 'ulid';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../db/client';
import { usageKeys } from '../db/keys';
import type { UsageFeature } from '../db/keys';

/**
 * Number of days a raw usage event is retained in DynamoDB before the TTL
 * attribute causes automatic deletion. Set to 90 days to keep recent history
 * for billing reconciliation while avoiding unbounded table growth.
 */
export const USAGE_EVENT_TTL_DAYS = 90;

// ---------------------------------------------------------------------------
// AI usage events
// ---------------------------------------------------------------------------

/**
 * Input for recording a single AI model invocation.
 *
 * @property sub          - Cognito user sub (primary partition identifier).
 * @property feature      - The product feature that triggered the invocation
 *                          (e.g. `'ocr'`, `'study'`).
 * @property model        - Bedrock / Claude model id string used for the call.
 * @property inputTokens  - Prompt (input) token count for the invocation.
 * @property outputTokens - Completion (output) token count for the invocation.
 * @property ts           - Optional ISO-8601 timestamp; defaults to `Date.now()`
 *                          when omitted.
 */
export interface AiUsageEventInput {
  sub: string;
  feature: UsageFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Optional ISO-8601 timestamp. Defaults to `new Date().toISOString()` when omitted. */
  ts?: string;
}

/**
 * Builds the DynamoDB item for an AI usage event without performing any I/O.
 *
 * Key derivation:
 * - A `ulid()` is generated to provide a unique, time-ordered sort-key suffix.
 * - `day` is extracted as the `YYYY-MM-DD` prefix of `ts`.
 * - Primary keys come from `usageKeys.rawEvent(sub, day, id)`.
 * - Raw events are **sparse on GSI1** — no `gsi1pk`/`gsi1sk` keys are written,
 *   so they never appear in the `UsageByDay` index scan used by the aggregator.
 *
 * Non-finite token counts (NaN, ±Infinity, undefined) are coerced to `0`.
 *
 * @returns A plain object ready to pass as a DynamoDB `PutCommand` `Item`.
 */
export function buildAiUsageEvent(input: AiUsageEventInput): Record<string, unknown> {
  const { sub, feature, model } = input;
  const id = ulid();
  const ts = input.ts ?? new Date().toISOString();
  const day = ts.slice(0, 10); // YYYY-MM-DD
  const keys = usageKeys.rawEvent(sub, day, id);
  const inputTokens = Number.isFinite(input.inputTokens) ? input.inputTokens : 0;
  const outputTokens = Number.isFinite(input.outputTokens) ? input.outputTokens : 0;
  // expiresAt is a Unix epoch SECONDS integer — DynamoDB TTL operates on seconds.
  const expiresAt = Math.floor(Date.now() / 1000) + USAGE_EVENT_TTL_DAYS * 86400;
  return { ...keys, feature, model, inputTokens, outputTokens, ts, expiresAt };
}

/**
 * Writes an AI usage event to the `Usage` DynamoDB table.
 *
 * **Fire-and-forget**: this function NEVER throws or rejects. Any DynamoDB error
 * is caught, logged to stderr via `console.error`, and swallowed — a metering
 * failure must never surface to the caller or degrade the primary request path.
 *
 * @param input - See {@link AiUsageEventInput}.
 */
export async function putUsageEvent(input: AiUsageEventInput): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: buildAiUsageEvent(input),
      }),
    );
  } catch (err) {
    console.error('[putUsageEvent] metering write failed', err);
  }
}

// ---------------------------------------------------------------------------
// Storage delta events
// ---------------------------------------------------------------------------

/**
 * Input for recording a storage size change (upload adds bytes; delete subtracts).
 *
 * @property sub        - Cognito user sub.
 * @property bytesDelta - Signed byte count: positive for uploads, negative for
 *                        deletes. A delta of `0` is a no-op and will not be written.
 * @property ts         - Optional ISO-8601 timestamp; defaults to `Date.now()`
 *                        when omitted.
 */
export interface StorageDeltaEventInput {
  sub: string;
  bytesDelta: number;
  /** Optional ISO-8601 timestamp. Defaults to `new Date().toISOString()` when omitted. */
  ts?: string;
}

/**
 * Builds the DynamoDB item for a storage delta event without performing any I/O.
 *
 * The item's `feature` is hardcoded to `'storage'`. Non-finite `bytesDelta`
 * values are coerced to `0`. The item is **sparse on GSI1** — no `gsi1pk`/`gsi1sk`
 * keys are written; raw events never appear in the day-aggregation index.
 *
 * Note: `bytesDelta` may legitimately be negative (representing a delete).
 *
 * @returns A plain object ready to pass as a DynamoDB `PutCommand` `Item`.
 */
export function buildStorageDeltaEvent(input: StorageDeltaEventInput): Record<string, unknown> {
  const { sub } = input;
  const id = ulid();
  const ts = input.ts ?? new Date().toISOString();
  const day = ts.slice(0, 10); // YYYY-MM-DD
  const keys = usageKeys.rawEvent(sub, day, id);
  const bytesDelta = Number.isFinite(input.bytesDelta) ? input.bytesDelta : 0;
  // expiresAt is a Unix epoch SECONDS integer — DynamoDB TTL operates on seconds.
  const expiresAt = Math.floor(Date.now() / 1000) + USAGE_EVENT_TTL_DAYS * 86400;
  return { ...keys, feature: 'storage' as const, bytesDelta, ts, expiresAt };
}

/**
 * Writes a storage delta event to the `Usage` DynamoDB table.
 *
 * **Fire-and-forget**: this function NEVER throws or rejects. Errors are caught,
 * logged, and swallowed.
 *
 * **No-op guard**: if the coerced `bytesDelta` is `0`, the function returns
 * immediately without issuing any DynamoDB write — recording a zero-byte delta
 * would be a pointless event that wastes write capacity.
 *
 * @param input - See {@link StorageDeltaEventInput}.
 */
export async function putStorageDeltaEvent(input: StorageDeltaEventInput): Promise<void> {
  const bytesDelta = Number.isFinite(input.bytesDelta) ? input.bytesDelta : 0;
  if (bytesDelta === 0) {
    return;
  }
  try {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Usage,
        Item: buildStorageDeltaEvent(input),
      }),
    );
  } catch (err) {
    console.error('[putStorageDeltaEvent] metering write failed', err);
  }
}
