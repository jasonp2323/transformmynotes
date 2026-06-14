/**
 * pickImage — unified image picker that routes to the native Capacitor camera
 * on Android/iOS and falls back to a caller-supplied web mechanism on the web.
 *
 * The web fallback is a thunk so the caller can wire the existing hidden
 * `<input type="file">` without this module needing any DOM knowledge.
 *
 * @example
 * ```ts
 * const file = await pickImage({ webFallback: () => openFileInput(ref) });
 * ```
 */

export interface PickImageOpts {
  /**
   * Called when running in a web browser (non-native). Must return a Promise
   * that resolves with the chosen File or rejects if the user cancels / no
   * file is chosen.
   */
  webFallback: () => Promise<File>;
}

/**
 * Pick an image from the camera or gallery.
 *
 * - **Native (Android / iOS via Capacitor):** opens the system camera / photo
 *   picker via `@capacitor/camera`, converts the resulting URI to a `File`.
 * - **Web:** delegates entirely to `opts.webFallback`.
 */
export async function pickImage(opts: PickImageOpts): Promise<File> {
  // Guard: not in a browser-like environment — nothing to do.
  if (typeof window === 'undefined') {
    return opts.webFallback();
  }

  // Dynamically import Capacitor core so this module is tree-shakeable and
  // safe to import in a plain Node/jsdom test environment.
  const cap = await import('@capacitor/core').catch(() => null);

  if (cap?.Capacitor?.isNativePlatform()) {
    // Native path — use the Capacitor Camera plugin.
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
    });

    // `photo.webPath` is a Capacitor-managed blob URL that the WebView can
    // fetch. Convert it to a proper `File` so the rest of the upload pipeline
    // is unchanged.
    const response = await fetch(photo.webPath!);
    const blob = await response.blob();
    return new File([blob], `capture-${Date.now()}.jpg`, {
      type: blob.type || 'image/jpeg',
    });
  }

  // Web fallback — let the caller decide how to obtain the file
  // (e.g. click a hidden <input type="file"> and resolve on change).
  return opts.webFallback();
}
