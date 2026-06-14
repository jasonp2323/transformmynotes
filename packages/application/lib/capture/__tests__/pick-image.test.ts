import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Camera as CameraType } from '@capacitor/camera';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted above imports
// ---------------------------------------------------------------------------

// We re-declare the mocked values inside each test via vi.mocked() so we can
// vary isNativePlatform per test case.

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: vi.fn(),
  } satisfies Pick<typeof CameraType, 'getPhoto'>,
  CameraResultType: {
    Uri: 'uri',
  },
  CameraSource: {
    Prompt: 'PROMPT',
  },
}));

// ---------------------------------------------------------------------------
// Imports — must come after vi.mock hoisting
// ---------------------------------------------------------------------------

import { pickImage } from '../pick-image';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Smallest valid JPEG header bytes (just need a non-empty Blob) */
const FAKE_IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const FAKE_BLOB = new Blob([FAKE_IMAGE_BYTES], { type: 'image/jpeg' });

function makeFakeResponse(blob: Blob): Response {
  return new Response(blob, { status: 200 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pickImage', () => {
  const webFallback = vi.fn<() => Promise<File>>();

  beforeEach(() => {
    webFallback.mockReset();
    // Simulate a browser-like environment so the `typeof window === 'undefined'`
    // guard in pick-image.ts doesn't short-circuit before reaching the
    // Capacitor isNativePlatform() check.  The test environment is plain Node,
    // so we stub `window` as a minimal object here and restore it in afterEach
    // via vi.restoreAllMocks / vi.unstubAllGlobals.
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Test A — native platform → uses Camera plugin, skips webFallback
  // -------------------------------------------------------------------------

  describe('when running on a native platform (Capacitor)', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Camera.getPhoto).mockResolvedValue({
        webPath: 'blob:native://x',
        format: 'jpeg',
        saved: false,
      });
      // Stub global fetch so the webPath → Blob conversion works.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFakeResponse(FAKE_BLOB)));
    });

    it('calls Camera.getPhoto with the expected options', async () => {
      await pickImage({ webFallback });

      expect(Camera.getPhoto).toHaveBeenCalledOnce();
      expect(Camera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 90,
          resultType: 'uri',   // CameraResultType.Uri mock value
          source: 'PROMPT',    // CameraSource.Prompt mock value
        }),
      );
    });

    it('resolves with a File built from the camera webPath', async () => {
      const result = await pickImage({ webFallback });

      expect(result).toBeInstanceOf(File);
      expect(result.type).toBe('image/jpeg');
      expect(result.name).toMatch(/^capture-\d+\.jpg$/);
    });

    it('does NOT call webFallback', async () => {
      await pickImage({ webFallback });

      expect(webFallback).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Test B — web platform → delegates to webFallback, skips Camera plugin
  // -------------------------------------------------------------------------

  describe('when running in a web browser (non-native)', () => {
    const webFile = new File([FAKE_BLOB], 'photo.jpg', { type: 'image/jpeg' });

    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
      webFallback.mockResolvedValue(webFile);
    });

    it('returns the File provided by webFallback', async () => {
      const result = await pickImage({ webFallback });

      expect(result).toBe(webFile);
    });

    it('calls webFallback exactly once', async () => {
      await pickImage({ webFallback });

      expect(webFallback).toHaveBeenCalledOnce();
    });

    it('does NOT call Camera.getPhoto', async () => {
      await pickImage({ webFallback });

      expect(Camera.getPhoto).not.toHaveBeenCalled();
    });
  });
});
