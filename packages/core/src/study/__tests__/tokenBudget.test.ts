import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  estimateTokens,
  resolveContextLimit,
  DEFAULT_CONTEXT_LIMIT,
  HARD_CAP_TOKENS,
} from '../tokenBudget.js';

describe('estimateTokens', () => {
  it('returns 0 for an empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('returns 100 for a single 400-char text (400 chars / 4 = 100 exactly)', () => {
    const text = 'x'.repeat(400);
    expect(text.length).toBe(400);
    expect(estimateTokens([text])).toBe(100);
  });

  it('rounds the result — 401 chars → 100 (Math.round(401/4) = 100)', () => {
    const text = 'x'.repeat(401);
    expect(estimateTokens([text])).toBe(100);
  });

  it('rounds the result — 402 chars → 101 (Math.round(402/4) = 101) — wait, 402/4=100.5 → 101', () => {
    // Math.round(402/4) = Math.round(100.5) = 101
    const text = 'x'.repeat(402);
    expect(estimateTokens([text])).toBe(101);
  });

  it('sums across multiple texts', () => {
    // 200 + 200 = 400 chars → 100 tokens
    const text = 'x'.repeat(200);
    expect(estimateTokens([text, text])).toBe(100);
  });

  it('handles a single empty-string element', () => {
    expect(estimateTokens([''])).toBe(0);
  });

  it('constants have expected values', () => {
    expect(DEFAULT_CONTEXT_LIMIT).toBe(60_000);
    expect(HARD_CAP_TOKENS).toBe(200_000);
  });
});

describe('resolveContextLimit', () => {
  const ENV_KEY = 'SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value';

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('returns DEFAULT_CONTEXT_LIMIT when env var is not set', () => {
    expect(resolveContextLimit()).toBe(DEFAULT_CONTEXT_LIMIT);
  });

  it('returns DEFAULT_CONTEXT_LIMIT when env var is empty string', () => {
    process.env[ENV_KEY] = '';
    expect(resolveContextLimit()).toBe(DEFAULT_CONTEXT_LIMIT);
  });

  it('returns DEFAULT_CONTEXT_LIMIT when env var is a non-integer string', () => {
    process.env[ENV_KEY] = 'not-a-number';
    expect(resolveContextLimit()).toBe(DEFAULT_CONTEXT_LIMIT);
  });

  it('returns DEFAULT_CONTEXT_LIMIT when env var is zero', () => {
    process.env[ENV_KEY] = '0';
    expect(resolveContextLimit()).toBe(DEFAULT_CONTEXT_LIMIT);
  });

  it('returns DEFAULT_CONTEXT_LIMIT when env var is negative', () => {
    process.env[ENV_KEY] = '-5000';
    expect(resolveContextLimit()).toBe(DEFAULT_CONTEXT_LIMIT);
  });

  it('returns the parsed value when env var is a valid positive integer', () => {
    process.env[ENV_KEY] = '80000';
    expect(resolveContextLimit()).toBe(80_000);
  });

  it('returns the parsed value when env var is the string "1"', () => {
    process.env[ENV_KEY] = '1';
    expect(resolveContextLimit()).toBe(1);
  });
});
