/**
 * Unit tests for the pure `shouldQueueCapture` helper extracted from
 * CaptureScreen.tsx (M22.3.3).
 *
 * The helper determines whether a capture should be silently queued offline
 * rather than surfaced as an error to the user.
 */

import { describe, it, expect } from 'vitest';
import { CaptureUploadError } from '@/lib/capture';
import { shouldQueueCapture } from '../CaptureScreen';

describe('shouldQueueCapture', () => {
  describe('when online (isOnline = true)', () => {
    it('returns false for undefined error (up-front check)', () => {
      expect(shouldQueueCapture(undefined, true)).toBe(false);
    });

    it('returns false for a CaptureUploadError in any phase', () => {
      expect(shouldQueueCapture(new CaptureUploadError('presign', 'No presign'), true)).toBe(false);
      expect(shouldQueueCapture(new CaptureUploadError('put', 'PUT failed'), true)).toBe(false);
      expect(shouldQueueCapture(new CaptureUploadError('resize', 'Bad image'), true)).toBe(false);
      expect(shouldQueueCapture(new CaptureUploadError('transcribe', 'Tx failed'), true)).toBe(false);
    });

    it('returns false for a generic Error', () => {
      expect(shouldQueueCapture(new Error('network reset'), true)).toBe(false);
    });
  });

  describe('when offline (isOnline = false)', () => {
    it('returns true for undefined error (up-front offline check, no attempt made)', () => {
      expect(shouldQueueCapture(undefined, false)).toBe(true);
    });

    it('returns true for null error', () => {
      expect(shouldQueueCapture(null, false)).toBe(true);
    });

    it('returns true for CaptureUploadError in presign phase (network)', () => {
      expect(shouldQueueCapture(new CaptureUploadError('presign', 'No presign'), false)).toBe(true);
    });

    it('returns true for CaptureUploadError in put phase (network)', () => {
      expect(shouldQueueCapture(new CaptureUploadError('put', 'PUT failed'), false)).toBe(true);
    });

    it('returns false for CaptureUploadError in resize phase (local failure)', () => {
      expect(shouldQueueCapture(new CaptureUploadError('resize', 'Bad image'), false)).toBe(false);
    });

    it('returns false for CaptureUploadError in transcribe phase (server-side, not network)', () => {
      expect(shouldQueueCapture(new CaptureUploadError('transcribe', 'Tx failed'), false)).toBe(false);
    });

    it('returns true for a generic Error while offline (treat as network failure)', () => {
      expect(shouldQueueCapture(new Error('Failed to fetch'), false)).toBe(true);
    });
  });
});
