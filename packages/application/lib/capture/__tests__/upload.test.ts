import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { uploadImageForTranscription, CaptureUploadError, MULTIPART_THRESHOLD } from '../upload';
import type { TranscribeResult } from '../upload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRESIGN_RESPONSE = {
  presignedUrl: 'https://s3.example.com/bucket/key?signed=1',
  s3Key: 'users/sub123/jobs/job-abc/original.jpg',
  jobId: 'job-abc',
};

const TRANSCRIBE_RESULT: TranscribeResult = {
  markdown: '# Notes\nHello world.',
  wordCount: 3,
  detectedLang: 'en',
  ocrConfidence: 0.97,
  markdownS3Key: 'users/sub123/jobs/job-abc/result.md',
};

/** Creates a mock Response with a JSON body. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Creates a mock Response with no body, just a status code. */
function statusResponse(status: number): Response {
  return new Response(null, { status });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const smallBlob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
const resizedBlob = new Blob(['resized-jpeg-bytes'], { type: 'image/jpeg' });

// A blob larger than MULTIPART_THRESHOLD (5MB)
function makeLargeBlob(sizeBytes: number): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uploadImageForTranscription', () => {
  let resizeFn: Mock<(file: Blob) => Promise<Blob>>;
  let fetchFn: Mock<typeof fetch>;
  let putFn: Mock<(url: string, blob: Blob, onProgress?: (fraction: number) => void) => Promise<void>>;

  beforeEach(() => {
    resizeFn = vi.fn<(file: Blob) => Promise<Blob>>().mockResolvedValue(resizedBlob);
    fetchFn = vi.fn<typeof fetch>();
    putFn = vi
      .fn<(url: string, blob: Blob, onProgress?: (fraction: number) => void) => Promise<void>>()
      .mockResolvedValue(undefined); // default: PUT succeeds
  });

  // -------------------------------------------------------------------------
  // Happy path (single-PUT ≤5MB)
  // -------------------------------------------------------------------------

  describe('happy path (single-PUT)', () => {
    beforeEach(() => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE))   // presign
        .mockResolvedValueOnce(jsonResponse(TRANSCRIBE_RESULT)); // transcribe
    });

    it('calls resizeFn with the original file', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      expect(resizeFn).toHaveBeenCalledOnce();
      expect(resizeFn).toHaveBeenCalledWith(smallBlob);
    });

    it('POSTs to /api/notes/upload-url with correct headers and body (includes size)', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/notes/upload-url');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      const body = JSON.parse(init.body as string);
      expect(body.contentType).toBe('image/jpeg');
      expect(typeof body.size).toBe('number');
    });

    it('calls putFn with the presigned URL and resized blob', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      expect(putFn).toHaveBeenCalledOnce();
      const [url, blob] = putFn.mock.calls[0] as [string, Blob, unknown];
      expect(url).toBe(PRESIGN_RESPONSE.presignedUrl);
      expect(blob).toBe(resizedBlob);
    });

    it('POSTs to /api/transcribe with the jobId', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('/api/transcribe');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ jobId: PRESIGN_RESPONSE.jobId });
    });

    it('makes exactly 2 fetch calls (presign + transcribe)', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const urls = fetchFn.mock.calls.map((args: unknown[]) => args[0] as string);
      expect(urls).toEqual(['/api/notes/upload-url', '/api/transcribe']);
    });

    it('returns the correct { jobId, result }', async () => {
      const response = await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      expect(response.jobId).toBe(PRESIGN_RESPONSE.jobId);
      expect(response.result).toEqual(TRANSCRIBE_RESULT);
    });

    it('calls onProgress during PUT', async () => {
      const onProgress = vi.fn();
      // putFn calls onProgress once
      putFn.mockImplementation((_url: string, _blob: Blob, prog?: (f: number) => void) => {
        prog?.(0.5);
        return Promise.resolve();
      });
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn, onProgress });
      expect(onProgress).toHaveBeenCalledWith(0.5);
    });

    it('calls onResized with original and resized sizes', async () => {
      const onResized = vi.fn();
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn, onResized });
      expect(onResized).toHaveBeenCalledOnce();
      const [info] = onResized.mock.calls[0] as [{ originalBytes: number; resizedBytes: number }];
      expect(info.originalBytes).toBe(smallBlob.size);
      expect(info.resizedBytes).toBe(resizedBlob.size);
    });
  });

  // -------------------------------------------------------------------------
  // Presign failure
  // -------------------------------------------------------------------------

  describe('presign non-ok (401)', () => {
    beforeEach(() => {
      fetchFn.mockResolvedValueOnce(statusResponse(401));
    });

    it('throws CaptureUploadError with phase "presign" and status 401', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('presign');
      expect(thrown?.status).toBe(401);
    });

    it('does not call putFn or transcribe after presign failure', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn }).catch(() => {});
      expect(putFn).not.toHaveBeenCalled();
      expect(fetchFn).toHaveBeenCalledOnce(); // only the presign call
    });
  });

  // -------------------------------------------------------------------------
  // S3 PUT failure
  // -------------------------------------------------------------------------

  describe('S3 PUT failure (403)', () => {
    beforeEach(() => {
      fetchFn.mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE)); // presign OK
      putFn.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    });

    it('throws CaptureUploadError with phase "put" and status 403', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('put');
      expect(thrown?.status).toBe(403);
    });

    it('does not call transcribe after PUT failure', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn }).catch(() => {});
      expect(fetchFn).toHaveBeenCalledOnce(); // presign only
    });
  });

  // -------------------------------------------------------------------------
  // Transcribe failure
  // -------------------------------------------------------------------------

  describe('transcribe non-ok (500)', () => {
    beforeEach(() => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE)) // presign OK
        .mockResolvedValueOnce(statusResponse(500));           // transcribe fails
    });

    it('throws CaptureUploadError with phase "transcribe" and status 500', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('transcribe');
      expect(thrown?.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // Resize failure
  // -------------------------------------------------------------------------

  describe('resizeFn throws', () => {
    it('wraps any non-decode resize error as CaptureUploadError with phase "resize"', async () => {
      resizeFn.mockRejectedValueOnce(new Error('canvas not available'));

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('resize');
      expect(thrown?.message).toContain('canvas not available');
    });

    it('makes no network calls when resize fails with non-ImageDecodeError', async () => {
      resizeFn.mockRejectedValueOnce(new Error('decode failed'));
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn, putFn }).catch(() => {});
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('falls back to original file when ImageDecodeError and original is JPEG (allowed)', async () => {
      const { ImageDecodeError } = await import('../resize-image');
      const jpegOriginal = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
      resizeFn.mockRejectedValueOnce(new ImageDecodeError('Could not decode'));

      fetchFn
        .mockResolvedValueOnce(jsonResponse({ ...PRESIGN_RESPONSE, jobId: 'fallback-job' }))
        .mockResolvedValueOnce(jsonResponse(TRANSCRIBE_RESULT));

      const result = await uploadImageForTranscription(jpegOriginal, { fetchFn, resizeFn, putFn });
      // Should proceed (no error), upload the original file
      expect(result.jobId).toBe('fallback-job');
      // putFn called with the original blob (not resized)
      expect(putFn).toHaveBeenCalledOnce();
      const [, blobArg] = putFn.mock.calls[0] as [string, Blob];
      expect(blobArg).toBe(jpegOriginal);
    });

    it('throws resize error when ImageDecodeError and original has disallowed MIME type', async () => {
      const { ImageDecodeError } = await import('../resize-image');
      const unsupportedBlob = new Blob(['data'], { type: 'image/webp' });
      resizeFn.mockRejectedValueOnce(new ImageDecodeError('Cannot decode WebP'));

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(unsupportedBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('resize');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('preserves ImageDecodeError message when type is disallowed', async () => {
      const { ImageDecodeError } = await import('../resize-image');
      const unsupportedBlob = new Blob(['data'], { type: 'image/webp' });
      resizeFn.mockRejectedValueOnce(new ImageDecodeError('Could not decode HEIC image'));

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(unsupportedBlob, { fetchFn, resizeFn, putFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown?.phase).toBe('resize');
      expect(thrown?.message).toContain('Could not decode HEIC image');
    });
  });

  // -------------------------------------------------------------------------
  // Multipart path (blob > 5MB)
  // -------------------------------------------------------------------------

  describe('multipart path (blob > MULTIPART_THRESHOLD)', () => {
    const MULTIPART_CREATE_RESPONSE = {
      uploadToken: 'tok-abc',
      uploadId: 'mpu-id-123',
      jobId: 'job-multipart',
      s3Key: 'images/users/sub/job-multipart.jpg',
      partUrls: [
        { partNumber: 1, url: 'https://s3.example.com/part1' },
        { partNumber: 2, url: 'https://s3.example.com/part2' },
      ],
    };

    const MULTIPART_COMPLETE_RESPONSE = {
      jobId: 'job-multipart',
      s3Key: 'images/users/sub/job-multipart.jpg',
    };

    let putPartFn: Mock<(url: string, blob: Blob, partNumber: number) => Promise<string>>;
    let largeBlob: Blob;

    beforeEach(() => {
      // 6MB blob — above 5MB threshold
      largeBlob = makeLargeBlob(6 * 1024 * 1024);
      // resizeFn returns the same large blob
      resizeFn.mockResolvedValue(largeBlob);
      putPartFn = vi
        .fn<(url: string, blob: Blob, partNumber: number) => Promise<string>>()
        .mockResolvedValue('"etag-value"');

      fetchFn
        .mockResolvedValueOnce(jsonResponse(MULTIPART_CREATE_RESPONSE)) // multipart/create
        .mockResolvedValueOnce(jsonResponse(MULTIPART_COMPLETE_RESPONSE)) // multipart/complete
        .mockResolvedValueOnce(jsonResponse(TRANSCRIBE_RESULT));          // transcribe
    });

    it('calls multipart/create endpoint for large blobs', async () => {
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/notes/multipart/create');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.contentType).toBe('image/jpeg');
      expect(body.size).toBe(largeBlob.size);
      expect(typeof body.parts).toBe('number');
      expect(body.parts).toBeGreaterThan(0);
    });

    it('calls putPartFn for each part', async () => {
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      // 6MB / 5MB = 2 parts
      expect(putPartFn).toHaveBeenCalledTimes(2);
    });

    it('calls multipart/complete with uploadToken and parts', async () => {
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
      expect(url).toBe('/api/notes/multipart/complete');
      const body = JSON.parse(init.body as string);
      expect(body.uploadToken).toBe('tok-abc');
      expect(Array.isArray(body.parts)).toBe(true);
      expect(body.parts).toHaveLength(2);
    });

    it('returns the correct jobId from multipart create', async () => {
      const result = await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      expect(result.jobId).toBe('job-multipart');
    });

    it('calls transcribe after multipart complete', async () => {
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      const transcribeCall = fetchFn.mock.calls[2] as [string, RequestInit];
      expect(transcribeCall[0]).toBe('/api/transcribe');
    });

    it('reports progress across parts via onProgress', async () => {
      const onProgress = vi.fn();
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn, onProgress });
      // Should have called onProgress after each part
      expect(onProgress).toHaveBeenCalled();
      // Final progress should be 1.0 (after last part)
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1] as [number];
      expect(lastCall[0]).toBeCloseTo(1.0, 2);
    });

    it('does NOT call putFn for multipart blobs (uses putPartFn instead)', async () => {
      await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn, putFn });
      expect(putFn).not.toHaveBeenCalled();
    });

    it('throws CaptureUploadError("put") when multipart create returns non-ok', async () => {
      fetchFn.mockReset();
      fetchFn.mockResolvedValueOnce(statusResponse(413)); // create returns 413

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(largeBlob, { fetchFn, resizeFn, putPartFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('presign');
      expect(thrown?.status).toBe(413);
    });
  });
});
