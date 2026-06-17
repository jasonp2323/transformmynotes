/**
 * Integration test: map-reduce code paths in `processStudyGeneration` (M17).
 *
 * Tests the three token-budget branches:
 *   1. Map-reduce: combined est > resolveContextLimit() but ≤ HARD_CAP_TOKENS.
 *   2. Direct (single-pass): combined est ≤ resolveContextLimit().
 *   3. Too-large: combined est > HARD_CAP_TOKENS.
 *
 * Uses the real `getStudySet` / `claimStudySet` / `markStudySetReady` /
 * `markStudySetFailed` / `markStudySetTooLarge` round-trip against dynalite.
 * I/O-heavy deps (`getNoteMarkdown`, `generate`, `putBody`) are injected as
 * mocks — no real S3 or Bedrock is hit.
 *
 * The dynalite server is started by the integration globalSetup and the
 * production DynamoDB client is pointed at it via env vars from the integration
 * setupFiles (so importing `@transformmynotes/core` db functions hits dynalite).
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { buildStudySetItem, putStudySet, getStudySet } from '@transformmynotes/core';
import { processStudyGeneration } from './study-generation';

const rand = () => Math.random().toString(36).slice(2);

// Helper: restore the env var to its original value after each test.
const LIMIT_ENV_KEY = 'SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value';

afterEach(() => {
  delete process.env[LIMIT_ENV_KEY];
});

// ---------------------------------------------------------------------------
// 1. Map-reduce path
// ---------------------------------------------------------------------------
describe('processStudyGeneration — map-reduce path (M17)', () => {
  it('runs map→dedup→reduce, marks ready with map-reduce metadata', async () => {
    const sub = `sub-mr-happy-${rand()}`;
    const studySetId = `set-mr-happy-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['nA', 'nB', 'nC'],
        type: 'flashcards',
        title: 'MR Happy Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    // Set a very small context limit so the combined body triggers map-reduce
    // (~300 chars × 3 notes = ~225 tokens > 50-token limit).
    process.env[LIMIT_ENV_KEY] = '50';

    // Each note body is ~300 chars (75 tokens individually, 225 combined > 50 limit).
    const noteBodyA = 'A'.repeat(50) + ' ' + 'biology note one '.repeat(10);
    const noteBodyB = 'B'.repeat(50) + ' ' + 'chemistry note two '.repeat(10);
    const noteBodyC = 'C'.repeat(50) + ' ' + 'physics note three '.repeat(10);

    const noteBodyMap: Record<string, string> = {
      nA: noteBodyA,
      nB: noteBodyB,
      nC: noteBodyC,
    };

    const generateSpy = vi.fn().mockImplementation(
      async (input: { phase?: string }) => {
        if (input.phase === 'map') {
          return {
            payload: [{ text: 'cand1' }, { text: 'cand2' }],
            promptVersion: 'map12345',
          };
        }
        if (input.phase === 'reduce') {
          return {
            payload: { cards: [{ front: 'F', back: 'B' }] },
            promptVersion: 'red12345',
          };
        }
        // Fallthrough — should not be called without a phase in this test.
        return { payload: {}, promptVersion: 'fallthrough' };
      },
    );

    const putBodySpy = vi.fn().mockResolvedValue(undefined);

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockImplementation(async (_sub: string, noteId: string) => {
        const body = noteBodyMap[noteId];
        if (!body) throw new Error(`note not found: ${noteId}`);
        return body;
      }),
      generate: generateSpy,
      putBody: putBodySpy,
    });

    expect(result.outcome).toBe('ready');

    const persisted = await getStudySet(sub, studySetId);
    expect(persisted).toBeDefined();
    expect(persisted!.status).toBe('ready');
    expect(persisted!.mapReduce).toBe(true);
    expect(typeof persisted!.chunkCount).toBe('number');
    expect(persisted!.chunkCount).toBeGreaterThanOrEqual(1);
    expect(persisted!.inputNoteCount).toBe(3);

    // generate was called with at least one map phase and exactly one reduce phase.
    const mapCalls = generateSpy.mock.calls.filter((c) => c[0].phase === 'map');
    const reduceCalls = generateSpy.mock.calls.filter((c) => c[0].phase === 'reduce');
    expect(mapCalls.length).toBeGreaterThanOrEqual(1);
    expect(reduceCalls.length).toBe(1);

    // The reduce call's candidates must be a non-empty array whose items carry sourceNoteIds.
    const reduceCandidates = reduceCalls[0][0].candidates as Array<{
      text: string;
      sourceNoteIds: string[];
    }>;
    expect(Array.isArray(reduceCandidates)).toBe(true);
    expect(reduceCandidates.length).toBeGreaterThan(0);
    for (const cand of reduceCandidates) {
      expect(Array.isArray(cand.sourceNoteIds)).toBe(true);
      expect(cand.sourceNoteIds.length).toBeGreaterThan(0);
    }

    // putBody was called exactly once.
    expect(putBodySpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Direct (single-pass) path
// ---------------------------------------------------------------------------
describe('processStudyGeneration — direct single-pass path (M17)', () => {
  it('generates in one pass, marks ready without map-reduce metadata', async () => {
    const sub = `sub-direct-${rand()}`;
    const studySetId = `set-direct-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['n1', 'n2'],
        type: 'flashcards',
        title: 'Direct Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    // Large context limit so combined short bodies always fit in direct path.
    process.env[LIMIT_ENV_KEY] = '100000';

    const generateSpy = vi
      .fn()
      .mockResolvedValue({ payload: { cards: [{ front: 'Q', back: 'A' }] }, promptVersion: 'abc123' });
    const putBodySpy = vi.fn().mockResolvedValue(undefined);

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('short note body'),
      generate: generateSpy,
      putBody: putBodySpy,
    });

    expect(result.outcome).toBe('ready');

    const persisted = await getStudySet(sub, studySetId);
    expect(persisted).toBeDefined();
    expect(persisted!.status).toBe('ready');
    // mapReduce should be absent (falsy) on direct path.
    expect(persisted!.mapReduce).toBeFalsy();
    // inputNoteCount should be 2.
    expect(persisted!.inputNoteCount).toBe(2);

    // generate called exactly once, with no phase field.
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const callArg = generateSpy.mock.calls[0][0];
    expect(callArg.phase).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Too-large path
// ---------------------------------------------------------------------------
describe('processStudyGeneration — too_large path (M17)', () => {
  it('marks the study set too_large without calling generate', async () => {
    const sub = `sub-toolarge-${rand()}`;
    const studySetId = `set-toolarge-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['bigA', 'bigB', 'bigC'],
        type: 'flashcards',
        title: 'Too Large Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    // Each ~300_000-char string → ~75_000 tokens; 3 × 75_000 = ~225_000 > HARD_CAP (200_000).
    const bigBody = 'x'.repeat(300_000);

    const generateSpy = vi.fn();
    const putBodySpy = vi.fn();

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue(bigBody),
      generate: generateSpy,
      putBody: putBodySpy,
    });

    expect(result.outcome).toBe('too_large');

    const persisted = await getStudySet(sub, studySetId);
    expect(persisted).toBeDefined();
    expect(persisted!.status).toBe('too_large');

    // generate and putBody must NOT have been called.
    expect(generateSpy).not.toHaveBeenCalled();
    expect(putBodySpy).not.toHaveBeenCalled();
  });
});
