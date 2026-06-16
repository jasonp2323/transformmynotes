import { describe, it, expect } from 'vitest';
import {
  QUIZ_TOOL_SCHEMA,
  assignQuestionIds,
  toClientQuestions,
  QuizGenerationError,
} from '../../src/study/quiz';
import type { GeneratedQuiz } from '../../src/study/quiz';

// ── Local schema navigation helpers ──────────────────────────────────────────

/**
 * Navigate the DocumentType schema without using bare `any`.
 * DocumentType is a recursive type (primitives | arrays | objects), so we cast
 * step-by-step via `Record<string, unknown>` and assert each level.
 */
function asObj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`Expected object, got ${typeof v}`);
  }
  return v as Record<string, unknown>;
}

function asArr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error(`Expected array, got ${typeof v}`);
  return v;
}

// ── Raw quiz payload helpers ──────────────────────────────────────────────────

const RAW_2MCQ_1SA = {
  questions: [
    { type: 'mcq', stem: 'Q1?', options: ['a', 'b', 'c'], correctIndex: 0, explanation: 'Because a.' },
    { type: 'mcq', stem: 'Q2?', options: ['x', 'y'], correctIndex: 1, explanation: 'Because y.' },
    { type: 'short-answer', prompt: 'Describe Q3.', modelAnswer: 'The answer is 42.', acceptableAnswers: ['42', 'forty-two'], explanation: 'The answer is 42.' },
  ],
};

// A GeneratedQuiz with ids already set (used for toClientQuestions tests)
const QUIZ_WITH_IDS: GeneratedQuiz = {
  questions: [
    { type: 'mcq', id: '01HWTEST001', stem: 'Capital of France?', options: ['London', 'Paris', 'Berlin'], correctIndex: 1, explanation: 'Paris is the capital.' },
    { type: 'mcq', id: '01HWTEST002', stem: 'What is 2+2?', options: ['3', '4', '5'], correctIndex: 1, explanation: 'Basic arithmetic.' },
    { type: 'short-answer', id: '01HWTEST003', prompt: 'Name a primary colour.', modelAnswer: 'Red', acceptableAnswers: ['red', 'blue', 'yellow'], explanation: 'Red, blue, and yellow are primary colours.' },
  ],
};

// ── QUIZ_TOOL_SCHEMA tests ────────────────────────────────────────────────────

describe('QUIZ_TOOL_SCHEMA', () => {
  it('questions.minItems is 3', () => {
    const schema = asObj(QUIZ_TOOL_SCHEMA);
    const props = asObj(schema['properties']);
    const questions = asObj(props['questions']);
    expect(questions['minItems']).toBe(3);
  });

  it('questions.maxItems is 15', () => {
    const schema = asObj(QUIZ_TOOL_SCHEMA);
    const props = asObj(schema['properties']);
    const questions = asObj(props['questions']);
    expect(questions['maxItems']).toBe(15);
  });

  it('questions.items.oneOf has exactly 2 members', () => {
    const schema = asObj(QUIZ_TOOL_SCHEMA);
    const props = asObj(schema['properties']);
    const questions = asObj(props['questions']);
    const items = asObj(questions['items']);
    const oneOf = asArr(items['oneOf']);
    expect(oneOf).toHaveLength(2);
  });

  it('one oneOf member has correctIndex in required (MCQ shape)', () => {
    const schema = asObj(QUIZ_TOOL_SCHEMA);
    const props = asObj(schema['properties']);
    const questions = asObj(props['questions']);
    const items = asObj(questions['items']);
    const oneOf = asArr(items['oneOf']);
    const mcqShape = asObj(oneOf[0]);
    const required = asArr(mcqShape['required']);
    expect(required).toContain('correctIndex');
  });

  it('one oneOf member has modelAnswer and acceptableAnswers in required (short-answer shape)', () => {
    const schema = asObj(QUIZ_TOOL_SCHEMA);
    const props = asObj(schema['properties']);
    const questions = asObj(props['questions']);
    const items = asObj(questions['items']);
    const oneOf = asArr(items['oneOf']);
    const saShape = asObj(oneOf[1]);
    const required = asArr(saShape['required']);
    expect(required).toContain('modelAnswer');
    expect(required).toContain('acceptableAnswers');
  });
});

