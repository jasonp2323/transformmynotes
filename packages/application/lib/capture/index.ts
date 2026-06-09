/**
 * Public API for the capture utilities (resize + upload pipeline).
 */
export {
  MAX_LONGEST_SIDE,
  JPEG_QUALITY,
  computeScaledDimensions,
  ImageDecodeError,
  resizeImageToJpeg,
} from './resize-image';

export type { PresignResponse, TranscribeResult, CaptureUploadPhase, UploadDeps } from './upload';
export { CaptureUploadError, uploadImageForTranscription } from './upload';
