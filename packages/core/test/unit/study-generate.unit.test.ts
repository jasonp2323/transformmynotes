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

  return {
    BedrockRuntimeClient: MockBedrockRuntimeClient,
    ConverseCommand: MockConverseCommand,
  };
});

// ── Mock the DynamoDB client so resolveAiConfig() resolves from env defaults
// (no CURRENT item) without touching real/dynalite DynamoDB. ──────────────────
vi.mock('../../src/db/client', () => ({
  ddb: { send: vi.fn().mockResolvedValue({ Item: undefined }) },
  TableNames: { UserData: 'UserData-test' },
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import {
  generateStudyMaterial,
  AUTO_DIRECTIVE,
  PT_BR_DIRECTIVE,
  BILINGUAL_DIRECTIVE,
  TOOL_SCHEMAS,
} from '../../src/study/generate';
import { bustAiConfigCache } from '../../src/study/config';
import type { GeneratedQuiz } from '../../src/study/quiz';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToolUseResponse(payload: unknown) {
  return {
    output: {
      message: {
        content: [
          {
            toolUse: {
              name: 'submit_study_material',
              input: payload,
            },
          },
        ],
      },
    },
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

// Valid 3-question quiz payload (no ids) — used wherever quiz type is mocked
// to satisfy the assignQuestionIds(payload) call that now runs post-generation.
const VALID_QUIZ_PAYLOAD = {
  questions: [
    { type: 'mcq', stem: 'Q1', options: ['a', 'b'], correctIndex: 0, explanation: 'e1' },
    { type: 'mcq', stem: 'Q2', options: ['a', 'b'], correctIndex: 1, explanation: 'e2' },
    { type: 'short-answer', prompt: 'Q3', modelAnswer: 'm', acceptableAnswers: ['m'], explanation: 'e3' },
  ],
};

const ENV_VARS = {
  SST_RESOURCE_BEDROCK_MODEL_ID_value: 'us.anthropic.test-model',
  SST_RESOURCE_STUDY_SYSTEM_PROMPT_value: 'BASE_SYSTEM_PROMPT',
  SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value: 'FLASHCARDS_TYPE_PROMPT',
  SST_RESOURCE_STUDY_QUIZ_PROMPT_value: 'QUIZ_TYPE_PROMPT',
  SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value: 'ASSIGNMENT_TYPE_PROMPT',
  SST_RESOURCE_STUDY_SUMMARY_PROMPT_value: 'SUMMARY_TYPE_PROMPT',
  SST_RESOURCE_STUDY_GLOSSARY_PROMPT_value: 'GLOSSARY_TYPE_PROMPT',
  SST_RESOURCE_STUDY_GUIDE_PROMPT_value: 'STUDY_GUIDE_TYPE_PROMPT',
};

describe('generateStudyMaterial', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV_VARS)) {
      process.env[k] = v;
    }
    mockSend.mockReset();
    // The resolveAiConfig cache is module-level; clear it so each case
    // re-resolves against the current env (the missing-env cases depend on this).
    bustAiConfigCache();
  });

  afterEach(() => {
    for (const k of Object.keys(ENV_VARS)) {
      delete process.env[k];
    }
  });

  it('sends toolConfig with submit_study_material tool', async () => {
    const payload = { cards: [{ front: 'Q', back: 'A' }] };
    mockSend.mockResolvedValue(makeToolUseResponse(payload));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Test', noteTitle: 'Test Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { name: string } }>; toolChoice: { tool: { name: string } } };
    expect(toolConfig).toBeDefined();
    expect(toolConfig.tools[0].toolSpec.name).toBe('submit_study_material');
    expect(toolConfig.toolChoice.tool.name).toBe('submit_study_material');
  });

  it('passes the correct inputSchema for flashcards type', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { inputSchema: { json: object } } }> };
    expect(toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(TOOL_SCHEMAS['flashcards']);
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for flashcards', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default
  });

  it('sets inferenceConfig.temperature and topP from AiConfig (defaults 0.5, 0.9)', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.temperature).toBe(0.5); // AiConfig default
    expect(inferenceConfig.topP).toBe(0.9);        // AiConfig default
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for quiz', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse(VALID_QUIZ_PAYLOAD));
    await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for assignment', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', instructions: 'I', rubric: [] }));
    await generateStudyMaterial({ type: 'assignment', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default (was per-type 2048 before M19.2.2)
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for summary', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', tldr: 'S', keyPoints: [], terms: [] }));
    await generateStudyMaterial({ type: 'summary', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default (was per-type 1024 before M19.2.2)
  });

  it('system[0].text contains base prompt and type prompt and auto directive (default)', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    const systemText = system[0].text;
    expect(systemText).toContain('BASE_SYSTEM_PROMPT');
    expect(systemText).toContain('FLASHCARDS_TYPE_PROMPT');
    expect(systemText).toContain(AUTO_DIRECTIVE);
    expect(systemText).not.toContain(PT_BR_DIRECTIVE);
    expect(systemText).not.toContain(BILINGUAL_DIRECTIVE);
  });

  it('system[0].text contains auto directive when language=auto', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note', language: 'auto' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    const systemText = system[0].text;
    expect(systemText).toContain(AUTO_DIRECTIVE);
    expect(systemText).not.toContain(PT_BR_DIRECTIVE);
    expect(systemText).not.toContain(BILINGUAL_DIRECTIVE);
  });

  it('system[0].text contains pt-BR directive when language=pt-BR', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note', language: 'pt-BR' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    const systemText = system[0].text;
    expect(systemText).toContain(PT_BR_DIRECTIVE);
    expect(systemText).not.toContain(AUTO_DIRECTIVE);
    expect(systemText).not.toContain(BILINGUAL_DIRECTIVE);
  });

  it('system[0].text contains bilingual directive when language=bilingual', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note', language: 'bilingual' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    const systemText = system[0].text;
    expect(systemText).toContain(BILINGUAL_DIRECTIVE);
    expect(systemText).not.toContain(AUTO_DIRECTIVE);
    expect(systemText).not.toContain(PT_BR_DIRECTIVE);
  });

  it('extracts payload from toolUse block and returns it', async () => {
    const expectedPayload = { cards: [{ front: 'Pergunta', back: 'Resposta' }] };
    mockSend.mockResolvedValue(makeToolUseResponse(expectedPayload));
    const result = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });

    expect(result.payload).toEqual(expectedPayload);
  });

  it('returns usage from response', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    const result = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });

    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(50);
  });

  it('promptVersion is an 8-char hex string', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    const result = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });

    expect(result.promptVersion).toMatch(/^[0-9a-f]{8}$/);
  });

  it('promptVersion is stable for identical inputs', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    const r1 = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    const r2 = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });
    expect(r1.promptVersion).toBe(r2.promptVersion);
  });

  it('promptVersion differs when type changes (different type prompt)', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    const r1 = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });
    mockSend.mockResolvedValue(makeToolUseResponse(VALID_QUIZ_PAYLOAD));
    const r2 = await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Note', noteTitle: 'Note' });
    expect(r1.promptVersion).not.toBe(r2.promptVersion);
  });

  it('retries on ThrottlingException and returns result on third attempt', async () => {
    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    const payload = { cards: [{ front: 'Q', back: 'A' }] };
    mockSend
      .mockRejectedValueOnce(throttle)
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue(makeToolUseResponse(payload));

    const result = await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });
    expect(result.payload).toEqual(payload);
    expect(mockSend).toHaveBeenCalledTimes(3);
  }, 15000);

  it('throws when SST_RESOURCE_BEDROCK_MODEL_ID_value is missing and never calls Bedrock', async () => {
    delete process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
    await expect(
      generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' }),
    ).rejects.toThrow(/SST_RESOURCE_BEDROCK_MODEL_ID_value/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('falls back to the bundled default system prompt when the env var is missing (M19 fix)', async () => {
    // With no STUDY_SYSTEM_PROMPT env var, buildSecretDefaults() now uses the
    // bundled DEFAULT_SYSTEM_PROMPT constant — so generation succeeds (no
    // filesystem dependency) and the real default prompt is sent to Bedrock.
    delete process.env.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value;
    delete process.env.SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value;
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));

    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    expect(system[0].text).toContain('You are an expert tutor');
  });

  it('passes the correct inputSchema for quiz type', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse(VALID_QUIZ_PAYLOAD));
    await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { inputSchema: { json: object } } }> };
    expect(toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(TOOL_SCHEMAS['quiz']);
  });

  it('quiz post-process: result.payload.questions all have a non-empty id after generateStudyMaterial', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse(VALID_QUIZ_PAYLOAD));
    const result = await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Test', noteTitle: 'Note' });

    const quiz = result.payload as GeneratedQuiz;
    expect(Array.isArray(quiz.questions)).toBe(true);
    expect(quiz.questions).toHaveLength(3);
    for (const q of quiz.questions) {
      expect(typeof q.id).toBe('string');
      expect(q.id.length).toBeGreaterThan(0);
    }
  });

  it('passes the correct inputSchema for glossary type', async () => {
    const payload = { terms: [{ term: 'Foo', definition: 'Bar' }] };
    mockSend.mockResolvedValue(makeToolUseResponse(payload));
    await generateStudyMaterial({ type: 'glossary', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { inputSchema: { json: object } } }> };
    expect(toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(TOOL_SCHEMAS['glossary']);
  });

  it('extracts payload for glossary type from toolUse block', async () => {
    const payload = { terms: [{ term: 'Substantivo', definition: 'Classe gramatical que nomeia seres.' }] };
    mockSend.mockResolvedValue(makeToolUseResponse(payload));
    const result = await generateStudyMaterial({ type: 'glossary', noteMarkdown: '# Note', noteTitle: 'Note' });
    expect(result.payload).toEqual(payload);
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for glossary', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ terms: [] }));
    await generateStudyMaterial({ type: 'glossary', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default (was per-type 2048 before M19.2.2)
  });

  it('system[0].text contains glossary prompt when type=glossary', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ terms: [] }));
    await generateStudyMaterial({ type: 'glossary', noteMarkdown: '# Note', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    expect(system[0].text).toContain('GLOSSARY_TYPE_PROMPT');
  });

  it('passes the correct inputSchema for study_guide type', async () => {
    const payload = { title: 'T', sections: [{ heading: 'H', keyPoints: ['P'] }] };
    mockSend.mockResolvedValue(makeToolUseResponse(payload));
    await generateStudyMaterial({ type: 'study_guide', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { inputSchema: { json: object } } }> };
    expect(toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(TOOL_SCHEMAS['study_guide']);
  });

  it('extracts payload for study_guide type from toolUse block', async () => {
    const payload = {
      title: 'Guia de Estudo',
      sections: [{ heading: 'Introdução', keyPoints: ['Conceito A', 'Conceito B'], body: 'Texto explicativo.' }],
    };
    mockSend.mockResolvedValue(makeToolUseResponse(payload));
    const result = await generateStudyMaterial({ type: 'study_guide', noteMarkdown: '# Note', noteTitle: 'Note' });
    expect(result.payload).toEqual(payload);
  });

  it('sets inferenceConfig.maxTokens from AiConfig.maxTokens (default 4096) for study_guide', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', sections: [] }));
    await generateStudyMaterial({ type: 'study_guide', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number; temperature: number; topP: number };
    expect(inferenceConfig.maxTokens).toBe(4096); // AiConfig default
  });

  it('system[0].text contains study_guide prompt when type=study_guide', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', sections: [] }));
    await generateStudyMaterial({ type: 'study_guide', noteMarkdown: '# Note', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    expect(system[0].text).toContain('STUDY_GUIDE_TYPE_PROMPT');
  });
});
