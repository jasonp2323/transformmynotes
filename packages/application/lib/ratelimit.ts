/**
 * In-memory sliding-window rate limiter.
 *
 * Keeps a list of request timestamps per key in a module-level Map. On each
 * call, prunes timestamps older than the window and checks against the limit.
 * Pure / testable — accepts an optional `now` override for deterministic tests.
 */

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Per-key timestamp store (milliseconds since epoch). */
const store = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /** Override the current time (milliseconds since epoch). Useful in tests. */
  now?: number;
}

/**
 * Checks whether `key` is within the rate limit.
 *
 * @param key     Unique string identifying the caller (e.g. "request-access:<ip>").
 * @param opts    Optional overrides for limit, window, and current time.
 * @returns       `ok` — whether the request is allowed; `remaining` — how many
 *                calls are left in the current window; `retryAfterMs` — ms until
 *                the oldest request in the window ages out (0 when ok=true).
 */
export function rateLimit(key: string, opts?: RateLimitOptions): RateLimitResult {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = opts?.now ?? Date.now();
  const cutoff = now - windowMs;

  // Retrieve and prune stale timestamps.
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    // Rate-limited: compute how long until the oldest entry leaves the window.
    const oldest = timestamps[0]!;
    const retryAfterMs = oldest + windowMs - now;
    store.set(key, timestamps);
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  // Allow: record this call.
  timestamps.push(now);
  store.set(key, timestamps);

  return {
    ok: true,
    remaining: limit - timestamps.length,
    retryAfterMs: 0,
  };
}

/**
 * Clears all stored timestamps — use in tests to reset state between runs.
 */
export function resetRateLimiter(): void {
  store.clear();
}
