import { describe, it, expect, vi } from 'vitest';
import { consumeConverseStream } from '../generate.js';

async function* fakeStream(events: unknown[]) {
  for (const e of events) yield e;
}

// JSON fragments used across tests — stored as variables so esbuild doesn't
// mistake the trailing `}` / `}]}` in the string value for a closing brace of
// the surrounding object literal.
const CHUNK1 = '{"cards":';
const CHUNK2 = '[{"front":"Q",';
const CHUNK3 = '"back":"A"}]}';
const TITLE_START = '{"title":';
const TITLE_END = '"hello"}';
const TEXT_END = '1}';
const NESTED_FULL = '{"a":';

describe('consumeConverseStream', () => {
  it('accumulates tool-use input deltas, forwards them, and parses the final JSON', async () => {
    const onDelta = vi.fn();
    const events: unknown[] = [
      { contentBlockDelta: { delta: { toolUse: { input: CHUNK1 } } } },
      { contentBlockDelta: { delta: { toolUse: { input: CHUNK2 } } } },
      { contentBlockDelta: { delta: { toolUse: { input: CHUNK3 } } } },
      { metadata: { usage: { inputTokens: 10, outputTokens: 20 } } },
    ];
    const result = await consumeConverseStream(fakeStream(events), onDelta);
    expect(onDelta).toHaveBeenNthCalledWith(1, CHUNK1);
    expect(onDelta).toHaveBeenNthCalledWith(2, CHUNK2);
    expect(onDelta).toHaveBeenNthCalledWith(3, CHUNK3);
    expect(onDelta).toHaveBeenCalledTimes(3);
    expect(result.toolUseInput).toEqual({ cards: [{ front: 'Q', back: 'A' }] });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('forwards plain text deltas too', async () => {
    const onDelta = vi.fn();
    const events: unknown[] = [
      { contentBlockDelta: { delta: { text: TITLE_START } } },
      { contentBlockDelta: { delta: { text: TITLE_END } } },
    ];
    const result = await consumeConverseStream(fakeStream(events), onDelta);
    expect(onDelta).toHaveBeenNthCalledWith(1, TITLE_START);
    expect(onDelta).toHaveBeenNthCalledWith(2, TITLE_END);
    expect(onDelta).toHaveBeenCalledTimes(2);
    expect(result.toolUseInput).toEqual({ title: 'hello' });
  });

  it('captures usage from a metadata event that arrives mid-stream', async () => {
    const events: unknown[] = [
      { metadata: { usage: { inputTokens: 5, outputTokens: 15 } } },
      { contentBlockDelta: { delta: { toolUse: { input: '{}' } } } },
    ];
    const result = await consumeConverseStream(fakeStream(events), () => {});
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 15 });
  });

  it('returns undefined toolUseInput when the stream emits no delta content', async () => {
    const events: unknown[] = [{ metadata: { usage: { inputTokens: 1, outputTokens: 2 } } }];
    const result = await consumeConverseStream(fakeStream(events), () => {});
    expect(result.toolUseInput).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it('throws on malformed accumulated JSON', async () => {
    const events: unknown[] = [
      { contentBlockDelta: { delta: { toolUse: { input: '{not json' } } } },
    ];
    await expect(
      consumeConverseStream(fakeStream(events), () => {}),
    ).rejects.toThrow('Failed to parse streamed tool-use JSON');
  });

  it('handles mixed toolUse and text deltas in sequence', async () => {
    const collected: string[] = [];
    const onDelta = (s: string) => collected.push(s);
    const events: unknown[] = [
      { contentBlockDelta: { delta: { toolUse: { input: NESTED_FULL } } } },
      { contentBlockDelta: { delta: { text: TEXT_END } } },
    ];
    const result = await consumeConverseStream(fakeStream(events), onDelta);
    expect(collected).toEqual([NESTED_FULL, TEXT_END]);
    expect(result.toolUseInput).toEqual({ a: 1 });
  });

  it('ignores events with no contentBlockDelta or metadata', async () => {
    const onDelta = vi.fn();
    const events: unknown[] = [
      { messageStart: { role: 'assistant' } },
      { contentBlockStart: { contentBlockIndex: 0 } },
      { contentBlockDelta: { delta: { toolUse: { input: '"ok"' } } } },
      { contentBlockStop: {} },
      { messageStop: { stopReason: 'tool_use' } },
    ];
    const result = await consumeConverseStream(fakeStream(events), onDelta);
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(result.toolUseInput).toBe('ok');
  });
});
