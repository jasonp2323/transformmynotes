/**
 * Integration test: ensureActiveAdminProfile access pattern via the real
 * production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `buildUserProfileItem` —
 * no mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildUserProfileItem } from '../src/auth/profile.js';
import { getUserProfileBySub, ensureActiveAdminProfile } from '../src/db/users.js';

describe('ensureActiveAdminProfile', () => {
  it('creates an active admin profile when none exists', async () => {
    const sub = 'ensure-admin-001';

    const result = await ensureActiveAdminProfile({
      sub,
      email: 'ensure-admin-001@example.com',
      name: 'Admin One',
    });

    expect(result.sub).toBe(sub);
    expect(result.status).toBe('active');
    expect(result.role).toBe('admin');
    expect(result.email).toBe('ensure-admin-001@example.com');
    expect(result.name).toBe('Admin One');

    // Verify the item is readable from DynamoDB.
    const stored = await getUserProfileBySub(sub);
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe('active');
    expect(stored!.role).toBe('admin');
  });

  it('returns the existing profile unchanged when it is already active', async () => {
    const sub = 'ensure-admin-002';
    const existing = buildUserProfileItem({
      sub,
      email: 'ensure-admin-002@example.com',
      name: 'Admin Two',
      status: 'active',
      role: 'admin',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: existing,
      }),
    );

    const result = await ensureActiveAdminProfile({
      sub,
      email: 'ensure-admin-002@example.com',
      name: 'Admin Two',
    });

    expect(result.status).toBe('active');
    expect(result.role).toBe('admin');
    // createdAt must be the original value (not re-stamped).
    expect(result.createdAt).toBe(existing.createdAt);
  });

  it('activates a pending profile and promotes it to admin role', async () => {
    const sub = 'ensure-admin-003';
    const pending = buildUserProfileItem({
      sub,
      email: 'ensure-admin-003@example.com',
      name: 'Pending Admin',
      status: 'pending',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: pending,
      }),
    );

    const result = await ensureActiveAdminProfile({
      sub,
      email: 'ensure-admin-003@example.com',
      name: 'Pending Admin',
    });

    expect(result.status).toBe('active');
    expect(result.role).toBe('admin');
    // createdAt must be preserved from the original pending item.
    expect(result.createdAt).toBe(pending.createdAt);

    // Confirm the stored item reflects the activation.
    const stored = await getUserProfileBySub(sub);
    expect(stored!.status).toBe('active');
    expect(stored!.role).toBe('admin');
  });

  it('is idempotent: calling twice returns the same active admin profile', async () => {
    const sub = 'ensure-admin-004';

    const first = await ensureActiveAdminProfile({
      sub,
      email: 'ensure-admin-004@example.com',
      name: 'Idempotent Admin',
    });

    const second = await ensureActiveAdminProfile({
      sub,
      email: 'ensure-admin-004@example.com',
      name: 'Idempotent Admin',
    });

    expect(first.status).toBe('active');
    expect(second.status).toBe('active');
    expect(second.createdAt).toBe(first.createdAt);
  });
});
