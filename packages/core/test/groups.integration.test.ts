/**
 * Integration test: Groups access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `groupKeys`,
 * `putGroup`, `getGroup`, `listGroupMembers`, and `listUserGroups` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * `addGroupMember` (which uses TransactWriteCommand) cannot be called directly
 * against the dynalite harness. The membership write + memberCount update
 * behaviour is instead exercised here by calling the underlying DynamoDB
 * operations (PutCommand + UpdateCommand) individually — exactly what the
 * transaction wraps — so we validate the full read access patterns (including
 * GSI1) without a live AWS stage.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { groupKeys } from '../src/db/keys.js';
import {
  putGroup,
  getGroup,
  buildGroupMemberItem,
  listGroupMembers,
  listUserGroups,
  buildGroupMetaItem,
} from '../src/db/groups.js';

// ---------------------------------------------------------------------------
// Helper: write a membership item + increment memberCount individually.
// Mimics exactly what `addGroupMember`'s TransactWriteCommand does as two
// separate operations (dynalite does not support TransactWriteItems).
// ---------------------------------------------------------------------------

async function writeGroupMember(groupId: string, userSub: string, role: 'member' | 'admin' = 'member') {
  const memberItem = buildGroupMemberItem({ groupId, userSub, role });

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Groups,
      Item: memberItem,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );

  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Groups,
      Key: groupKeys.groupMetaKey(groupId),
      UpdateExpression: 'ADD memberCount :one',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':one': 1 },
    }),
  );

  return memberItem;
}

// ---------------------------------------------------------------------------
// putGroup / getGroup — write/read round-trip
// ---------------------------------------------------------------------------

describe('Groups — putGroup / getGroup round-trip', () => {
  it('reads back the exact item that was written', async () => {
    const groupId = 'rt-group-001';
    const item = await putGroup({
      groupId,
      name: 'Round-trip Group',
      description: 'A test group for round-trip verification',
      createdBy: 'user-sub-rt-001',
    });

    expect(item.pk).toBe(`GROUP#${groupId}`);
    expect(item.sk).toBe('META');
    expect(item.groupId).toBe(groupId);
    expect(item.name).toBe('Round-trip Group');
    expect(item.description).toBe('A test group for round-trip verification');
    expect(item.createdBy).toBe('user-sub-rt-001');
    expect(item.memberCount).toBe(0);
    expect(typeof item.createdAt).toBe('string');

    const fetched = await getGroup(groupId);
    expect(fetched).toBeDefined();
    expect(fetched).toEqual(item);
  });

  it('reads back a group without optional description', async () => {
    const groupId = 'rt-group-nodesc';
    const item = await putGroup({
      groupId,
      name: 'No-description Group',
      createdBy: 'user-sub-rt-002',
    });

    expect(item.description).toBeUndefined();

    const fetched = await getGroup(groupId);
    expect(fetched).toBeDefined();
    expect(fetched!.description).toBeUndefined();
    expect(fetched!.name).toBe('No-description Group');
  });

  it('returns undefined for a non-existent group', async () => {
    const result = await getGroup('does-not-exist-xyz-999');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listGroupMembers — membership writes + memberCount
// ---------------------------------------------------------------------------

describe('Groups — listGroupMembers and memberCount', () => {
  const GROUP_ID = 'member-test-group-001';
  const USER_A = 'user-sub-member-a';
  const USER_B = 'user-sub-member-b';

  it('setup: creates the group', async () => {
    await putGroup({ groupId: GROUP_ID, name: 'Member Test Group', createdBy: 'admin-sub' });
    const meta = await getGroup(GROUP_ID);
    expect(meta).toBeDefined();
    expect(meta!.memberCount).toBe(0);
  });

  it('writing a membership item makes it appear in listGroupMembers', async () => {
    const memberItem = await writeGroupMember(GROUP_ID, USER_A);

    expect(memberItem.pk).toBe(`GROUP#${GROUP_ID}`);
    expect(memberItem.sk).toBe(`MEMBER#${USER_A}`);
    expect(memberItem.gsi1pk).toBe(`USER#${USER_A}`);
    expect(memberItem.gsi1sk).toBe(`GROUP#${GROUP_ID}`);
    expect(memberItem.groupId).toBe(GROUP_ID);
    expect(memberItem.userSub).toBe(USER_A);
    expect(memberItem.role).toBe('member');

    const members = await listGroupMembers(GROUP_ID);
    expect(members.length).toBe(1);
    expect(members[0].userSub).toBe(USER_A);
  });

  it('memberCount increments to 1 after adding one member', async () => {
    const meta = await getGroup(GROUP_ID);
    expect(meta).toBeDefined();
    expect(meta!.memberCount).toBe(1);
  });

  it('adding a second member with role=admin is reflected in listGroupMembers', async () => {
    const memberItem = await writeGroupMember(GROUP_ID, USER_B, 'admin');
    expect(memberItem.role).toBe('admin');

    const members = await listGroupMembers(GROUP_ID);
    const adminMember = members.find((m) => m.userSub === USER_B);
    expect(adminMember).toBeDefined();
    expect(adminMember!.role).toBe('admin');
  });

  it('memberCount increments to 2 after adding a second member', async () => {
    const meta = await getGroup(GROUP_ID);
    expect(meta).toBeDefined();
    expect(meta!.memberCount).toBe(2);
  });

  it('listGroupMembers returns only MEMBER# items, not the META item', async () => {
    const members = await listGroupMembers(GROUP_ID);
    expect(members.length).toBe(2);
    for (const m of members) {
      expect(m.sk.startsWith('MEMBER#')).toBe(true);
      expect(m.sk).not.toBe('META');
    }
  });

  it('listGroupMembers returns items for both members', async () => {
    const members = await listGroupMembers(GROUP_ID);
    const userSubs = members.map((m) => m.userSub);
    expect(userSubs).toContain(USER_A);
    expect(userSubs).toContain(USER_B);
  });
});

// ---------------------------------------------------------------------------
// listUserGroups — inverted index (GSI1): user → groups
// ---------------------------------------------------------------------------

describe('Groups — listUserGroups (inverted GSI1 index)', () => {
  const GROUP_X = 'gsi-group-x';
  const GROUP_Y = 'gsi-group-y';
  const USER_MULTI = 'user-sub-multi-grp';
  const USER_SINGLE = 'user-sub-single-grp';
  const USER_NONE = 'user-sub-no-grp';

  it('setup: creates two groups and adds the same user to both', async () => {
    await putGroup({ groupId: GROUP_X, name: 'GSI Group X', createdBy: 'admin' });
    await putGroup({ groupId: GROUP_Y, name: 'GSI Group Y', createdBy: 'admin' });

    await writeGroupMember(GROUP_X, USER_MULTI);
    await writeGroupMember(GROUP_Y, USER_MULTI);
    await writeGroupMember(GROUP_X, USER_SINGLE);
  });

  it('listUserGroups returns both groups for a multi-group user', async () => {
    const groups = await listUserGroups(USER_MULTI);
    expect(groups.length).toBe(2);
    const groupIds = groups.map((g) => g.groupId);
    expect(groupIds).toContain(GROUP_X);
    expect(groupIds).toContain(GROUP_Y);
  });

  it('listUserGroups returns only the correct group for a single-group user', async () => {
    const groups = await listUserGroups(USER_SINGLE);
    expect(groups.length).toBe(1);
    expect(groups[0].groupId).toBe(GROUP_X);
  });

  it('listUserGroups does not include groups the user is not in', async () => {
    const groups = await listUserGroups(USER_SINGLE);
    const groupIds = groups.map((g) => g.groupId);
    expect(groupIds).not.toContain(GROUP_Y);
  });

  it('listUserGroups returns an empty array for a user in no groups', async () => {
    const groups = await listUserGroups(USER_NONE);
    expect(groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Idempotency / no double-count: PutItem condition_not_exists guard
// Writing the same membership item twice fails on the condition check and
// memberCount must remain unchanged.
// ---------------------------------------------------------------------------

describe('Groups — membership idempotency guard (attribute_not_exists)', () => {
  const GROUP_ID = 'idempotent-group-001';
  const USER_SUB = 'user-sub-idem-001';

  it('setup: creates the group and adds the member once', async () => {
    await putGroup({ groupId: GROUP_ID, name: 'Idempotency Test Group', createdBy: 'admin' });
    await writeGroupMember(GROUP_ID, USER_SUB);

    const meta = await getGroup(GROUP_ID);
    expect(meta!.memberCount).toBe(1);
  });

  it('writing the same member a second time throws a conditional check error', async () => {
    // The PutCommand with attribute_not_exists(pk) must reject the duplicate write.
    // dynalite returns the message "The conditional request failed" (same semantics
    // as ConditionalCheckFailedException from real DynamoDB).
    const memberItem = buildGroupMemberItem({ groupId: GROUP_ID, userSub: USER_SUB });
    await expect(
      ddb.send(
        new PutCommand({
          TableName: TableNames.Groups,
          Item: memberItem,
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      ),
    ).rejects.toThrow(/conditional/i);
  });

  it('memberCount remains 1 after the failed second write', async () => {
    const meta = await getGroup(GROUP_ID);
    expect(meta).toBeDefined();
    expect(meta!.memberCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pure item builders — unit-style checks (no DynamoDB I/O)
// ---------------------------------------------------------------------------

describe('buildGroupMetaItem', () => {
  it('defaults memberCount to 0 when not supplied', () => {
    const item = buildGroupMetaItem({ groupId: 'g', name: 'N', createdBy: 'u' });
    expect(item.memberCount).toBe(0);
  });

  it('accepts an explicit memberCount', () => {
    const item = buildGroupMetaItem({ groupId: 'g', name: 'N', createdBy: 'u', memberCount: 5 });
    expect(item.memberCount).toBe(5);
  });

  it('defaults createdAt to a valid ISO-8601 string', () => {
    const before = new Date().toISOString();
    const item = buildGroupMetaItem({ groupId: 'g', name: 'N', createdBy: 'u' });
    const after = new Date().toISOString();
    expect(item.createdAt >= before).toBe(true);
    expect(item.createdAt <= after).toBe(true);
  });

  it('uses the provided createdAt when supplied', () => {
    const ts = '2025-01-15T10:00:00.000Z';
    const item = buildGroupMetaItem({ groupId: 'g', name: 'N', createdBy: 'u', createdAt: ts });
    expect(item.createdAt).toBe(ts);
  });
});

describe('buildGroupMemberItem', () => {
  it('defaults role to "member" when not supplied', () => {
    const item = buildGroupMemberItem({ groupId: 'g', userSub: 'u' });
    expect(item.role).toBe('member');
  });

  it('accepts role = "admin"', () => {
    const item = buildGroupMemberItem({ groupId: 'g', userSub: 'u', role: 'admin' });
    expect(item.role).toBe('admin');
  });

  it('defaults joinedAt to a valid ISO-8601 string', () => {
    const before = new Date().toISOString();
    const item = buildGroupMemberItem({ groupId: 'g', userSub: 'u' });
    const after = new Date().toISOString();
    expect(item.joinedAt >= before).toBe(true);
    expect(item.joinedAt <= after).toBe(true);
  });

  it('populates all primary and GSI keys correctly', () => {
    const item = buildGroupMemberItem({ groupId: 'grp-1', userSub: 'sub-1' });
    expect(item.pk).toBe('GROUP#grp-1');
    expect(item.sk).toBe('MEMBER#sub-1');
    expect(item.gsi1pk).toBe('USER#sub-1');
    expect(item.gsi1sk).toBe('GROUP#grp-1');
  });
});
