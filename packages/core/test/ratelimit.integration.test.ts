/**
 * Integration test: fixed-window rate-limit counter via `hitRateLimit` +
 * `rateLimitKeys` (M11.2.2).
 *
 * Exercises the real `ddb` DocumentClient, `rateLimitKeys` key builders,
 * and `hitRateLimit` — no mocks. The dynalite server is started by
 * `dynalite-global.ts` (globalSetup) and the production client is pointed
 * at it via env vars set in `integration-env.ts` (setupFiles), which run in
 * workers before test files.
 *
 * Each test uses a unique IP suffix so items written by different tests
 * never collide — dynalite state persists across tests within a run.
 */

import { describe, it, expect } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { rateLimitKeys } from '../src/db/keys.js';
import { hitRateLimit } from '../src/db/rate-limit.js';

// ---------------------------------------------------------------------------
// Test 1: counter increments 1..10 for the same (route, ip, windowStart)
// ---------------------------------------------------------------------------

describe('hitRateLimit — counter increments atomically', () => {
  const ROUTE = 'login';
  const IP = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;
  const WINDOW_START = 1700000000;
  const WINDOW_SECONDS = 60;

  it('increments from 1 to 10 across 10 sequential calls', async () => {
    for (let i = 1; i <= 10; i++) {
      const result = await hitRateLimit({
        route: ROUTE,
        ip: IP,
        windowStart: WINDOW_START,
        windowSeconds: WINDOW_SECONDS,
      });
      expect(result.count).toBe(i);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: expiresAt is set to windowStart + 2*windowSeconds on creation and
// unchanged on subsequent increments. Verified by reading back the raw item.
// ---------------------------------------------------------------------------

describe('hitRateLimit — expiresAt TTL attribute', () => {
  const ROUTE = 'login';
  const IP = `10.1.1.${Math.floor(Math.random() * 200) + 1}`;
  // Use a current-ish window start so expiresAt is in the future.
  const WINDOW_START = Math.floor(Date.now() / 1000);
  const WINDOW_SECONDS = 300;

  it('returns an expiresAt equal to windowStart + 2*windowSeconds', async () => {
    const result = await hitRateLimit({
      route: ROUTE,
      ip: IP,
      windowStart: WINDOW_START,
      windowSeconds: WINDOW_SECONDS,
    });
    expect(result.expiresAt).toBe(WINDOW_START + WINDOW_SECONDS * 2);
    // Also confirm it is in the future relative to when we called it.
    expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('stored expiresAt equals windowStart + 2*windowSeconds and does not change on re-increment', async () => {
    // Increment a second time; expiresAt must not change (if_not_exists).
    await hitRateLimit({
      route: ROUTE,
      ip: IP,
      windowStart: WINDOW_START,
      windowSeconds: WINDOW_SECONDS,
    });

    const key = rateLimitKeys.counter(ROUTE, IP, String(WINDOW_START));
    const getRes = await ddb.send(new GetCommand({
      TableName: TableNames.UserData,
      Key: key,
    }));

    const item = getRes.Item as { expiresAt?: number; count?: number } | undefined;
    expect(item).toBeDefined();
    expect(item!.expiresAt).toBe(WINDOW_START + WINDOW_SECONDS * 2);
  });
});

// ---------------------------------------------------------------------------
// Test 3: a different windowStart (or different ip) starts a fresh counter
// at count=1 — windows/ips are isolated.
// ---------------------------------------------------------------------------

describe('hitRateLimit — window and IP isolation', () => {
  const ROUTE = 'login';
  const BASE_IP = `10.2.2.${Math.floor(Math.random() * 200) + 1}`;
  const WINDOW_SECONDS = 60;

  it('a different windowStart starts a fresh counter at count=1', async () => {
    const WIN_A = 1700020000;
    const WIN_B = 1700020060; // next window

    // Bump window A a few times.
    for (let i = 0; i < 5; i++) {
      await hitRateLimit({ route: ROUTE, ip: BASE_IP, windowStart: WIN_A, windowSeconds: WINDOW_SECONDS });
    }

    // First hit on window B should be count=1.
    const result = await hitRateLimit({
      route: ROUTE,
      ip: BASE_IP,
      windowStart: WIN_B,
      windowSeconds: WINDOW_SECONDS,
    });
    expect(result.count).toBe(1);
  });

  it('a different ip starts a fresh counter at count=1', async () => {
    const WIN = 1700030000;
    const IP_A = `10.3.3.${Math.floor(Math.random() * 100) + 1}`;
    const IP_B = `10.3.3.${Math.floor(Math.random() * 100) + 101}`;

    // Bump IP_A a few times.
    for (let i = 0; i < 3; i++) {
      await hitRateLimit({ route: ROUTE, ip: IP_A, windowStart: WIN, windowSeconds: WINDOW_SECONDS });
    }

    // First hit from IP_B in the same window should be count=1.
    const result = await hitRateLimit({
      route: ROUTE,
      ip: IP_B,
      windowStart: WIN,
      windowSeconds: WINDOW_SECONDS,
    });
    expect(result.count).toBe(1);
  });
});
