/**
 * Integration test: AI config data model (M19.1.1) — `aiConfigKeys` builders +
 * DB-backed `resolveAiConfig()` against dynalite.
 *
 * Exercises the real `ddb` DocumentClient, `aiConfigKeys`, and the
 * `resolveAiConfig()` deep-merge/fallback logic — no mocks. The dynalite server
 * is started by `dynalite-global.ts` (globalSetup); the production client is
 * pointed at it via `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * the CONFIG#AI items are written with individual PutCommands.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { aiConfigKeys } from '../src/db/keys.js';
import {
  resolveAiConfig,
  bustAiConfigCache,
  buildSecretDefaults,
} from '../src/study/config.js';

const ENV_VARS = {
  SST_RESOURCE_BEDROCK_MODEL_ID_value: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  SST_RESOURCE_STUDY_SYSTEM_PROMPT_value: 'Env base system prompt',
  SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value: 'Env flashcards prompt',
  SST_RESOURCE_STUDY_QUIZ_PROMPT_value: 'Env quiz prompt',
  SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value: 'Env assignment prompt',
  SST_RESOURCE_STUDY_SUMMARY_PROMPT_value: 'Env summary prompt',
};

beforeAll(async () => {
  // Ensure buildSecretDefaults() produces a valid baseline for every case.
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;

  // Clean the CONFIG#AI partition to guarantee a fresh slate. This file and
  // ai-config-db.integration.test.ts share one dynalite table/partition, and
  // Vitest does not guarantee cross-file execution order, so start from a
  // known state rather than assuming nothing else has written here yet.
  await ddb.send(new DeleteCommand({ TableName: TableNames.UserData, Key: aiConfigKeys.current() }));
  for (const seq of [1, 2, 3]) {
    await ddb.send(
      new DeleteCommand({ TableName: TableNames.UserData, Key: aiConfigKeys.version(seq) }),
    );
  }
});

beforeEach(() => {
  // The module-level cache must never leak between cases.
  bustAiConfigCache();
});

// ---------------------------------------------------------------------------
// Pure builder checks (no I/O)
// ---------------------------------------------------------------------------

describe('aiConfigKeys — pure builder checks', () => {
  it('current() returns CONFIG#AI / CURRENT', () => {
    const key = aiConfigKeys.current();
    expect(key.pk).toBe('CONFIG#AI');
    expect(key.sk).toBe('CURRENT');
  });

  it('version(2) zero-pads the SK to 12 digits', () => {
    const key = aiConfigKeys.version(2);
    expect(key.pk).toBe('CONFIG#AI');
    expect(key.sk).toBe('VERSION#000000000002');
  });

  it('listVersions() builds an ascending CONFIG#AI VERSION# prefix query', () => {
    const params = aiConfigKeys.listVersions();
    expect(params.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :prefix)');
    expect(params.ExpressionAttributeValues[':pk']).toBe('CONFIG#AI');
    expect(params.ExpressionAttributeValues[':prefix']).toBe('VERSION#');
    expect(params.ScanIndexForward).toBe(true);
  });

  it('parseVersionSk strips zero-padding back to the integer seq', () => {
    expect(aiConfigKeys.parseVersionSk('VERSION#000000000007')).toEqual({ seq: 7 });
  });

  it('parseVersionSk throws on a malformed key', () => {
    expect(() => aiConfigKeys.parseVersionSk('CURRENT')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveAiConfig — DB-backed deep-merge + fallback round-trips
// ---------------------------------------------------------------------------

describe('resolveAiConfig — partial CURRENT item deep-merges over env defaults', () => {
  it('setup: write a partial CURRENT item', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...aiConfigKeys.current(),
          baseSystemPrompt: 'DB prompt',
          maxTokens: 2048,
          version: 3,
        },
      }),
    );
  });

  it('DB values win where present; env defaults fill the rest', async () => {
    bustAiConfigCache();
    const config = await resolveAiConfig();
    expect(config.baseSystemPrompt).toBe('DB prompt');
    expect(config.maxTokens).toBe(2048);
    expect(config.version).toBe(3);
    // Fall back to env defaults where the DB item is silent.
    expect(config.modelId).toBe(ENV_VARS.SST_RESOURCE_BEDROCK_MODEL_ID_value);
    expect(config.promptOverrides.flashcards).toBe('Env flashcards prompt');
  });
});

describe('resolveAiConfig — falls back to env defaults when no CURRENT item', () => {
  it('setup: delete the CURRENT item', async () => {
    await ddb.send(
      new DeleteCommand({
        TableName: TableNames.UserData,
        Key: aiConfigKeys.current(),
      }),
    );
  });

  it('returns the env-default baseline', async () => {
    bustAiConfigCache();
    const config = await resolveAiConfig();
    const defaults = buildSecretDefaults();
    expect(config.baseSystemPrompt).toBe(ENV_VARS.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value);
    expect(config.modelId).toBe(ENV_VARS.SST_RESOURCE_BEDROCK_MODEL_ID_value);
    expect(config.maxTokens).toBe(defaults.maxTokens);
  });
});

// ---------------------------------------------------------------------------
// Version history — VERSION# items list in ascending sequence order
// ---------------------------------------------------------------------------

describe('aiConfigKeys.listVersions — ascending VERSION# scan', () => {
  it('setup: write VERSION#1 and VERSION#2 snapshots', async () => {
    for (const seq of [1, 2]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: {
            ...aiConfigKeys.version(seq),
            version: seq,
            updatedBy: `admin-${seq}`,
            updatedAt: new Date(2024, 0, seq).toISOString(),
          },
        }),
      );
    }
  });

  it('returns the two snapshots in ascending sort-key order', async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.UserData,
        ...aiConfigKeys.listVersions(),
      }),
    );
    expect(Items).toHaveLength(2);
    expect(Items![0].sk).toBe('VERSION#000000000001');
    expect(Items![1].sk).toBe('VERSION#000000000002');
    expect(aiConfigKeys.parseVersionSk(Items![0].sk).seq).toBe(1);
    expect(aiConfigKeys.parseVersionSk(Items![1].sk).seq).toBe(2);
  });
});
