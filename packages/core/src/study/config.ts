import type { StudyMaterialType, StudyLanguage } from './types.js';

export interface ResolvedAiConfig {
  baseSystemPrompt: string;
  typePrompts: Record<StudyMaterialType, string>;
  modelId: string;
  maxTokens: Record<StudyMaterialType, number>;
  temperature?: number;
  topP?: number;
  languageDefault: StudyLanguage;
}

export const MAX_TOKENS_BY_TYPE: Record<StudyMaterialType, number> = {
  flashcards: 4096,
  quiz: 4096,
  assignment: 2048,
  summary: 1024,
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}: the value is not bound. ` +
        `Expected it from the SST secret link.`,
    );
  }
  return value;
}

export async function resolveAiConfig(): Promise<ResolvedAiConfig> {
  const modelId = requireEnv('SST_RESOURCE_BEDROCK_MODEL_ID_value');
  const baseSystemPrompt = requireEnv('SST_RESOURCE_STUDY_SYSTEM_PROMPT_value');
  const flashcardsPrompt = requireEnv('SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value');
  const quizPrompt = requireEnv('SST_RESOURCE_STUDY_QUIZ_PROMPT_value');
  const assignmentPrompt = requireEnv('SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value');
  const summaryPrompt = requireEnv('SST_RESOURCE_STUDY_SUMMARY_PROMPT_value');

  return {
    modelId,
    baseSystemPrompt,
    typePrompts: {
      flashcards: flashcardsPrompt,
      quiz: quizPrompt,
      assignment: assignmentPrompt,
      summary: summaryPrompt,
    },
    maxTokens: MAX_TOKENS_BY_TYPE,
    languageDefault: 'pt-BR',
  };
}
