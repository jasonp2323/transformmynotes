/**
 * Client-side upload pipeline for the capture flow.
 *
 * Accepts injected `fetchFn` and `resizeFn` so the pipeline is fully testable
 * in Node (no DOM, no real network). The default implementations wire up the
 * browser globals (`fetch`, `resizeImageToJpeg`).
 */
import { resizeImageToJpeg, ImageDecodeError } from './resize-image';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PresignResponse {
  presignedUrl: string;
  s3Key: string;
  jobId: string;
}

/**
 * Response shape for POST /api/transcribe — mirrors the M4 spec.
 * M4.6 will produce this response; this type documents the contract.
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
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Full capture upload pipeline:
 *  1. Resize the image to JPEG.
 *  2. POST /api/notes/upload-url to get a presigned S3 URL + jobId.
 *  3. PUT the JPEG blob directly to S3.
 *  4. POST /api/transcribe with the jobId; return the transcription result.
 *
 * All network errors are wrapped as `CaptureUploadError` with a `phase` field
 * so the UI can display phase-specific messages.
 */
export async function uploadImageForTranscription(
  file: Blob,
  deps?: UploadDeps,
): Promise<{ jobId: string; result: TranscribeResult }> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const resizeFn = deps?.resizeFn ?? resizeImageToJpeg;

  // Step 1 — resize
  let blob: Blob;
  try {
    blob = await resizeFn(file);
  } catch (err) {
    const message =
      err instanceof ImageDecodeError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    throw new CaptureUploadError('resize', message);
  }

  // Step 2 — presign
  const presignRes = await fetchFn('/api/notes/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg' }),
  });
  if (!presignRes.ok) {
    throw new CaptureUploadError(
      'presign',
      `Failed to get upload URL (HTTP ${presignRes.status}).`,
      presignRes.status,
    );
  }
  const { presignedUrl, s3Key: _s3Key, jobId } = (await presignRes.json()) as PresignResponse;

  // Step 3 — PUT to S3
  const putRes = await fetchFn(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!putRes.ok) {
    throw new CaptureUploadError(
      'put',
      `S3 upload failed (HTTP ${putRes.status}).`,
      putRes.status,
    );
  }

  // Step 4 — transcribe
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
