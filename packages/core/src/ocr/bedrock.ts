import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { withBedrockRetry } from './retry.js';

/**
 * The system prompt used for handwriting transcription.
 * Exported so it can be asserted in unit tests.
 */
export const SYSTEM_PROMPT =
  'You are an expert transcription assistant specialising in handwritten study notes, including notes written in Brazilian Portuguese or that contain Portuguese/Spanish vocabulary. Your task is to convert the handwritten page in the image into clean, well-structured Markdown. Rules: (1) Preserve all accented characters exactly as written (ã, ç, é, ê, ô, etc.). (2) Infer document structure — use `##` for main section headings, `###` for sub-sections, `- ` for bullet lists, numbered lists for ordered items, and pipe-delimited tables for tabular data. (3) Wrap key terms or highlighted phrases in `==term==` (double-equals). (4) Do NOT add commentary, preamble, or trailing notes — output ONLY the Markdown. (5) If a word is genuinely illegible, write `[?]` in its place.';

export interface BedrockResult {
  rawText: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const client = new BedrockRuntimeClient({});

/**
 * Consumes a Bedrock `ConverseStream` event stream, accumulating the emitted
 * text and capturing token usage. Pure (no AWS calls) so it can be unit-tested
 * with a fake async-iterable.
 *
 * - Appends each non-empty `contentBlockDelta.delta.text` to the accumulator
 *   and forwards it to `onDelta`.
 * - Captures `metadata.usage` if a metadata event arrives.
 */
export async function consumeOcrStream(
  stream: AsyncIterable<ConverseStreamOutput> | undefined,
  onDelta?: (textDelta: string) => void,
): Promise<{ rawText: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  if (!stream) {
    return { rawText: '' };
  }

  let rawText = '';
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;

  for await (const event of stream) {
    const text =
      'contentBlockDelta' in event ? event.contentBlockDelta?.delta?.text : undefined;
    if (typeof text === 'string' && text.length > 0) {
      rawText += text;
      onDelta?.(text);
    }

    const eventUsage = 'metadata' in event ? event.metadata?.usage : undefined;
    if (eventUsage) {
      usage = {
        inputTokens: eventUsage.inputTokens,
        outputTokens: eventUsage.outputTokens,
      };
    }
  }

  return { rawText, usage };
}

/**
 * Transcribes a JPEG image using AWS Bedrock's Converse API.
 * Reads the model id from the SST resource binding (BEDROCK_MODEL_ID).
 * Wraps the call in exponential-back-off retry logic for transient errors.
 *
 * When `onDelta` is provided, the streaming `ConverseStream` API is used and
 * each text delta is forwarded to the callback as it arrives; otherwise the
 * non-streaming `Converse` API is used unchanged.
 */
export async function transcribeImage(
  imageBytes: Uint8Array,
  onDelta?: (textDelta: string) => void,
): Promise<BedrockResult> {
  const modelId = process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  if (!modelId) {
    throw new Error(
      'Missing required env var SST_RESOURCE_BEDROCK_MODEL_ID_value: the Bedrock model id ' +
        'is not bound. Expected it from the SST secret link (BEDROCK_MODEL_ID).',
    );
  }

  const system = [{ text: SYSTEM_PROMPT }];
  const messages = [
    {
      role: 'user' as const,
      content: [
        {
          image: {
            format: 'jpeg' as const,
            source: { bytes: imageBytes },
          },
        },
      ],
    },
  ];
  const inferenceConfig = { maxTokens: 4096 };

  if (onDelta) {
    const streamCommand = new ConverseStreamCommand({
      modelId,
      system,
      messages,
      inferenceConfig,
    });

    const response = await withBedrockRetry(() => client.send(streamCommand));
    const { rawText, usage } = await consumeOcrStream(response.stream, onDelta);

    return { rawText, model: modelId, usage };
  }

  const command = new ConverseCommand({
    modelId,
    system,
    messages,
    inferenceConfig,
  });

  const response = await withBedrockRetry(() => client.send(command));

  const contentBlocks = response.output?.message?.content ?? [];
  const rawText = contentBlocks
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('');

  return {
    rawText,
    model: modelId,
    usage: {
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    },
  };
}
