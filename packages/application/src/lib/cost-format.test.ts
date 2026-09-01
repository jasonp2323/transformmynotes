import { describe, it, expect } from 'vitest';
import { formatUSD, formatTokens, formatNumber, formatBytes } from './cost-format';

describe('formatUSD', () => {
  it('returns $0.00 for zero', () => {
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('returns $0.00 for negative values', () => {
    expect(formatUSD(-5)).toBe('$0.00');
  });

  it('returns <$0.01 for tiny positive values', () => {
    expect(formatUSD(0.001)).toBe('<$0.01');
    expect(formatUSD(0.004)).toBe('<$0.01');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatUSD(1.2345)).toBe('$1.23');
    expect(formatUSD(1.235)).toBe('$1.24');
  });

  it('includes thousands separator for large values', () => {
    expect(formatUSD(1234.56)).toBe('$1,234.56');
    expect(formatUSD(1000000)).toBe('$1,000,000.00');
  });

  it('handles NaN and Infinity', () => {
    expect(formatUSD(NaN)).toBe('$0.00');
    expect(formatUSD(Infinity)).toBe('$0.00');
  });

  it('handles boundary at $0.005', () => {
    // 0.005 rounds to 0.01, which is >= 0.005 threshold
    expect(formatUSD(0.005)).toBe('$0.01');
  });
});

describe('formatTokens', () => {
  it('returns 0 for zero', () => {
    expect(formatTokens(0)).toBe('0');
  });

  it('returns 0 for negative values', () => {
    expect(formatTokens(-100)).toBe('0');
  });

  it('formats small counts with commas', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1500)).toBe('1,500');
    expect(formatTokens(9999)).toBe('9,999');
  });

  it('uses K suffix for values >= 10,000', () => {
    expect(formatTokens(10000)).toBe('10K');
    expect(formatTokens(15000)).toBe('15K');
    expect(formatTokens(1500000)).toBe('1,500K');
  });
});

describe('formatNumber', () => {
  it('returns 0 for zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats with commas', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('rounds floats', () => {
    expect(formatNumber(1.7)).toBe('2');
  });
});

describe('formatBytes', () => {
  it('returns 0 B for zero or negative', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
  });

  it('returns bytes for small values', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(5_242_880)).toBe('5 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(1_073_741_824)).toBe('1 GB');
  });

  it('trims trailing .0', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('handles NaN and Infinity', () => {
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});
