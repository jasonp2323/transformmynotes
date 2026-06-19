import { describe, it, expect } from 'vitest';
import { usageKeys } from '../keys.js';

// ─── rawEvent ────────────────────────────────────────────────────────────────

describe('usageKeys.rawEvent', () => {
  it('builds the correct pk and sk', () => {
    const key = usageKeys.rawEvent('sub-123', '2026-06-19', '01HWXYZ');
    expect(key).toEqual({
      pk: 'USER#sub-123',
      sk: 'EVT#2026-06-19#01HWXYZ',
    });
  });
});

// ─── parseRawEventSk ─────────────────────────────────────────────────────────

describe('usageKeys.parseRawEventSk', () => {
  it('round-trips a rawEvent sk', () => {
    const sk = usageKeys.rawEvent('sub-abc', '2026-01-01', '01ABCDEF').sk;
    expect(usageKeys.parseRawEventSk(sk)).toEqual({ day: '2026-01-01', ulid: '01ABCDEF' });
  });

  it('parses a known sk directly', () => {
    expect(usageKeys.parseRawEventSk('EVT#2026-06-19#01HWXYZ')).toEqual({
      day: '2026-06-19',
      ulid: '01HWXYZ',
    });
  });

  it('throws on a missing EVT# prefix', () => {
    expect(() => usageKeys.parseRawEventSk('DAY#2026-06-19#something')).toThrow(
      'usageKeys.parseRawEventSk: malformed sort key "DAY#2026-06-19#something"',
    );
  });

  it('throws on a malformed date segment', () => {
    expect(() => usageKeys.parseRawEventSk('EVT#20260619#ulid')).toThrow(
      'usageKeys.parseRawEventSk: malformed sort key',
    );
  });

  it('throws on an empty string', () => {
    expect(() => usageKeys.parseRawEventSk('')).toThrow('usageKeys.parseRawEventSk: malformed sort key');
  });
});

// ─── storageGauge ────────────────────────────────────────────────────────────

describe('usageKeys.storageGauge', () => {
  it('builds the correct pk and sk', () => {
    expect(usageKeys.storageGauge('sub-456')).toEqual({
      pk: 'USER#sub-456',
      sk: 'STORAGE#CURRENT',
    });
  });

  it('sk is the literal string STORAGE#CURRENT', () => {
    expect(usageKeys.storageGauge('any').sk).toBe('STORAGE#CURRENT');
  });
});

// ─── dailyAggregate ──────────────────────────────────────────────────────────

