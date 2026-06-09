import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImageForTranscription, CaptureUploadError } from '../upload';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uploadImageForTranscription', () => {
  let resizeFn: ReturnType<typeof vi.fn>;
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resizeFn = vi.fn().mockResolvedValue(resizedBlob);
    fetchFn = vi.fn();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    beforeEach(() => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE))      // presign
        .mockResolvedValueOnce(statusResponse(200))                  // S3 PUT
        .mockResolvedValueOnce(jsonResponse(TRANSCRIBE_RESULT));     // transcribe
    });

    it('calls resizeFn with the original file', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      expect(resizeFn).toHaveBeenCalledOnce();
      expect(resizeFn).toHaveBeenCalledWith(smallBlob);
    });

    it('POSTs to /api/notes/upload-url with correct headers and body', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/notes/upload-url');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual({ contentType: 'image/jpeg' });
    });

    it('PUTs the resized blob (not the original) to the presigned URL', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
      expect(url).toBe(PRESIGN_RESPONSE.presignedUrl);
      expect(init.method).toBe('PUT');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
      expect(init.body).toBe(resizedBlob);
    });

    it('POSTs to /api/transcribe with the jobId', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      const [url, init] = fetchFn.mock.calls[2] as [string, RequestInit];
      expect(url).toBe('/api/transcribe');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual({ jobId: PRESIGN_RESPONSE.jobId });
    });

    it('makes exactly 3 network calls in the correct order', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      expect(fetchFn).toHaveBeenCalledTimes(3);
      const urls = fetchFn.mock.calls.map((args: unknown[]) => args[0] as string);
      expect(urls).toEqual([
        '/api/notes/upload-url',
        PRESIGN_RESPONSE.presignedUrl,
        '/api/transcribe',
      ]);
    });

    it('returns the correct { jobId, result }', async () => {
      const response = await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      expect(response.jobId).toBe(PRESIGN_RESPONSE.jobId);
      expect(response.result).toEqual(TRANSCRIBE_RESULT);
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
      await expect(
        uploadImageForTranscription(smallBlob, { fetchFn, resizeFn }),
      ).rejects.toThrow(CaptureUploadError);

      const err = await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn }).catch(
        (e) => e,
      );
      // refresh fetchFn for second call
    });

    it('does not call PUT or transcribe after presign failure', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn }).catch(() => {});
      expect(fetchFn).toHaveBeenCalledOnce(); // only the presign call
    });

    it('error has phase "presign" and status 401', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('presign');
      expect(thrown?.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // S3 PUT failure
  // -------------------------------------------------------------------------

  describe('S3 PUT non-ok (403)', () => {
    beforeEach(() => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE)) // presign OK
        .mockResolvedValueOnce(statusResponse(403));            // PUT fails
    });

    it('throws CaptureUploadError with phase "put" and status 403', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('put');
      expect(thrown?.status).toBe(403);
    });

    it('does not call transcribe after PUT failure', async () => {
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn }).catch(() => {});
      expect(fetchFn).toHaveBeenCalledTimes(2); // presign + PUT only
    });
  });

  // -------------------------------------------------------------------------
  // Transcribe failure
  // -------------------------------------------------------------------------

  describe('transcribe non-ok (500)', () => {
    beforeEach(() => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(PRESIGN_RESPONSE)) // presign OK
        .mockResolvedValueOnce(statusResponse(200))             // PUT OK
        .mockResolvedValueOnce(statusResponse(500));            // transcribe fails
    });

    it('throws CaptureUploadError with phase "transcribe" and status 500', async () => {
      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
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
    it('wraps any resize error as CaptureUploadError with phase "resize"', async () => {
      resizeFn.mockRejectedValueOnce(new Error('canvas not available'));

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('resize');
      expect(thrown?.message).toContain('canvas not available');
    });

    it('makes no network calls when resize fails', async () => {
      resizeFn.mockRejectedValueOnce(new Error('decode failed'));
      await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn }).catch(() => {});
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('preserves ImageDecodeError message in the CaptureUploadError', async () => {
      const { ImageDecodeError } = await import('../resize-image');
      resizeFn.mockRejectedValueOnce(new ImageDecodeError('Could not decode HEIC image'));

      let thrown: CaptureUploadError | undefined;
      try {
        await uploadImageForTranscription(smallBlob, { fetchFn, resizeFn });
      } catch (e) {
        thrown = e as CaptureUploadError;
      }
      expect(thrown).toBeInstanceOf(CaptureUploadError);
      expect(thrown?.phase).toBe('resize');
      expect(thrown?.message).toContain('Could not decode HEIC image');
    });
  });
});
