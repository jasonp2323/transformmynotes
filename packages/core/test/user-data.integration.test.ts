/**
 * Integration test: UserData table round-trip via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, and `userDataKeys` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { userDataKeys } from '../src/db/keys.js';

describe('UserData table — write/read round-trip', () => {
  it('reads back the exact item that was written', async () => {
    const userId = 'test-user-001';
    const keys = userDataKeys.profile(userId);
    const item = {
      ...keys,
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: '2024-01-15T12:00:00.000Z',
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

  it('returns undefined Item for a non-existent user', async () => {
    const keys = userDataKeys.profile('non-existent-user-xyz');

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: keys,
      }),
    );

    expect(Item).toBeUndefined();
  });
});
