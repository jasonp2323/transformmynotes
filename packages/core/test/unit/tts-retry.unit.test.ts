import { describe, it, expect, vi } from 'vitest';
import { withPollyRetry } from '../../src/tts/retry';

describe('withPollyRetry', () => {
  // ── Successful calls ──────────────────────────────────────────────────────

  it('returns the result of fn when it succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withPollyRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Non-retryable errors ──────────────────────────────────────────────────

  it('re-throws ValidationException immediately without retrying', async () => {
    const err = Object.assign(new Error('bad input'), { name: 'ValidationException' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withPollyRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('bad input');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a generic 500 server error (narrowed to 429/503)', async () => {
    const serverErr = Object.assign(new Error('Internal Server Error'), {
      name: 'InternalServerException',
      $metadata: { httpStatusCode: 500 },
    });
    const fn = vi.fn().mockRejectedValue(serverErr);
    await expect(withPollyRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'Internal Server Error',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── ThrottlingException retries ───────────────────────────────────────────

  it('retries on ThrottlingException and eventually succeeds', async () => {
    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(throttle)
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue('success');
    const result = await withPollyRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after 3 attempts all fail with ThrottlingException (default maxAttempts)', async () => {
    const throttle = Object.assign(new Error('still throttled'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValue(throttle);
    await expect(withPollyRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('still throttled');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── 429 / 503 HTTP status code retries ───────────────────────────────────

  it('retries on HTTP 429 Too Many Requests via $metadata', async () => {
    const err429 = Object.assign(new Error('Too Many Requests'), {
      name: 'TooManyRequestsException',
      $metadata: { httpStatusCode: 429 },
    });
    const fn = vi.fn().mockRejectedValueOnce(err429).mockResolvedValue('recovered');
    const result = await withPollyRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 503 service unavailable error', async () => {
    const serviceErr = Object.assign(new Error('Service Unavailable'), {
      name: 'ServiceUnavailableException',
      $metadata: { httpStatusCode: 503 },
    });
    const fn = vi.fn().mockRejectedValueOnce(serviceErr).mockResolvedValue('back online');
    const result = await withPollyRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('back online');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── Jitter / backoff ──────────────────────────────────────────────────────

  it('applies exponential backoff with jitter via injected sleep + random', async () => {
    const sleepArgs: number[] = [];
    const fakeSleep = vi.fn((ms: number) => {
      sleepArgs.push(ms);
      return Promise.resolve();
    });
    // random=0.5 → jitter=(0.5*2-1)*200=0
    const fakeRandom = vi.fn().mockReturnValue(0.5);

    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(throttle)
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue('done');

    await withPollyRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: fakeSleep,
      random: fakeRandom,
    });

    expect(sleepArgs).toHaveLength(2);
    expect(sleepArgs[0]).toBeCloseTo(100, 0); // 100 * 2^0 + 0
    expect(sleepArgs[1]).toBeCloseTo(200, 0); // 100 * 2^1 + 0
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
