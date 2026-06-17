/**
 * Integration test: `processStudyGeneration` happy path + idempotency + failure
 * (M13). Exercises the real `getStudySet` / `claimStudySet` / `markStudySetReady`
 * / `markStudySetFailed` round-trip against dynalite, with the I/O-heavy
 * `getNoteMarkdown` / `generate` / `putBody` deps injected as mocks so no real
 * S3 / Bedrock is hit.
 *
 * The dynalite server is started by the integration globalSetup and the
 * production client is pointed at it via env vars from the integration
 * setupFiles (so importing `@transformmynotes/core` db functions hits dynalite).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildStudySetItem, putStudySet, getStudySet } from '@transformmynotes/core';
import { processStudyGeneration } from './study-generation';

const rand = () => Math.random().toString(36).slice(2);

describe('processStudyGeneration — happy path + idempotency', () => {
  it('generates a study set, marks it ready, and skips a second run', async () => {
    const sub = `sub-study-job-happy-${rand()}`;
    const studySetId = `set-happy-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-job-happy'],
        type: 'flashcards',
        title: 'Happy Set',
        status: 'queued',
        language: 'pt-BR',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const generateSpy = vi
      .fn()
      .mockResolvedValue({ payload: { cards: [] }, promptVersion: 'abcd1234' });

    const r1 = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
    });
    expect(r1.outcome).toBe('ready');

    const after = await getStudySet(sub, studySetId);
    expect(after!.status).toBe('ready');
    expect(after!.bodyS3Key).toBe(`study/users/${sub}/${studySetId}.json`);

    // Idempotency: a second run must skip without re-generating.
    const generateSpy2 = vi.fn().mockResolvedValue({ payload: {}, promptVersion: 'x' });
    const r2 = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn(),
      generate: generateSpy2,
      putBody: vi.fn(),
    });
    expect(r2.outcome).toBe('skipped');
    expect(generateSpy2).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// M17.2.1 — provenance: every persisted card must carry sourceNoteIds
// ---------------------------------------------------------------------------

describe('processStudyGeneration — provenance (M17.2.1)', () => {
  it('shims sourceNoteIds onto every card in the persisted payload (single-pass, two source notes)', async () => {
    const sub = `sub-prov-${Math.random().toString(36).slice(2)}`;
    const studySetId = `set-prov-${Math.random().toString(36).slice(2)}`;
    const sourceNoteIds = ['note-src-1', 'note-src-2'];

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds,
        type: 'flashcards',
        title: 'Provenance Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    // Three cards: first has a valid sourceNoteIds subset, second has a bogus id,
    // third omits the field entirely — the shim must normalise all three.
    const mockPayload = {
      cards: [
        { front: 'Q1', back: 'A1', sourceNoteIds: ['note-src-1'] },
        { front: 'Q2', back: 'A2', sourceNoteIds: ['bogus-id'] },
        { front: 'Q3', back: 'A3' /* no sourceNoteIds */ },
      ],
    };

    let capturedJson = '';
    const putBodySpy = vi.fn(async (_sub: string, _id: string, json: string) => {
      capturedJson = json;
    });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: vi.fn().mockResolvedValue({ payload: mockPayload, promptVersion: 'test1234' }),
      putBody: putBodySpy,
    });

    expect(result.outcome).toBe('ready');
    expect(putBodySpy).toHaveBeenCalledTimes(1);

    const persisted = JSON.parse(capturedJson) as {
      cards: Array<{ front: string; back: string; sourceNoteIds?: string[] }>;
    };

    // Every card must have a non-empty sourceNoteIds drawn only from the allowed set.
    for (const card of persisted.cards) {
      expect(Array.isArray(card.sourceNoteIds)).toBe(true);
      expect(card.sourceNoteIds!.length).toBeGreaterThanOrEqual(1);
      for (const id of card.sourceNoteIds!) {
        expect(sourceNoteIds).toContain(id);
      }
    }

    // Card 0: valid subset → unchanged.
    expect(persisted.cards[0]!.sourceNoteIds).toEqual(['note-src-1']);
    // Card 1: bogus id → falls back to full allowed set.
    expect(persisted.cards[1]!.sourceNoteIds).toEqual(sourceNoteIds);
    // Card 2: missing → falls back to full allowed set.
    expect(persisted.cards[2]!.sourceNoteIds).toEqual(sourceNoteIds);
  });
});

describe('processStudyGeneration — failure', () => {
  it('marks the study set failed with a sanitised error', async () => {
    const sub = `sub-study-job-fail-${rand()}`;
    const studySetId = `set-fail-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-job-fail'],
        type: 'flashcards',
        title: 'Fail Set',
        status: 'queued',
        language: 'pt-BR',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const r = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockRejectedValue(new Error('NoSuchKey')),
      generate: vi.fn().mockResolvedValue({ payload: {}, promptVersion: 'x' }),
      putBody: vi.fn().mockResolvedValue(undefined),
    });
    expect(r.outcome).toBe('failed');

    const after = await getStudySet(sub, studySetId);
    expect(after!.status).toBe('failed');
    expect(typeof after!.error === 'string' && after!.error.length > 0).toBe(true);
  });
});
