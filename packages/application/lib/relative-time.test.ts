import { describe, it, expect } from 'vitest';
import { relativeTime, formatAvgWait } from './relative-time';

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------

describe('relativeTime', () => {
  const NOW = new Date('2026-06-10T12:00:00.000Z');

  it('returns "just now" for less than 60 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 30_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('just now');
  });

  it('returns "just now" for exactly 0 ms ago', () => {
    expect(relativeTime(NOW.toISOString(), NOW)).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 59_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('just now');
  });

  it('returns "Xm ago" for minutes-level age', () => {
    const iso = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('5m ago');
  });

  it('returns "1m ago" for exactly 60 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('1m ago');
  });

  it('returns "Xh ago" for hours-level age', () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('3h ago');
  });

  it('returns "Xd ago" for days-level age', () => {
    const iso = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('2d ago');
  });

  it('defaults now to the current time when not provided', () => {
    // Should not throw and should return a string ending in "ago" or "just now"
    const iso = new Date(Date.now() - 10_000).toISOString();
    const result = relativeTime(iso);
    expect(result).toBe('just now');
  });
});

// ---------------------------------------------------------------------------
// formatAvgWait
// ---------------------------------------------------------------------------

describe('formatAvgWait', () => {
  const NOW = new Date('2026-06-10T12:00:00.000Z');

  it('returns "—" for an empty array', () => {
    expect(formatAvgWait([], NOW)).toBe('—');
  });

  it('returns minutes for a single sub-hour entry', () => {
    const iso = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    expect(formatAvgWait([iso], NOW)).toBe('30m');
  });

  it('returns hours for a single hour-range entry', () => {
    const iso = new Date(NOW.getTime() - 4 * 60 * 60_000).toISOString();
    expect(formatAvgWait([iso], NOW)).toBe('4h');
  });

  it('returns days for a single multi-day entry', () => {
    const iso = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatAvgWait([iso], NOW)).toBe('2d');
  });

  it('averages multiple entries correctly', () => {
    // 1h and 3h → average 2h
    const iso1 = new Date(NOW.getTime() - 1 * 60 * 60_000).toISOString();
    const iso2 = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatAvgWait([iso1, iso2], NOW)).toBe('2h');
  });

  it('rounds down to the nearest unit', () => {
    // 90 minutes: floor to 1h
    const iso = new Date(NOW.getTime() - 90 * 60_000).toISOString();
    expect(formatAvgWait([iso], NOW)).toBe('1h');
  });

  it('defaults now to the current time when not provided', () => {
    // Should not throw and should return a non-empty string
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = formatAvgWait([iso]);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
