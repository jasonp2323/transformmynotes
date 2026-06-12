import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { buildAccessRequestItem, type AccessRequestItem } from '../auth/access-request.js';
import { accessRequestKeys, type AccessRequestStatus } from './keys.js';

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

/**
 * Fetches a single access request by its id. Returns undefined if not found.
 */
export async function getAccessRequest(id: string): Promise<AccessRequestItem | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: accessRequestKeys.request(id),
    }),
  );
  return res.Item as AccessRequestItem | undefined;
}

/**
 * Lists all access requests with a given status, oldest→newest (GSI1 query).
 */
export async function listAccessRequestsByStatus(
  status: AccessRequestStatus,
): Promise<AccessRequestItem[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TableNames.UserData,
      ...accessRequestKeys.listByStatus(status),
    }),
  );
  return (res.Items ?? []) as AccessRequestItem[];
}

export interface UpdateAccessRequestResult {
  ok: boolean;
  item?: AccessRequestItem;
  reason?: 'not_found';
}

/**
 * Conditionally updates an access request's status and rewrites gsi1pk so the
 * status GSI stays consistent. ConditionExpression requires the item to exist
 * (attribute_exists(pk)); a missing item → { ok:false, reason:'not_found' }.
 * Returns the updated item (ReturnValues: ALL_NEW) on success.
 */
export async function updateAccessRequestStatus(
  id: string,
  status: AccessRequestStatus,
  opts?: { now?: Date },
): Promise<UpdateAccessRequestResult> {
  const now = (opts?.now ?? new Date()).toISOString();

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: accessRequestKeys.request(id),
        UpdateExpression: 'SET #status = :status, gsi1pk = :gsi1pk, updatedAt = :now',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':gsi1pk': `ACCESSREQ_STATUS#${status}`,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { ok: true, item: result.Attributes as AccessRequestItem };
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'ConditionalCheckFailedException'
    ) {
      return { ok: false, reason: 'not_found' };
    }
    throw err;
  }
}
