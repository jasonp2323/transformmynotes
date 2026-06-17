import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the DocumentClient so resolveAiConfig() never hits real DynamoDB.
const sendMock = vi.fn();
vi.mock('../../src/db/client', () => ({
  ddb: { send: (...args: unknown[]) => sendMock(...args) },
  TableNames: { UserData: 'UserData-test' },
}));

import {
  AI_MODEL_ALLOWLIST,
  MAX_TOKENS_BY_TYPE,
  buildSecretDefaults,
  deepMergeAiConfig,
  validateRequired,
  resolveAiConfig,
  bustAiConfigCache,
  type AiConfig,
} from '../../src/study/config';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TYPE_PROMPTS } from '../../src/study/default-prompts';

const ENV_VARS = {
  SST_RESOURCE_BEDROCK_MODEL_ID_value: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  SST_RESOURCE_STUDY_SYSTEM_PROMPT_value: 'Base system prompt text',
  SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value: 'Flashcards prompt text',
  SST_RESOURCE_STUDY_QUIZ_PROMPT_value: 'Quiz prompt text',
  SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value: 'Assignment prompt text',
  SST_RESOURCE_STUDY_SUMMARY_PROMPT_value: 'Summary prompt text',
  SST_RESOURCE_STUDY_GLOSSARY_PROMPT_value: 'Glossary prompt text',
  SST_RESOURCE_STUDY_GUIDE_PROMPT_value: 'Study guide prompt text',
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;
}
function clearEnv() {
  for (const k of Object.keys(ENV_VARS)) delete process.env[k];
}

describe('MAX_TOKENS_BY_TYPE', () => {
  it('has flashcards=4096', () => expect(MAX_TOKENS_BY_TYPE.flashcards).toBe(4096));
  it('has quiz=4096', () => expect(MAX_TOKENS_BY_TYPE.quiz).toBe(4096));
  it('has assignment=2048', () => expect(MAX_TOKENS_BY_TYPE.assignment).toBe(2048));
  it('has summary=1024', () => expect(MAX_TOKENS_BY_TYPE.summary).toBe(1024));
  it('has glossary=2048', () => expect(MAX_TOKENS_BY_TYPE.glossary).toBe(2048));
  it('has study_guide=4096', () => expect(MAX_TOKENS_BY_TYPE.study_guide).toBe(4096));
});

