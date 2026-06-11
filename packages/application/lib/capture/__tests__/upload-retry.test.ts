import { describe, it, expect, vi } from 'vitest';
import { withUploadRetry, isTransientUploadError } from '../upload-retry';

// ---------------------------------------------------------------------------
// isTransientUploadError
// ---------------------------------------------------------------------------

describe('isTransientUploadError', () => {
  it('treats a plain Error (no status) as transient (network error)', () => {
    expect(isTransientUploadError(new Error('network failed'))).toBe(true);
  });

  it('treats HTTP 503 as transient', () => {
    expect(isTransientUploadError(Object.assign(new Error('503'), { status: 503 }))).toBe(true);
  });

  it('treats HTTP 408 as transient', () => {
    expect(isTransientUploadError(Object.assign(new Error('408'), { status: 408 }))).toBe(true);
  });

  it('does NOT treat HTTP 403 as transient', () => {
    expect(isTransientUploadError(Object.assign(new Error('403'), { status: 403 }))).toBe(false);
  });

  it('does NOT treat HTTP 400 as transient', () => {
    expect(isTransientUploadError(Object.assign(new Error('400'), { status: 400 }))).toBe(false);
  });

  it('does NOT treat HTTP 500 as transient', () => {
    expect(isTransientUploadError(Object.assign(new Error('500'), { status: 500 }))).toBe(false);
  });

  it('treats null as non-transient', () => {
    expect(isTransientUploadError(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withUploadRetry
// ---------------------------------------------------------------------------

describe('withUploadRetry', () => {
  it('succeeds immediately if fn resolves first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withUploadRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors and succeeds on 3rd attempt', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const randomFn = vi.fn().mockReturnValue(0.5); // jitter = 0

    const networkErr = new Error('network error');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('success');

    const result = await withUploadRetry(fn, {
      sleep: sleepFn,
      random: randomFn,
      baseDelayMs: 200,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    // Should have slept twice (after attempt 0 and attempt 1)
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-transient error (403) without retry', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const err403 = Object.assign(new Error('Forbidden'), { status: 403 });
    const fn = vi.fn().mockRejectedValue(err403);

    await expect(withUploadRetry(fn, { sleep: sleepFn })).rejects.toThrow('Forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('exhausts all attempts and throws on repeated transient errors', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const networkErr = new Error('network error');
    const fn = vi.fn().mockRejectedValue(networkErr);

    await expect(
      withUploadRetry(fn, { sleep: sleepFn, maxAttempts: 3 }),
    ).rejects.toThrow('network error');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2); // sleeps between attempts 0→1 and 1→2
  });

  it('uses exponential backoff with jitter — delay pattern is correct', async () => {
    const sleepArgs: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      sleepArgs.push(ms);
      return Promise.resolve();
    });
    // random always returns 0 → jitter = -50ms (0-0.5)*100 = -50
    const randomFn = vi.fn().mockReturnValue(0);

    const networkErr = new Error('net');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('done');

    await withUploadRetry(fn, {
      sleep: sleepFn,
      random: randomFn,
      baseDelayMs: 200,
      maxAttempts: 3,
    });

    // attempt 0: delay = 200*2^0 + (0-0.5)*100 = 200 - 50 = 150, clamped to max(0,150) = 150
    // attempt 1: delay = 200*2^1 + (0-0.5)*100 = 400 - 50 = 350
    expect(sleepArgs[0]).toBe(150);
    expect(sleepArgs[1]).toBe(350);
  });

  it('respects custom maxAttempts', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('net'));

    await expect(withUploadRetry(fn, { sleep: sleepFn, maxAttempts: 2 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });
});
