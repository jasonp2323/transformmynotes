import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { buildAccessRequestItem, type AccessRequestItem } from '../auth/access-request.js';

/**
 * Writes a new access request to DynamoDB.
 *
 * Builds the full item via `buildAccessRequestItem` (status defaults to 'new',
 * id defaults to a new UUID), writes it with PutCommand, and returns the item.
 */
export async function putAccessRequest(input: {
  name: string;
  email: string;
  note?: string;
  id?: string;
}): Promise<AccessRequestItem> {
  const item = buildAccessRequestItem({
    id: input.id ?? randomUUID(),
    name: input.name,
    email: input.email,
    note: input.note,
  });

  await ddb.send(
    new PutCommand({
      TableName: TableNames.UserData,
      Item: item,
    }),
  );

  return item;
}
