/**
 * Retry helper for transient S3 PUT errors, plus XHR-based S3 PUT with progress.
 */

export interface UploadRetryOpts {
  maxAttempts?: number;      // default 3
  baseDelayMs?: number;      // default 200
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;     // default Math.random
}

/**
 * Returns true if the error is transient (should be retried):
 * - A network error (thrown Error with no `status`, meaning no HTTP response)
 * - HTTP 503 (ServiceUnavailable)
 * - HTTP 408 (RequestTimeout)
 */
export function isTransientUploadError(err: unknown): boolean {
  if (err instanceof Error && !('status' in err)) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: number }).status;
    return s === 503 || s === 408;
  }
  return false;
}

/**
 * Retries `fn` up to `maxAttempts` times (default 3) on transient errors.
 * Exponential backoff: delay = baseDelayMs * 2^attempt + jitter (±50ms).
 * Non-transient errors throw immediately (no retry).
 */
export async function withUploadRetry<T>(
  fn: () => Promise<T>,
  opts?: UploadRetryOpts,
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 200;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = opts?.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientUploadError(err)) throw err;
      if (attempt < maxAttempts - 1) {
        const jitter = Math.round((random() - 0.5) * 100); // ±50ms
        const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
        await sleep(Math.max(0, delay));
      }
    }
  }
  throw lastErr;
}

export interface PutS3Opts {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  xhrFactory?: () => XMLHttpRequest;
}

/**
 * XHR-based S3 PUT with progress reporting.
 * Rejects with `{ status }` error object on non-2xx HTTP.
 * Rejects with a plain Error on network failure.
 */
export function putToS3WithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  opts?: PutS3Opts,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = (opts?.xhrFactory ?? (() => new XMLHttpRequest()))();

    if (opts?.onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          opts.onProgress!(ev.loaded / ev.total);
        }
      };
    }

    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(Object.assign(new Error(`S3 PUT failed (HTTP ${xhr.status})`), { status: xhr.status }));
      }
    };

    xhr.onerror = () => reject(new Error('S3 PUT network error'));
    xhr.ontimeout = () => reject(new Error('S3 PUT timeout'));

    xhr.send(blob);
  });
}
