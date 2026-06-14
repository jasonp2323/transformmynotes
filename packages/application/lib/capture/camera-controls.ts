/**
 * Pure, side-effect-free camera control helpers.
 * All browser-specific MediaTrack properties that are absent from the standard TS lib
 * are cast via `as unknown as ...` — no global type augmentation, no `any` sprawl.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraCapabilities {
  zoom: ZoomRange | null;
  torch: boolean;
  focus: boolean;
}

// Internal shape of the non-standard capabilities object returned by browsers
interface ExtendedCapabilities {
  zoom?: { min?: number; max?: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
  pointsOfInterest?: unknown;
}

// ---------------------------------------------------------------------------
// readCameraCapabilities
// ---------------------------------------------------------------------------

/**
 * Read capabilities from a video track.
 * Gracefully handles browsers that don't implement getCapabilities().
 */
export function readCameraCapabilities(track: MediaStreamTrack): CameraCapabilities {
  if (typeof track.getCapabilities !== 'function') {
    return { zoom: null, torch: false, focus: false };
  }

  const raw = track.getCapabilities() as unknown as ExtendedCapabilities;

  // Zoom: must have numeric min/max with max > min
  let zoom: ZoomRange | null = null;
  if (raw.zoom && typeof raw.zoom.min === 'number' && typeof raw.zoom.max === 'number' && raw.zoom.max > raw.zoom.min) {
    zoom = {
      min: raw.zoom.min,
      max: raw.zoom.max,
      step: typeof raw.zoom.step === 'number' ? raw.zoom.step : 0.1,
    };
  }

  // Torch: true only when explicitly advertised
  const torch = raw.torch === true;

  // Focus: true if focusMode includes manual/single-shot OR pointsOfInterest exists
  const focusModes = Array.isArray(raw.focusMode) ? raw.focusMode : [];
  const focus =
    focusModes.includes('manual') ||
    focusModes.includes('single-shot') ||
    raw.pointsOfInterest !== undefined;

  return { zoom, torch, focus };
}

// ---------------------------------------------------------------------------
// clampZoom
// ---------------------------------------------------------------------------

/**
 * Clamp a zoom value to [min, max].
 */
export function clampZoom(value: number, range: Pick<ZoomRange, 'min' | 'max'>): number {
  return Math.min(range.max, Math.max(range.min, value));
}

// ---------------------------------------------------------------------------
// normalizeFocusPoint
// ---------------------------------------------------------------------------

/**
 * Convert a pointer event's client coordinates to a normalized [0,1] focus
 * point relative to the viewfinder rect.
 *
 * When `mirrored` is true (front camera, CSS scaleX(-1)), the x axis is
 * flipped so the focus point aligns with the actual sensor direction.
 */
export function normalizeFocusPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  mirrored: boolean,
): { x: number; y: number } {
  const rawX = (clientX - rect.left) / rect.width;
  const rawY = (clientY - rect.top) / rect.height;

  const x = Math.min(1, Math.max(0, mirrored ? 1 - rawX : rawX));
  const y = Math.min(1, Math.max(0, rawY));

  return { x, y };
}

// ---------------------------------------------------------------------------
// buildZoomConstraints
// ---------------------------------------------------------------------------

/**
 * Build the advanced constraints object for applying a zoom level.
 * Caller applies via track.applyConstraints(buildZoomConstraints(value)).
 */
export function buildZoomConstraints(value: number): Record<string, unknown> {
  return { advanced: [{ zoom: value }] };
}

// ---------------------------------------------------------------------------
// buildFocusConstraints
// ---------------------------------------------------------------------------

/**
 * Build the advanced constraints object for tap-to-focus at a normalized point.
 */
export function buildFocusConstraints(point: { x: number; y: number }): Record<string, unknown> {
  return {
    advanced: [{ pointsOfInterest: [point], focusMode: 'single-shot' }],
  };
}

// ---------------------------------------------------------------------------
// Zoom presets
// ---------------------------------------------------------------------------

export const ZOOM_PRESETS = [0.5, 1, 1.5, 2, 5] as const;

export interface ZoomPreset {
  value: number;
  label: string;
  enabled: boolean;
}

/**
 * Map the fixed presets to UI options, marking each enabled only if it falls
 * within the device's reported zoom range. Returns [] when range is null.
 */
export function buildZoomPresets(range: { min: number; max: number } | null): ZoomPreset[] {
  if (!range) return [];
  return ZOOM_PRESETS.map((value) => ({
    value,
    label: `${value}x`,
    enabled: value >= range.min && value <= range.max,
  }));
}
