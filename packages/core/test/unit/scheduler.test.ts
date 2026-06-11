import { describe, it, expect } from 'vitest';
import { schedule } from '../../src/srs/scheduler.js';
import type { CardState, Grade } from '../../src/srs/scheduler.js';

/** A deterministic reference timestamp used across tests. */
const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default initial card state (fresh card). */
const INITIAL: CardState = { ease: 2.5, interval: 1, dueAt: '2026-01-01T00:00:00.000Z' };

// ---------------------------------------------------------------------------
// Grade 5 — perfect recall
// ---------------------------------------------------------------------------

describe('grade 5 (perfect recall)', () => {
  it('increases ease above 2.5 when starting from 2.5', () => {
    const result = schedule(INITIAL, 5, NOW);
    // ease += 0.1 - 0 = 0.1
    expect(result.ease).toBeCloseTo(2.6, 10);
  });

  it('advances interval from 1 → 6 on the first pass', () => {
    const result = schedule(INITIAL, 5, NOW);
    expect(result.interval).toBe(6);
  });

  it('sets dueAt to now + 6 days', () => {
    const result = schedule(INITIAL, 5, NOW);
    const expected = new Date(NOW.getTime() + 6 * DAY_MS).toISOString();
    expect(result.dueAt).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Grade 4 — correct with hesitation
// ---------------------------------------------------------------------------

describe('grade 4 (correct with hesitation)', () => {
  it('leaves ease unchanged at 2.5 when starting from 2.5', () => {
    // ease += 0.1 - 1*(0.08 + 1*0.02) = 0.1 - 0.1 = 0
    const result = schedule(INITIAL, 4, NOW);
    expect(result.ease).toBeCloseTo(2.5, 10);
  });

  it('advances interval from 1 → 6', () => {
    const result = schedule(INITIAL, 4, NOW);
    expect(result.interval).toBe(6);
  });

  it('ease change is smaller than grade 5 (grade 4 does not increase ease from 2.5)', () => {
    const r4 = schedule(INITIAL, 4, NOW);
    const r5 = schedule(INITIAL, 5, NOW);
    expect(r4.ease).toBeLessThan(r5.ease);
  });
});

// ---------------------------------------------------------------------------
// Grade 3 — barely passed (ease DECREASES)
// ---------------------------------------------------------------------------

describe('grade 3 (barely passed)', () => {
  it('decreases ease by 0.14 from 2.5', () => {
    // ease += 0.1 - 2*(0.08 + 2*0.02) = 0.1 - 2*0.12 = 0.1 - 0.24 = -0.14
    const result = schedule(INITIAL, 3, NOW);
    expect(result.ease).toBeCloseTo(2.5 - 0.14, 10);
  });

  it('ease is exactly 2.36 (not an increase)', () => {
    const result = schedule(INITIAL, 3, NOW);
    expect(result.ease).toBeCloseTo(2.36, 10);
  });

  it('advances interval from 1 → 6', () => {
    const result = schedule(INITIAL, 3, NOW);
    expect(result.interval).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Interval progression: 1 → 6 → 21 → round(21 * ease)
// ---------------------------------------------------------------------------

describe('interval progression across successive passes', () => {
  it('1 → 6 on first pass (grade 5)', () => {
    const r = schedule(INITIAL, 5, NOW);
    expect(r.interval).toBe(6);
  });

  it('6 → 21 on second pass (grade 5)', () => {
    const afterFirst = schedule(INITIAL, 5, NOW);
    const r = schedule(afterFirst, 5, NOW);
    expect(r.interval).toBe(21);
  });

  it('21 → round(21 * ease) on third pass (grade 5)', () => {
    const afterFirst = schedule(INITIAL, 5, NOW);
    const afterSecond = schedule(afterFirst, 5, NOW);
    // ease after two grade-5 reviews starting from 2.5: 2.5 + 0.1 + 0.1 = 2.7
    const expectedInterval = Math.round(21 * afterSecond.ease);
    const r = schedule(afterSecond, 5, NOW);
    expect(r.interval).toBe(expectedInterval);
  });

  it('uses current ease (before update) for interval multiplication', () => {
    // Verify: the interval is computed with current.ease, not newEase
    const state: CardState = { ease: 2.0, interval: 21, dueAt: NOW.toISOString() };
    const r = schedule(state, 5, NOW);
    expect(r.interval).toBe(Math.round(21 * 2.0)); // = 42, not round(21 * 2.1)
  });
});

// ---------------------------------------------------------------------------
// Grades 0, 1, 2 — failed
// ---------------------------------------------------------------------------

describe('grade 0 (failed — complete blackout)', () => {
  it('resets interval to 1', () => {
    const state: CardState = { ease: 2.5, interval: 21, dueAt: NOW.toISOString() };
    const r = schedule(state, 0, NOW);
    expect(r.interval).toBe(1);
  });

  it('leaves ease unchanged', () => {
    const state: CardState = { ease: 2.5, interval: 21, dueAt: NOW.toISOString() };
    const r = schedule(state, 0, NOW);
    expect(r.ease).toBe(2.5);
  });

  it('dueAt is now + 1 day', () => {
    const r = schedule(INITIAL, 0, NOW);
    const expected = new Date(NOW.getTime() + DAY_MS).toISOString();
    expect(r.dueAt).toBe(expected);
  });
});

describe('grade 1 (failed — incorrect; correct remembered after seeing)', () => {
  it('resets interval to 1', () => {
    const state: CardState = { ease: 1.8, interval: 42, dueAt: NOW.toISOString() };
    const r = schedule(state, 1, NOW);
    expect(r.interval).toBe(1);
  });

  it('leaves ease unchanged', () => {
    const state: CardState = { ease: 1.8, interval: 42, dueAt: NOW.toISOString() };
    const r = schedule(state, 1, NOW);
    expect(r.ease).toBe(1.8);
  });
});

describe('grade 2 (failed — blackout with hint)', () => {
  it('resets interval to 1', () => {
    const r = schedule(INITIAL, 2, NOW);
    expect(r.interval).toBe(1);
  });

  it('leaves ease unchanged at 2.5', () => {
    const r = schedule(INITIAL, 2, NOW);
    expect(r.ease).toBe(2.5);
  });

  it('dueAt is now + 1 day', () => {
    const r = schedule(INITIAL, 2, NOW);
    const expected = new Date(NOW.getTime() + DAY_MS).toISOString();
    expect(r.dueAt).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Minimum ease clamp at 1.3
// ---------------------------------------------------------------------------

describe('minimum ease clamp', () => {
  it('clamps ease at exactly 1.3 when repeated grade-3 reviews drive it below 1.3', () => {
    // Each grade-3 pass reduces ease by 0.14. Starting at 1.35 → would go to 1.21, clamped to 1.3.
    const lowEaseState: CardState = { ease: 1.35, interval: 6, dueAt: NOW.toISOString() };
    const r = schedule(lowEaseState, 3, NOW);
    expect(r.ease).toBe(1.3);
  });

  it('never goes below 1.3 after multiple consecutive grade-3 reviews from 2.5', () => {
    let state: CardState = INITIAL;
    // Drive ease down with repeated grade-3 passes
    for (let i = 0; i < 20; i++) {
      state = schedule(state, 3, NOW);
    }
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('clamps to exactly 1.3, not something fractionally below', () => {
    const almostClamped: CardState = { ease: 1.31, interval: 6, dueAt: NOW.toISOString() };
    const r = schedule(almostClamped, 3, NOW);
    // 1.31 - 0.14 = 1.17, clamped to 1.3
    expect(r.ease).toBe(1.3);
  });
});

// ---------------------------------------------------------------------------
// Deterministic dueAt
// ---------------------------------------------------------------------------

describe('deterministic dueAt', () => {
  it('sets dueAt to exactly now + 1 day (in ms) for a failed card', () => {
    const r = schedule(INITIAL, 0, NOW);
    expect(r.dueAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('sets dueAt to exactly now + 6 days for the first pass', () => {
    const r = schedule(INITIAL, 5, NOW);
    expect(r.dueAt).toBe('2026-01-07T00:00:00.000Z');
  });

  it('sets dueAt to exactly now + 21 days for the second pass (interval=6 → 21)', () => {
    const state: CardState = { ease: 2.5, interval: 6, dueAt: NOW.toISOString() };
    const r = schedule(state, 5, NOW);
    expect(r.dueAt).toBe('2026-01-22T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// lastReviewedAt
// ---------------------------------------------------------------------------

describe('lastReviewedAt', () => {
  it('equals now.toISOString() for a passed card', () => {
    const r = schedule(INITIAL, 5, NOW);
    expect(r.lastReviewedAt).toBe(NOW.toISOString());
  });

  it('equals now.toISOString() for a failed card', () => {
    const r = schedule(INITIAL, 0, NOW);
    expect(r.lastReviewedAt).toBe(NOW.toISOString());
  });

  it('is a valid ISO-8601 string', () => {
    const r = schedule(INITIAL, 4, NOW);
    expect(r.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

// ---------------------------------------------------------------------------
// Purity — input object must not be mutated
// ---------------------------------------------------------------------------

describe('purity (no mutation of input)', () => {
  it('does not mutate the input CardState on a passed review', () => {
    const input: CardState = { ease: 2.5, interval: 1, dueAt: '2026-01-01T00:00:00.000Z' };
    const snapshot = { ...input };
    schedule(input, 5, NOW);
    expect(input).toEqual(snapshot);
  });

  it('does not mutate the input CardState on a failed review', () => {
    const input: CardState = { ease: 2.5, interval: 21, dueAt: '2026-01-01T00:00:00.000Z' };
    const snapshot = { ...input };
    schedule(input, 1, NOW);
    expect(input).toEqual(snapshot);
  });

  it('does not mutate the input CardState when ease is clamped', () => {
    const input: CardState = { ease: 1.31, interval: 6, dueAt: NOW.toISOString() };
    const snapshot = { ...input };
    schedule(input, 3, NOW);
    expect(input).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Default `now` behaviour (smoke test — no fixed time)
// ---------------------------------------------------------------------------

describe('default now parameter', () => {
  it('returns a valid ISO string for dueAt when now is omitted', () => {
    const r = schedule(INITIAL, 5);
    expect(r.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns a valid ISO string for lastReviewedAt when now is omitted', () => {
    const r = schedule(INITIAL, 5);
    expect(r.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
