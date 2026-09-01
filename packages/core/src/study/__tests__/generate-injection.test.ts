import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPhaseSystemPrompt,
  wrapReferenceArticle,
  injectionGuard,
  REFERENCE_ARTICLE_BEGIN,
  REFERENCE_ARTICLE_END,
  AUTO_DIRECTIVE,
} from '../generate.js';

const BASE = 'You are a study material generation assistant.';

describe('injectionGuard exports', () => {
  it('injectionGuard is a non-empty string', () => {
    expect(typeof injectionGuard).toBe('string');
    expect(injectionGuard.length).toBeGreaterThan(0);
  });

  it('injectionGuard contains the key security note phrase', () => {
    expect(injectionGuard).toContain('SECURITY NOTE');
    expect(injectionGuard).toContain('--- BEGIN REFERENCE ARTICLE ---');
    expect(injectionGuard).toContain('--- END REFERENCE ARTICLE ---');
  });
});

describe('wrapReferenceArticle', () => {
  it('wraps markdown with begin and end delimiters', () => {
    const result = wrapReferenceArticle('x');
    expect(result).toBe(
      `${REFERENCE_ARTICLE_BEGIN}\nx\n${REFERENCE_ARTICLE_END}`,
    );
  });

  it('preserves the content unchanged', () => {
    const content = 'Some article\n\nWith multiple paragraphs.';
    const result = wrapReferenceArticle(content);
    expect(result).toContain(content);
    expect(result.startsWith(REFERENCE_ARTICLE_BEGIN)).toBe(true);
    expect(result.endsWith(REFERENCE_ARTICLE_END)).toBe(true);
  });
});

describe('buildPhaseSystemPrompt with injectGuard', () => {
  it('injectGuard=true: appends injectionGuard at the end', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, undefined, true);
    expect(result).toContain(injectionGuard);
    expect(result.endsWith(injectionGuard)).toBe(true);
  });

  it('injectGuard=true with phase=map: guard comes after MAP_PHASE_INSTRUCTION', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'map', true);
    expect(result).toContain(injectionGuard);
    expect(result.endsWith(injectionGuard)).toBe(true);
    const mapIdx = result.indexOf('MAP phase');
    const guardIdx = result.indexOf('SECURITY NOTE');
    expect(guardIdx).toBeGreaterThan(mapIdx);
  });

  it('injectGuard=true with phase=reduce: guard comes after REDUCE_PHASE_INSTRUCTION', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, 'reduce', true);
    expect(result).toContain(injectionGuard);
    expect(result.endsWith(injectionGuard)).toBe(true);
    const reduceIdx = result.indexOf('REDUCE phase');
    const guardIdx = result.indexOf('SECURITY NOTE');
    expect(guardIdx).toBeGreaterThan(reduceIdx);
  });

  it('injectGuard=false (default): does NOT contain injectionGuard', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE);
    expect(result).not.toContain(injectionGuard);
  });

  it('injectGuard=false explicitly: does NOT contain injectionGuard', () => {
    const result = buildPhaseSystemPrompt(BASE, '', AUTO_DIRECTIVE, undefined, false);
    expect(result).not.toContain(injectionGuard);
  });
});

// ── Integration-style tests capturing ConverseCommand input ─────────────────

// Minimal valid AiConfig for testing
const MOCK_CONFIG = {
  baseSystemPrompt: 'Base system prompt.',
  promptOverrides: {} as Record<string, string>,
  modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  modelOverrides: {} as Record<string, string>,
  maxTokens: 4096,
  temperature: 0.5,
  topP: 0.9,
  languageDefault: 'auto' as const,
  perUserDailyGenerationCap: 100,
  maxNotesPerRun: 25,
  tokenBudget: 8192,
  pollyVoiceId: 'Camila',
  pollyEngine: 'neural' as const,
  speedRate: 'medium',
  enabledMaterialTypes: {} as Record<string, boolean>,
  generationEnabled: true,
  version: 0,
  updatedBy: 'system',
  updatedAt: '',
};

