import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAiConfig, MAX_TOKENS_BY_TYPE } from '../../src/study/config';

const ENV_VARS = {
  SST_RESOURCE_BEDROCK_MODEL_ID_value: 'us.anthropic.test-model',
  SST_RESOURCE_STUDY_SYSTEM_PROMPT_value: 'Base system prompt text',
  SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value: 'Flashcards prompt text',
  SST_RESOURCE_STUDY_QUIZ_PROMPT_value: 'Quiz prompt text',
  SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value: 'Assignment prompt text',
  SST_RESOURCE_STUDY_SUMMARY_PROMPT_value: 'Summary prompt text',
};

describe('MAX_TOKENS_BY_TYPE', () => {
  it('has flashcards=4096', () => expect(MAX_TOKENS_BY_TYPE.flashcards).toBe(4096));
  it('has quiz=4096', () => expect(MAX_TOKENS_BY_TYPE.quiz).toBe(4096));
  it('has assignment=2048', () => expect(MAX_TOKENS_BY_TYPE.assignment).toBe(2048));
  it('has summary=1024', () => expect(MAX_TOKENS_BY_TYPE.summary).toBe(1024));
});

describe('resolveAiConfig', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV_VARS)) {
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(ENV_VARS)) {
      delete process.env[k];
    }
  });

  it('returns the correct modelId', async () => {
    const config = await resolveAiConfig();
    expect(config.modelId).toBe('us.anthropic.test-model');
  });

  it('returns baseSystemPrompt from env var', async () => {
    const config = await resolveAiConfig();
    expect(config.baseSystemPrompt).toBe('Base system prompt text');
  });

  it('returns all typePrompts correctly', async () => {
    const config = await resolveAiConfig();
    expect(config.typePrompts.flashcards).toBe('Flashcards prompt text');
    expect(config.typePrompts.quiz).toBe('Quiz prompt text');
    expect(config.typePrompts.assignment).toBe('Assignment prompt text');
    expect(config.typePrompts.summary).toBe('Summary prompt text');
  });

  it('returns maxTokens matching MAX_TOKENS_BY_TYPE', async () => {
    const config = await resolveAiConfig();
    expect(config.maxTokens).toEqual(MAX_TOKENS_BY_TYPE);
  });

  it('languageDefault is pt-BR', async () => {
    const config = await resolveAiConfig();
    expect(config.languageDefault).toBe('pt-BR');
  });

  it('throws naming SST_RESOURCE_BEDROCK_MODEL_ID_value when missing', async () => {
    delete process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_BEDROCK_MODEL_ID_value/);
  });

  it('throws naming SST_RESOURCE_STUDY_SYSTEM_PROMPT_value when missing', async () => {
    delete process.env.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_STUDY_SYSTEM_PROMPT_value/);
  });

  it('throws naming SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value when missing', async () => {
    delete process.env.SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value/);
  });

  it('throws naming SST_RESOURCE_STUDY_QUIZ_PROMPT_value when missing', async () => {
    delete process.env.SST_RESOURCE_STUDY_QUIZ_PROMPT_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_STUDY_QUIZ_PROMPT_value/);
  });

  it('throws naming SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value when missing', async () => {
    delete process.env.SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value/);
  });

  it('throws naming SST_RESOURCE_STUDY_SUMMARY_PROMPT_value when missing', async () => {
    delete process.env.SST_RESOURCE_STUDY_SUMMARY_PROMPT_value;
    await expect(resolveAiConfig()).rejects.toThrow(/SST_RESOURCE_STUDY_SUMMARY_PROMPT_value/);
  });
});
