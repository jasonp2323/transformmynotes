import { describe, it, expect, vi } from 'vitest';
import { withBedrockRetry, shouldSkipTranscription } from '../../src/ocr/retry';

describe('withBedrockRetry', () => {
  // ── Successful calls ──────────────────────────────────────────────────────

  it('returns the result of fn when it succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withBedrockRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Non-retryable errors ──────────────────────────────────────────────────

  it('re-throws ValidationException immediately without retrying', async () => {
    const err = Object.assign(new Error('bad input'), { name: 'ValidationException' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('bad input');
    // Must NOT retry — call count must be exactly 1
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-throws AccessDeniedException immediately without retrying', async () => {
    const err = Object.assign(new Error('access denied'), { name: 'AccessDeniedException' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('access denied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-throws a generic Error immediately without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('network down');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-throws a 400-class HTTP error immediately (not retryable)', async () => {
    const err = Object.assign(new Error('Not Found'), {
      name: 'ResourceNotFoundException',
      $metadata: { httpStatusCode: 404 },
    });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a generic 500 server error (spec narrowed to 429/503)', async () => {
    const serverErr = Object.assign(new Error('Internal Server Error'), {
      name: 'InternalServerException',
      $metadata: { httpStatusCode: 500 },
    });
    const fn = vi.fn().mockRejectedValue(serverErr);
    await expect(withBedrockRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'Internal Server Error',
    );
    // Should NOT retry — exactly 1 call
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
    const result = await withBedrockRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxAttempts all fail with ThrottlingException', async () => {
    const throttle = Object.assign(new Error('still throttled'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValue(throttle);
    await expect(withBedrockRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'still throttled',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom maxAttempts (1 means no retries)', async () => {
    const throttle = Object.assign(new Error('throttled'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValue(throttle);
    await expect(withBedrockRetry(fn, { maxAttempts: 1, baseDelayMs: 0 })).rejects.toThrow(
      'throttled',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── ServiceUnavailableException retries ──────────────────────────────────

  it('retries on ServiceUnavailableException (by name)', async () => {
    const serviceErr = Object.assign(new Error('Service Unavailable'), {
      name: 'ServiceUnavailableException',
    });
    const fn = vi.fn().mockRejectedValueOnce(serviceErr).mockResolvedValue('back online');
    const result = await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('back online');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── 429 / 503 HTTP status code retries ───────────────────────────────────

  it('retries on HTTP 429 Too Many Requests', async () => {
    const err429 = Object.assign(new Error('Too Many Requests'), {
      name: 'TooManyRequestsException',
      $metadata: { httpStatusCode: 429 },
    });
    const fn = vi.fn().mockRejectedValueOnce(err429).mockResolvedValue('recovered');
    const result = await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 503 service unavailable error', async () => {
    const serviceErr = Object.assign(new Error('Service Unavailable'), {
      name: 'ServiceUnavailableException',
      $metadata: { httpStatusCode: 503 },
    });
    const fn = vi.fn().mockRejectedValueOnce(serviceErr).mockResolvedValue('back online');
    const result = await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('back online');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when all 503 attempts are exhausted', async () => {
    const serviceErr = Object.assign(new Error('still down'), {
      name: 'ServiceUnavailableException',
      $metadata: { httpStatusCode: 503 },
    });
    const fn = vi.fn().mockRejectedValue(serviceErr);
    await expect(withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 })).rejects.toThrow(
      'still down',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── Default options ───────────────────────────────────────────────────────

  it('uses maxAttempts=3 by default', async () => {
    const throttle = Object.assign(new Error('throttle'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValue(throttle);
    // baseDelayMs: 0 to keep the test instant; maxAttempts relies on default (3)
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── Jitter and delay ─────────────────────────────────────────────────────

  it('applies jitter: delay = baseDelayMs * 2^attempt ± 200ms via injected random', async () => {
    const sleepArgs: number[] = [];
    const fakeSleep = vi.fn((ms: number) => {
      sleepArgs.push(ms);
      return Promise.resolve();
    });
    // random always returns 0.5 → jitter = (0.5 * 2 - 1) * 200 = 0ms (net zero)
    const fakeRandom = vi.fn().mockReturnValue(0.5);

    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValueOnce(throttle).mockRejectedValueOnce(throttle).mockResolvedValue('done');

    await withBedrockRetry(fn, { maxAttempts: 3, baseDelayMs: 100, sleep: fakeSleep, random: fakeRandom });

    // With random=0.5, jitter=(0.5*2-1)*200=0, so delays are: 100*2^0=100, 100*2^1=200
    expect(sleepArgs).toHaveLength(2);
    expect(sleepArgs[0]).toBeCloseTo(100, 0); // attempt 0: 100 * 2^0 + 0 = 100
    expect(sleepArgs[1]).toBeCloseTo(200, 0); // attempt 1: 100 * 2^1 + 0 = 200
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('delay is clamped to 0 when jitter causes a negative value', async () => {
    const sleepArgs: number[] = [];
    const fakeSleep = vi.fn((ms: number) => {
      sleepArgs.push(ms);
      return Promise.resolve();
    });
    // random=0 → jitter = (0*2-1)*200 = -200ms; with baseDelay=50: 50-200 = -150 → clamped to 0
    const fakeRandom = vi.fn().mockReturnValue(0);

    const throttle = Object.assign(new Error('throttled'), { name: 'ThrottlingException' });
    const fn = vi.fn().mockRejectedValueOnce(throttle).mockResolvedValue('ok');

    await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 50, sleep: fakeSleep, random: fakeRandom });

    expect(sleepArgs).toHaveLength(1);
    expect(sleepArgs[0]).toBe(0); // clamped from -150 to 0
  });
});

describe('shouldSkipTranscription', () => {
  it('returns true for status "done"', () => {
    expect(shouldSkipTranscription('done')).toBe(true);
  });

  it('returns true for status "processing"', () => {
    expect(shouldSkipTranscription('processing')).toBe(true);
  });

  it('returns false for status "pending"', () => {
    expect(shouldSkipTranscription('pending')).toBe(false);
  });

  it('returns false for status "error"', () => {
    expect(shouldSkipTranscription('error')).toBe(false);
  });
});
