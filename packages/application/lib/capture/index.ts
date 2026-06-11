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
export { CaptureUploadError, uploadImageForTranscription, MULTIPART_THRESHOLD } from './upload';
export { withUploadRetry, isTransientUploadError, putToS3WithProgress } from './upload-retry';
export type { UploadRetryOpts, PutS3Opts } from './upload-retry';
export { formatBytes } from './format-bytes';
