import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICE_BOOK, priceForModel } from '../price-book.js';

// ---------------------------------------------------------------------------
// DEFAULT_PRICE_BOOK shape
// ---------------------------------------------------------------------------

describe('DEFAULT_PRICE_BOOK', () => {
  it('contains the primary us. cross-region inference profile key', () => {
    expect(DEFAULT_PRICE_BOOK.models).toHaveProperty(
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('contains the bare foundation-model id as a secondary key', () => {
    expect(DEFAULT_PRICE_BOOK.models).toHaveProperty(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('has sensible Sonnet 3.5 v2 rates for the primary key', () => {
    const rate = DEFAULT_PRICE_BOOK.models['us.anthropic.claude-3-5-sonnet-20241022-v2:0'];
    expect(rate.inputPer1k).toBeCloseTo(0.003, 5);
    expect(rate.outputPer1k).toBeCloseTo(0.015, 5);
  });

  it('has a non-zero s3PerGbMonth rate', () => {
    expect(DEFAULT_PRICE_BOOK.s3PerGbMonth).toBeGreaterThan(0);
  });

  it('s3PerGbMonth equals the S3 Standard rate of $0.023', () => {
    expect(DEFAULT_PRICE_BOOK.s3PerGbMonth).toBeCloseTo(0.023, 5);
  });

  it('has a defaultModel with positive rates', () => {
    expect(DEFAULT_PRICE_BOOK.defaultModel.inputPer1k).toBeGreaterThan(0);
    expect(DEFAULT_PRICE_BOOK.defaultModel.outputPer1k).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// priceForModel — known model
// ---------------------------------------------------------------------------

describe('priceForModel — known model', () => {
  it('returns unpriced: false for a model id present in the price book', () => {
    const result = priceForModel(
      DEFAULT_PRICE_BOOK,
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
    expect(result.unpriced).toBe(false);
  });

  it('returns the specific model rate, not the default', () => {
    const customBook = {
      ...DEFAULT_PRICE_BOOK,
      models: {
        'model-a': { inputPer1k: 0.001, outputPer1k: 0.002 },
      },
      defaultModel: { inputPer1k: 0.999, outputPer1k: 0.999 },
    };
    const result = priceForModel(customBook, 'model-a');
    expect(result.price.inputPer1k).toBeCloseTo(0.001, 5);
    expect(result.price.outputPer1k).toBeCloseTo(0.002, 5);
    expect(result.unpriced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// priceForModel — unknown model (fallback)
// ---------------------------------------------------------------------------

describe('priceForModel — unknown model (fallback)', () => {
  it('returns unpriced: true for a model id not in the price book', () => {
    const result = priceForModel(DEFAULT_PRICE_BOOK, 'unknown-model-xyz');
    expect(result.unpriced).toBe(true);
  });

  it('returns the defaultModel rate for an unknown model id', () => {
    const result = priceForModel(DEFAULT_PRICE_BOOK, 'unknown-model-xyz');
    expect(result.price).toEqual(DEFAULT_PRICE_BOOK.defaultModel);
  });

  it('returns unpriced: true for an empty string model id', () => {
    const result = priceForModel(DEFAULT_PRICE_BOOK, '');
    expect(result.unpriced).toBe(true);
  });

  it('uses a custom defaultModel rate when the model is absent', () => {
    const customBook = {
      models: {},
      defaultModel: { inputPer1k: 0.1, outputPer1k: 0.2 },
      s3PerGbMonth: 0.023,
    };
    const result = priceForModel(customBook, 'anything');
    expect(result.price.inputPer1k).toBeCloseTo(0.1, 5);
    expect(result.price.outputPer1k).toBeCloseTo(0.2, 5);
    expect(result.unpriced).toBe(true);
  });
});