describe('AI_MODEL_ALLOWLIST', () => {
  it('is locked to exactly one entry — the us. cross-region inference profile', () => {
    expect(AI_MODEL_ALLOWLIST).toHaveLength(1);
    expect(AI_MODEL_ALLOWLIST).toContain('us.anthropic.claude-3-5-sonnet-20241022-v2:0');
  });
  it('does NOT include the bare foundation-model id, Haiku ids, or legacy Sonnet', () => {
    expect(AI_MODEL_ALLOWLIST).not.toContain('anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(AI_MODEL_ALLOWLIST).not.toContain('anthropic.claude-3-haiku-20240307-v1:0');
    expect(AI_MODEL_ALLOWLIST).not.toContain('us.anthropic.claude-3-haiku-20240307-v1:0');
    expect(AI_MODEL_ALLOWLIST).not.toContain('anthropic.claude-3-sonnet-20240229-v1:0');
  });
});

describe('buildSecretDefaults', () => {
  beforeEach(setEnv);
  afterEach(clearEnv);

  it('reads modelId and baseSystemPrompt from env', () => {
    const c = buildSecretDefaults();
    expect(c.modelId).toBe(ENV_VARS.SST_RESOURCE_BEDROCK_MODEL_ID_value);
    expect(c.baseSystemPrompt).toBe('Base system prompt text');
  });

  it('populates all six prompt overrides from env', () => {
    const c = buildSecretDefaults();
    expect(c.promptOverrides.flashcards).toBe('Flashcards prompt text');
    expect(c.promptOverrides.quiz).toBe('Quiz prompt text');
    expect(c.promptOverrides.assignment).toBe('Assignment prompt text');
    expect(c.promptOverrides.summary).toBe('Summary prompt text');
    expect(c.promptOverrides.glossary).toBe('Glossary prompt text');
    expect(c.promptOverrides.study_guide).toBe('Study guide prompt text');
  });

  it('falls back to the bundled default for a prompt-override key when its env var is unset (M19 fix)', () => {
    delete process.env.SST_RESOURCE_STUDY_QUIZ_PROMPT_value;
    const c = buildSecretDefaults();
    // The env var wins when set; otherwise the bundled DEFAULT_TYPE_PROMPTS
    // constant is used so the field is never empty (no filesystem dependency).
    expect(c.promptOverrides.quiz).toBe(DEFAULT_TYPE_PROMPTS.quiz);
    expect(c.promptOverrides.flashcards).toBe('Flashcards prompt text');
  });

  it('produces a complete config with hardcoded fallbacks', () => {
    const c = buildSecretDefaults();
    expect(c.maxTokens).toBe(4096);
    expect(c.temperature).toBe(0.5);
    expect(c.topP).toBe(0.9);
    expect(c.languageDefault).toBe('auto');
    expect(c.perUserDailyGenerationCap).toBe(100);
    expect(c.maxNotesPerRun).toBe(25);
    expect(c.tokenBudget).toBe(8192);
    expect(c.pollyVoiceId).toBe('Camila');
    expect(c.pollyEngine).toBe('neural');
    expect(c.speedRate).toBe('medium');
    expect(c.enabledMaterialTypes).toEqual({
      flashcards: true,
      quiz: true,
      assignment: true,
      summary: true,
      glossary: true,
      study_guide: true,
    });
    expect(c.generationEnabled).toBe(true);
    expect(c.version).toBe(0);
    expect(c.updatedBy).toBe('system');
  });

  it('leaves modelId empty but fills prompts from bundled defaults when env unset (M19 fix)', () => {
    clearEnv();
    const c = buildSecretDefaults();
    // modelId still has NO fallback — validateRequired fails loud on it.
    expect(c.modelId).toBe('');
    // baseSystemPrompt + every per-type override now fall back to the bundled
    // constants so the deployed web runtime never returns empty prompts.
    expect(c.baseSystemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(c.promptOverrides.flashcards).toBe(DEFAULT_TYPE_PROMPTS.flashcards);
    expect(c.promptOverrides.study_guide).toBe(DEFAULT_TYPE_PROMPTS.study_guide);
  });
});

describe('deepMergeAiConfig', () => {
  beforeEach(setEnv);
  afterEach(clearEnv);

  it('DB scalar wins over the default', () => {
    const merged = deepMergeAiConfig(buildSecretDefaults(), {
      maxTokens: 2048,
      baseSystemPrompt: 'DB prompt',
    });
    expect(merged.maxTokens).toBe(2048);
    expect(merged.baseSystemPrompt).toBe('DB prompt');
  });

  it('ignores undefined override values (does not blow away defaults)', () => {
    const merged = deepMergeAiConfig(buildSecretDefaults(), {
      maxTokens: undefined,
    } as Partial<AiConfig>);
    expect(merged.maxTokens).toBe(4096);
  });

  it('merges record fields per key, keeping default keys not in the override', () => {
    const merged = deepMergeAiConfig(buildSecretDefaults(), {
      promptOverrides: { flashcards: 'DB flashcards' },
      modelOverrides: { quiz: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0' },
      enabledMaterialTypes: { summary: false },
    });
    // overridden keys win
    expect(merged.promptOverrides.flashcards).toBe('DB flashcards');
    // non-overridden default keys survive
    expect(merged.promptOverrides.quiz).toBe('Quiz prompt text');
    // model override added without dropping anything
    expect(merged.modelOverrides.quiz).toBe('us.anthropic.claude-3-5-sonnet-20241022-v2:0');
    // per-key flag merge
    expect(merged.enabledMaterialTypes.summary).toBe(false);
    expect(merged.enabledMaterialTypes.flashcards).toBe(true);
  });
});

describe('validateRequired', () => {
  beforeEach(setEnv);
  afterEach(clearEnv);

  it('passes for a complete config', () => {
    expect(() => validateRequired(buildSecretDefaults())).not.toThrow();
  });

  it('throws when baseSystemPrompt is empty/whitespace', () => {
    const c = { ...buildSecretDefaults(), baseSystemPrompt: '   ' };
    expect(() => validateRequired(c)).toThrow(/baseSystemPrompt/);
  });

  it('throws when modelId is empty', () => {
    const c = { ...buildSecretDefaults(), modelId: '' };
    expect(() => validateRequired(c)).toThrow(/modelId/);
  });
});

describe('resolveAiConfig — caching', () => {
  beforeEach(() => {
    setEnv();
    sendMock.mockReset();
    bustAiConfigCache();
  });
  afterEach(() => {
    clearEnv();
    bustAiConfigCache();
  });

  it('hits .send once, then serves from cache within TTL', async () => {
    sendMock.mockResolvedValue({ Item: undefined });

    const first = await resolveAiConfig();
    const second = await resolveAiConfig();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second); // same cached object
    // Falls back to env defaults when no CURRENT item exists.
    expect(first.baseSystemPrompt).toBe('Base system prompt text');
    expect(first.modelId).toBe(ENV_VARS.SST_RESOURCE_BEDROCK_MODEL_ID_value);
  });

  it('bustAiConfigCache() forces a fresh .send', async () => {
    sendMock.mockResolvedValue({ Item: undefined });

    await resolveAiConfig();
    bustAiConfigCache();
    await resolveAiConfig();

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('deep-merges a partial DB CURRENT item over env defaults', async () => {
    sendMock.mockResolvedValue({
      Item: { pk: 'CONFIG#AI', sk: 'CURRENT', baseSystemPrompt: 'DB prompt', maxTokens: 2048, version: 3 },
    });

    const config = await resolveAiConfig();
    expect(config.baseSystemPrompt).toBe('DB prompt'); // DB wins
    expect(config.maxTokens).toBe(2048);
    expect(config.version).toBe(3);
    // Falls back to env where DB is silent.
    expect(config.modelId).toBe(ENV_VARS.SST_RESOURCE_BEDROCK_MODEL_ID_value);
    expect(config.promptOverrides.flashcards).toBe('Flashcards prompt text');
  });

  it('throws (fail-loud) when required fields are missing from both DB and env', async () => {
    clearEnv(); // no env defaults
    sendMock.mockResolvedValue({ Item: undefined });
    await expect(resolveAiConfig()).rejects.toThrow(/baseSystemPrompt|modelId/);
  });

});
