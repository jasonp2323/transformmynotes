import { describe, it, expect } from 'vitest';
import { buildAiUsageEvent, buildStorageDeltaEvent } from '../capture.js';

const SUB = 'user-abc123';
const FIXED_TS = '2026-06-19T12:00:00.000Z';

// ---------------------------------------------------------------------------
// buildAiUsageEvent
// ---------------------------------------------------------------------------

describe('buildAiUsageEvent', () => {
  it('sets pk to USER#<sub>', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(item['pk']).toBe(`USER#${SUB}`);
  });

  it('sk starts with EVT#<day>#', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(item['sk']).toMatch(/^EVT#2026-06-19#/);
  });

  it('carries feature, model, inputTokens, outputTokens, ts', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'ocr',
      model: 'claude-3-sonnet',
      inputTokens: 200,
      outputTokens: 80,
      ts: FIXED_TS,
    });
    expect(item['feature']).toBe('ocr');
    expect(item['model']).toBe('claude-3-sonnet');
    expect(item['inputTokens']).toBe(200);
    expect(item['outputTokens']).toBe(80);
    expect(item['ts']).toBe(FIXED_TS);
  });

  it('carries a numeric expiresAt', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(typeof item['expiresAt']).toBe('number');
    expect(Number.isInteger(item['expiresAt'])).toBe(true);
  });

  it('expiresAt is in the future (greater than now in epoch seconds)', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(item['expiresAt'] as number).toBeGreaterThan(nowSeconds);
  });

  it('does NOT include gsi1pk or gsi1sk (sparse on GSI1)', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(item).not.toHaveProperty('gsi1pk');
    expect(item).not.toHaveProperty('gsi1sk');
  });

  it('coerces NaN inputTokens to 0', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: NaN,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(item['inputTokens']).toBe(0);
  });

  it('coerces NaN outputTokens to 0', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: NaN,
      ts: FIXED_TS,
    });
    expect(item['outputTokens']).toBe(0);
  });

  it('coerces undefined-cast (0/0 = NaN) token values to 0', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 0 / 0,  // NaN
      outputTokens: Infinity,
      ts: FIXED_TS,
    });
    expect(item['inputTokens']).toBe(0);
    expect(item['outputTokens']).toBe(0);
  });

  it('produces different sk values on successive calls (unique ulid)', () => {
    const a = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    const b = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      ts: FIXED_TS,
    });
    expect(a['sk']).not.toBe(b['sk']);
  });

  it('defaults ts to a valid ISO-8601 string when omitted', () => {
    const item = buildAiUsageEvent({
      sub: SUB,
      feature: 'study',
      model: 'claude-3-haiku',
      inputTokens: 10,
      outputTokens: 5,
    });
    // Should be a valid date string parseable by Date
    expect(isNaN(Date.parse(item['ts'] as string))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildStorageDeltaEvent
// ---------------------------------------------------------------------------

describe('buildStorageDeltaEvent', () => {
  it('sets feature to "storage"', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 1024, ts: FIXED_TS });
    expect(item['feature']).toBe('storage');
  });

  it('preserves a positive bytesDelta', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 4096, ts: FIXED_TS });
    expect(item['bytesDelta']).toBe(4096);
  });

  it('preserves a negative bytesDelta (delete path)', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: -2048, ts: FIXED_TS });
    expect(item['bytesDelta']).toBe(-2048);
  });

  it('sk starts with EVT#<day># derived from ts', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 512, ts: FIXED_TS });
    expect(item['sk']).toMatch(/^EVT#2026-06-19#/);
  });

  it('pk is USER#<sub>', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 512, ts: FIXED_TS });
    expect(item['pk']).toBe(`USER#${SUB}`);
  });

  it('does NOT include gsi1pk or gsi1sk (sparse on GSI1)', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 512, ts: FIXED_TS });
    expect(item).not.toHaveProperty('gsi1pk');
    expect(item).not.toHaveProperty('gsi1sk');
  });

  it('coerces NaN bytesDelta to 0', () => {
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: NaN, ts: FIXED_TS });
    expect(item['bytesDelta']).toBe(0);
  });

  it('carries a numeric integer expiresAt greater than now', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const item = buildStorageDeltaEvent({ sub: SUB, bytesDelta: 1024, ts: FIXED_TS });
    expect(typeof item['expiresAt']).toBe('number');
    expect(Number.isInteger(item['expiresAt'])).toBe(true);
    expect(item['expiresAt'] as number).toBeGreaterThan(nowSeconds);
  });
});
