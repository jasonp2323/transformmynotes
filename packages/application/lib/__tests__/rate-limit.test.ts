import { describe, it, expect, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const hitRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock('@transformmynotes/core', () => ({
  hitRateLimit: hitRateLimitMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { enforceRateLimit } from '../rate-limit';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RATE_LIMIT_DISABLED;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enforceRateLimit', () => {
  describe('RATE_LIMIT_DISABLED escape hatch', () => {
    it('returns { ok: true } immediately when RATE_LIMIT_DISABLED=1 and does NOT call hitRateLimit', async () => {
      process.env.RATE_LIMIT_DISABLED = '1';

      const result = await enforceRateLimit('login', '1.2.3.4', 10, 60);

      expect(result).toEqual({ ok: true, retryAfterSeconds: 0 });
      expect(hitRateLimitMock).not.toHaveBeenCalled();
    });

    it('calls hitRateLimit normally when RATE_LIMIT_DISABLED is unset', async () => {
      hitRateLimitMock.mockResolvedValue({ count: 1 });

      const result = await enforceRateLimit('login', '1.2.3.4', 10, 60, Date.now());

      expect(hitRateLimitMock).toHaveBeenCalledOnce();
      expect(result.ok).toBe(true);
    });

    it('calls hitRateLimit normally when RATE_LIMIT_DISABLED is set to a value other than "1"', async () => {
      process.env.RATE_LIMIT_DISABLED = '0';
      hitRateLimitMock.mockResolvedValue({ count: 1 });

      const result = await enforceRateLimit('login', '1.2.3.4', 10, 60, Date.now());

      expect(hitRateLimitMock).toHaveBeenCalledOnce();
      expect(result.ok).toBe(true);
    });
  });

  describe('normal rate-limit behaviour', () => {
    it('returns { ok: true } when count is at or below threshold', async () => {
      hitRateLimitMock.mockResolvedValue({ count: 10 });

      const result = await enforceRateLimit('login', '1.2.3.4', 10, 60, Date.now());

      expect(result.ok).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('returns { ok: false, retryAfterSeconds > 0 } when count exceeds threshold', async () => {
      hitRateLimitMock.mockResolvedValue({ count: 11 });
      const now = 1_000_000 * 1000; // ms — sits 0s into a 60s window

      const result = await enforceRateLimit('login', '1.2.3.4', 10, 60, now);

      expect(result.ok).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });
  });
});
