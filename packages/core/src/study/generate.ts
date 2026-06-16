import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import { createHash } from 'node:crypto';
import { withBedrockRetry } from '../ocr/retry.js';
import { resolveAiConfig, MAX_TOKENS_BY_TYPE } from './config.js';
import type { StudyMaterialType, StudyLanguage } from './types.js';

export { MAX_TOKENS_BY_TYPE };

export interface GenerateStudyMaterialInput {
  type: StudyMaterialType;
  noteMarkdown: string;
  noteTitle: string;
  language?: StudyLanguage;
}

export interface GenerateStudyMaterialResult {
  payload: unknown;
  promptVersion: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const AUTO_DIRECTIVE =
  "Write all generated study material in the same language as the source note, matching its language and regional conventions. Do not translate the note into another language unless explicitly instructed.";

export const PT_BR_DIRECTIVE =
  'Escreva todo o conteúdo gerado em Português Brasileiro (pt-BR). Use vocabulário, ortografia e convenções gramaticais do Português do Brasil — não do Português Europeu.';

export const BILINGUAL_DIRECTIVE =
  'Este é um material de aprendizado de idiomas pt-BR ↔ en. Para cada item gerado, escreva a frente (front) em Português Brasileiro e o verso (back) em inglês (English). Para flashcards: frente em pt-BR, verso em inglês. Para quizzes: enunciado em pt-BR, explicações em ambos os idiomas. Para resumos e tarefas: conteúdo principal em pt-BR com termos-chave também em inglês.';

export const TOOL_SCHEMAS: Record<StudyMaterialType, DocumentType> = {
  flashcards: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            front: { type: 'string', maxLength: 300 },
            back: { type: 'string', maxLength: 600 },
            sourceSpan: { type: 'string', maxLength: 300 },
          },
          required: ['front', 'back'],
        },
      },
    },
    required: ['cards'],
  },
  quiz: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stem: { type: 'string' },
            choices: {
              type: 'array',
              items: { type: 'string' },
              minItems: 4,
              maxItems: 4,
            },
            answerIndex: { type: 'integer', minimum: 0, maximum: 3 },
            explanation: { type: 'string' },
          },
          required: ['stem', 'choices', 'answerIndex', 'explanation'],
        },
      },
    },
    required: ['questions'],
  },
  assignment: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      instructions: { type: 'string' },
      rubric: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion: { type: 'string' },
            points: { type: 'number' },
          },
          required: ['criterion', 'points'],
        },
      },
    },
    required: ['title', 'instructions', 'rubric'],
  },
  summary: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      tldr: { type: 'string' },
      keyPoints: {
        type: 'array',
        items: { type: 'string' },
      },
      terms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            term: { type: 'string' },
            definition: { type: 'string' },
          },
          required: ['term', 'definition'],
        },
      },
    },
    required: ['title', 'tldr', 'keyPoints', 'terms'],
  },
};

const client = new BedrockRuntimeClient({});

export async function generateStudyMaterial(
  input: GenerateStudyMaterialInput,
): Promise<GenerateStudyMaterialResult> {
  const config = await resolveAiConfig();

  const { type } = input;
  const language = input.language ?? config.languageDefault; // 'auto' by default
  const languageDirective =
    language === 'bilingual' ? BILINGUAL_DIRECTIVE
    : language === 'pt-BR' ? PT_BR_DIRECTIVE
    : AUTO_DIRECTIVE;

  const combinedPrompt =
    config.baseSystemPrompt +
    '\n\n' +
    config.typePrompts[type] +
    '\n\n' +
    languageDirective;

  const promptVersion = createHash('sha256')
    .update(combinedPrompt)
    .digest('hex')
    .slice(0, 8);

  const command = new ConverseCommand({
    modelId: config.modelId,
    system: [{ text: combinedPrompt }],
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Note: "${input.noteTitle}"\n\n${input.noteMarkdown}`,
          },
        ],
      },
    ],
    inferenceConfig: { maxTokens: config.maxTokens[type] },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'submit_study_material',
            description: 'Submit the generated study material as structured JSON.',
            inputSchema: { json: TOOL_SCHEMAS[type] },
          },
        },
      ],
      toolChoice: { tool: { name: 'submit_study_material' } },
    },
  });

  const response = await withBedrockRetry(() => client.send(command));

  const contentBlocks = response.output?.message?.content ?? [];
  let payload: unknown = undefined;
  for (const block of contentBlocks) {
    if (
      'toolUse' in block &&
      (block as { toolUse?: { name?: string; input?: unknown } }).toolUse?.name ===
        'submit_study_material'
    ) {
      payload = (block as { toolUse: { name: string; input: unknown } }).toolUse.input;
      break;
    }
  }

  return {
    payload,
    promptVersion,
    usage: {
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    },
  };
}
