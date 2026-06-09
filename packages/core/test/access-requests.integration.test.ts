/**
 * Integration test: AccessRequests access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, and `accessRequestKeys` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { accessRequestKeys } from '../src/db/keys.js';
import { buildAccessRequestItem } from '../src/auth/access-request.js';

describe('AccessRequests — write/read round-trip', () => {
  it('reads back the exact item that was written', async () => {
    const id = 'int-req-001';
    const item = buildAccessRequestItem({
      id,
      email: 'alice@example.com',
      name: 'Alice',
      note: 'Looking forward to it',
      status: 'new',
      createdAt: '2024-01-15T12:00:00.000Z',
      now: '2024-01-15T12:00:00.000Z',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: item,
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(id),
      }),
    );

    expect(Item).toEqual(item);
  });

  it('returns undefined Item for a non-existent request', async () => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request('non-existent-req-xyz'),
      }),
    );

    expect(Item).toBeUndefined();
  });
});

describe('AccessRequests — GSI1 status index', () => {
  it('queries new requests via GSI1 in ascending chronological order', async () => {
    // Seed three "new" requests (varying createdAt) and one "approved" request.
    const newRequests = [
      { id: 'gsi-new-003', createdAt: '2024-03-01T10:00:00.000Z' },
      { id: 'gsi-new-001', createdAt: '2024-01-01T10:00:00.000Z' },
      { id: 'gsi-new-002', createdAt: '2024-02-01T10:00:00.000Z' },
    ];

    for (const { id, createdAt } of newRequests) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: buildAccessRequestItem({
            id,
            email: `${id}@example.com`,
            status: 'new',
            createdAt,
            now: createdAt,
          }),
        }),
      );
    }

    // Approved request — should NOT appear in the "new" query.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: buildAccessRequestItem({
          id: 'gsi-approved-001',
          email: 'gsi-approved-001@example.com',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00.000Z',
          now: '2024-01-15T10:00:00.000Z',
        }),
      }),
    );

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...accessRequestKeys.listByStatus('new'),
      }),
    );

    expect(Items).toBeDefined();

    // Filter to only our seeded items by checking pk prefix (shared table).
    const seededNew = Items!.filter((i) =>
      ['ACCESSREQ#gsi-new-001', 'ACCESSREQ#gsi-new-002', 'ACCESSREQ#gsi-new-003'].includes(
        i.pk as string,
      ),
    );

    expect(seededNew.length).toBe(3);

    // GSI1 range key is ISO-8601 createdAt — ascending = chronological (oldest first).
    expect(seededNew[0].pk).toBe('ACCESSREQ#gsi-new-001');
    expect(seededNew[1].pk).toBe('ACCESSREQ#gsi-new-002');
    expect(seededNew[2].pk).toBe('ACCESSREQ#gsi-new-003');

    // Verify the approved request is absent from the "new" query.
    const pks = Items!.map((i) => i.pk as string);
    expect(pks).not.toContain('ACCESSREQ#gsi-approved-001');
  });

  it('excludes an item from the new query after its status is updated to approved', async () => {
    const id = 'gsi-status-change-req-001';
    const createdAt = '2024-04-01T08:00:00.000Z';

    // Write as "new" first.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: buildAccessRequestItem({
          id,
          email: `${id}@example.com`,
          status: 'new',
          createdAt,
          now: createdAt,
        }),
      }),
    );

    // Confirm it appears in the "new" query.
    const { Items: before } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...accessRequestKeys.listByStatus('new'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...accessRequestKeys.listByStatus('new').ExpressionAttributeValues,
          ':pk': `ACCESSREQ#${id}`,
        },
      }),
    );
    expect(before!.some((i) => i.pk === `ACCESSREQ#${id}`)).toBe(true);

    // Update status to "approved" — must update BOTH gsi1pk AND the status attribute.
    // Use ExpressionAttributeNames because "status" is a DynamoDB reserved word.
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(id),
        UpdateExpression: 'SET gsi1pk = :newGsi1pk, #status = :newStatus',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':newGsi1pk': 'ACCESSREQ_STATUS#approved',
          ':newStatus': 'approved',
        },
      }),
    );

    // Now re-query "new" — the item must no longer appear.
    const { Items: after } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...accessRequestKeys.listByStatus('new'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...accessRequestKeys.listByStatus('new').ExpressionAttributeValues,
          ':pk': `ACCESSREQ#${id}`,
        },
      }),
    );
    expect(after!.some((i) => i.pk === `ACCESSREQ#${id}`)).toBe(false);
  });
});

describe('buildAccessRequestItem — write/read round-trip via real DDB builder', () => {
  it('writes and reads back a new request by primary key', async () => {
    const id = 'ar-int-1';
    const request = buildAccessRequestItem({
      id,
      email: 'bob@example.com',
      name: 'Bob',
      status: 'new',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: request,
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(id),
      }),
    );

    expect(Item).toBeDefined();
    expect(Item!.pk).toBe(`ACCESSREQ#${id}`);
    expect(Item!.sk).toBe('REQUEST');
    expect(Item!.id).toBe(id);
    expect(Item!.email).toBe('bob@example.com');
    expect(Item!.name).toBe('Bob');
    expect(Item!.status).toBe('new');
    expect(Item!.note).toBeUndefined();
  });

  it('includes the request in a listByStatus("new") GSI query', async () => {
    const id = 'ar-int-2';
    const request = buildAccessRequestItem({
      id,
      email: 'carol@example.com',
      status: 'new',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: request,
      }),
    );

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...accessRequestKeys.listByStatus('new'),
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ...accessRequestKeys.listByStatus('new').ExpressionAttributeValues,
          ':pk': `ACCESSREQ#${id}`,
        },
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.some((i) => i.pk === `ACCESSREQ#${id}`)).toBe(true);
  });
});
