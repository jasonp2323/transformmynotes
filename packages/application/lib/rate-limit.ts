/**
 * HTTP rate-limit wrapper backed by DynamoDB via `hitRateLimit` from
 * `@transformmynotes/core` (atomic fixed-window counter on the UserData table).
 *
 * Distinct from the existing in-memory `lib/ratelimit.ts` (sliding-window,
 * process-local). This module is async and persists across instances/restarts.
 */

import { hitRateLimit } from '@transformmynotes/core';

/**
 * Extract the client IP from request headers.
 * Prefers CF-Connecting-IP (set by Cloudflare), then falls back to the first
 * entry of X-Forwarded-For. Returns 'unknown' if no usable IP is found.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf?.trim()) return cf.trim();
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim() || 'unknown';
  return 'unknown';
}

/**
 * Increment the fixed-window counter for (route, ip) and check it against the
 * threshold. Returns `{ ok: true }` when the request should be allowed and
 * `{ ok: false, retryAfterSeconds }` when it should be rejected (429).
 *
 * @param route          Route slug used as part of the DynamoDB key.
 * @param ip             Client IP address.
 * @param threshold      Maximum number of requests per window (inclusive).
 * @param windowSeconds  Window size in seconds.
 * @param now            Override for current time in ms (default: Date.now()).
 */
export async function enforceRateLimit(
  route: string,
  ip: string,
  threshold: number,
  windowSeconds: number,
  now: number = Date.now(),
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  // Test/offline escape hatch: the offline E2E suite runs every sign-in from a single
  // localhost IP, which would trip the per-IP login limit. This flag is set ONLY by the
  // E2E global-setup — it is NEVER added to the SST environment map, so production and
  // pr-<N> never see it and always rate-limit normally.
  if (process.env.RATE_LIMIT_DISABLED === '1') {
    return { ok: true, retryAfterSeconds: 0 };
  }
  const windowStart = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
  const { count } = await hitRateLimit({ route, ip, windowStart, windowSeconds });
  if (count > threshold) {
    const retryAfterSeconds = Math.max(1, windowStart + windowSeconds - Math.floor(now / 1000));
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true, retryAfterSeconds: 0 };
}