// Fake ConverseCommand output — a toolUse block with submit_study_material + valid flashcards input
const FAKE_FLASHCARDS_RESPONSE = {
  output: {
    message: {
      content: [
        {
          toolUse: {
            name: 'submit_study_material',
            input: {
              cards: [{ front: 'Q', back: 'A' }],
            },
          },
        },
      ],
    },
  },
  usage: { inputTokens: 100, outputTokens: 50 },
};

vi.mock('../config.js', () => ({
  resolveAiConfig: vi.fn(),
  MAX_TOKENS_BY_TYPE: {
    flashcards: 4096,
    quiz: 4096,
    assignment: 2048,
    summary: 1024,
    glossary: 2048,
    study_guide: 4096,
  },
}));

vi.mock('../ocr/retry.js', () => ({
  withBedrockRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

// We'll capture what was passed to ConverseCommand's constructor
let capturedCommandInput: Record<string, unknown> | null = null;

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class MockConverseCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
      capturedCommandInput = input;
    }
  }
  class MockBedrockRuntimeClient {
    send(_cmd: MockConverseCommand) {
      return Promise.resolve(FAKE_FLASHCARDS_RESPONSE);
    }
  }
  return {
    BedrockRuntimeClient: MockBedrockRuntimeClient,
    ConverseCommand: MockConverseCommand,
  };
});

describe('generateStudyMaterial — contentTrust integration', () => {
  beforeEach(async () => {
    capturedCommandInput = null;
    const { resolveAiConfig } = await import('../config.js');
    vi.mocked(resolveAiConfig).mockResolvedValue(MOCK_CONFIG as any);
  });

  it("contentTrust='web-fetched': user message contains delimiters and system contains injectionGuard", async () => {
    const { generateStudyMaterial } = await import('../generate.js');
    await generateStudyMaterial({
      type: 'flashcards',
      noteMarkdown: 'SECRET BODY',
      noteTitle: 'Test Title',
      contentTrust: 'web-fetched',
    });

    expect(capturedCommandInput).not.toBeNull();
    const cmd = capturedCommandInput!;

    // User message should contain delimiters and the content
    const messages = cmd.messages as Array<{ role: string; content: Array<{ text: string }> }>;
    const userText = messages[0].content[0].text;
    expect(userText).toContain('--- BEGIN REFERENCE ARTICLE ---');
    expect(userText).toContain('--- END REFERENCE ARTICLE ---');
    expect(userText).toContain('SECRET BODY');

    // System prompt should contain the injectionGuard
    const system = cmd.system as Array<{ text: string }>;
    expect(system[0].text).toContain(injectionGuard);
  });

  it("contentTrust='user-authored': no delimiters in user message, no injectionGuard in system", async () => {
    const { generateStudyMaterial } = await import('../generate.js');
    await generateStudyMaterial({
      type: 'flashcards',
      noteMarkdown: 'NORMAL BODY',
      noteTitle: 'Test Title',
      contentTrust: 'user-authored',
    });

    expect(capturedCommandInput).not.toBeNull();
    const cmd = capturedCommandInput!;

    const messages = cmd.messages as Array<{ role: string; content: Array<{ text: string }> }>;
    const userText = messages[0].content[0].text;
    expect(userText).not.toContain('--- BEGIN REFERENCE ARTICLE ---');
    expect(userText).not.toContain('--- END REFERENCE ARTICLE ---');

    const system = cmd.system as Array<{ text: string }>;
    expect(system[0].text).not.toContain(injectionGuard);
  });

  it('contentTrust omitted (default): behaves as user-authored', async () => {
    const { generateStudyMaterial } = await import('../generate.js');
    await generateStudyMaterial({
      type: 'flashcards',
      noteMarkdown: 'NORMAL BODY',
      noteTitle: 'Test Title',
    });

    expect(capturedCommandInput).not.toBeNull();
    const cmd = capturedCommandInput!;

    const messages = cmd.messages as Array<{ role: string; content: Array<{ text: string }> }>;
    const userText = messages[0].content[0].text;
    expect(userText).not.toContain('--- BEGIN REFERENCE ARTICLE ---');

    const system = cmd.system as Array<{ text: string }>;
    expect(system[0].text).not.toContain(injectionGuard);
  });
});
