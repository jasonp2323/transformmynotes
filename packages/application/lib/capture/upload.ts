/**
 * Client-side upload pipeline for the capture flow.
 *
 * Accepts injected deps so the pipeline is fully testable in Node (no DOM, no
 * real network, no real XHR). The default implementations wire up the browser
 * globals.
 */
import { resizeImageToJpeg, ImageDecodeError } from './resize-image';
import { withUploadRetry, putToS3WithProgress, isTransientUploadError } from './upload-retry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Files larger than this use the multipart upload path. */
export const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PresignResponse {
  presignedUrl: string;
  s3Key: string;
  jobId: string;
}

export interface MultipartCreateResponse {
  uploadToken: string;
  uploadId: string;
  jobId: string;
  s3Key: string;
  partUrls: Array<{ partNumber: number; url: string }>;
}

export interface MultipartCompleteResponse {
  jobId: string;
  s3Key: string;
}

/**
 * Response shape for POST /api/transcribe — mirrors the M4 spec.
 */
export interface TranscribeResult {
  markdown: string;
  wordCount: number;
  detectedLang: string;
  ocrConfidence: number;
  markdownS3Key: string;
}

export type CaptureUploadPhase = 'resize' | 'presign' | 'put' | 'transcribe';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CaptureUploadError extends Error {
  readonly name = 'CaptureUploadError';
  readonly phase: CaptureUploadPhase;
  readonly status?: number;

  constructor(phase: CaptureUploadPhase, message: string, status?: number) {
    super(message);
    this.phase = phase;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface UploadDeps {
  /** Override the global `fetch` for testing. Defaults to the browser global. */
  fetchFn?: typeof fetch;
  /** Override the resize step for testing. Defaults to `resizeImageToJpeg`. */
  resizeFn?: (file: Blob) => Promise<Blob>;
  /**
   * Override the S3 PUT step for testing (replaces XHR-based put + retry).
   * Called with the presigned URL and the blob. Should resolve on success,
   * reject with CaptureUploadError-compatible error on failure.
   */
  putFn?: (url: string, blob: Blob, onProgress?: (fraction: number) => void) => Promise<void>;
  /**
   * Override multipart PUT for a single part for testing.
   * Called with (url, blob) — returns the ETag string.
   */
  putPartFn?: (url: string, blob: Blob, partNumber: number) => Promise<string>;
  /** Called with upload progress fraction [0,1] during the PUT phase. */
  onProgress?: (fraction: number) => void;
  /** Called after resize with original/resized byte sizes. */
  onResized?: (info: { originalBytes: number; resizedBytes: number }) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PART_SIZE = MULTIPART_THRESHOLD; // 5 MB per part

function defaultPutFn(
  url: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return withUploadRetry(() =>
    putToS3WithProgress(url, blob, blob.type || 'application/octet-stream', { onProgress }),
  );
}

async function defaultPutPartFn(url: string, blob: Blob): Promise<string> {
  let etag = '';
  await withUploadRetry(async () => {
    const res = await fetch(url, {
      method: 'PUT',
      body: blob,
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Part PUT failed (HTTP ${res.status})`), { status: res.status });
    }
    etag = res.headers.get('ETag') ?? '';
  });
  return etag;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Full capture upload pipeline:
 *  1. Resize the image to JPEG (falls back to original on decode error if MIME is allowed).
 *  2a. If blob ≤ 5MB: POST /api/notes/upload-url, PUT to S3 (with retry+progress).
 *  2b. If blob > 5MB: POST /api/notes/multipart/create, PUT parts, POST /api/notes/multipart/complete.
 *  3. POST /api/transcribe with the jobId; return the transcription result.
 *
 * All network errors are wrapped as `CaptureUploadError` with a `phase` field.
 */
export async function uploadImageForTranscription(
  file: Blob,
  deps?: UploadDeps,
): Promise<{ jobId: string; result: TranscribeResult }> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const resizeFn = deps?.resizeFn ?? resizeImageToJpeg;
  const putFn = deps?.putFn ?? defaultPutFn;
  const putPartFn = deps?.putPartFn ?? defaultPutPartFn;
  const onProgress = deps?.onProgress;
  const onResized = deps?.onResized;

  const originalBytes = file.size;

  // ---------------------------------------------------------------------------
  // Step 1 — resize (with fallback to original on decode error for allowed types)
  // ---------------------------------------------------------------------------
  const ALLOWED_FALLBACK_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic']);

  let blob: Blob;
  let uploadContentType = 'image/jpeg';

  try {
    blob = await resizeFn(file);
    // blob from resizeFn is always JPEG
    uploadContentType = 'image/jpeg';
  } catch (err) {
    if (err instanceof ImageDecodeError && ALLOWED_FALLBACK_TYPES.has(file.type)) {
      // Mobile-Safari safety: fall back to original
      console.warn('[upload] resize failed, falling back to original:', err.message);
      blob = file;
      uploadContentType = file.type;
    } else if (err instanceof ImageDecodeError) {
      throw new CaptureUploadError('resize', err.message);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      throw new CaptureUploadError('resize', message);
    }
  }

  if (onResized) {
    onResized({ originalBytes, resizedBytes: blob.size });
  }

  // ---------------------------------------------------------------------------
  // Step 2 — upload (single-PUT or multipart)
  // ---------------------------------------------------------------------------

  let jobId: string;

  if (blob.size <= MULTIPART_THRESHOLD) {
    // --- Single-PUT path ---
    const presignRes = await fetchFn('/api/notes/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: uploadContentType, size: blob.size }),
    });
    if (!presignRes.ok) {
      throw new CaptureUploadError(
        'presign',
        `Failed to get upload URL (HTTP ${presignRes.status}).`,
        presignRes.status,
      );
    }
    const { presignedUrl, jobId: presignJobId } = (await presignRes.json()) as PresignResponse;
    jobId = presignJobId;

    // PUT to S3 with retry+progress
    try {
      await putFn(presignedUrl, blob, onProgress);
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err
        ? (err as { status: number }).status
        : undefined;
      throw new CaptureUploadError(
        'put',
        `S3 upload failed${status ? ` (HTTP ${status})` : ''}.`,
        status,
      );
    }
  } else {
    // --- Multipart path ---
    const partCount = Math.ceil(blob.size / PART_SIZE);

    const createRes = await fetchFn('/api/notes/multipart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: uploadContentType, size: blob.size, parts: partCount }),
    });
    if (!createRes.ok) {
      throw new CaptureUploadError(
        'presign',
        `Failed to initiate multipart upload (HTTP ${createRes.status}).`,
        createRes.status,
      );
    }
    const { uploadToken, partUrls, jobId: mpJobId } = (await createRes.json()) as MultipartCreateResponse;
    jobId = mpJobId;

    // PUT each part
    const parts: Array<{ partNumber: number; etag: string }> = [];
    let loadedBytes = 0;

    for (const { partNumber, url } of partUrls) {
      const start = (partNumber - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, blob.size);
      const partBlob = blob.slice(start, end);

      let etag: string;
      try {
        etag = await putPartFn(url, partBlob, partNumber);
      } catch (err) {
        const status = err && typeof err === 'object' && 'status' in err
          ? (err as { status: number }).status
          : undefined;
        throw new CaptureUploadError(
          'put',
          `Multipart part ${partNumber} upload failed${status ? ` (HTTP ${status})` : ''}.`,
          status,
        );
      }

      loadedBytes += partBlob.size;
      if (onProgress) {
        onProgress(loadedBytes / blob.size);
      }
      parts.push({ partNumber, etag });
    }

    // Complete multipart
    const completeRes = await fetchFn('/api/notes/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadToken, parts }),
    });
    if (!completeRes.ok) {
      throw new CaptureUploadError(
        'put',
        `Multipart complete failed (HTTP ${completeRes.status}).`,
        completeRes.status,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3 — transcribe
  // ---------------------------------------------------------------------------
  const transcribeRes = await fetchFn('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!transcribeRes.ok) {
    throw new CaptureUploadError(
      'transcribe',
      `Transcription request failed (HTTP ${transcribeRes.status}).`,
      transcribeRes.status,
    );
  }
  const result = (await transcribeRes.json()) as TranscribeResult;

  return { jobId, result };
}
