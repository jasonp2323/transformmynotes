import { describe, it, expect } from 'vitest';
import { aiTokensToUsd, averageBytes, gbMonths, storageUsd } from '../cost.js';
import type { ModelPrice } from '../types.js';

// Reusable rate fixture matching Sonnet 3.5 v2 public rates
const SONNET_RATES: ModelPrice = { inputPer1k: 0.003, outputPer1k: 0.015 };

// ---------------------------------------------------------------------------
// aiTokensToUsd
// ---------------------------------------------------------------------------

describe('aiTokensToUsd', () => {
  it('computes the correct USD for a known input/output pair', () => {
    // 1000 input tokens at $0.003/1k = $0.003
    // 500  output tokens at $0.015/1k = $0.0075
    // total = $0.0105
    const result = aiTokensToUsd({ inputTokens: 1000, outputTokens: 500 }, SONNET_RATES);
    expect(result).toBeCloseTo(0.0105, 10);
  });

  it('returns 0 when both token counts are 0', () => {
    expect(aiTokensToUsd({ inputTokens: 0, outputTokens: 0 }, SONNET_RATES)).toBe(0);
  });

  it('accounts only for input when outputTokens is 0', () => {
    // 2000 input * 0.003 / 1000 = 0.006
    expect(aiTokensToUsd({ inputTokens: 2000, outputTokens: 0 }, SONNET_RATES))
      .toBeCloseTo(0.006, 10);
  });

  it('accounts only for output when inputTokens is 0', () => {
    // 1000 output * 0.015 / 1000 = 0.015
    expect(aiTokensToUsd({ inputTokens: 0, outputTokens: 1000 }, SONNET_RATES))
      .toBeCloseTo(0.015, 10);
  });

  it('scales linearly with token counts', () => {
    const single = aiTokensToUsd({ inputTokens: 1000, outputTokens: 500 }, SONNET_RATES);
    const double = aiTokensToUsd({ inputTokens: 2000, outputTokens: 1000 }, SONNET_RATES);
    expect(double).toBeCloseTo(single * 2, 10);
  });

  it('works with fractional-per-1k rates', () => {
    const rates: ModelPrice = { inputPer1k: 0.0008, outputPer1k: 0.0024 };
    // 500 input * 0.0008 / 1000 + 500 output * 0.0024 / 1000 = 0.0004 + 0.0012 = 0.0016
    expect(aiTokensToUsd({ inputTokens: 500, outputTokens: 500 }, rates))
      .toBeCloseTo(0.0016, 10);
  });
});

// ---------------------------------------------------------------------------
// averageBytes
// ---------------------------------------------------------------------------

describe('averageBytes', () => {
  it('returns 0 for an empty array', () => {
    expect(averageBytes([])).toBe(0);
  });

  it('returns the single element for a one-element array', () => {
    expect(averageBytes([1_000_000])).toBe(1_000_000);
  });

  it('returns the arithmetic mean of multiple snapshots', () => {
    // (100 + 200 + 300) / 3 = 200
    expect(averageBytes([100, 200, 300])).toBeCloseTo(200, 10);
  });

  it('handles all-identical snapshots', () => {
    expect(averageBytes([5e9, 5e9, 5e9])).toBe(5e9);
  });

  it('handles zero values without dividing by zero', () => {
    expect(averageBytes([0, 0, 0])).toBe(0);
  });

  it('handles a mixed array with some zeros', () => {
    // (0 + 1e9 + 2e9) / 3
    expect(averageBytes([0, 1e9, 2e9])).toBeCloseTo(1e9, 1);
  });
});

// ---------------------------------------------------------------------------
// gbMonths
// ---------------------------------------------------------------------------

describe('gbMonths', () => {
  it('returns 0 for periodDays <= 0 (zero)', () => {
    expect(gbMonths(5e9, 0)).toBe(0);
  });

  it('returns 0 for periodDays < 0 (negative)', () => {
    expect(gbMonths(5e9, -1)).toBe(0);
  });

  it('full 30-day period: avgGB ≈ GB-months (5 GB storage → 5 GB-months)', () => {
    // (5e9 / 1e9) * (30 / 30) = 5 GB-months
    expect(gbMonths(5e9, 30)).toBeCloseTo(5.0, 10);
  });

  it('15-day half-period: GB-months is halved relative to a full period', () => {
    // (5e9 / 1e9) * (15 / 30) = 2.5 GB-months
    expect(gbMonths(5e9, 15)).toBeCloseTo(2.5, 10);
  });

  it('a single day: a 1/30 fraction of a GB-month', () => {
    // (1e9 / 1e9) * (1 / 30) ≈ 0.03333...
    expect(gbMonths(1e9, 1)).toBeCloseTo(1 / 30, 10);
  });

  it('returns 0 when avgBytes is 0', () => {
    expect(gbMonths(0, 30)).toBe(0);
  });

  it('converts bytes correctly (1 GB = 1e9 bytes)', () => {
    // 1 GB stored for 30 days = exactly 1.0 GB-month
    expect(gbMonths(1e9, 30)).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// storageUsd
// ---------------------------------------------------------------------------

describe('storageUsd', () => {
  it('multiplies gbMonths by s3PerGbMonth rate', () => {
    // 5 GB-months * $0.023 = $0.115
    expect(storageUsd(5, 0.023)).toBeCloseTo(0.115, 10);
  });

  it('returns 0 for 0 GB-months', () => {
    expect(storageUsd(0, 0.023)).toBe(0);
  });

  it('returns 0 for a 0 rate', () => {
    expect(storageUsd(10, 0)).toBe(0);
  });

  it('scales linearly with storage', () => {
    const a = storageUsd(1, 0.023);
    const b = storageUsd(10, 0.023);
    expect(b).toBeCloseTo(a * 10, 10);
  });

  it('uses the S3 Standard rate of $0.023/GB-month for a 1 GB-month unit', () => {
    expect(storageUsd(1, 0.023)).toBeCloseTo(0.023, 10);
  });
});
