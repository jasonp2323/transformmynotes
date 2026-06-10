import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @aws-sdk/client-bedrock-runtime ─────────────────────────────────────
// We capture constructor input from ConverseCommand and control the send response.

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

// ── Import AFTER mocks are wired ───────────────────────────────────────────
// (vitest hoists vi.mock calls so this is safe at module level)
import { transcribeImage, SYSTEM_PROMPT } from '../../src/ocr/bedrock';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConverseSendResponse(text: string) {
  return {
    output: {
      message: {
        content: [{ text }],
      },
    },
    usage: { inputTokens: 42, outputTokens: 17 },
  };
}

describe('SYSTEM_PROMPT', () => {
  it('contains the phrase "Preserve all accented characters"', () => {
    expect(SYSTEM_PROMPT).toContain('Preserve all accented characters');
  });

  it('contains the phrase "ONLY the Markdown"', () => {
    expect(SYSTEM_PROMPT).toContain('ONLY the Markdown');
  });

  it('mentions Brazilian Portuguese', () => {
    expect(SYSTEM_PROMPT).toContain('Brazilian Portuguese');
  });

  it('instructs use of ## for main section headings', () => {
    expect(SYSTEM_PROMPT).toContain('##');
  });

  it('contains the [?] illegibility marker instruction', () => {
    expect(SYSTEM_PROMPT).toContain('[?]');
  });
});

describe('transcribeImage', () => {
  beforeEach(() => {
    process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value = 'us.anthropic.test-model';
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  });

  it('calls ConverseCommand with inferenceConfig.maxTokens === 4096', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Transcribed text.'));
    const imageBytes = new Uint8Array([1, 2, 3]);
    await transcribeImage(imageBytes);

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const inferenceConfig = cmd.input.inferenceConfig as { maxTokens: number };
    expect(inferenceConfig.maxTokens).toBe(4096);
  });

  it('sets system[0].text to SYSTEM_PROMPT', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Some output.'));
    await transcribeImage(new Uint8Array([10, 20]));

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const system = cmd.input.system as Array<{ text: string }>;
    expect(system[0].text).toBe(SYSTEM_PROMPT);
  });

  it('passes the image bytes as a jpeg image content block', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Image transcription.'));
    const imageBytes = new Uint8Array([255, 0, 128]);
    await transcribeImage(imageBytes);

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    const messages = cmd.input.messages as Array<{
      role: string;
      content: Array<Record<string, unknown>>;
    }>;
    const userMessage = messages[0];
    expect(userMessage.role).toBe('user');
    const imageBlock = userMessage.content[0] as {
      image: { format: string; source: { bytes: Uint8Array } };
    };
    expect(imageBlock.image.format).toBe('jpeg');
    expect(imageBlock.image.source.bytes).toBe(imageBytes);
  });

  it('returns the concatenated assistant text in rawText', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Hello, world!'));
    const result = await transcribeImage(new Uint8Array([1]));
    expect(result.rawText).toBe('Hello, world!');
  });

  it('concatenates multiple content blocks into rawText', async () => {
    mockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'Part one. ' }, { text: 'Part two.' }],
        },
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const result = await transcribeImage(new Uint8Array([1]));
    expect(result.rawText).toBe('Part one. Part two.');
  });

  it('returns usage inputTokens and outputTokens from the response', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Tokens test.'));
    const result = await transcribeImage(new Uint8Array([1]));
    expect(result.usage?.inputTokens).toBe(42);
    expect(result.usage?.outputTokens).toBe(17);
  });

  it('passes the modelId from SST_RESOURCE_BEDROCK_MODEL_ID_value to ConverseCommand', async () => {
    mockSend.mockResolvedValue(makeConverseSendResponse('Model id check.'));
    await transcribeImage(new Uint8Array([1]));

    const cmd = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input.modelId).toBe('us.anthropic.test-model');
  });

  it('handles an empty content array gracefully (returns empty rawText)', async () => {
    mockSend.mockResolvedValue({
      output: { message: { content: [] } },
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const result = await transcribeImage(new Uint8Array([1]));
    expect(result.rawText).toBe('');
  });

  it('retries on ThrottlingException and returns the successful result', async () => {
    const throttle = Object.assign(new Error('rate limited'), { name: 'ThrottlingException' });
    mockSend
      .mockRejectedValueOnce(throttle)
      .mockRejectedValueOnce(throttle)
      .mockResolvedValue(makeConverseSendResponse('Recovered text.'));
    const result = await transcribeImage(new Uint8Array([1]));
    expect(result.rawText).toBe('Recovered text.');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });
});
