import { describe, it, expect } from 'vitest';
import {
  reduceByModel,
  reduceByFeature,
  reduceByUser,
  reduceByGroup,
  totalCost,
} from '../reducers.js';
import type { DailyAiAggregate, PriceBook } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Price book with two explicit models and a distinct defaultModel rate. */
const PRICE_BOOK: PriceBook = {
  models: {
    'model-a': { inputPer1k: 0.001, outputPer1k: 0.002 },
    'model-b': { inputPer1k: 0.004, outputPer1k: 0.008 },
  },
  defaultModel: { inputPer1k: 0.010, outputPer1k: 0.020 },
  s3PerGbMonth: 0.023,
};

/** Helper to build a DailyAiAggregate with convenient defaults. */
function agg(
  overrides: Partial<DailyAiAggregate> & Pick<DailyAiAggregate, 'sub' | 'model'>,
): DailyAiAggregate {
  return {
    day: '2026-01-01',
    feature: 'flashcards',
    inputTokens: 1000,
    outputTokens: 500,
    calls: 1,
    ...overrides,
  };
}

// Pre-built records used across multiple describe blocks
const AGG_A1 = agg({ sub: 'user-1', model: 'model-a', inputTokens: 2000, outputTokens: 1000, calls: 2 });
const AGG_A2 = agg({ sub: 'user-2', model: 'model-a', inputTokens: 1000, outputTokens: 500, calls: 1 });
const AGG_B1 = agg({ sub: 'user-1', model: 'model-b', inputTokens: 500, outputTokens: 250, calls: 1 });
const AGG_UNKNOWN = agg({ sub: 'user-3', model: 'unknown-model', inputTokens: 1000, outputTokens: 500, calls: 1 });

// USD spot-checks (computed by hand):
// model-a: input $0.001/1k, output $0.002/1k
//   AGG_A1: (2000/1000)*0.001 + (1000/1000)*0.002 = 0.002 + 0.002 = 0.004
//   AGG_A2: (1000/1000)*0.001 + (500/1000)*0.002  = 0.001 + 0.001 = 0.002
// model-b: input $0.004/1k, output $0.008/1k
//   AGG_B1: (500/1000)*0.004 + (250/1000)*0.008   = 0.002 + 0.002 = 0.004
// unknown-model (fallback $0.010/$0.020):
//   AGG_UNKNOWN: (1000/1000)*0.010 + (500/1000)*0.020 = 0.010 + 0.010 = 0.020

// ---------------------------------------------------------------------------
// reduceByModel
// ---------------------------------------------------------------------------

