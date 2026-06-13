import { PutCommand, GetCommand, UpdateCommand, QueryCommand, type UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { inviteKeys } from './keys.js';
import { buildInviteItem, hashInviteCode, type InviteItem, type InviteType, type InviteStatus } from '../auth/invite.js';

/** Input to `putInvite`. Supply a raw `code` string; codeHash is derived automatically. */
export interface PutInviteInput {
  code: string;
  type: InviteType;
  targetEmail?: string;
  label?: string;
  groupId?: string;
  groupName?: string;
  inviterName?: string;
  /** ISO-8601 datetime after which the invite expires. Absent = never expires. */
  expiresAt?: string;
  /** Maximum number of times this invite can be claimed. Defaults to 1. */
  maxUses?: number;
  createdBy?: string;
  role?: 'member' | 'admin';
}

/**
 * Writes a new invite to the Invites table.
 *
 * Derives `codeHash` from the raw `code` via SHA-256, builds the full item
 * via `buildInviteItem`, writes it with PutCommand, and returns the item.
 */
export async function putInvite(input: PutInviteInput): Promise<InviteItem> {
  const codeHash = hashInviteCode(input.code);

  const item = buildInviteItem({
    codeHash,
    type: input.type,
    targetEmail: input.targetEmail,
    label: input.label,
    groupId: input.groupId,
    groupName: input.groupName,
    inviterName: input.inviterName,
    expiresAt: input.expiresAt,
    maxUses: input.maxUses,
    createdBy: input.createdBy,
    role: input.role,
  });

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Invites,
      Item: item,
    }),
  );

  return item;
}

/**
 * Retrieves an invite record by its raw (unhashed) code.
 *
 * Hashes the code via SHA-256, then fetches the item from the Invites table
 * by primary key. Returns `undefined` if no matching item is found.
 */
export async function getInviteByCode(rawCode: string): Promise<InviteItem | undefined> {
  const codeHash = hashInviteCode(rawCode);

  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.Invites,
      Key: inviteKeys.invite(codeHash),
    }),
  );

  return Item as InviteItem | undefined;
}

/** Result of a successful claim. */
export interface ClaimInviteSuccess {
  ok: true;
  item: InviteItem;
}

/** Result of a failed claim — invite unavailable (exhausted, expired, revoked, or missing). */
export interface ClaimInviteFailure {
  ok: false;
  reason: 'unavailable';
}

export type ClaimInviteResult = ClaimInviteSuccess | ClaimInviteFailure;

/**
 * Atomically claims an invite by incrementing `usedCount`.
 *
 * Uses a `ConditionExpression` to ensure the invite is still claimable:
 *   - `#status = 'pending'`
 *   - `usedCount < maxUses`
 *   - either `expiresAt` is absent, or `expiresAt > now` (ISO string compare)
 *
 * On `ConditionalCheckFailedException`, returns `{ ok: false, reason: 'unavailable' }`.
 *
 * On success the UpdateCommand returns the updated item (`ReturnValues: 'ALL_NEW'`).
 * If the new `usedCount >= maxUses`, a second UpdateCommand flips `#status` to `'used'`
 * and refreshes `updatedAt`.
 *
 * @param rawCode - The raw (user-supplied) invite code.
 * @param now     - The current time (defaults to `new Date()`). Used for the expiry check.
 */
