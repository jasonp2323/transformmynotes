import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from '@aws-sdk/client-polly';
import { withPollyRetry } from './retry.js';

export interface PollyResult {
  audioBytes: Uint8Array;
  charCount: number;
}

const client = new PollyClient({});

/**
 * Escapes a string for safe inclusion inside an XML/SSML element.
 *
 * Replaces `&` FIRST (so the entity ampersands introduced by later replacements
 * are not double-escaped), then `<`, `>`, `"`, and `'`. This prevents SSML
 * injection when `text` originates from user-created card content (see M18.md
 * "Risks / open questions → SSML injection").
 */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Synthesizes speech from `text` using AWS Polly.
 *
 * Pure async function — the caller supplies the `voiceId` and `engine` (resolved
 * from the M19 admin AI config — AiConfig.pollyVoiceId / pollyEngine). When `ssmlRate` is provided
 * the text is wrapped in an SSML `<prosody rate>` element (the text is XML-escaped
 * to prevent SSML injection); otherwise it is sent as plain text.
 *
 * The Polly call is wrapped in `withPollyRetry` for transient-error back-off.
 * Returns the synthesized MP3 bytes plus the ORIGINAL `text` character count.
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  engine: string,
  ssmlRate?: string,
): Promise<PollyResult> {
  if (!voiceId || typeof voiceId !== 'string') {
    throw new Error('synthesizeSpeech: voiceId is required (AiConfig.pollyVoiceId is empty)');
  }
  if (!engine || typeof engine !== 'string') {
    throw new Error('synthesizeSpeech: engine is required (AiConfig.pollyEngine is empty)');
  }

  const useSsml = ssmlRate !== undefined;
  const inputText = useSsml
    ? `<speak><prosody rate="${ssmlRate}">${xmlEscape(text)}</prosody></speak>`
    : text;

  const command = new SynthesizeSpeechCommand({
    Text: inputText,
    TextType: useSsml ? 'ssml' : 'text',
    OutputFormat: 'mp3',
    // Engine/VoiceId are SDK string-literal unions; this function is pure and
    // accepts arbitrary config-supplied strings, so cast to the SDK types.
    Engine: engine as Engine,
    LanguageCode: 'pt-BR',
    VoiceId: voiceId as VoiceId,
  });

  const response = await withPollyRetry(() => client.send(command));

  if (!response.AudioStream) {
    throw new Error('synthesizeSpeech: Polly response did not include an AudioStream');
  }

  const audioBytes = await response.AudioStream.transformToByteArray();

  return {
    audioBytes,
    charCount: text.length,
  };
}
