import { describe, it, expect, vi } from 'vitest';
import {
  readCameraCapabilities,
  clampZoom,
  normalizeFocusPoint,
  buildZoomConstraints,
  buildFocusConstraints,
  buildZoomPresets,
} from '../camera-controls';

// ---------------------------------------------------------------------------
// Helpers to create a fake MediaStreamTrack
// ---------------------------------------------------------------------------

function makeTrack(capabilities: Record<string, unknown>): MediaStreamTrack {
  return {
    getCapabilities: () => capabilities,
  } as unknown as MediaStreamTrack;
}

function makeTrackNoCapabilities(): MediaStreamTrack {
  return {} as unknown as MediaStreamTrack;
}

// ---------------------------------------------------------------------------
// readCameraCapabilities
// ---------------------------------------------------------------------------

describe('readCameraCapabilities', () => {
  it('returns null zoom and false flags when getCapabilities is missing', () => {
    const track = makeTrackNoCapabilities();
    expect(readCameraCapabilities(track)).toEqual({ zoom: null, torch: false, focus: false });
  });

  it('parses zoom range correctly', () => {
    const track = makeTrack({ zoom: { min: 1, max: 5, step: 0.5 } });
    const caps = readCameraCapabilities(track);
    expect(caps.zoom).toEqual({ min: 1, max: 5, step: 0.5 });
  });

  it('returns null zoom when max === min', () => {
    const track = makeTrack({ zoom: { min: 1, max: 1 } });
    expect(readCameraCapabilities(track).zoom).toBeNull();
  });

  it('returns null zoom when zoom is absent', () => {
    const track = makeTrack({});
    expect(readCameraCapabilities(track).zoom).toBeNull();
  });

  it('uses default step when zoom step is missing', () => {
    const track = makeTrack({ zoom: { min: 1, max: 3 } });
    const caps = readCameraCapabilities(track);
    expect(caps.zoom?.step).toBe(0.1);
  });

  it('detects torch = true', () => {
    const track = makeTrack({ torch: true });
    expect(readCameraCapabilities(track).torch).toBe(true);
  });

  it('returns torch = false when absent', () => {
    const track = makeTrack({});
    expect(readCameraCapabilities(track).torch).toBe(false);
  });

  it('detects focus via manual focusMode', () => {
    const track = makeTrack({ focusMode: ['manual', 'continuous'] });
    expect(readCameraCapabilities(track).focus).toBe(true);
  });

  it('detects focus via single-shot focusMode', () => {
    const track = makeTrack({ focusMode: ['single-shot'] });
    expect(readCameraCapabilities(track).focus).toBe(true);
  });

  it('detects focus via pointsOfInterest', () => {
    const track = makeTrack({ pointsOfInterest: {} });
    expect(readCameraCapabilities(track).focus).toBe(true);
  });

  it('returns focus = false when no focus indicators', () => {
    const track = makeTrack({ focusMode: ['continuous'] });
    expect(readCameraCapabilities(track).focus).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampZoom
// ---------------------------------------------------------------------------

describe('clampZoom', () => {
  const range = { min: 1, max: 5 };

  it('clamps below min to min', () => {
    expect(clampZoom(0.5, range)).toBe(1);
  });

  it('clamps above max to max', () => {
    expect(clampZoom(10, range)).toBe(5);
  });

  it('passes through in-range value unchanged', () => {
    expect(clampZoom(3, range)).toBe(3);
  });

  it('accepts min boundary', () => {
    expect(clampZoom(1, range)).toBe(1);
  });

  it('accepts max boundary', () => {
    expect(clampZoom(5, range)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// normalizeFocusPoint
// ---------------------------------------------------------------------------

describe('normalizeFocusPoint', () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };

  it('returns center for a center tap', () => {
    const pt = normalizeFocusPoint(300, 200, rect, false);
    expect(pt.x).toBeCloseTo(0.5);
    expect(pt.y).toBeCloseTo(0.5);
  });

  it('returns (0, 0) for top-left tap', () => {
    const pt = normalizeFocusPoint(100, 50, rect, false);
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(0);
  });

  it('returns (1, 1) for bottom-right tap', () => {
    const pt = normalizeFocusPoint(500, 350, rect, false);
    expect(pt.x).toBeCloseTo(1);
    expect(pt.y).toBeCloseTo(1);
  });

  it('flips x when mirrored', () => {
    const pt = normalizeFocusPoint(300, 200, rect, true); // center, mirrored
    expect(pt.x).toBeCloseTo(0.5); // center stays center
  });

  it('flips x correctly on left edge when mirrored', () => {
    const pt = normalizeFocusPoint(100, 200, rect, true); // tap at x=0 → should become x=1
    expect(pt.x).toBeCloseTo(1);
  });

  it('flips x correctly on right edge when mirrored', () => {
    const pt = normalizeFocusPoint(500, 200, rect, true); // tap at x=1 → should become x=0
    expect(pt.x).toBeCloseTo(0);
  });

  it('clamps out-of-bounds tap to [0, 1]', () => {
    const pt = normalizeFocusPoint(0, 0, rect, false); // way outside the rect
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(0);
  });

  it('clamps out-of-bounds tap to max', () => {
    const pt = normalizeFocusPoint(600, 500, rect, false); // way outside
    expect(pt.x).toBe(1);
    expect(pt.y).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildZoomConstraints / buildFocusConstraints
// ---------------------------------------------------------------------------

describe('buildZoomConstraints', () => {
  it('returns the expected advanced constraints shape', () => {
    expect(buildZoomConstraints(2.5)).toEqual({ advanced: [{ zoom: 2.5 }] });
  });
});

describe('buildFocusConstraints', () => {
  it('returns the expected advanced constraints shape', () => {
    expect(buildFocusConstraints({ x: 0.3, y: 0.7 })).toEqual({
      advanced: [{ pointsOfInterest: [{ x: 0.3, y: 0.7 }], focusMode: 'single-shot' }],
    });
  });
});

// ---------------------------------------------------------------------------
// buildZoomPresets
// ---------------------------------------------------------------------------

describe('buildZoomPresets', () => {
  it('returns [] when range is null', () => {
    expect(buildZoomPresets(null)).toEqual([]);
  });

  it('returns 4 presets with correct labels and enabled flags for range { min: 1, max: 3 }', () => {
    const presets = buildZoomPresets({ min: 1, max: 3 });
    expect(presets).toHaveLength(4);
    expect(presets.map((p) => p.label)).toEqual(['1x', '1.5x', '2x', '5x']);
    expect(presets.map((p) => p.enabled)).toEqual([true, true, true, false]);
  });

  it('marks all presets enabled for range { min: 0.5, max: 8 }', () => {
    const presets = buildZoomPresets({ min: 0.5, max: 8 });
    expect(presets.every((p) => p.enabled)).toBe(true);
  });

  it('enables 1x and 5x (inclusive bounds) for range { min: 1, max: 5 }', () => {
    const presets = buildZoomPresets({ min: 1, max: 5 });
    const byLabel = Object.fromEntries(presets.map((p) => [p.label, p.enabled]));
    expect(byLabel['1x']).toBe(true);
    expect(byLabel['5x']).toBe(true);
  });
});
