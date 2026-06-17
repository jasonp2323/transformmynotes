import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @aws-sdk/client-polly ───────────────────────────────────────────────
// Capture SynthesizeSpeechCommand input and control the send response.

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-polly', () => {
  class MockSynthesizeSpeechCommand {
    public input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class MockPollyClient {
    send(cmd: MockSynthesizeSpeechCommand) {
      return mockSend(cmd);
    }
  }

  return {
    PollyClient: MockPollyClient,
    SynthesizeSpeechCommand: MockSynthesizeSpeechCommand,
  };
});

// ── Import AFTER mocks are wired ─────────────────────────────────────────────
import { synthesizeSpeech, xmlEscape } from '../../src/tts/polly';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAudioResponse(bytes: Uint8Array) {
  return {
    AudioStream: {
      transformToByteArray: vi.fn().mockResolvedValue(bytes),
    },
  };
}

function lastCommandInput(): Record<string, unknown> {
  const cmd = mockSend.mock.calls[mockSend.mock.calls.length - 1][0] as {
    input: Record<string, unknown>;
  };
  return cmd.input;
}

describe('xmlEscape', () => {
  it('escapes & first, then <, >, ", and \'', () => {
    expect(xmlEscape('a & b < c > d " e \' f')).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });

  it('does not double-escape ampersands', () => {
    expect(xmlEscape('<tag>')).toBe('&lt;tag&gt;');
    expect(xmlEscape('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });
});

describe('synthesizeSpeech', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('builds a SynthesizeSpeechCommand with mp3/neural/pt-BR/Camila for plain text', async () => {
    mockSend.mockResolvedValue(makeAudioResponse(new Uint8Array([1, 2, 3])));
    await synthesizeSpeech('olá', 'Camila', 'neural');

    const input = lastCommandInput();
    expect(input.OutputFormat).toBe('mp3');
    expect(input.Engine).toBe('neural');
    expect(input.LanguageCode).toBe('pt-BR');
    expect(input.VoiceId).toBe('Camila');
    expect(input.TextType).toBe('text');
    expect(input.Text).toBe('olá');
  });

  it('uses SSML with a <prosody rate> wrapper when ssmlRate is supplied', async () => {
    mockSend.mockResolvedValue(makeAudioResponse(new Uint8Array([9])));
    await synthesizeSpeech('texto lento', 'Camila', 'neural', 'slow');

    const input = lastCommandInput();
    expect(input.TextType).toBe('ssml');
    expect(input.Text).toBe('<speak><prosody rate="slow">texto lento</prosody></speak>');
  });

  it('XML-escapes malicious text so SSML cannot be injected', async () => {
    mockSend.mockResolvedValue(makeAudioResponse(new Uint8Array([0])));
    const malicious = '</prosody><break time="10s"/><prosody rate="x-fast">';
    await synthesizeSpeech(malicious, 'Camila', 'neural', 'slow');

    const input = lastCommandInput();
    const text = input.Text as string;
    // The raw injection payload must NOT appear verbatim.
    expect(text).not.toContain('</prosody><break');
    // Escaped entities must be present instead.
    expect(text).toContain('&lt;/prosody&gt;');
    expect(text).toContain('&lt;break');
    expect(text).toContain('&quot;');
    // Still wrapped in exactly one legitimate prosody element.
    expect(text.startsWith('<speak><prosody rate="slow">')).toBe(true);
    expect(text.endsWith('</prosody></speak>')).toBe(true);
  });

  it('throws when voiceId is empty and never calls Polly', async () => {
    await expect(synthesizeSpeech('olá', '', 'neural')).rejects.toThrow(/voiceId is required/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('throws when engine is empty and never calls Polly', async () => {
    await expect(synthesizeSpeech('olá', 'Camila', '')).rejects.toThrow(/engine is required/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns audioBytes from the AudioStream and the ORIGINAL text length as charCount', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    mockSend.mockResolvedValue(makeAudioResponse(bytes));
    const result = await synthesizeSpeech('cinco', 'Camila', 'neural');

    expect(result.audioBytes).toBe(bytes);
    expect(result.charCount).toBe(5); // 'cinco'.length, NOT the wrapped/escaped length
  });

  it('throws when the Polly response has no AudioStream', async () => {
    mockSend.mockResolvedValue({});
    await expect(synthesizeSpeech('olá', 'Camila', 'neural')).rejects.toThrow(/AudioStream/);
  });
});
