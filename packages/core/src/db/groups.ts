import { PutCommand, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { groupKeys, type GroupRole } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** A group metadata item (PK = `GROUP#<groupId>`, SK = `META`). */
export interface GroupMetaItem {
  pk: string;
  sk: 'META';
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  /** Maintained by conditional increments on membership writes. Starts at 0. */
  memberCount: number;
}

/** A group membership item (PK = `GROUP#<groupId>`, SK = `MEMBER#<userSub>`). */
export interface GroupMemberItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  groupId: string;
  userSub: string;
  joinedAt: string;
  role: GroupRole;
}

// ---------------------------------------------------------------------------
// Pure item builders
// ---------------------------------------------------------------------------

/** Input for building a group metadata item. */
export interface BuildGroupMetaItemInput {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  createdAt?: string;
  /** Defaults to 0. */
  memberCount?: number;
}

/** Builds a `GroupMetaItem` with all DynamoDB keys populated. */
export function buildGroupMetaItem(input: BuildGroupMetaItemInput): GroupMetaItem {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const memberCount = input.memberCount ?? 0;
  const keys = groupKeys.groupMetaKey(input.groupId);

  const item: GroupMetaItem = {
    pk: keys.pk,
    sk: keys.sk,
    groupId: input.groupId,
    name: input.name,
    createdBy: input.createdBy,
    createdAt,
    memberCount,
  };

  if (input.description !== undefined) {
    item.description = input.description;
  }

  return item;
}

/** Input for building a group membership item. */
export interface BuildGroupMemberItemInput {
  groupId: string;
  userSub: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  joinedAt?: string;
  /** Defaults to `'member'` if omitted. */
  role?: GroupRole;
}

/** Builds a `GroupMemberItem` with all primary + GSI1 keys populated. */
export function buildGroupMemberItem(input: BuildGroupMemberItemInput): GroupMemberItem {
  const joinedAt = input.joinedAt ?? new Date().toISOString();
  const role = input.role ?? 'member';
  const primaryKeys = groupKeys.groupMemberKey(input.groupId, input.userSub);
  const indexKeys = groupKeys.userGroupsIndexKey(input.userSub, input.groupId);

  return {
    pk: primaryKeys.pk,
    sk: primaryKeys.sk,
    gsi1pk: indexKeys.gsi1pk,
    gsi1sk: indexKeys.gsi1sk,
    groupId: input.groupId,
    userSub: input.userSub,
    joinedAt,
    role,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/** Input for `putGroup`. */
export interface PutGroupInput {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt?: string;
}

/**
 * Writes a new group metadata item to the Groups table.
 *
 * Builds the full item via `buildGroupMetaItem` and writes it with PutCommand.
 * Returns the written item.
 */
export async function putGroup(input: PutGroupInput): Promise<GroupMetaItem> {
  const item = buildGroupMetaItem(input);

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Groups,
      Item: item,
    }),
  );

  return item;
}

/**
 * Retrieves a group metadata item by groupId.
 *
 * Returns `undefined` if no matching item is found.
 */
export async function getGroup(groupId: string): Promise<GroupMetaItem | undefined> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.Groups,
      Key: groupKeys.groupMetaKey(groupId),
    }),
  );

  return Item as GroupMetaItem | undefined;
}

/** Input for `addGroupMember`. */
export interface AddGroupMemberInput {
  groupId: string;
  userSub: string;
  /** Defaults to `'member'` if omitted. */
  role?: GroupRole;
}

/**
 * Atomically adds a membership item to the Groups table and increments the
 * group's `memberCount` by one.
 *
 * Uses a `TransactWriteCommand` with two operations:
 *   1. **Put** the membership item with `ConditionExpression: 'attribute_not_exists(pk)'`
 *      — idempotency guard so re-adding the same member can't double-count.
 *   2. **Update** the group meta item's `memberCount` with `ADD memberCount :one`,
 *      with `ConditionExpression: 'attribute_exists(pk)'` to ensure the group exists.
 *
 * Throws a descriptive error on `TransactionCanceledException`; the caller
 * decides how to handle it (already-member, group-not-found, etc.).
 *
 * Returns the built membership item.
 */
export async function addGroupMember(input: AddGroupMemberInput): Promise<GroupMemberItem> {
  const memberItem = buildGroupMemberItem(input);
  const metaKey = groupKeys.groupMetaKey(input.groupId);

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TableNames.Groups,
              Item: memberItem,
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: TableNames.Groups,
              Key: metaKey,
              UpdateExpression: 'ADD memberCount :one',
              ConditionExpression: 'attribute_exists(pk)',
              ExpressionAttributeValues: { ':one': 1 },
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'TransactionCanceledException'
    ) {
      throw new Error(
        `addGroupMember failed for groupId=${input.groupId} userSub=${input.userSub}: ` +
          `member may already exist or group does not exist (TransactionCanceledException).`,
      );
    }
    throw err;
  }

  return memberItem;
}

/**
 * Lists all membership items for a group by querying the primary index
 * with SK prefix `MEMBER#`. The group META item is excluded.
 *
 * Returns an empty array if the group has no members.
 */
export async function listGroupMembers(groupId: string): Promise<GroupMemberItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Groups,
      ...groupKeys.listGroupMembers(groupId),
    }),
  );

  return (Items ?? []) as GroupMemberItem[];
}

/**
 * Lists all groups a user belongs to by querying GSI1 with gsi1pk = `USER#<userSub>`.
 *
 * Returns the membership items (carrying `groupId`) for all groups the user is in.
 * Returns an empty array if the user belongs to no groups.
 */
export async function listUserGroups(userSub: string): Promise<GroupMemberItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Groups,
      ...groupKeys.listUserGroups(userSub),
    }),
  );

  return (Items ?? []) as GroupMemberItem[];
}
