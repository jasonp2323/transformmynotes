/**
 * Client-side image resize utilities for the capture flow.
 *
 * `computeScaledDimensions` is pure and unit-testable in Node.
 * `resizeImageToJpeg` is browser-only (canvas/OffscreenCanvas) and is not
 * unit-tested — it is exercised by real browser smoke tests.
 */

export const MAX_LONGEST_SIDE = 1920;
export const JPEG_QUALITY = 0.82;

/**
 * Computes new dimensions so the longest side ≤ maxSide while preserving
 * aspect ratio. Never upscales. Results are rounded to the nearest integer
 * with a minimum of 1px on each side.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxSide = MAX_LONGEST_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Thrown when the browser cannot decode the source image (e.g. HEIC on Android).
 * The UI can catch this and prompt the user to pick a JPEG instead.
 */
export class ImageDecodeError extends Error {
  readonly name = 'ImageDecodeError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Resizes `source` to at most `maxSide` on the longest side and encodes as
 * JPEG at `quality`. Browser-only — uses OffscreenCanvas when available,
 * falling back to a `document.createElement('canvas')` approach.
 *
 * @throws {ImageDecodeError} if the browser cannot decode the source image.
 * @throws {Error} if JPEG encoding yields no blob.
 */
export async function resizeImageToJpeg(
  source: Blob,
  opts?: { maxSide?: number; quality?: number },
): Promise<Blob> {
  const maxSide = opts?.maxSide ?? MAX_LONGEST_SIDE;
  const quality = opts?.quality ?? JPEG_QUALITY;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch (err) {
    throw new ImageDecodeError(
      `Could not decode image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height, maxSide);

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D context from OffscreenCanvas.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      if (!blob) throw new Error('JPEG encoding produced no blob (OffscreenCanvas).');
      return blob;
    }

    // Fallback: HTMLCanvasElement
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from HTMLCanvasElement.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('JPEG encoding produced no blob (HTMLCanvasElement).'));
          }
        },
        'image/jpeg',
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}
