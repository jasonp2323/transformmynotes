/**
 * Integration test: AI config DB access functions (M19.1.2).
 *
 * Exercises getCurrentAiConfig, saveAiConfig, listAiConfigVersions,
 * getAiConfigVersion, and revertAiConfig against dynalite (in-memory DynamoDB).
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup);
 * the production client is pointed at it via `integration-env.ts` (setupFiles).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { aiConfigKeys } from '../src/db/keys.js';
import {
  getCurrentAiConfig,
  saveAiConfig,
  listAiConfigVersions,
  getAiConfigVersion,
  revertAiConfig,
} from '../src/db/ai-config.js';
import { bustAiConfigCache, type AiConfigInput } from '../src/study/config.js';

beforeAll(async () => {
  process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
  process.env.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value = 'Env base system prompt';

  // Clean the CONFIG#AI partition to guarantee a fresh slate.
  await ddb.send(new DeleteCommand({ TableName: TableNames.UserData, Key: aiConfigKeys.current() }));
  for (const seq of [1, 2, 3]) {
    await ddb.send(
      new DeleteCommand({ TableName: TableNames.UserData, Key: aiConfigKeys.version(seq) }),
    );
  }
});

beforeEach(() => {
  bustAiConfigCache();
});

function fixture(overrides: Partial<AiConfigInput> = {}): AiConfigInput {
  return {
    baseSystemPrompt: 'Body prompt',
    promptOverrides: {},
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    modelOverrides: {},
    maxTokens: 4096,
    temperature: 0.5,
    topP: 0.9,
    languageDefault: 'auto',
    perUserDailyGenerationCap: 100,
    maxNotesPerRun: 25,
    tokenBudget: 8192,
    pollyVoiceId: 'Camila',
    pollyEngine: 'neural',
    speedRate: 'medium',
    enabledMaterialTypes: { flashcards: true, quiz: true, assignment: true, summary: true },
    generationEnabled: true,
    ...overrides,
  };
}

describe('ai-config DB round-trip', () => {
  it('getCurrentAiConfig() returns null when nothing written', async () => {
    const result = await getCurrentAiConfig();
    expect(result).toBeNull();
  });

  it('saveAiConfig(fixture(), admin-1) returns version 1 and writes CURRENT', async () => {
    const result = await saveAiConfig(fixture(), 'admin-1');
    expect(result).toEqual({ version: 1 });

    const cur = await getCurrentAiConfig();
    expect(cur).not.toBeNull();
    expect(cur!.version).toBe(1);
    expect(cur!.baseSystemPrompt).toBe('Body prompt');
    expect(cur!.updatedBy).toBe('admin-1');
    expect('pk' in (cur as object)).toBe(false);
    expect('sk' in (cur as object)).toBe(false);
  });

  it('second save returns version 2 and lists DESCENDING', async () => {
    const result = await saveAiConfig(fixture({ baseSystemPrompt: 'Body prompt v2' }), 'admin-1');
    expect(result).toEqual({ version: 2 });

    const versions = await listAiConfigVersions();
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(2);
    expect(versions[1].version).toBe(1);
  });

  it('getAiConfigVersion(1) returns the first snapshot; getAiConfigVersion(99) is null', async () => {
    const v1 = await getAiConfigVersion(1);
    expect(v1).not.toBeNull();
    expect(v1!.version).toBe(1);
    expect(v1!.baseSystemPrompt).toBe('Body prompt');

    const v99 = await getAiConfigVersion(99);
    expect(v99).toBeNull();
  });

  it('revertAiConfig(1, admin-2) creates version 3 from version 1s body', async () => {
    const result = await revertAiConfig(1, 'admin-2');
    expect(result).toEqual({ version: 3 });

    const cur = await getCurrentAiConfig();
    expect(cur).not.toBeNull();
    expect(cur!.version).toBe(3);
    expect(cur!.updatedBy).toBe('admin-2');
    expect(cur!.baseSystemPrompt).toBe('Body prompt');

    const versions = await listAiConfigVersions();
    expect(versions).toHaveLength(3);
  });
});
