/**
 * Generic retry helper for AWS Bedrock calls.
 *
 * Retries only on transient errors:
 *   - ThrottlingException (name === 'ThrottlingException')
 *   - Server errors (.$metadata?.httpStatusCode >= 500)
 *
 * Any other error is re-thrown immediately without retrying.
 * Sleep between attempts uses exponential back-off: baseDelayMs * 2^attempt (0-indexed).
 * Pass `baseDelayMs: 0` in tests so retries are instant.
 */

export interface BedrockRetryOpts {
  /** Total number of attempts (default 3). */
  maxAttempts?: number;
  /** Base delay in ms; actual delay is baseDelayMs * 2^attempt (default 200). */
  baseDelayMs?: number;
}

function isTransient(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.name === 'ThrottlingException') return true;
    const meta = e.$metadata as Record<string, unknown> | undefined;
    if (typeof meta?.httpStatusCode === 'number' && meta.httpStatusCode >= 500) return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying up to `opts.maxAttempts` times on transient Bedrock errors.
 * Non-transient errors are re-thrown immediately.
 */
export async function withBedrockRetry<T>(
  fn: () => Promise<T>,
  opts?: BedrockRetryOpts,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 200;

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
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}