describe('usageKeys.dailyAggregate', () => {
  it('builds all four key attributes for an AI feature (with model)', () => {
    const key = usageKeys.dailyAggregate(
      'sub-789',
      '2026-06-19',
      'study',
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
    expect(key).toEqual({
      pk: 'USER#sub-789',
      sk: 'DAY#2026-06-19#study#us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      gsi1pk: 'DAY#2026-06-19',
      gsi1sk: 'USER#sub-789#study#us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
  });

  it('builds all four key attributes for a storage snapshot (no model)', () => {
    const key = usageKeys.dailyAggregate('sub-789', '2026-06-19', 'storage');
    expect(key).toEqual({
      pk: 'USER#sub-789',
      sk: 'DAY#2026-06-19#storage',
      gsi1pk: 'DAY#2026-06-19',
      gsi1sk: 'USER#sub-789#storage',
    });
  });

  it('builds correctly for an ocr feature without model', () => {
    const key = usageKeys.dailyAggregate('sub-001', '2026-01-15', 'ocr');
    expect(key.sk).toBe('DAY#2026-01-15#ocr');
    expect(key.gsi1sk).toBe('USER#sub-001#ocr');
  });

  it('gsi1pk is always DAY#<day>', () => {
    const key = usageKeys.dailyAggregate('sub', '2026-03-10', 'study', 'model-x');
    expect(key.gsi1pk).toBe('DAY#2026-03-10');
  });
});

// ─── parseDailyAggregateSk ───────────────────────────────────────────────────

describe('usageKeys.parseDailyAggregateSk', () => {
  it('parses a storage snapshot sk (no model)', () => {
    expect(usageKeys.parseDailyAggregateSk('DAY#2026-06-19#storage')).toEqual({
      day: '2026-06-19',
      feature: 'storage',
      model: undefined,
    });
  });

  it('parses an AI feature sk with a simple model', () => {
    expect(usageKeys.parseDailyAggregateSk('DAY#2026-06-19#study#claude-3')).toEqual({
      day: '2026-06-19',
      feature: 'study',
      model: 'claude-3',
    });
  });

  it('preserves model ids containing colons and dots', () => {
    const sk = 'DAY#2026-06-19#study#us.anthropic.claude-3-5-sonnet-20241022-v2:0';
    expect(usageKeys.parseDailyAggregateSk(sk)).toEqual({
      day: '2026-06-19',
      feature: 'study',
      model: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
  });

  it('round-trips dailyAggregate (with model) through parseDailyAggregateSk', () => {
    const model = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
    const { sk } = usageKeys.dailyAggregate('sub', '2026-06-19', 'study', model);
    expect(usageKeys.parseDailyAggregateSk(sk)).toEqual({
      day: '2026-06-19',
      feature: 'study',
      model,
    });
  });

  it('round-trips dailyAggregate (no model) through parseDailyAggregateSk', () => {
    const { sk } = usageKeys.dailyAggregate('sub', '2026-06-19', 'storage');
    expect(usageKeys.parseDailyAggregateSk(sk)).toEqual({
      day: '2026-06-19',
      feature: 'storage',
      model: undefined,
    });
  });

  it('throws on a malformed key missing DAY# prefix', () => {
    expect(() => usageKeys.parseDailyAggregateSk('EVT#2026-06-19#study')).toThrow(
      'usageKeys.parseDailyAggregateSk: malformed sort key',
    );
  });

  it('throws on an empty string', () => {
    expect(() => usageKeys.parseDailyAggregateSk('')).toThrow(
      'usageKeys.parseDailyAggregateSk: malformed sort key',
    );
  });

  it('throws on a key with too few segments', () => {
    expect(() => usageKeys.parseDailyAggregateSk('DAY#2026-06-19')).toThrow(
      'usageKeys.parseDailyAggregateSk: malformed sort key',
    );
  });
});

// ─── parseUsageByDayGsi1sk ───────────────────────────────────────────────────

describe('usageKeys.parseUsageByDayGsi1sk', () => {
  it('parses a storage gsi1sk (no model)', () => {
    expect(usageKeys.parseUsageByDayGsi1sk('USER#sub-789#storage')).toEqual({
      sub: 'sub-789',
      feature: 'storage',
      model: undefined,
    });
  });

  it('parses an AI feature gsi1sk with a model', () => {
    expect(
      usageKeys.parseUsageByDayGsi1sk('USER#sub-789#study#us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    ).toEqual({
      sub: 'sub-789',
      feature: 'study',
      model: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
  });

  it('round-trips dailyAggregate (with model) gsi1sk through parseUsageByDayGsi1sk', () => {
    const model = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
    const { gsi1sk } = usageKeys.dailyAggregate('sub-abc', '2026-06-19', 'study', model);
    expect(usageKeys.parseUsageByDayGsi1sk(gsi1sk)).toEqual({
      sub: 'sub-abc',
      feature: 'study',
      model,
    });
  });

  it('round-trips dailyAggregate (no model) gsi1sk through parseUsageByDayGsi1sk', () => {
    const { gsi1sk } = usageKeys.dailyAggregate('sub-abc', '2026-06-19', 'storage');
    expect(usageKeys.parseUsageByDayGsi1sk(gsi1sk)).toEqual({
      sub: 'sub-abc',
      feature: 'storage',
      model: undefined,
    });
  });

  it('throws on a missing USER# prefix', () => {
    expect(() => usageKeys.parseUsageByDayGsi1sk('DAY#2026-06-19#study')).toThrow(
      'usageKeys.parseUsageByDayGsi1sk: malformed GSI1 sort key',
    );
  });

  it('throws on an empty string', () => {
    expect(() => usageKeys.parseUsageByDayGsi1sk('')).toThrow(
      'usageKeys.parseUsageByDayGsi1sk: malformed GSI1 sort key',
    );
  });

  it('throws on a key with too few segments', () => {
    expect(() => usageKeys.parseUsageByDayGsi1sk('USER#sub-789')).toThrow(
      'usageKeys.parseUsageByDayGsi1sk: malformed GSI1 sort key',
    );
  });
});

// ─── priceBook ───────────────────────────────────────────────────────────────

describe('usageKeys.priceBook', () => {
  it('returns pk=CONFIG and sk=PRICING', () => {
    expect(usageKeys.priceBook()).toEqual({ pk: 'CONFIG', sk: 'PRICING' });
  });
});

// ─── byDayQuery ──────────────────────────────────────────────────────────────

describe('usageKeys.byDayQuery', () => {
  it('returns the expected QueryCommand params object for a given day', () => {
    expect(usageKeys.byDayQuery('2026-06-19')).toEqual({
      IndexName: 'GSI1',
      KeyConditionExpression: 'gsi1pk = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': 'DAY#2026-06-19' },
    });
  });
});

// ─── listUserAggregatesByRange ────────────────────────────────────────────────

describe('usageKeys.listUserAggregatesByRange', () => {
  it('returns the expected QueryCommand params with inclusive upper bound', () => {
    expect(usageKeys.listUserAggregatesByRange('sub-123', '2026-06-01', '2026-06-30')).toEqual({
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
      ExpressionAttributeValues: {
        ':pk': 'USER#sub-123',
        ':from': 'DAY#2026-06-01',
        ':to': 'DAY#2026-06-30#￿',
      },
    });
  });

  it('includes the U+FFFF sentinel in the upper bound to cover all feature/model suffixes', () => {
    const params = usageKeys.listUserAggregatesByRange('sub', '2026-01-01', '2026-01-31');
    expect(params.ExpressionAttributeValues[':to']).toBe('DAY#2026-01-31#￿');
  });

  it('handles a single-day range (fromDay === toDay)', () => {
    const params = usageKeys.listUserAggregatesByRange('sub', '2026-06-19', '2026-06-19');
    expect(params.ExpressionAttributeValues[':from']).toBe('DAY#2026-06-19');
    expect(params.ExpressionAttributeValues[':to']).toBe('DAY#2026-06-19#￿');
  });
});
