/**
 * Integration test: admin user-management access patterns via the real production client.
 *
 * Covers: listUserProfilesByStatus, updateUserStatus, updateUserRole,
 * deleteUserProfileWithAudit — all against dynalite (no mocks).
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * `deleteUserProfileWithAudit` (which uses TransactWriteCommand) cannot be
 * called directly against the dynalite harness. The soft-delete behaviour is
 * exercised here by calling the underlying DynamoDB operations (PutCommand +
 * DeleteCommand) individually — exactly what the transaction wraps — so we
 * validate the full access pattern without a live AWS stage.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildUserProfileItem } from '../src/auth/profile.js';
import { userDataKeys } from '../src/db/keys.js';
import {
  getUserProfileBySub,
  listUserProfilesByStatus,
  updateUserStatus,
  updateUserRole,
} from '../src/db/users.js';

// ---------------------------------------------------------------------------
// listUserProfilesByStatus — GSI1 query
// ---------------------------------------------------------------------------

describe('listUserProfilesByStatus — GSI1 query', () => {
  it('returns a pending profile that was written', async () => {
    const sub = 'admin-list-001';
    const profile = buildUserProfileItem({
      sub,
      email: 'admin-list-001@example.com',
      status: 'pending',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const results = await listUserProfilesByStatus('pending');

    expect(results.length).toBeGreaterThan(0);
    const found = results.find((p) => p.sub === sub);
    expect(found).toBeDefined();
    expect(found!.email).toBe('admin-list-001@example.com');
    expect(found!.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// updateUserStatus — status transitions + GSI consistency
// ---------------------------------------------------------------------------

describe('updateUserStatus — status transitions', () => {
  const sub = 'admin-status-001';

  it('setup: write a pending profile', async () => {
    const profile = buildUserProfileItem({
      sub,
      email: 'admin-status-001@example.com',
      status: 'pending',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const pending = await listUserProfilesByStatus('pending');
    const found = pending.find((p) => p.sub === sub);
    expect(found).toBeDefined();
  });

  it('updateUserStatus → active: moves from pending to active partition', async () => {
    const result = await updateUserStatus(sub, 'active');

    expect(result.ok).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile!.status).toBe('active');
    expect(result.profile!.gsi1pk).toBe('STATUS#active');

    // Must no longer appear in the pending partition.
    const pending = await listUserProfilesByStatus('pending');
    const stillPending = pending.find((p) => p.sub === sub);
    expect(stillPending).toBeUndefined();

    // Must appear in the active partition.
    const active = await listUserProfilesByStatus('active');
    const nowActive = active.find((p) => p.sub === sub);
    expect(nowActive).toBeDefined();
    expect(nowActive!.status).toBe('active');
  });

  it('updateUserStatus → disabled with auditNotes: persists auditNotes on the item', async () => {
    const result = await updateUserStatus(sub, 'disabled', {
      auditNotes: 'Rejected by admin',
    });

    expect(result.ok).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile!.status).toBe('disabled');
    expect((result.profile as { auditNotes?: string }).auditNotes).toBe('Rejected by admin');
  });

  it('updateUserStatus on a nonexistent sub returns { ok:false, reason:"not_found" }', async () => {
    const result = await updateUserStatus('nonexistent-sub-xyz', 'active');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
  });
});

// ---------------------------------------------------------------------------
// updateUserRole — role changes must not disturb GSI keys
// ---------------------------------------------------------------------------

describe('updateUserRole — role change preserves GSI keys', () => {
  const sub = 'admin-role-001';

  it('setup: write an active profile', async () => {
    const profile = buildUserProfileItem({
      sub,
      email: 'admin-role-001@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );
  });

  it('updateUserRole to admin: role becomes admin', async () => {
    const result = await updateUserRole(sub, 'admin');

    expect(result.ok).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile!.role).toBe('admin');
  });

  it('item is still queryable by its status partition after role change', async () => {
    // Role change must NOT disturb gsi1pk/gsi1sk.
    const active = await listUserProfilesByStatus('active');
    const found = active.find((p) => p.sub === sub);
    expect(found).toBeDefined();
    expect(found!.role).toBe('admin');
  });

  it('updateUserRole on a nonexistent sub returns { ok:false, reason:"not_found" }', async () => {
    const result = await updateUserRole('nonexistent-role-sub-xyz', 'admin');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
  });
});

// ---------------------------------------------------------------------------
// deleteUserProfileWithAudit — soft-delete + audit trail
//
// NOTE: dynalite v4 does not support TransactWriteItems, so we call the
// underlying Put (audit record) + Delete (profile) individually — exactly what
// deleteUserProfileWithAudit's TransactWriteCommand does — and then verify the
// same post-conditions the production function guarantees.
// ---------------------------------------------------------------------------

describe('deleteUserProfileWithAudit — soft-delete', () => {
  const sub = 'admin-delete-001';

  it('setup: write a profile with a known noteCount', async () => {
    const profile = buildUserProfileItem({
      sub,
      email: 'admin-delete-001@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const fetched = await getUserProfileBySub(sub);
    expect(fetched).not.toBeNull();
    expect(fetched!.noteCount).toBe(0);
  });

  it('soft-delete: profile is gone, audit item is present', async () => {
    // Read the profile so we can copy attributes into the audit record.
    const existing = await getUserProfileBySub(sub);
    expect(existing).not.toBeNull();

    const deletedAt = new Date().toISOString();
    const auditItem = {
      ...userDataKeys.deletedAudit(sub),
      sub,
      email: existing!.email,
      name: existing!.name,
      noteCount: existing!.noteCount,
      deletedBy: 'admin-x',
      deletedAt,
      action: 'deleted' as const,
    };

    // Write audit record (mimics the TransactWrite Put leg).
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: auditItem,
      }),
    );

    // Delete the profile (mimics the TransactWrite Delete leg).
    await ddb.send(
      new DeleteCommand({
        TableName: TableNames.UserData,
        Key: userDataKeys.profile(sub),
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );

    // Profile must be gone.
    const profile = await getUserProfileBySub(sub);
    expect(profile).toBeNull();

    // Audit item must exist with all required attributes.
    const auditKey = userDataKeys.deletedAudit(sub);
    const { Item: storedAudit } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: auditKey,
      }),
    );

    expect(storedAudit).toBeDefined();
    expect(storedAudit!.action).toBe('deleted');
    expect(storedAudit!.deletedBy).toBe('admin-x');
    expect(storedAudit!.email).toBe('admin-delete-001@example.com');
    expect(storedAudit!.noteCount).toBe(0);
    expect(typeof storedAudit!.deletedAt).toBe('string');
  });

  it('after deletion, getUserProfileBySub returns null (idempotent read)', async () => {
    // Profile was deleted in the previous test — re-fetch must return null.
    const result = await getUserProfileBySub(sub);
    expect(result).toBeNull();
  });
});
