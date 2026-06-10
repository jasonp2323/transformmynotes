import { describe, it, expect, vi } from 'vitest';
import { withBedrockRetry } from '../../src/ocr/retry';

describe('withBedrockRetry', () => {
  // ── Successful calls ──────────────────────────────────────────────────────

  it('returns the result of fn when it succeeds on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withBedrockRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Non-retryable errors ──────────────────────────────────────────────────

  it('re-throws a non-retryable error immediately without retrying', async () => {
    const err = Object.assign(new Error('bad input'), { name: 'ValidationException' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withBedrockRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('bad input');
    // Should NOT retry — call count must be exactly 1
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

  // ── 500-class HTTP errors (server errors) ────────────────────────────────

  it('retries on a 500 server error', async () => {
    const serverErr = Object.assign(new Error('Internal Server Error'), {
      name: 'InternalServerException',
      $metadata: { httpStatusCode: 500 },
    });
    const fn = vi.fn().mockRejectedValueOnce(serverErr).mockResolvedValue('recovered');
    const result = await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on a 503 service unavailable error', async () => {
    const serviceErr = Object.assign(new Error('Service Unavailable'), {
      name: 'ServiceUnavailableException',
      $metadata: { httpStatusCode: 503 },
    });
    const fn = vi.fn().mockRejectedValueOnce(serviceErr).mockResolvedValue('back online');
    const result = await withBedrockRetry(fn, { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('back online');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when all server-error attempts are exhausted', async () => {
    const serverErr = Object.assign(new Error('still down'), {
      name: 'InternalServerException',
      $metadata: { httpStatusCode: 500 },
    });
    const fn = vi.fn().mockRejectedValue(serverErr);
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
});
