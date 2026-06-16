/**
 * M15.2.2 — LLM-as-judge grading for short-answer quiz questions.
 *
 * Sends the question, model answer, acceptable synonyms, and the student's
 * answer to Bedrock and forces a structured verdict via a single tool call.
 * The `correct` flag is derived authoritatively from the returned score
 * (>= 0.5), never trusting the model's own boolean.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import { withBedrockRetry } from '../ocr/retry.js';
import type { ShortAnswerQuestion } from './quiz.js';

const client = new BedrockRuntimeClient({});

export interface JudgeResult {
  correct: boolean;
  score: number;
  feedback: string;
}

export const JUDGE_SYSTEM_PROMPT =
  'You are a strict but fair answer evaluator. Given a question, the model answer, a list of acceptable synonyms, and a student\'s answer, decide whether the student answered correctly. Rules: (1) Minor spelling errors and valid paraphrases count as correct. (2) Semantically wrong answers are incorrect even if they mention related terms. (3) Set `score` to 1.0 for fully correct, 0.5 for partially correct (key idea present but incomplete), 0.0 for wrong. (4) `feedback` is a single concise sentence explaining the verdict. (5) Output only via the tool call.';

export const JUDGE_TOOL_SCHEMA: DocumentType = {
  type: 'object',
  required: ['correct', 'score', 'feedback'],
  properties: {
    correct: { type: 'boolean' },
    score: { type: 'number', minimum: 0, maximum: 1 },
    feedback: { type: 'string', maxLength: 200 },
  },
};

export async function judgeShortAnswer(
  question: ShortAnswerQuestion,
  userAnswer: string,
): Promise<JudgeResult> {
  const modelId = process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  if (!modelId) {
    throw new Error(
      'Missing required env var SST_RESOURCE_BEDROCK_MODEL_ID_value: the Bedrock model id ' +
        'is not bound. Expected it from the SST secret link (BEDROCK_MODEL_ID).',
    );
  }

  const command = new ConverseCommand({
    modelId,
    system: [{ text: JUDGE_SYSTEM_PROMPT }],
    messages: [
      {
        role: 'user',
        content: [
          {
            text:
              `Question: ${question.prompt}\n` +
              `Model answer: ${question.modelAnswer}\n` +
              `Also acceptable: ${question.acceptableAnswers.join(', ')}\n` +
              `Student answer: ${userAnswer}`,
          },
        ],
      },
    ],
    inferenceConfig: { maxTokens: 256 },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'submit_verdict',
            description: 'Submit the grading verdict as structured JSON.',
            inputSchema: { json: JUDGE_TOOL_SCHEMA },
          },
        },
      ],
      toolChoice: { tool: { name: 'submit_verdict' } },
    },
  });

  const response = await withBedrockRetry(() => client.send(command));

  const contentBlocks = response.output?.message?.content ?? [];
  let payload: unknown = undefined;
  for (const block of contentBlocks) {
    if (
      'toolUse' in block &&
      (block as { toolUse?: { name?: string; input?: unknown } }).toolUse?.name === 'submit_verdict'
    ) {
      payload = (block as { toolUse: { name: string; input: unknown } }).toolUse.input;
      break;
    }
  }

  if (payload === undefined || payload === null) {
    throw new Error('judgeShortAnswer: Bedrock returned no submit_verdict tool payload');
  }

  const out = payload as { correct?: boolean; score?: number; feedback?: string };
  const score = typeof out.score === 'number' ? out.score : 0;
  const feedback = typeof out.feedback === 'string' ? out.feedback : '';
  const correct = score >= 0.5;

  return { correct, score, feedback };
}
