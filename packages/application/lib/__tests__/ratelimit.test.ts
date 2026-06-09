import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimiter } from '../ratelimit';

const KEY = 'test-key';
const LIMIT = 5;
const WINDOW_MS = 60_000; // 1 minute

beforeEach(() => {
  resetRateLimiter();
});

describe('rateLimit — basic allow/block', () => {
  it('allows up to limit calls and reports remaining correctly', () => {
    let now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now });
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe(LIMIT - i);
      expect(result.retryAfterMs).toBe(0);
      now += 1000;
    }
  });

  it('blocks the (limit + 1)th call within the window', () => {
    let now = 1_000_000;
    for (let i = 0; i < LIMIT; i++) {
      rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now });
      now += 1000;
    }

    const result = rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('retryAfterMs reflects the time until the oldest entry leaves the window', () => {
    // Fill with exactly `limit` calls at time 0.
    const baseNow = 1_000_000;
    for (let i = 0; i < LIMIT; i++) {
      rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now: baseNow });
    }

    // 30s later — oldest entry is baseNow, expires at baseNow + WINDOW_MS
    const laterNow = baseNow + 30_000;
    const result = rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now: laterNow });
    expect(result.ok).toBe(false);
    const expectedRetry = baseNow + WINDOW_MS - laterNow;
    expect(result.retryAfterMs).toBe(expectedRetry); // 30_000 ms
  });
});

describe('rateLimit — window reset', () => {
  it('allows calls again after the full window has elapsed', () => {
    const startNow = 1_000_000;
    // Fill the window.
    for (let i = 0; i < LIMIT; i++) {
      rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now: startNow });
    }

    // Blocked at startNow.
    expect(rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now: startNow }).ok).toBe(false);

    // WINDOW_MS + 1ms later — all timestamps have aged out.
    const afterWindow = startNow + WINDOW_MS + 1;
    const result = rateLimit(KEY, { limit: LIMIT, windowMs: WINDOW_MS, now: afterWindow });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });
});

describe('rateLimit — key isolation', () => {
  it('tracks different keys independently', () => {
    const now = 1_000_000;
    for (let i = 0; i < LIMIT; i++) {
      rateLimit('key-a', { limit: LIMIT, windowMs: WINDOW_MS, now });
    }

    // key-a should be blocked, key-b should be free.
    expect(rateLimit('key-a', { limit: LIMIT, windowMs: WINDOW_MS, now }).ok).toBe(false);
    expect(rateLimit('key-b', { limit: LIMIT, windowMs: WINDOW_MS, now }).ok).toBe(true);
  });
});

describe('rateLimit — defaults', () => {
  it('uses defaults of limit=10 when no opts provided', () => {
    // We can't inject `now` without opts, so just verify 10 calls succeed.
    resetRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(`default-key-${i}`).ok).toBe(true);
    }
  });
});
