/**
 * Integration test (M18): audio pointer item round-trip via the real production client.
 *
 * Exercises `audioKeys.pointer` + `storageKeys.audioMp3` against the real `ddb`
 * DocumentClient and `TableNames` — no mocks. The dynalite server is started by
 * `dynalite-global.ts` (globalSetup) and the production client is pointed at it
 * via env vars set in `integration-env.ts` (setupFiles).
 *
 * Hashes are literal strings here on purpose — the content-hash helper lives in
 * `src/tts/` (owned by a sibling task) and is not a dependency of this round-trip.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { audioKeys, storageKeys } from '../src/db/keys.js';

describe('UserData table — audio pointer write/read round-trip (M18)', () => {
  it('reads back the exact audio pointer item that was written', async () => {
    const keys = audioKeys.pointer('sub-A', 'H1');
    const item = {
      ...keys,
      hash: 'H1',
      s3Key: storageKeys.audioMp3('sub-A', 'H1'),
      voiceId: 'Camila',
      engine: 'neural',
      charCount: 42,
      createdAt: '2026-06-17T00:00:00.000Z',
    };

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: item,
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: keys,
      }),
    );

    expect(Item).toEqual(item);
  });

  it('returns undefined for an absent hash in the same user partition', async () => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: audioKeys.pointer('sub-A', 'H2'),
      }),
    );

    expect(Item).toBeUndefined();
  });

  it('does not leak one user\'s audio pointer to another user (cross-user isolation)', async () => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: audioKeys.pointer('sub-B', 'H1'),
      }),
    );

    expect(Item).toBeUndefined();
  });
});

describe('UserData table — userAudioQuery daily-cap list (M18.2)', () => {
  it('returns only the queried user\'s AUDIO# items and sums their charCount', async () => {
    // Three pointer items for user Q (varying charCount) + one for user R.
    const qItems = [
      { hash: 'Q1', charCount: 10 },
      { hash: 'Q2', charCount: 25 },
      { hash: 'Q3', charCount: 7 },
    ];
    for (const { hash, charCount } of qItems) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: {
            ...audioKeys.pointer('sub-Q', hash),
            hash,
            s3Key: storageKeys.audioMp3('sub-Q', hash),
            voiceId: 'Camila',
            engine: 'neural',
            charCount,
            createdAt: '2026-06-17T00:00:00.000Z',
          },
        }),
      );
    }
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...audioKeys.pointer('sub-R', 'R1'),
          hash: 'R1',
          s3Key: storageKeys.audioMp3('sub-R', 'R1'),
          voiceId: 'Camila',
          engine: 'neural',
          charCount: 999,
          createdAt: '2026-06-17T00:00:00.000Z',
        },
      }),
    );

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...audioKeys.userAudioQuery('sub-Q'),
      }),
    );

    expect(Items).toHaveLength(3);
    // Cross-user isolation: user R's item must not appear.
    expect((Items ?? []).some((i) => i.hash === 'R1')).toBe(false);
    const sum = (Items ?? []).reduce((acc, i) => acc + (i.charCount as number), 0);
    expect(sum).toBe(42);
  });
});
