import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eachDayInRange, parseDateRange } from '../range.js';

// ---------------------------------------------------------------------------
// eachDayInRange
// ---------------------------------------------------------------------------

describe('eachDayInRange', () => {
  it('returns a single element for the same from and to', () => {
    expect(eachDayInRange('2026-06-15', '2026-06-15')).toEqual(['2026-06-15']);
  });

  it('returns inclusive multi-day range', () => {
    expect(eachDayInRange('2026-06-13', '2026-06-15')).toEqual([
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
    ]);
  });

  it('returns [] when fromDay > toDay', () => {
    expect(eachDayInRange('2026-06-15', '2026-06-13')).toEqual([]);
  });

  it('crosses month boundaries correctly', () => {
    const days = eachDayInRange('2026-01-30', '2026-02-02');
    expect(days).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('crosses year boundaries correctly', () => {
    const days = eachDayInRange('2025-12-30', '2026-01-02');
    expect(days).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });

  it('handles leap day (Feb 29 2024 exists)', () => {
    const days = eachDayInRange('2024-02-28', '2024-03-01');
    expect(days).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('returns correct count for a 92-day range', () => {
    const days = eachDayInRange('2026-01-01', '2026-04-02');
    expect(days.length).toBe(92);
    expect(days[0]).toBe('2026-01-01');
    expect(days[91]).toBe('2026-04-02');
  });
});

// ---------------------------------------------------------------------------
// parseDateRange
// ---------------------------------------------------------------------------

describe('parseDateRange — default (both absent)', () => {
  beforeEach(() => {
    // Pin "today" to a known UTC date so the default range is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a 30-day range ending today when both params are absent', () => {
    const result = parseDateRange({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.to).toBe('2026-06-19');
    expect(result.from).toBe('2026-05-21');
    expect(result.days.length).toBe(30);
    expect(result.days[0]).toBe('2026-05-21');
    expect(result.days[29]).toBe('2026-06-19');
  });

  it('uses defaultDays override when provided', () => {
    const result = parseDateRange({}, { defaultDays: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days.length).toBe(7);
  });
});

describe('parseDateRange — explicit range', () => {
  it('returns ok result for a valid 3-day range', () => {
    const result = parseDateRange({ from: '2026-06-01', to: '2026-06-03' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toBe('2026-06-01');
    expect(result.to).toBe('2026-06-03');
    expect(result.days).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('returns ok for a single-day range (from === to)', () => {
    const result = parseDateRange({ from: '2026-06-15', to: '2026-06-15' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days).toEqual(['2026-06-15']);
  });

  it('errors when from > to', () => {
    const result = parseDateRange({ from: '2026-06-15', to: '2026-06-01' });
    expect(result.ok).toBe(false);
  });

  it('errors when only from is provided', () => {
    const result = parseDateRange({ from: '2026-06-01' });
    expect(result.ok).toBe(false);
  });

  it('errors when only to is provided', () => {
    const result = parseDateRange({ to: '2026-06-01' });
    expect(result.ok).toBe(false);
  });

  it('errors on invalid format (not YYYY-MM-DD)', () => {
    const result = parseDateRange({ from: '06/01/2026', to: '2026-06-03' });
    expect(result.ok).toBe(false);
  });

  it('errors on invalid calendar date (month 13)', () => {
    const result = parseDateRange({ from: '2026-13-01', to: '2026-13-05' });
    expect(result.ok).toBe(false);
  });

  it('errors on invalid calendar date (day 40)', () => {
    const result = parseDateRange({ from: '2026-06-40', to: '2026-06-40' });
    expect(result.ok).toBe(false);
  });

  it('errors when range exceeds maxDays (default 92)', () => {
    const result = parseDateRange({ from: '2026-01-01', to: '2026-12-31' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/max 92 days/);
  });

  it('errors when range exceeds custom maxDays', () => {
    const result = parseDateRange(
      { from: '2026-06-01', to: '2026-06-10' },
      { maxDays: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/max 5 days/);
  });

  it('accepts exactly maxDays length range', () => {
    // 92-day range ending 2026-04-02 starting 2026-01-01
    const result = parseDateRange({ from: '2026-01-01', to: '2026-04-02' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days.length).toBe(92);
  });

  it('handles leap-day boundary (2024-02-28 to 2024-03-01)', () => {
    const result = parseDateRange({ from: '2024-02-28', to: '2024-03-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('errors on Feb 30 (non-existent date)', () => {
    const result = parseDateRange({ from: '2026-02-30', to: '2026-02-30' });
    expect(result.ok).toBe(false);
  });
});
