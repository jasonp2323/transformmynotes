import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @aws-sdk/client-bedrock-runtime ─────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class MockConverseCommand {
    public input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class MockBedrockRuntimeClient {
    send(cmd: MockConverseCommand) {
      return mockSend(cmd);
    }
  }
  return { BedrockRuntimeClient: MockBedrockRuntimeClient, ConverseCommand: MockConverseCommand };
});

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import { gradeMcq } from '../../src/study/grading';
import { judgeShortAnswer, JUDGE_SYSTEM_PROMPT } from '../../src/study/judgeShortAnswer';
import type { MCQQuestion, ShortAnswerQuestion } from '../../src/study/quiz';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVerdict(payload: unknown) {
  return { output: { message: { content: [{ toolUse: { name: 'submit_verdict', input: payload } }] } } };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const MCQ: MCQQuestion = { type: 'mcq', id: 'q1', stem: 'S', options: ['a', 'b', 'c'], correctIndex: 2, explanation: 'e' };
const SA: ShortAnswerQuestion = { type: 'short-answer', id: 'q2', prompt: 'P', modelAnswer: 'm', acceptableAnswers: ['m'], explanation: 'e' };

describe('gradeMcq', () => {
  it('returns incorrect for a wrong index', () => {
    expect(gradeMcq({ ...MCQ, correctIndex: 0 }, '2')).toEqual({ correct: false, score: 0 });
  });

  it('returns correct for the matching index', () => {
    expect(gradeMcq(MCQ, '2')).toEqual({ correct: true, score: 1 });
  });

  it('parses the string answer "2" against correctIndex 2', () => {
    const q: MCQQuestion = { ...MCQ, correctIndex: 2 };
    expect(gradeMcq(q, '2')).toEqual({ correct: true, score: 1 });
  });

  it('returns incorrect for an undefined answer', () => {
    expect(gradeMcq(MCQ, undefined)).toEqual({ correct: false, score: 0 });
  });
});

describe('judgeShortAnswer', () => {
  beforeEach(() => {
    process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value = 'us.anthropic.test-model';
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  });

  it('returns the verdict for a score of 1', async () => {
    mockSend.mockResolvedValue(makeVerdict({ correct: true, score: 1, feedback: 'Good' }));
    const result = await judgeShortAnswer(SA, 'm');
    expect(result).toEqual({ correct: true, score: 1, feedback: 'Good' });
  });

  it('treats a score of 0.5 as correct (>= 0.5 threshold)', async () => {
    mockSend.mockResolvedValue(makeVerdict({ correct: false, score: 0.5, feedback: 'Partial' }));
    const result = await judgeShortAnswer(SA, 'm');
    expect(result).toEqual({ correct: true, score: 0.5, feedback: 'Partial' });
  });

  it('treats a score of 0.4 as incorrect even when the model says correct:true', async () => {
    mockSend.mockResolvedValue(makeVerdict({ correct: true, score: 0.4, feedback: 'x' }));
    const result = await judgeShortAnswer(SA, 'm');
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.4);
  });

  it('retries on ThrottlingException and returns the result on the second attempt', async () => {
    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    mockSend
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue(makeVerdict({ correct: true, score: 1, feedback: 'Good' }));
    const result = await judgeShortAnswer(SA, 'm');
    expect(result.correct).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 15000);

  it('JUDGE_SYSTEM_PROMPT documents the partial-credit threshold', () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain('partial');
    expect(JUDGE_SYSTEM_PROMPT).toContain('0.5');
  });
});
