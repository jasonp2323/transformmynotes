import { describe, it, expect } from 'vitest';
import { computeScaledDimensions, MAX_LONGEST_SIDE, JPEG_QUALITY } from '../resize-image';

describe('constants', () => {
  it('MAX_LONGEST_SIDE is 2048', () => {
    expect(MAX_LONGEST_SIDE).toBe(2048);
  });

  it('JPEG_QUALITY is 0.85', () => {
    expect(JPEG_QUALITY).toBe(0.85);
  });
});

describe('computeScaledDimensions', () => {
  it('landscape: downscales so longest side equals maxSide (4000×3000 → 2048×1536)', () => {
    const result = computeScaledDimensions(4000, 3000);
    expect(result).toEqual({ width: 2048, height: 1536 });
  });

  it('portrait: downscales so longest side equals maxSide (3000×4000 → 1536×2048)', () => {
    const result = computeScaledDimensions(3000, 4000);
    expect(result).toEqual({ width: 1536, height: 2048 });
  });

  it('square: downscales both sides equally (4000×4000 → 2048×2048)', () => {
    const result = computeScaledDimensions(4000, 4000);
    expect(result).toEqual({ width: 2048, height: 2048 });
  });

  it('already-small: does not upscale (1000×800 unchanged)', () => {
    const result = computeScaledDimensions(1000, 800);
    expect(result).toEqual({ width: 1000, height: 800 });
  });

  it('exact boundary: 2048×1080 is returned unchanged', () => {
    const result = computeScaledDimensions(2048, 1080);
    expect(result).toEqual({ width: 2048, height: 1080 });
  });

  it('tiny: 1×1 is returned as 1×1', () => {
    const result = computeScaledDimensions(1, 1);
    expect(result).toEqual({ width: 1, height: 1 });
  });

  it('rounding: non-integer result rounds to nearest integer (3001×2000 downscale)', () => {
    // longest = 3001, scale = 2048/3001
    const scale = 2048 / 3001;
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

  it('wide landscape: 2560×1440 downscales width to 2048 and height proportionally', () => {
    // scale = 2048/2560 = 0.8 → 2048×1152
    const result = computeScaledDimensions(2560, 1440);
    expect(result).toEqual({ width: 2048, height: 1152 });
  });
});
