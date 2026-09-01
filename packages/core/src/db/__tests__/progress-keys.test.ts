import { describe, it, expect } from 'vitest';
import { progressKeys } from '../keys.js';

// ─── eventItem ───────────────────────────────────────────────────────────────

describe('progressKeys.eventItem', () => {
  it('builds the correct pk and sk', () => {
    const key = progressKeys.eventItem('sub-123', '2026-06-20T03:26:49.123Z', '01HWXYZ');
    expect(key).toEqual({
      pk: 'USER#sub-123',
      sk: 'EVENT#2026-06-20T03:26:49.123Z#01HWXYZ',
    });
  });

  it('pk is always USER#<sub>', () => {
    expect(progressKeys.eventItem('abc', '2026-01-01T00:00:00.000Z', 'ulid').pk).toBe('USER#abc');
  });

  it('sk begins with EVENT#', () => {
    expect(
      progressKeys.eventItem('s', '2026-01-01T00:00:00.000Z', 'u').sk.startsWith('EVENT#'),
    ).toBe(true);
  });
});

// ─── dayItem ─────────────────────────────────────────────────────────────────

describe('progressKeys.dayItem', () => {
  it('builds the correct pk and sk', () => {
    expect(progressKeys.dayItem('sub-456', '2026-06-20')).toEqual({
      pk: 'USER#sub-456',
      sk: 'DAY#2026-06-20',
    });
  });

  it('sk is DAY#<YYYY-MM-DD>', () => {
    expect(progressKeys.dayItem('s', '2026-01-15').sk).toBe('DAY#2026-01-15');
  });
});

// ─── dayRangeQuery ───────────────────────────────────────────────────────────

describe('progressKeys.dayRangeQuery', () => {
  it('returns the expected QueryCommand params', () => {
    expect(progressKeys.dayRangeQuery('sub-789', '2026-06-01', '2026-06-30')).toEqual({
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
      ExpressionAttributeValues: {
        ':pk': 'USER#sub-789',
        ':from': 'DAY#2026-06-01',
        ':to': 'DAY#2026-06-30',
      },
      ScanIndexForward: true,
    });
  });

  it('handles a single-day range (fromDate === toDate)', () => {
    const params = progressKeys.dayRangeQuery('sub', '2026-06-19', '2026-06-19');
    expect(params.ExpressionAttributeValues[':from']).toBe('DAY#2026-06-19');
    expect(params.ExpressionAttributeValues[':to']).toBe('DAY#2026-06-19');
  });

  it('ScanIndexForward is true (chronological order)', () => {
    expect(progressKeys.dayRangeQuery('sub', '2026-01-01', '2026-01-31').ScanIndexForward).toBe(
      true,
    );
  });
});

// ─── eventScanForDay ─────────────────────────────────────────────────────────

describe('progressKeys.eventScanForDay', () => {
  it('returns the expected QueryCommand params', () => {
    expect(progressKeys.eventScanForDay('sub-001', '2026-06-20')).toEqual({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: {
        ':pk': 'USER#sub-001',
        ':p': 'EVENT#2026-06-20',
      },
    });
  });

  it(':p prefix is EVENT#<YYYY-MM-DD>', () => {
    const params = progressKeys.eventScanForDay('sub', '2026-01-15');
    expect(params.ExpressionAttributeValues[':p']).toBe('EVENT#2026-01-15');
  });
});

// ─── parseEventSk ────────────────────────────────────────────────────────────

describe('progressKeys.parseEventSk', () => {
  it('round-trips an eventItem sk', () => {
    const sk = progressKeys.eventItem('sub-abc', '2026-06-20T03:26:49.123Z', '01ABCDEF').sk;
    expect(progressKeys.parseEventSk(sk)).toEqual({
      ts: '2026-06-20T03:26:49.123Z',
      id: '01ABCDEF',
    });
  });

  it('parses a known sk directly', () => {
    expect(
      progressKeys.parseEventSk('EVENT#2026-06-20T00:00:00.000Z#01HWXYZ'),
    ).toEqual({
      ts: '2026-06-20T00:00:00.000Z',
      id: '01HWXYZ',
    });
  });

  it('throws on a missing EVENT# prefix', () => {
    expect(() => progressKeys.parseEventSk('DAY#2026-06-20')).toThrow(
      'progressKeys.parseEventSk: malformed event sort key "DAY#2026-06-20"',
    );
  });

  it('throws on an empty string', () => {
    expect(() => progressKeys.parseEventSk('')).toThrow(
      'progressKeys.parseEventSk: malformed event sort key ""',
    );
  });

  it('throws on an EVENT# key with no ULID segment', () => {
    expect(() => progressKeys.parseEventSk('EVENT#2026-06-20T00:00:00.000Z')).toThrow(
      'progressKeys.parseEventSk',
    );
  });
});

// ─── parseDaySk ──────────────────────────────────────────────────────────────

describe('progressKeys.parseDaySk', () => {
  it('round-trips a dayItem sk', () => {
    const sk = progressKeys.dayItem('sub-xyz', '2026-06-20').sk;
    expect(progressKeys.parseDaySk(sk)).toEqual({ date: '2026-06-20' });
  });

  it('parses a known sk directly', () => {
    expect(progressKeys.parseDaySk('DAY#2026-01-15')).toEqual({ date: '2026-01-15' });
  });

  it('throws on a missing DAY# prefix', () => {
    expect(() => progressKeys.parseDaySk('EVENT#2026-06-20T00:00:00.000Z#ulid')).toThrow(
      'progressKeys.parseDaySk: malformed day sort key',
    );
  });

  it('throws on a DAY# key with a non-date segment', () => {
    expect(() => progressKeys.parseDaySk('DAY#not-a-date')).toThrow(
      'progressKeys.parseDaySk: malformed day sort key',
    );
  });

  it('throws on an empty string', () => {
    expect(() => progressKeys.parseDaySk('')).toThrow(
      'progressKeys.parseDaySk: malformed day sort key ""',
    );
  });
});
