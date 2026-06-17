/**
 * Generic retry helper for AWS Polly calls.
 *
 * Retries only on transient errors:
 *   - ThrottlingException (name === 'ThrottlingException')
 *   - ServiceUnavailableException (name === 'ServiceUnavailableException')
 *   - HTTP 429 Too Many Requests ($metadata.httpStatusCode === 429)
 *   - HTTP 503 Service Unavailable ($metadata.httpStatusCode === 503)
 *
 * Any other error (including generic 500, ValidationException, AccessDeniedException,
 * etc.) is re-thrown immediately without retrying.
 *
 * Sleep between attempts uses exponential back-off with jitter:
 *   delay = baseDelayMs * 2^attempt ± jitterMs
 *
 * Pass `baseDelayMs: 0` in tests so retries are instant, or inject a custom
 * `sleep` and `random` for deterministic testing.
 *
 * Mirrors `packages/core/src/ocr/retry.ts`'s `withBedrockRetry` for consistency.
 */

const JITTER_MS = 200;

export interface PollyRetryOpts {
  /** Total number of attempts (default 3). */
  maxAttempts?: number;
  /** Base delay in ms; actual delay is baseDelayMs * 2^attempt ± jitterMs (default 1000). */
  baseDelayMs?: number;
  /**
   * Injectable sleep function for testing.
   * Defaults to a real setTimeout-based sleep.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Injectable random function for deterministic jitter in tests.
   * Should return a value in [0, 1). Defaults to Math.random.
   */
  random?: () => number;
}

function isTransient(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Transient by name
    if (e.name === 'ThrottlingException') return true;
    if (e.name === 'ServiceUnavailableException') return true;
    // Transient by HTTP status code (429 or 503 only — NOT generic 500)
    const meta = e.$metadata as Record<string, unknown> | undefined;
    if (typeof meta?.httpStatusCode === 'number') {
      const code = meta.httpStatusCode;
      if (code === 429 || code === 503) return true;
    }
  }
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying up to `opts.maxAttempts` times on transient Polly errors.
 * Non-transient errors are re-thrown immediately.
 */
export async function withPollyRetry<T>(
  fn: () => Promise<T>,
  opts?: PollyRetryOpts,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  const sleepFn = opts?.sleep ?? defaultSleep;
  const randomFn = opts?.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const baseDelay = baseDelayMs * Math.pow(2, attempt);
        // Jitter: ±JITTER_MS (random in [0,1) → maps to [-JITTER_MS, +JITTER_MS))
        const jitter = (randomFn() * 2 - 1) * JITTER_MS;
        const delay = Math.max(0, baseDelay + jitter);
        await sleepFn(delay);
      }
    }
  }
  throw lastError;
}