export async function claimInvite(
  rawCode: string,
  now: Date = new Date(),
): Promise<ClaimInviteResult> {
  const codeHash = hashInviteCode(rawCode);
  const key = inviteKeys.invite(codeHash);
  const nowIso = now.toISOString();
  const updatedAt = nowIso;

  try {
    // Step 1: Conditionally increment usedCount.
    // Condition:
    //   - #status = 'pending'
    //   - usedCount < maxUses
    //   - (attribute_not_exists(expiresAt) OR expiresAt > :now)
    const updateResult = await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Invites,
        Key: key,
        UpdateExpression: 'SET usedCount = usedCount + :one, updatedAt = :updatedAt',
        ConditionExpression:
          '#status = :pending' +
          ' AND usedCount < maxUses' +
          ' AND (attribute_not_exists(expiresAt) OR expiresAt > :now)',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':one': 1,
          ':updatedAt': updatedAt,
          ':pending': 'pending',
          ':now': nowIso,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    const updatedItem = updateResult.Attributes as InviteItem;

    // Step 2: If usedCount has reached maxUses, flip status to 'used'.
    if (updatedItem.usedCount >= updatedItem.maxUses) {
      const finalResult = await ddb.send(
        new UpdateCommand({
          TableName: TableNames.Invites,
          Key: key,
          UpdateExpression: 'SET #status = :used, gsi1sk = :gsi1sk, updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':used': 'used',
            ':gsi1sk': `used#${updatedItem.createdAt}`,
            ':updatedAt': updatedAt,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      return { ok: true, item: finalResult.Attributes as InviteItem };
    }

    return { ok: true, item: updatedItem };
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'ConditionalCheckFailedException'
    ) {
      return { ok: false, reason: 'unavailable' };
    }
    throw err;
  }
}

/** Result of a successful revoke. */
export interface RevokeInviteSuccess {
  ok: true;
  item: InviteItem;
}

/** Result of a failed revoke — invite not found or already revoked. */
export interface RevokeInviteFailure {
  ok: false;
  reason: 'not_found' | 'already_revoked';
}

export type RevokeInviteResult = RevokeInviteSuccess | RevokeInviteFailure;

/**
 * Revokes an invite by its codeHash.
 *
 * Fetches the current item first to detect not-found / already-revoked, then
 * does a conditional UpdateCommand that flips `status` to `'revoked'` and
 * moves the GSI1 sort key to the `revoked#<createdAt>` partition so
 * `inviteKeys.listByStatus('revoked')` finds it.
 *
 * @param codeHash   - The SHA-256 hash of the invite code (NOT the raw code).
 * @param opts.auditNotes - Optional notes stored alongside the revocation.
 * @param opts.now        - Timestamp to use for `updatedAt` (defaults to `new Date()`).
 */
export async function revokeInvite(
  codeHash: string,
  opts?: { auditNotes?: string; now?: Date },
): Promise<RevokeInviteResult> {
  const key = inviteKeys.invite(codeHash);
  const now = opts?.now ?? new Date();

  // Step 1: Get the current item to check existence and current status,
  // and to read `createdAt` needed to build the new gsi1sk.
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.Invites,
      Key: key,
    }),
  );

  if (Item === undefined) {
    return { ok: false, reason: 'not_found' };
  }

  if ((Item as InviteItem).status === 'revoked') {
    return { ok: false, reason: 'already_revoked' };
  }

  const createdAt = (Item as InviteItem).createdAt;
  const updatedAt = now.toISOString();
  const gsi1sk = `revoked#${createdAt}`;

  // Step 2: Conditionally update the item to 'revoked'.
  let updateExpression =
    'SET #status = :revoked, gsi1sk = :gsi1sk, updatedAt = :updatedAt';
  const expressionAttributeValues: UpdateCommandInput['ExpressionAttributeValues'] = {
    ':revoked': 'revoked',
    ':gsi1sk': gsi1sk,
    ':updatedAt': updatedAt,
  };

  if (opts?.auditNotes !== undefined) {
    updateExpression += ', auditNotes = :auditNotes';
    expressionAttributeValues[':auditNotes'] = opts.auditNotes;
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Invites,
        Key: key,
        UpdateExpression: updateExpression,
        ConditionExpression: 'attribute_exists(pk) AND #status <> :revoked',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return { ok: true, item: result.Attributes as InviteItem };
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'ConditionalCheckFailedException'
    ) {
      return { ok: false, reason: 'already_revoked' };
    }
    throw err;
  }
}

/**
 * Lists invites from the Invites table via GSI1, sorted newest-first.
 *
 * When `status` is provided, only invites with that status are returned
 * (uses a `begins_with` filter on the GSI1 sort key prefix `<status>#`).
 * When omitted, all invites across all statuses are returned.
 *
 * Results are ordered newest-first (`ScanIndexForward: false`) because the
 * GSI1 sort key is `<status>#<ISO-8601 createdAt>` and ISO timestamps sort
 * lexicographically — reversing the scan yields descending chronological order.
 *
 * @param status - Optional status filter (`'pending' | 'used' | 'expired' | 'revoked'`).
 * @returns Array of `InviteItem` records, newest first. Returns `[]` if none found.
 */
export async function listInvites(status?: InviteStatus): Promise<InviteItem[]> {
  const keyParams = status ? inviteKeys.listByStatus(status) : inviteKeys.listAll();

  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Invites,
      ...keyParams,
      ScanIndexForward: false,
    }),
  );

  return (Items as InviteItem[]) ?? [];
}
