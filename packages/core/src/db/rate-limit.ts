import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { rateLimitKeys, sourceRateLimitKeys } from './keys.js';

export interface RateLimitHit {
  /** The counter value AFTER this increment (1-based). */
  count: number;
  /** TTL value written on the item (Unix epoch seconds). */
  expiresAt: number;
}

export interface HitRateLimitParams {
  route: string;
  ip: string;
  /** Window start as Unix epoch SECONDS (already floored to the window). */
  windowStart: number;
  /** Window size in seconds (used to compute the TTL). */
  windowSeconds: number;
}

/**
 * Atomically increments the fixed-window counter for (route, ip, windowStart)
 * and returns the new count. The `expiresAt` TTL is set once on item creation
 * (windowStart + 2*windowSeconds) and left unchanged on subsequent increments.
 */
export async function hitRateLimit(params: HitRateLimitParams): Promise<RateLimitHit> {
  const { route, ip, windowStart, windowSeconds } = params;
  const expiresAt = windowStart + windowSeconds * 2;
  const key = rateLimitKeys.counter(route, ip, String(windowStart));
  const res = await ddb.send(new UpdateCommand({
    TableName: TableNames.UserData,
    Key: key,
    UpdateExpression: 'ADD #count :one SET #exp = if_not_exists(#exp, :exp)',
    ExpressionAttributeNames: { '#count': 'count', '#exp': 'expiresAt' },
    ExpressionAttributeValues: { ':one': 1, ':exp': expiresAt },
    ReturnValues: 'UPDATED_NEW',
  }));
  const attrs = (res.Attributes ?? {}) as { count?: number; expiresAt?: number };
  return { count: Number(attrs.count ?? 0), expiresAt: Number(attrs.expiresAt ?? expiresAt) };
}

export interface HitSourceFetchWindowParams {
  sub: string;
  /** Window start as Unix epoch SECONDS. */
  windowStart: number;
  /** Window size in seconds (used to compute TTL = windowStart + windowSeconds*2). */
  windowSeconds: number;
}

/**
 * Atomically increments the per-user URL-fetch window counter and returns
 * the new count. The `expiresAt` TTL is set once on item creation
 * (windowStart + 2*windowSeconds) and left unchanged on subsequent increments.
 *
 * Used by the from-url route (M21.2.2) to enforce the 10 req/60s rate limit.
 */
export async function hitSourceFetchWindow(
  params: HitSourceFetchWindowParams,
): Promise<{ count: number }> {
  const { sub, windowStart, windowSeconds } = params;
  const expiresAt = windowStart + windowSeconds * 2;
  const key = sourceRateLimitKeys.fetchRateWindow(sub, windowStart);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TableNames.UserData,
      Key: key,
      UpdateExpression: 'ADD #count :one SET #exp = if_not_exists(#exp, :exp)',
      ExpressionAttributeNames: { '#count': 'count', '#exp': 'expiresAt' },
      ExpressionAttributeValues: { ':one': 1, ':exp': expiresAt },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const attrs = (res.Attributes ?? {}) as { count?: number };
  return { count: Number(attrs.count ?? 0) };
}

export interface HitSourceDailyCapParams {
  sub: string;
  /** UTC date string (YYYY-MM-DD) for the cap key. */
  dateUtc: string;
  /** TTL epoch seconds (next midnight UTC). */
  ttlEpochSeconds: number;
}

/**
 * Atomically increments the per-user daily URL-fetch cap counter and returns
 * the new count. The `expiresAt` TTL is set once on item creation to
 * `ttlEpochSeconds` (next midnight UTC) and left unchanged on subsequent
 * increments.
 *
 * Used by the from-url route (M21.2.2) to enforce the 50 req/day cap.
 */
export async function hitSourceDailyCap(
  params: HitSourceDailyCapParams,
): Promise<{ count: number }> {
  const { sub, dateUtc, ttlEpochSeconds } = params;
  const key = sourceRateLimitKeys.fetchDailyCap(sub, dateUtc);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TableNames.UserData,
      Key: key,
      UpdateExpression: 'ADD #count :one SET #exp = if_not_exists(#exp, :exp)',
      ExpressionAttributeNames: { '#count': 'count', '#exp': 'expiresAt' },
      ExpressionAttributeValues: { ':one': 1, ':exp': ttlEpochSeconds },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const attrs = (res.Attributes ?? {}) as { count?: number };
  return { count: Number(attrs.count ?? 0) };
}
