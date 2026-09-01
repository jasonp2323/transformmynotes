import { describe, it, expect } from 'vitest';
import { validateAiConfigInput, type AiConfigInput } from '../../src/study/config';

function validInput(): Record<string, unknown> {
  return {
    baseSystemPrompt: 'Base system prompt',
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    promptOverrides: {},
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
  };
}

describe('validateAiConfigInput', () => {
  it('valid input returns ok:true and strips audit fields', () => {
    const inputWithAudit = { ...validInput(), version: 9, updatedBy: 'x', updatedAt: 'y' };
    const result = validateAiConfigInput(inputWithAudit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value as AiConfigInput & Record<string, unknown>;
    expect('version' in value).toBe(false);
    expect('updatedBy' in value).toBe(false);
    expect('updatedAt' in value).toBe(false);
  });

  it('modelId not in allowlist → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), modelId: 'gpt-4' });
    expect(result.ok).toBe(false);
  });

  it('modelOverrides with disallowed model → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), modelOverrides: { quiz: 'gpt-4' } });
    expect(result.ok).toBe(false);
  });

  it('maxTokens out of range → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), maxTokens: 9999 });
    expect(result.ok).toBe(false);
  });

  it('temperature out of range → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), temperature: 2 });
    expect(result.ok).toBe(false);
  });

  it('languageDefault invalid value → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), languageDefault: 'en' });
    expect(result.ok).toBe(false);
  });

  it('pollyEngine invalid value → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), pollyEngine: 'robotic' });
    expect(result.ok).toBe(false);
  });

  it('baseSystemPrompt empty string → ok:false', () => {
    const result = validateAiConfigInput({ ...validInput(), baseSystemPrompt: '' });
    expect(result.ok).toBe(false);
  });

  it('baseSystemPrompt missing → ok:false', () => {
    const input = validInput();
    delete input.baseSystemPrompt;
    const result = validateAiConfigInput(input);
    expect(result.ok).toBe(false);
  });
});
