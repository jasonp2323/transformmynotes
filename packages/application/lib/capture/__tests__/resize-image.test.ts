import { describe, it, expect } from 'vitest';
import { computeScaledDimensions, MAX_LONGEST_SIDE, JPEG_QUALITY } from '../resize-image';

describe('constants', () => {
  it('MAX_LONGEST_SIDE is 1920', () => {
    expect(MAX_LONGEST_SIDE).toBe(1920);
  });

  it('JPEG_QUALITY is 0.82', () => {
    expect(JPEG_QUALITY).toBe(0.82);
  });
});

describe('computeScaledDimensions', () => {
  it('landscape: downscales so longest side equals maxSide (4000×3000 → 1920×1440)', () => {
    const result = computeScaledDimensions(4000, 3000);
    expect(result).toEqual({ width: 1920, height: 1440 });
  });

  it('portrait: downscales so longest side equals maxSide (3000×4000 → 1440×1920)', () => {
    const result = computeScaledDimensions(3000, 4000);
    expect(result).toEqual({ width: 1440, height: 1920 });
  });

  it('square: downscales both sides equally (4000×4000 → 1920×1920)', () => {
    const result = computeScaledDimensions(4000, 4000);
    expect(result).toEqual({ width: 1920, height: 1920 });
  });

  it('already-small: does not upscale (1000×800 unchanged)', () => {
    const result = computeScaledDimensions(1000, 800);
    expect(result).toEqual({ width: 1000, height: 800 });
  });

  it('exact boundary: 1920×1080 is returned unchanged', () => {
    const result = computeScaledDimensions(1920, 1080);
    expect(result).toEqual({ width: 1920, height: 1080 });
  });

  it('tiny: 1×1 is returned as 1×1', () => {
    const result = computeScaledDimensions(1, 1);
    expect(result).toEqual({ width: 1, height: 1 });
  });

  it('rounding: non-integer result rounds to nearest integer (3001×2000 downscale)', () => {
    // longest = 3001, scale = 1920/3001
    const scale = 1920 / 3001;
    const expectedWidth = Math.max(1, Math.round(3001 * scale));
    const expectedHeight = Math.max(1, Math.round(2000 * scale));
    const result = computeScaledDimensions(3001, 2000);
    expect(result.width).toBe(expectedWidth);
    expect(result.height).toBe(expectedHeight);
  });

  it('custom maxSide: respects a supplied maxSide parameter (800×600, max=400 → 400×300)', () => {
    const result = computeScaledDimensions(800, 600, 400);
    expect(result).toEqual({ width: 400, height: 300 });
  });

  it('wide landscape: 2560×1440 downscales width to 1920 and height proportionally', () => {
    // scale = 1920/2560 = 0.75 → 1920×1080
    const result = computeScaledDimensions(2560, 1440);
    expect(result).toEqual({ width: 1920, height: 1080 });
  });
});
