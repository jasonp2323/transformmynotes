import { describe, it, expect } from 'vitest';
import { utcDateString, nextMidnightUtcEpochSeconds } from '../rate-window.js';

describe('utcDateString', () => {
  it('returns YYYY-MM-DD for a non-midnight time', () => {
    const now = Date.UTC(2026, 5, 18, 23, 59, 0); // 2026-06-18T23:59:00Z
    expect(utcDateString(now)).toBe('2026-06-18');
  });

  it('returns the same date for midnight', () => {
    const now = Date.UTC(2026, 5, 19, 0, 0, 0); // 2026-06-19T00:00:00Z
    expect(utcDateString(now)).toBe('2026-06-19');
  });

  it('pads month and day correctly', () => {
    const now = Date.UTC(2026, 0, 5, 12, 0, 0); // 2026-01-05T12:00:00Z
    expect(utcDateString(now)).toBe('2026-01-05');
  });
});

describe('nextMidnightUtcEpochSeconds', () => {
  it('returns next-day midnight for a non-midnight time', () => {
    const now = Date.UTC(2026, 5, 18, 23, 59, 0); // 2026-06-18T23:59:00Z
    const expected = Date.UTC(2026, 5, 19, 0, 0, 0) / 1000; // 2026-06-19T00:00:00Z
    expect(nextMidnightUtcEpochSeconds(now)).toBe(expected);
  });

  it('at exactly midnight, returns the NEXT day midnight (strictly after)', () => {
    const now = Date.UTC(2026, 5, 19, 0, 0, 0); // 2026-06-19T00:00:00Z (exactly midnight)
    const expected = Date.UTC(2026, 5, 20, 0, 0, 0) / 1000; // 2026-06-20T00:00:00Z
    expect(nextMidnightUtcEpochSeconds(now)).toBe(expected);
  });

  it('handles end of month correctly', () => {
    const now = Date.UTC(2026, 0, 31, 12, 0, 0); // 2026-01-31T12:00:00Z
    const expected = Date.UTC(2026, 1, 1, 0, 0, 0) / 1000; // 2026-02-01T00:00:00Z
    expect(nextMidnightUtcEpochSeconds(now)).toBe(expected);
  });
});
