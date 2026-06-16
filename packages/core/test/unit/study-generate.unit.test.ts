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

const ENV_VARS = {
  SST_RESOURCE_BEDROCK_MODEL_ID_value: 'us.anthropic.test-model',
  SST_RESOURCE_STUDY_SYSTEM_PROMPT_value: 'BASE_SYSTEM_PROMPT',
  SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value: 'FLASHCARDS_TYPE_PROMPT',
  SST_RESOURCE_STUDY_QUIZ_PROMPT_value: 'QUIZ_TYPE_PROMPT',
  SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value: 'ASSIGNMENT_TYPE_PROMPT',
  SST_RESOURCE_STUDY_SUMMARY_PROMPT_value: 'SUMMARY_TYPE_PROMPT',
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

  it('sets inferenceConfig.maxTokens to 4096 for flashcards', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ cards: [] }));
    await generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number };
    expect(inferenceConfig.maxTokens).toBe(4096);
  });

  it('sets inferenceConfig.maxTokens to 4096 for quiz', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ questions: [] }));
    await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number };
    expect(inferenceConfig.maxTokens).toBe(4096);
  });

  it('sets inferenceConfig.maxTokens to 2048 for assignment', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', instructions: 'I', rubric: [] }));
    await generateStudyMaterial({ type: 'assignment', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number };
    expect(inferenceConfig.maxTokens).toBe(2048);
  });

  it('sets inferenceConfig.maxTokens to 1024 for summary', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ title: 'T', tldr: 'S', keyPoints: [], terms: [] }));
    await generateStudyMaterial({ type: 'summary', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number };
    expect(inferenceConfig.maxTokens).toBe(1024);
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
    mockSend.mockResolvedValue(makeToolUseResponse({ questions: [] }));
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

  it('throws when STUDY_SYSTEM_PROMPT env var is missing and never calls Bedrock', async () => {
    delete process.env.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value;
    await expect(
      generateStudyMaterial({ type: 'flashcards', noteMarkdown: '# Note', noteTitle: 'Note' }),
    ).rejects.toThrow(/SST_RESOURCE_STUDY_SYSTEM_PROMPT_value/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('passes the correct inputSchema for quiz type', async () => {
    mockSend.mockResolvedValue(makeToolUseResponse({ questions: [] }));
    await generateStudyMaterial({ type: 'quiz', noteMarkdown: '# Test', noteTitle: 'Note' });

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const toolConfig = cmd.input.toolConfig as { tools: Array<{ toolSpec: { inputSchema: { json: object } } }> };
    expect(toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(TOOL_SCHEMAS['quiz']);
  });
});
