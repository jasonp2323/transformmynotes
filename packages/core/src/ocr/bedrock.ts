import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { withBedrockRetry } from './retry.js';

/**
 * The system prompt used for handwriting transcription.
 * Exported so it can be asserted in unit tests.
 */
export const SYSTEM_PROMPT =
  'You are an expert transcription assistant specialising in handwritten study notes, including notes written in Brazilian Portuguese or that contain Portuguese/Spanish vocabulary. Your task is to convert the handwritten page in the image into clean, well-structured Markdown. Rules: (1) Preserve all accented characters exactly as written (ã, ç, é, ê, ô, etc.). (2) Infer document structure — use `##` for main section headings, `###` for sub-sections, `- ` for bullet lists, numbered lists for ordered items, and pipe-delimited tables for tabular data. (3) Wrap key terms or highlighted phrases in `==term==` (double-equals). (4) Do NOT add commentary, preamble, or trailing notes — output ONLY the Markdown. (5) If a word is genuinely illegible, write `[?]` in its place.';

export interface BedrockResult {
  rawText: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const client = new BedrockRuntimeClient({});

/**
 * Transcribes a JPEG image using AWS Bedrock's Converse API.
 * Reads the model id from the SST resource binding (BEDROCK_MODEL_ID).
 * Wraps the call in exponential-back-off retry logic for transient errors.
 */
export async function transcribeImage(imageBytes: Uint8Array): Promise<BedrockResult> {
  const modelId = process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  if (!modelId) {
    throw new Error(
      'Missing required env var SST_RESOURCE_BEDROCK_MODEL_ID_value: the Bedrock model id ' +
        'is not bound. Expected it from the SST secret link (BEDROCK_MODEL_ID).',
    );
  }

  const command = new ConverseCommand({
    modelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [
      {
        role: 'user',
        content: [
          {
            image: {
              format: 'jpeg',
              source: { bytes: imageBytes },
            },
          },
        ],
      },
    ],
    inferenceConfig: { maxTokens: 4096 },
  });

  const response = await withBedrockRetry(() => client.send(command));

  const contentBlocks = response.output?.message?.content ?? [];
  const rawText = contentBlocks
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('');

  return {
    rawText,
    usage: {
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    },
  };
}
