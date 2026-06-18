/**
 * Integration test: source URL-fetch rate-limit counters (M21.2.2).
 *
 * Tests hitSourceFetchWindow and hitSourceDailyCap against the dynalite
 * in-memory DynamoDB. Verifies:
 *  - Atomic ADD increments work correctly (11th call returns count=11)
 *  - expiresAt TTL is set on creation and not changed on subsequent increments
 *  - Window and daily-cap items are distinct (different pk)
 */

import { describe, it, expect } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { sourceRateLimitKeys } from '../src/db/keys.js';
import { hitSourceFetchWindow, hitSourceDailyCap } from '../src/db/rate-limit.js';

// ---------------------------------------------------------------------------
// hitSourceFetchWindow
// ---------------------------------------------------------------------------

describe('hitSourceFetchWindow — counter increments atomically', () => {
  const SUB = `sub-srcrl-win-${Math.floor(Math.random() * 100000)}`;
  const WINDOW_START = 1750000000;
  const WINDOW_SECONDS = 60;

  it('11th increment returns count=11 (so caller comparing count > 10 rejects)', async () => {
    let lastResult = { count: 0 };
    for (let i = 1; i <= 11; i++) {
      lastResult = await hitSourceFetchWindow({
        sub: SUB,
        windowStart: WINDOW_START,
        windowSeconds: WINDOW_SECONDS,
      });
      expect(lastResult.count).toBe(i);
    }
    expect(lastResult.count).toBe(11);
  });

  it('item carries expiresAt = windowStart + 2*windowSeconds', async () => {
    const key = sourceRateLimitKeys.fetchRateWindow(SUB, WINDOW_START);
    const res = await ddb.send(
      new GetCommand({ TableName: TableNames.UserData, Key: key }),
    );
    const item = res.Item as { expiresAt?: number; count?: number } | undefined;
    expect(item).toBeDefined();
    expect(item!.expiresAt).toBe(WINDOW_START + WINDOW_SECONDS * 2);
  });
});

// ---------------------------------------------------------------------------
// hitSourceDailyCap
// ---------------------------------------------------------------------------

describe('hitSourceDailyCap — counter increments and TTL is set', () => {
  const SUB = `sub-srcrl-daily-${Math.floor(Math.random() * 100000)}`;
  const DATE_UTC = '2026-06-18';
  const TTL_EPOCH = 1750298400; // some future epoch seconds

  it('each call increments the count', async () => {
    const r1 = await hitSourceDailyCap({ sub: SUB, dateUtc: DATE_UTC, ttlEpochSeconds: TTL_EPOCH });
    expect(r1.count).toBe(1);
    const r2 = await hitSourceDailyCap({ sub: SUB, dateUtc: DATE_UTC, ttlEpochSeconds: TTL_EPOCH });
    expect(r2.count).toBe(2);
  });

  it('stored expiresAt equals the passed ttlEpochSeconds', async () => {
    const key = sourceRateLimitKeys.fetchDailyCap(SUB, DATE_UTC);
    const res = await ddb.send(
      new GetCommand({ TableName: TableNames.UserData, Key: key }),
    );
    const item = res.Item as { expiresAt?: number; count?: number } | undefined;
    expect(item).toBeDefined();
    expect(item!.expiresAt).toBe(TTL_EPOCH);
  });
});

// ---------------------------------------------------------------------------
// Isolation: window and daily-cap items are distinct
// ---------------------------------------------------------------------------

describe('sourceRateLimitKeys — window and daily-cap items are distinct', () => {
  const SUB = `sub-srcrl-iso-${Math.floor(Math.random() * 100000)}`;

  it('fetchRateWindow and fetchDailyCap have different pk values', () => {
    const winKey = sourceRateLimitKeys.fetchRateWindow(SUB, 1750000000);
    const dayKey = sourceRateLimitKeys.fetchDailyCap(SUB, '2026-06-18');
    expect(winKey.pk).toBe('RATELIMIT#sources/from-url');
    expect(dayKey.pk).toBe('RATELIMIT#sources/daily');
    expect(winKey.pk).not.toBe(dayKey.pk);
  });
});
