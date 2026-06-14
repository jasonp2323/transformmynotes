import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { rateLimitKeys } from './keys.js';

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
