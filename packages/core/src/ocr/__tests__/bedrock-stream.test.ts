import { describe, it, expect, vi } from 'vitest';
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import { consumeOcrStream } from '../bedrock.js';

describe('consumeOcrStream', () => {
  it('accumulates deltas, forwards them to onDelta in order, and captures usage', async () => {
    async function* fakeStream() {
      yield { contentBlockDelta: { delta: { text: 'Hello ' } } };
      yield { contentBlockDelta: { delta: { text: 'world' } } };
      yield { metadata: { usage: { inputTokens: 10, outputTokens: 5 } } };
    }

    const deltas: string[] = [];
    const onDelta = vi.fn((text: string) => {
      deltas.push(text);
    });

    const result = await consumeOcrStream(
      fakeStream() as unknown as AsyncIterable<ConverseStreamOutput>,
      onDelta,
    );

    expect(onDelta).toHaveBeenCalledTimes(2);
    expect(deltas).toEqual(['Hello ', 'world']);
    expect(result.rawText).toBe('Hello world');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('returns empty rawText and never calls onDelta when the stream is undefined', async () => {
    const onDelta = vi.fn();

    const result = await consumeOcrStream(undefined, onDelta);

    expect(result).toEqual({ rawText: '' });
    expect(result.usage).toBeUndefined();
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('leaves usage undefined when no metadata event arrives but still accumulates text', async () => {
    async function* fakeStream() {
      yield { contentBlockDelta: { delta: { text: 'foo' } } };
      yield { contentBlockDelta: { delta: { text: 'bar' } } };
    }

    const result = await consumeOcrStream(
      fakeStream() as unknown as AsyncIterable<ConverseStreamOutput>,
    );

    expect(result.rawText).toBe('foobar');
    expect(result.usage).toBeUndefined();
  });
});
