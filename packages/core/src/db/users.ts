import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { userDataKeys, type UserStatus } from './keys.js';
import type { UserProfileItem } from '../auth/profile.js';

/** Fetch a user profile from the UserData table by Cognito sub. Returns null if absent. */
export async function getUserProfileBySub(sub: string): Promise<UserProfileItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TableNames.UserData, Key: userDataKeys.profile(sub) }),
  );
  return (res.Item as UserProfileItem | undefined) ?? null;
}

/** List all user profiles in a given status, oldest→newest (GSI1 query). */
export async function listUserProfilesByStatus(status: UserStatus): Promise<UserProfileItem[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TableNames.UserData,
      ...userDataKeys.listByStatus(status),
    }),
  );
  return (res.Items ?? []) as UserProfileItem[];
}

export interface UpdateUserResult {
  ok: boolean;
  profile?: UserProfileItem;
  reason?: 'not_found';
}

/**
 * Conditionally update a user's status. Rewrites gsi1pk to STATUS#<status> so the
 * GSI stays consistent. Optionally sets auditNotes. ConditionExpression requires the
 * profile to exist (attribute_exists(pk)); a missing user → { ok:false, reason:'not_found' }.
 * Returns the updated item (ReturnValues: ALL_NEW) on success.
 */
export async function updateUserStatus(
  sub: string,
  status: UserStatus,
  opts?: { auditNotes?: string },
): Promise<UpdateUserResult> {
  const now = new Date().toISOString();
  let updateExpression = 'SET #status = :status, gsi1pk = :gsi1pk, updatedAt = :now';
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':gsi1pk': `STATUS#${status}`,
    ':now': now,
  };

  if (opts?.auditNotes !== undefined) {
    updateExpression += ', auditNotes = :audit';
    expressionAttributeValues[':audit'] = opts.auditNotes;
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: userDataKeys.profile(sub),
        UpdateExpression: updateExpression,
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { ok: true, profile: result.Attributes as UserProfileItem };
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

/**
 * Conditionally update a user's role (does not touch GSI keys). Missing user →
 * { ok:false, reason:'not_found' }. Returns updated item on success.
 */
export async function updateUserRole(
  sub: string,
  role: 'admin' | 'member',
): Promise<UpdateUserResult> {
  const now = new Date().toISOString();

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: userDataKeys.profile(sub),
        UpdateExpression: 'SET #role = :role, updatedAt = :now',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: {
          ':role': role,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { ok: true, profile: result.Attributes as UserProfileItem };
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

/**
 * Soft-delete: read the profile, then atomically (TransactWrite) write a DELETED
 * audit item and remove the PROFILE item. Missing profile → { ok:false, reason:'not_found' }.
 * Audit item: keys from userDataKeys.deletedAudit(sub), plus
 * { sub, email, name, noteCount, deletedBy, deletedAt: <now ISO>, action: 'deleted' }.
 */
export async function deleteUserProfileWithAudit(
  sub: string,
  opts: { deletedBy: string },
): Promise<{ ok: boolean; reason?: 'not_found' }> {
  // Step 1: Read the current profile.
  const existing = await getUserProfileBySub(sub);
  if (existing === null) {
    return { ok: false, reason: 'not_found' };
  }

  const deletedAt = new Date().toISOString();
  const auditItem = {
    ...userDataKeys.deletedAudit(sub),
    sub,
    email: existing.email,
    name: existing.name,
    noteCount: existing.noteCount,
    deletedBy: opts.deletedBy,
    deletedAt,
    action: 'deleted' as const,
  };

  // Step 2: Atomically write the audit record and delete the profile.
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TableNames.UserData,
            Item: auditItem,
          },
        },
        {
          Delete: {
            TableName: TableNames.UserData,
            Key: userDataKeys.profile(sub),
            ConditionExpression: 'attribute_exists(pk)',
          },
        },
      ],
    }),
  );

  return { ok: true };
}
