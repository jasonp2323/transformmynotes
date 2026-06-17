/**
 * M15 quiz domain — pure types, schema constants, and logic for quiz generation.
 *
 * SERVER-SIDE ONLY: This module contains answer-key fields (correctIndex,
 * modelAnswer, acceptableAnswers, explanation). Use `toClientQuestions` to
 * strip them before sending to the client.
 */

import type { DocumentType } from '@smithy/types';
import { ulid } from 'ulid';

// ── Question types ────────────────────────────────────────────────────────────

export interface MCQQuestion {
  type: 'mcq';
  id: string; // ULID, assigned post-generation
  stem: string;
  options: string[]; // 2–5 choices
  correctIndex: number; // ANSWER KEY — server-side only
  explanation: string; // ANSWER KEY — revealed only post-submission
  sourceNoteIds?: string[]; // M17.2.1 provenance (NOT an answer key)
}

export interface ShortAnswerQuestion {
  type: 'short-answer';
  id: string;
  prompt: string;
  modelAnswer: string; // ANSWER KEY
  acceptableAnswers: string[]; // ANSWER KEY
  explanation: string; // ANSWER KEY (revealed post-submission)
  sourceNoteIds?: string[]; // M17.2.1 provenance (NOT an answer key)
}

export type QuizQuestion = MCQQuestion | ShortAnswerQuestion;

export interface GeneratedQuiz {
  questions: QuizQuestion[];
}

// ── Client-safe types (answer keys stripped) ──────────────────────────────────

export type ClientMCQ = {
  type: 'mcq';
  id: string;
  stem: string;
  options: string[];
  sourceNoteIds?: string[]; // M17.2.1 provenance
};
export type ClientShortAnswer = {
  type: 'short-answer';
  id: string;
  prompt: string;
  sourceNoteIds?: string[]; // M17.2.1 provenance
};
export type ClientQuestion = ClientMCQ | ClientShortAnswer;

// ── Bedrock tool schema ───────────────────────────────────────────────────────

const mcqShape = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['mcq'] },
    stem: { type: 'string', maxLength: 400 },
    options: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      minItems: 2,
      maxItems: 5,
    },
    correctIndex: { type: 'integer', minimum: 0 },
    explanation: { type: 'string', maxLength: 600 },
    sourceNoteIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['type', 'stem', 'options', 'correctIndex', 'explanation'],
};

const shortAnswerShape = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['short-answer'] },
    prompt: { type: 'string', maxLength: 400 },
    modelAnswer: { type: 'string', maxLength: 300 },
    acceptableAnswers: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      maxItems: 10,
    },
    explanation: { type: 'string', maxLength: 600 },
    sourceNoteIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['type', 'prompt', 'modelAnswer', 'acceptableAnswers', 'explanation'],
};

export const QUIZ_TOOL_SCHEMA: DocumentType = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 15,
      items: {
        oneOf: [mcqShape, shortAnswerShape],
      },
    },
  },
};

// ── Error ─────────────────────────────────────────────────────────────────────

export class QuizGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}

// ── Post-processing: assign ULIDs to raw Bedrock payload ─────────────────────

/**
 * Takes the raw Bedrock tool payload (questions WITHOUT ids), validates it,
 * assigns a fresh ULID `id` to each question, and returns a typed GeneratedQuiz.
 *
 * Throws QuizGenerationError if the payload is invalid or has fewer than 3 questions.
 */
export function assignQuestionIds(raw: unknown): GeneratedQuiz {
  if (raw === null || typeof raw !== 'object') {
    throw new QuizGenerationError(
      `Quiz payload must be a non-null object, got: ${raw === null ? 'null' : typeof raw}`,
    );
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj['questions'])) {
    throw new QuizGenerationError(
      'Quiz payload missing required "questions" array',
    );
  }

  const rawQuestions = obj['questions'] as unknown[];

  if (rawQuestions.length < 3) {
    throw new QuizGenerationError(
      `Quiz must have at least 3 questions, got ${rawQuestions.length}`,
    );
  }

  const questions: QuizQuestion[] = rawQuestions.map((item) => {
    const q = item as Record<string, unknown>;
    return { ...q, id: ulid() } as QuizQuestion;
  });

  return { questions };
}

// ── ANTI-CHEAT: strip answer-key fields before sending to client ──────────────

// ANTI-CHEAT: This function removes all answer-key fields (correctIndex,
// modelAnswer, acceptableAnswers, explanation) from quiz questions before they
// are sent to the browser. Never send the full GeneratedQuiz to the client.
export function toClientQuestions(quiz: GeneratedQuiz): ClientQuestion[] {
  return quiz.questions.map((q): ClientQuestion => {
    if (q.type === 'mcq') {
      return {
        type: 'mcq',
        id: q.id,
        stem: q.stem,
        options: q.options,
        ...(q.sourceNoteIds !== undefined && { sourceNoteIds: q.sourceNoteIds }),
      };
    }
    return {
      type: 'short-answer',
      id: q.id,
      prompt: q.prompt,
      ...(q.sourceNoteIds !== undefined && { sourceNoteIds: q.sourceNoteIds }),
    };
  });
}
