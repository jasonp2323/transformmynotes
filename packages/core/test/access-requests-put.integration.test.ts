/**
 * Integration test: putAccessRequest helper via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `accessRequestKeys`, and
 * `putAccessRequest` — no mocks. The dynalite server is started by
 * `dynalite-global.ts` (globalSetup) and the production client is pointed at it
 * via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { accessRequestKeys } from '../src/db/keys.js';
import { putAccessRequest } from '../src/db/access-requests.js';

describe('putAccessRequest — write/read round-trip', () => {
  it('writes the item and reads it back by primary key', async () => {
    const id = 'put-req-001';
    const returned = await putAccessRequest({
      id,
      name: 'Dave',
      email: 'dave@example.com',
      note: 'Excited to try',
    });

    expect(returned.id).toBe(id);
    expect(returned.email).toBe('dave@example.com');
    expect(returned.name).toBe('Dave');
    expect(returned.note).toBe('Excited to try');
    expect(returned.status).toBe('new');

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(id),
      }),
    );

    expect(Item).toBeDefined();
    expect(Item).toEqual(returned);
  });

  it('generates a UUID when no id is provided', async () => {
    const returned = await putAccessRequest({
      name: 'Eve',
      email: 'eve@example.com',
    });

    expect(returned.id).toBeTruthy();
    expect(returned.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(returned.id),
      }),
    );

    expect(Item).toBeDefined();
    expect(Item!.email).toBe('eve@example.com');
  });

  it('appears in listByStatus("new") GSI query', async () => {
    const id = 'put-req-gsi-001';
    const returned = await putAccessRequest({
      id,
      name: 'Frank',
      email: 'frank@example.com',
    });

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
    expect(Items!.find((i) => i.pk === `ACCESSREQ#${id}`)!.email).toBe('frank@example.com');
    // Ensure the returned item from putAccessRequest matches what's stored.
    expect(Items!.find((i) => i.pk === `ACCESSREQ#${id}`)).toEqual(returned);
  });

  it('stores optional note but omits it when not provided', async () => {
    const withNote = await putAccessRequest({
      id: 'put-req-note-001',
      name: 'Grace',
      email: 'grace@example.com',
      note: 'My note',
    });
    expect(withNote.note).toBe('My note');

    const withoutNote = await putAccessRequest({
      id: 'put-req-note-002',
      name: 'Heidi',
      email: 'heidi@example.com',
    });
    expect(withoutNote.note).toBeUndefined();

    const { Item: itemWithout } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request('put-req-note-002'),
      }),
    );
    expect(itemWithout!.note).toBeUndefined();
  });
});