describe('reduceByModel', () => {
  it('returns an empty array for empty input', () => {
    expect(reduceByModel([], PRICE_BOOK)).toEqual([]);
  });

  it('produces one row per unique model id', () => {
    const rows = reduceByModel([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    const keys = rows.map(r => r.key).sort();
    expect(keys).toEqual(['model-a', 'model-b']);
  });

  it('sums inputTokens across records for the same model', () => {
    const rows = reduceByModel([AGG_A1, AGG_A2], PRICE_BOOK);
    const rowA = rows.find(r => r.key === 'model-a')!;
    expect(rowA.inputTokens).toBe(3000); // 2000 + 1000
  });

  it('sums outputTokens across records for the same model', () => {
    const rows = reduceByModel([AGG_A1, AGG_A2], PRICE_BOOK);
    const rowA = rows.find(r => r.key === 'model-a')!;
    expect(rowA.outputTokens).toBe(1500); // 1000 + 500
  });

  it('sums calls across records for the same model', () => {
    const rows = reduceByModel([AGG_A1, AGG_A2], PRICE_BOOK);
    const rowA = rows.find(r => r.key === 'model-a')!;
    expect(rowA.calls).toBe(3); // 2 + 1
  });

  it('computes correct USD for model-a (two records summed)', () => {
    const rows = reduceByModel([AGG_A1, AGG_A2], PRICE_BOOK);
    const rowA = rows.find(r => r.key === 'model-a')!;
    // 0.004 + 0.002 = 0.006
    expect(rowA.usd).toBeCloseTo(0.006, 10);
  });

  it('computes correct USD for model-b', () => {
    const rows = reduceByModel([AGG_B1], PRICE_BOOK);
    const rowB = rows.find(r => r.key === 'model-b')!;
    expect(rowB.usd).toBeCloseTo(0.004, 10);
  });

  it('sets unpriced: false for known models', () => {
    const rows = reduceByModel([AGG_A1, AGG_B1], PRICE_BOOK);
    for (const row of rows) {
      expect(row.unpriced).toBe(false);
    }
  });

  it('sets unpriced: true for an unknown model', () => {
    const rows = reduceByModel([AGG_UNKNOWN], PRICE_BOOK);
    const row = rows.find(r => r.key === 'unknown-model')!;
    expect(row.unpriced).toBe(true);
  });

  it('propagates unpriced: true when mixed known + unknown models are present in a group', () => {
    // Two records for the same unknown model id — the row must be unpriced
    const agg2 = agg({ sub: 'user-3', model: 'unknown-model', inputTokens: 200, outputTokens: 100, calls: 1 });
    const rows = reduceByModel([AGG_UNKNOWN, agg2], PRICE_BOOK);
    const row = rows.find(r => r.key === 'unknown-model')!;
    expect(row.unpriced).toBe(true);
  });

  it('uses the fallback rate for unknown models (not 0)', () => {
    const rows = reduceByModel([AGG_UNKNOWN], PRICE_BOOK);
    const row = rows.find(r => r.key === 'unknown-model')!;
    // $0.020 (see hand-calc above)
    expect(row.usd).toBeCloseTo(0.020, 10);
  });

  it('sorts rows by usd descending (highest cost first)', () => {
    // model-a total: 0.006, model-b total: 0.004 → a comes first
    const rows = reduceByModel([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    expect(rows[0].key).toBe('model-a');
    expect(rows[1].key).toBe('model-b');
  });

  it('breaks usd ties by key ascending', () => {
    // Both aggs have the same cost; keys 'aaa' < 'zzz'
    const x = agg({ sub: 'u1', model: 'aaa', inputTokens: 1000, outputTokens: 0, calls: 1 });
    const y = agg({ sub: 'u2', model: 'zzz', inputTokens: 1000, outputTokens: 0, calls: 1 });
    const rows = reduceByModel([y, x], PRICE_BOOK);
    expect(rows[0].key).toBe('aaa');
    expect(rows[1].key).toBe('zzz');
  });
});

// ---------------------------------------------------------------------------
// reduceByFeature
// ---------------------------------------------------------------------------

describe('reduceByFeature', () => {
  it('returns an empty array for empty input', () => {
    expect(reduceByFeature([], PRICE_BOOK)).toEqual([]);
  });

  it('groups records by feature, spanning multiple models', () => {
    const rec1 = agg({ sub: 'u1', model: 'model-a', feature: 'flashcards', inputTokens: 2000, outputTokens: 1000, calls: 2 });
    const rec2 = agg({ sub: 'u1', model: 'model-b', feature: 'flashcards', inputTokens: 500, outputTokens: 250, calls: 1 });
    const rec3 = agg({ sub: 'u1', model: 'model-a', feature: 'quiz', inputTokens: 1000, outputTokens: 500, calls: 1 });

    const rows = reduceByFeature([rec1, rec2, rec3], PRICE_BOOK);
    expect(rows.map(r => r.key).sort()).toEqual(['flashcards', 'quiz']);
  });

  it('sums USD correctly across models for the same feature', () => {
    const rec1 = agg({ sub: 'u1', model: 'model-a', feature: 'flashcards', inputTokens: 2000, outputTokens: 1000, calls: 2 });
    const rec2 = agg({ sub: 'u1', model: 'model-b', feature: 'flashcards', inputTokens: 500, outputTokens: 250, calls: 1 });
    const rows = reduceByFeature([rec1, rec2], PRICE_BOOK);
    const row = rows.find(r => r.key === 'flashcards')!;
    // model-a: 0.004, model-b: 0.004 → total 0.008
    expect(row.usd).toBeCloseTo(0.008, 10);
  });

  it('propagates unpriced: true if any record in the feature used an unknown model', () => {
    const rec1 = agg({ sub: 'u1', model: 'model-a', feature: 'flashcards' });
    const rec2 = agg({ sub: 'u1', model: 'unknown-model', feature: 'flashcards' });
    const rows = reduceByFeature([rec1, rec2], PRICE_BOOK);
    const row = rows.find(r => r.key === 'flashcards')!;
    expect(row.unpriced).toBe(true);
  });

  it('does NOT propagate unpriced from one feature to another', () => {
    const rec1 = agg({ sub: 'u1', model: 'unknown-model', feature: 'ocr' });
    const rec2 = agg({ sub: 'u1', model: 'model-a', feature: 'quiz' });
    const rows = reduceByFeature([rec1, rec2], PRICE_BOOK);
    const quizRow = rows.find(r => r.key === 'quiz')!;
    expect(quizRow.unpriced).toBe(false);
  });

  it('sorts by usd descending', () => {
    const cheap = agg({ sub: 'u1', model: 'model-a', feature: 'cheap', inputTokens: 100, outputTokens: 0, calls: 1 });
    const expensive = agg({ sub: 'u1', model: 'model-b', feature: 'expensive', inputTokens: 10000, outputTokens: 5000, calls: 5 });
    const rows = reduceByFeature([cheap, expensive], PRICE_BOOK);
    expect(rows[0].key).toBe('expensive');
  });
});

// ---------------------------------------------------------------------------
// reduceByUser
// ---------------------------------------------------------------------------

describe('reduceByUser', () => {
  it('returns an empty array for empty input', () => {
    expect(reduceByUser([], PRICE_BOOK)).toEqual([]);
  });

  it('produces one row per unique user sub', () => {
    const rows = reduceByUser([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    const subs = rows.map(r => r.key).sort();
    expect(subs).toEqual(['user-1', 'user-2']);
  });

  it('sums tokens and calls for the same user across multiple records', () => {
    // AGG_A1: user-1, model-a; AGG_B1: user-1, model-b
    const rows = reduceByUser([AGG_A1, AGG_B1], PRICE_BOOK);
    const user1 = rows.find(r => r.key === 'user-1')!;
    expect(user1.inputTokens).toBe(2500);  // 2000 + 500
    expect(user1.outputTokens).toBe(1250); // 1000 + 250
    expect(user1.calls).toBe(3);           // 2 + 1
  });

  it('computes correct USD for user-1 across two models', () => {
    // AGG_A1: 0.004, AGG_B1: 0.004 → total 0.008
    const rows = reduceByUser([AGG_A1, AGG_B1], PRICE_BOOK);
    const user1 = rows.find(r => r.key === 'user-1')!;
    expect(user1.usd).toBeCloseTo(0.008, 10);
  });

  it('sets unpriced: true for a user whose record uses an unknown model', () => {
    const rows = reduceByUser([AGG_A1, AGG_UNKNOWN], PRICE_BOOK);
    const user3 = rows.find(r => r.key === 'user-3')!;
    expect(user3.unpriced).toBe(true);
  });

  it('does NOT mark unpriced for a user whose records are all known models', () => {
    const rows = reduceByUser([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    for (const row of rows) {
      expect(row.unpriced).toBe(false);
    }
  });

  it('sorts by usd descending', () => {
    // user-1 has AGG_A1 (0.004) + AGG_B1 (0.004) = 0.008
    // user-2 has AGG_A2 (0.002)
    const rows = reduceByUser([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    expect(rows[0].key).toBe('user-1');
    expect(rows[1].key).toBe('user-2');
  });
});

// ---------------------------------------------------------------------------
// reduceByGroup
// ---------------------------------------------------------------------------

describe('reduceByGroup', () => {
  it('returns an empty array for empty input', () => {
    expect(reduceByGroup([], PRICE_BOOK, new Map())).toEqual([]);
  });

  it('groups users under their group id', () => {
    const subToGroup = new Map([['user-1', 'group-A'], ['user-2', 'group-A']]);
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, subToGroup);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('group-A');
  });

  it('buckets unmapped users under "(no group)"', () => {
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('(no group)');
  });

  it('splits records correctly across multiple groups', () => {
    const subToGroup = new Map([
      ['user-1', 'group-A'],
      ['user-2', 'group-B'],
    ]);
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, subToGroup);
    const keys = rows.map(r => r.key).sort();
    expect(keys).toEqual(['group-A', 'group-B']);
  });

  it('mixes (no group) with a mapped group', () => {
    const subToGroup = new Map([['user-1', 'group-A']]);
    // user-2 has no mapping → (no group)
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, subToGroup);
    const keys = rows.map(r => r.key).sort();
    expect(keys).toEqual(['(no group)', 'group-A']);
  });

  it('sums tokens for multiple users in the same group', () => {
    const subToGroup = new Map([['user-1', 'group-A'], ['user-2', 'group-A']]);
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, subToGroup);
    const row = rows.find(r => r.key === 'group-A')!;
    expect(row.inputTokens).toBe(3000);  // 2000 + 1000
    expect(row.outputTokens).toBe(1500); // 1000 + 500
    expect(row.calls).toBe(3);           // 2 + 1
  });

  it('computes correct USD for a group', () => {
    const subToGroup = new Map([['user-1', 'group-A'], ['user-2', 'group-A']]);
    const rows = reduceByGroup([AGG_A1, AGG_A2], PRICE_BOOK, subToGroup);
    const row = rows.find(r => r.key === 'group-A')!;
    // AGG_A1: 0.004, AGG_A2: 0.002 → 0.006
    expect(row.usd).toBeCloseTo(0.006, 10);
  });

  it('propagates unpriced: true when any record in the group uses an unknown model', () => {
    const subToGroup = new Map([['user-1', 'group-A'], ['user-3', 'group-A']]);
    const rows = reduceByGroup([AGG_A1, AGG_UNKNOWN], PRICE_BOOK, subToGroup);
    const row = rows.find(r => r.key === 'group-A')!;
    expect(row.unpriced).toBe(true);
  });

  it('sorts by usd descending', () => {
    const subToGroup = new Map([['user-1', 'group-A'], ['user-2', 'group-B']]);
    // user-1: AGG_A1 (0.004) + AGG_B1 (0.004) = 0.008 in group-A
    // user-2: AGG_A2 (0.002) in group-B
    const rows = reduceByGroup([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK, subToGroup);
    expect(rows[0].key).toBe('group-A');
    expect(rows[1].key).toBe('group-B');
  });
});

// ---------------------------------------------------------------------------
// totalCost
// ---------------------------------------------------------------------------

describe('totalCost', () => {
  it('returns zeros for empty input', () => {
    const result = totalCost([], PRICE_BOOK);
    expect(result).toEqual({ inputTokens: 0, outputTokens: 0, calls: 0, usd: 0, unpriced: false });
  });

  it('sums all inputTokens, outputTokens, and calls', () => {
    const result = totalCost([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    expect(result.inputTokens).toBe(3500);  // 2000 + 1000 + 500
    expect(result.outputTokens).toBe(1750); // 1000 + 500 + 250
    expect(result.calls).toBe(4);           // 2 + 1 + 1
  });

  it('computes correct total USD across all records and models', () => {
    // AGG_A1: 0.004, AGG_A2: 0.002, AGG_B1: 0.004 → total 0.010
    const result = totalCost([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    expect(result.usd).toBeCloseTo(0.010, 10);
  });

  it('sets unpriced: false when all records use known models', () => {
    const result = totalCost([AGG_A1, AGG_A2, AGG_B1], PRICE_BOOK);
    expect(result.unpriced).toBe(false);
  });

  it('sets unpriced: true when at least one record uses an unknown model', () => {
    const result = totalCost([AGG_A1, AGG_UNKNOWN], PRICE_BOOK);
    expect(result.unpriced).toBe(true);
  });

  it('includes the fallback-rate USD in the total even for unknown models', () => {
    // AGG_A1: 0.004, AGG_UNKNOWN: 0.020 → total 0.024
    const result = totalCost([AGG_A1, AGG_UNKNOWN], PRICE_BOOK);
    expect(result.usd).toBeCloseTo(0.024, 10);
  });

  it('handles a single-record case', () => {
    const result = totalCost([AGG_A1], PRICE_BOOK);
    expect(result.inputTokens).toBe(2000);
    expect(result.outputTokens).toBe(1000);
    expect(result.calls).toBe(2);
    expect(result.usd).toBeCloseTo(0.004, 10);
    expect(result.unpriced).toBe(false);
  });
});
