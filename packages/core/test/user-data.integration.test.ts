/**
 * Integration test: UserData table round-trip via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, and `userDataKeys` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { userDataKeys } from '../src/db/keys.js';
import { buildUserProfileItem } from '../src/auth/profile.js';

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

describe('UserData table — GSI1 status index', () => {
  it('queries pending users via GSI1 in ascending chronological order', async () => {
    // Seed three pending users (varying createdAt) and one active user.
    const pendingUsers = [
      { userId: 'gsi-pending-003', createdAt: '2024-03-01T10:00:00.000Z' },
      { userId: 'gsi-pending-001', createdAt: '2024-01-01T10:00:00.000Z' },
      { userId: 'gsi-pending-002', createdAt: '2024-02-01T10:00:00.000Z' },
    ];

    for (const { userId, createdAt } of pendingUsers) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: {
            ...userDataKeys.profile(userId),
            ...userDataKeys.statusIndex('pending', createdAt),
            status: 'pending',
            email: `${userId}@example.com`,
            createdAt,
          },
        }),
      );
    }

    // Active user — should NOT appear in the pending query.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...userDataKeys.profile('gsi-active-001'),
          ...userDataKeys.statusIndex('active', '2024-01-15T10:00:00.000Z'),
          status: 'active',
          email: 'gsi-active-001@example.com',
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      }),
    );

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...userDataKeys.listByStatus('pending'),
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.length).toBe(3);

    // GSI1 range key is the ISO-8601 createdAt — ascending = chronological (oldest first).
    expect(Items![0].userId ?? Items![0].pk).toContain('001');
    expect(Items![1].userId ?? Items![1].pk).toContain('002');
    expect(Items![2].userId ?? Items![2].pk).toContain('003');

    // Verify the active user is absent.
    const pks = Items!.map((i) => i.pk as string);
    expect(pks).not.toContain('USER#gsi-active-001');
  });

  it('excludes an item from the pending query after its status is updated to active', async () => {
    const userId = 'gsi-status-change-001';
    const createdAt = '2024-04-01T08:00:00.000Z';

    // Write as pending first.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...userDataKeys.profile(userId),
          ...userDataKeys.statusIndex('pending', createdAt),
          status: 'pending',
          email: `${userId}@example.com`,
          createdAt,
        },
      }),
    );

    // Confirm it appears in the pending query.
    const { Items: before } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...userDataKeys.listByStatus('pending'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...userDataKeys.listByStatus('pending').ExpressionAttributeValues,
          ':pk': `USER#${userId}`,
        },
      }),
    );
    expect(before!.some((i) => i.pk === `USER#${userId}`)).toBe(true);

    // Update status to active — must update BOTH gsi1pk and the status attribute.
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: userDataKeys.profile(userId),
        UpdateExpression: 'SET gsi1pk = :newGsi1pk, #s = :newStatus',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':newGsi1pk': `STATUS#active`,
          ':newStatus': 'active',
        },
      }),
    );

    // Now re-query pending — the item must no longer appear.
    const { Items: after } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...userDataKeys.listByStatus('pending'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...userDataKeys.listByStatus('pending').ExpressionAttributeValues,
          ':pk': `USER#${userId}`,
        },
      }),
    );
    expect(after!.some((i) => i.pk === `USER#${userId}`)).toBe(false);
  });
});

describe('buildUserProfileItem — write/read round-trip via real DDB builder', () => {
  it('writes and reads back a pending profile by primary key', async () => {
    const sub = 'pc-int-1';
    const profile = buildUserProfileItem({
      sub,
      email: 'a@b.com',
      status: 'pending',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: userDataKeys.profile(sub),
      }),
    );

    expect(Item).toBeDefined();
    expect(Item!.pk).toBe(`USER#${sub}`);
    expect(Item!.sk).toBe('PROFILE');
    expect(Item!.sub).toBe(sub);
    expect(Item!.email).toBe('a@b.com');
    expect(Item!.status).toBe('pending');
    expect(Item!.role).toBe('member');
    expect(Item!.noteCount).toBe(0);
    expect(Item!.groupIds).toEqual([]);
    expect(Item!.name).toBe('');
  });

  it('includes the profile in a listByStatus("pending") GSI query', async () => {
    // The previous test wrote pc-int-1 as pending — re-use that or write again.
    const sub = 'pc-int-2';
    const profile = buildUserProfileItem({
      sub,
      email: 'pc-int-2@b.com',
      status: 'pending',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...userDataKeys.listByStatus('pending'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...userDataKeys.listByStatus('pending').ExpressionAttributeValues,
          ':pk': `USER#${sub}`,
        },
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.some((i) => i.pk === `USER#${sub}`)).toBe(true);
  });
});