// ── assignQuestionIds tests ───────────────────────────────────────────────────

describe('assignQuestionIds', () => {
  it('assigns a non-empty string id to every question', () => {
    const result = assignQuestionIds(RAW_2MCQ_1SA);
    for (const q of result.questions) {
      expect(typeof q.id).toBe('string');
      expect(q.id.length).toBeGreaterThan(0);
    }
  });

  it('all assigned ids are unique', () => {
    const result = assignQuestionIds(RAW_2MCQ_1SA);
    const ids = result.questions.map((q) => q.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('preserves correctIndex on MCQ questions (answer key intact)', () => {
    const result = assignQuestionIds(RAW_2MCQ_1SA);
    const mcqs = result.questions.filter((q) => q.type === 'mcq');
    expect(mcqs).toHaveLength(2);
    for (const q of mcqs) {
      expect(typeof (q as { correctIndex: number }).correctIndex).toBe('number');
    }
  });

  it('preserves modelAnswer and acceptableAnswers on short-answer questions', () => {
    const result = assignQuestionIds(RAW_2MCQ_1SA);
    const sa = result.questions.find((q) => q.type === 'short-answer');
    expect(sa).toBeDefined();
    if (sa && sa.type === 'short-answer') {
      expect(sa.modelAnswer).toBe('The answer is 42.');
      expect(sa.acceptableAnswers).toEqual(['42', 'forty-two']);
    }
  });

  it('throws QuizGenerationError when questions array has fewer than 3 items', () => {
    const payload = {
      questions: [
        { type: 'mcq', stem: 'Q1?', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
        { type: 'mcq', stem: 'Q2?', options: ['a', 'b'], correctIndex: 1, explanation: 'e' },
      ],
    };
    expect(() => assignQuestionIds(payload)).toThrow(QuizGenerationError);
  });

  it('throws QuizGenerationError when given null', () => {
    expect(() => assignQuestionIds(null)).toThrow(QuizGenerationError);
  });

  it('throws QuizGenerationError when given a non-object (string)', () => {
    expect(() => assignQuestionIds('not an object')).toThrow(QuizGenerationError);
  });

  it('throws QuizGenerationError when given an object with no questions array', () => {
    expect(() => assignQuestionIds({})).toThrow(QuizGenerationError);
  });
});

// ── toClientQuestions tests ───────────────────────────────────────────────────

describe('toClientQuestions', () => {
  it('strips correctIndex, modelAnswer, acceptableAnswers, and explanation from JSON output', () => {
    const client = toClientQuestions(QUIZ_WITH_IDS);
    const json = JSON.stringify(client);
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain('modelAnswer');
    expect(json).not.toContain('acceptableAnswers');
    expect(json).not.toContain('explanation');
  });

  it('returns type, id, stem, and options for MCQ client questions', () => {
    const client = toClientQuestions(QUIZ_WITH_IDS);
    const mcqs = client.filter((q) => q.type === 'mcq');
    expect(mcqs).toHaveLength(2);
    for (const q of mcqs) {
      expect(q).toHaveProperty('type', 'mcq');
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('stem');
      expect(q).toHaveProperty('options');
    }
  });

  it('returns type, id, and prompt for short-answer client questions', () => {
    const client = toClientQuestions(QUIZ_WITH_IDS);
    const sa = client.find((q) => q.type === 'short-answer');
    expect(sa).toBeDefined();
    expect(sa).toHaveProperty('type', 'short-answer');
    expect(sa).toHaveProperty('id');
    expect(sa).toHaveProperty('prompt');
  });
});
