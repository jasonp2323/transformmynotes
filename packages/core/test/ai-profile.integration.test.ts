/**
 * Integration test: updateAiProfile access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `buildUserProfileItem`,
 * `getUserProfileBySub`, and `updateAiProfile` — no mocks. The dynalite server
 * is started by `dynalite-global.ts` (globalSetup) and the production client is
 * pointed at it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildUserProfileItem } from '../src/auth/profile.js';
import { getUserProfileBySub, updateAiProfile } from '../src/db/users.js';

describe('updateAiProfile — write/read round-trips', () => {
  it('(a) stores all fields and round-trips them correctly', async () => {
    const sub = 'aiprofile-int-001';
    const profile = buildUserProfileItem({
      sub,
      email: 'aiprofile-int-001@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    const result = await updateAiProfile(sub, {
      focus: 'Grammar and vocabulary',
      level: 'Intermediate',
      goals: 'Pass the CELPE-Bras exam',
      preferredLanguage: 'pt-BR',
      customInstructions: 'Use simple sentences.',
    });

    expect(result.ok).toBe(true);

    const fetched = await getUserProfileBySub(sub);
    expect(fetched).not.toBeNull();
    expect(fetched!.aiProfile).toBeDefined();
    expect(fetched!.aiProfile!.focus).toBe('Grammar and vocabulary');
    expect(fetched!.aiProfile!.level).toBe('Intermediate');
    expect(fetched!.aiProfile!.goals).toBe('Pass the CELPE-Bras exam');
    expect(fetched!.aiProfile!.preferredLanguage).toBe('pt-BR');
    expect(fetched!.aiProfile!.customInstructions).toBe('Use simple sentences.');
    expect(typeof fetched!.aiProfile!.updatedAt).toBe('string');
    expect(fetched!.aiProfile!.updatedAt.length).toBeGreaterThan(0);
  });

  it('(b) returns not_found for a non-existent sub', async () => {
    const result = await updateAiProfile('aiprofile-int-nonexistent', {
      focus: 'anything',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('(c) only stores defined fields — undefined fields are omitted', async () => {
    const sub = 'aiprofile-int-002';
    const profile = buildUserProfileItem({
      sub,
      email: 'aiprofile-int-002@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    await updateAiProfile(sub, { focus: 'X' });

    const fetched = await getUserProfileBySub(sub);
    expect(fetched!.aiProfile!.focus).toBe('X');
    expect(fetched!.aiProfile!.level).toBeUndefined();
    expect(fetched!.aiProfile!.goals).toBeUndefined();
    expect(fetched!.aiProfile!.customInstructions).toBeUndefined();
  });

  it('(d) defaults preferredLanguage to "auto" when not supplied', async () => {
    const sub = 'aiprofile-int-003';
    const profile = buildUserProfileItem({
      sub,
      email: 'aiprofile-int-003@example.com',
      status: 'active',
      role: 'member',
    });

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    await updateAiProfile(sub, { focus: 'X' });

    const fetched = await getUserProfileBySub(sub);
    expect(fetched!.aiProfile!.preferredLanguage).toBe('auto');
  });
});
