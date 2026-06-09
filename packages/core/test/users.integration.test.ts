/**
 * Integration test: getUserProfileBySub access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, and `userDataKeys` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildUserProfileItem } from '../src/auth/profile.js';
import { getUserProfileBySub } from '../src/db/users.js';

describe('getUserProfileBySub — write/read round-trip', () => {
  it('returns the profile that was written', async () => {
    const sub = 'users-int-001';
    const profile = buildUserProfileItem({
      sub,
      email: 'users-int-001@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const result = await getUserProfileBySub(sub);

    expect(result).not.toBeNull();
    expect(result!.sub).toBe(sub);
    expect(result!.email).toBe('users-int-001@example.com');
    expect(result!.status).toBe('active');
    expect(result!.role).toBe('member');
  });

  it('returns null for a non-existent sub', async () => {
    const result = await getUserProfileBySub('nonexistent-sub');
    expect(result).toBeNull();
  });
});
