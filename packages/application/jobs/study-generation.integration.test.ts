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
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
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
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
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
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// M20.3 — document sources
// ---------------------------------------------------------------------------

describe('processStudyGeneration — document sources (M20.3)', () => {
  it('happy path: document-only sourceRefs resolves via getDocumentMarkdown', async () => {
    const sub = `sub-doc-happy-${rand()}`;
    const studySetId = `set-doc-happy-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: [],
        sourceRefs: [{ type: 'document', id: 'doc-1' }],
        type: 'flashcards',
        title: 'Doc Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const getDocumentMarkdownSpy = vi
      .fn()
      .mockResolvedValue({ text: '# Document content', contentTrust: 'user-authored' });
    const getNoteMarkdownSpy = vi.fn();

    let capturedJson = '';
    const putBodySpy = vi.fn(async (_s: string, _id: string, json: string) => {
      capturedJson = json;
    });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: getNoteMarkdownSpy,
      getDocumentMarkdown: getDocumentMarkdownSpy,
      generate: vi.fn().mockResolvedValue({
        payload: { cards: [{ front: 'Q', back: 'A', sourceNoteIds: ['doc-1'] }] },
        promptVersion: 'v1',
      }),
      putBody: putBodySpy,
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    // getDocumentMarkdown called with the right args
    expect(getDocumentMarkdownSpy).toHaveBeenCalledWith(sub, 'doc-1');
    // getNoteMarkdown must NOT be called for a document-only set
    expect(getNoteMarkdownSpy).not.toHaveBeenCalled();

    // Provenance should use the doc id as the allowed id
    const persisted = JSON.parse(capturedJson) as {
      cards: Array<{ front: string; back: string; sourceNoteIds?: string[] }>;
    };
    expect(persisted.cards[0]!.sourceNoteIds).toContain('doc-1');
  });

  it('mixed note + document refs: both resolvers are called', async () => {
    const sub = `sub-mixed-${rand()}`;
    const studySetId = `set-mixed-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['n1'],
        sourceRefs: [
          { type: 'note', id: 'n1' },
          { type: 'document', id: 'd1' },
        ],
        type: 'flashcards',
        title: 'Mixed Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const getNoteMarkdownSpy = vi.fn().mockResolvedValue('# Note body');
    const getDocumentMarkdownSpy = vi
      .fn()
      .mockResolvedValue({ text: '# Doc body', contentTrust: 'user-authored' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: getNoteMarkdownSpy,
      getDocumentMarkdown: getDocumentMarkdownSpy,
      generate: vi.fn().mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' }),
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(getNoteMarkdownSpy).toHaveBeenCalledOnce();
    expect(getDocumentMarkdownSpy).toHaveBeenCalledOnce();
  });

  it('backward-compat: legacy sourceNoteIds (no sourceRefs) resolves via getNoteMarkdown only', async () => {
    const sub = `sub-compat-${rand()}`;
    const studySetId = `set-compat-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['n1'],
        // no sourceRefs field — legacy path
        type: 'flashcards',
        title: 'Compat Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const getNoteMarkdownSpy = vi.fn().mockResolvedValue('# Note body');
    const getDocumentMarkdownSpy = vi.fn();

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: getNoteMarkdownSpy,
      getDocumentMarkdown: getDocumentMarkdownSpy,
      generate: vi.fn().mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' }),
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(getNoteMarkdownSpy).toHaveBeenCalledWith(sub, 'n1');
    expect(getDocumentMarkdownSpy).not.toHaveBeenCalled();
  });

  it('large document → map-reduce branch when token limit is set low', async () => {
    const sub = `sub-doc-mr-${rand()}`;
    const studySetId = `set-doc-mr-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: [],
        sourceRefs: [{ type: 'document', id: 'big' }],
        type: 'flashcards',
        title: 'Big Doc Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    // Drive map-reduce by setting a tiny context limit (100 tokens = 400 chars)
    // and providing a document body exceeding that threshold but well below HARD_CAP.
    const originalLimit = process.env.SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value;
    process.env.SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value = '100'; // 100 tokens → 400 chars

    // ~600 chars → ~150 tokens (> 100 limit, < 200_000 HARD_CAP)
    const largeDocBody = 'A'.repeat(600);

    const generateSpy = vi
      .fn()
      // MAP phase returns array candidates
      .mockResolvedValueOnce({ payload: [{ text: 'c1' }], promptVersion: 'v1' })
      // REDUCE phase returns final object
      .mockResolvedValueOnce({ payload: { cards: [{ front: 'Q', back: 'A' }] }, promptVersion: 'v1' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn(),
      getDocumentMarkdown: vi
        .fn()
        .mockResolvedValue({ text: largeDocBody, contentTrust: 'user-authored' }),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    // Restore env
    process.env.SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value = originalLimit;

    expect(result.outcome).toBe('ready');
    // generate must have been called twice (map + reduce)
    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(generateSpy.mock.calls[0]![0]).toMatchObject({ phase: 'map' });
    expect(generateSpy.mock.calls[1]![0]).toMatchObject({ phase: 'reduce' });

    // Confirm mapReduce flag persisted in DynamoDB
    const after = await getStudySet(sub, studySetId);
    expect(after!.mapReduce).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M21 — contentTrust threading (prompt-injection guard for web-fetched sources)
// ---------------------------------------------------------------------------

describe('processStudyGeneration — M21 contentTrust threading', () => {
  it("passes contentTrust 'web-fetched' to generate() when a document source resolves as web-fetched", async () => {
    const sub = `sub-trust-web-${rand()}`;
    const studySetId = `set-trust-web-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: [],
        sourceRefs: [{ type: 'document', id: 'web-doc-1' }],
        type: 'flashcards',
        title: 'Web Source Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const generateSpy = vi
      .fn()
      .mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn(),
      getDocumentMarkdown: vi
        .fn()
        .mockResolvedValue({ text: '# Web article', contentTrust: 'web-fetched' }),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(generateSpy).toHaveBeenCalledOnce();
    expect(generateSpy.mock.calls[0]![0]).toMatchObject({ contentTrust: 'web-fetched' });
  });

  it("does NOT pass contentTrust 'web-fetched' for a note-only set", async () => {
    const sub = `sub-trust-note-${rand()}`;
    const studySetId = `set-trust-note-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-trust-1'],
        type: 'flashcards',
        title: 'Note Only Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const generateSpy = vi
      .fn()
      .mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(generateSpy).toHaveBeenCalledOnce();
    expect(generateSpy.mock.calls[0]![0].contentTrust).toBeUndefined();
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
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });
    expect(r.outcome).toBe('failed');

    const after = await getStudySet(sub, studySetId);
    expect(after!.status).toBe('failed');
    expect(typeof after!.error === 'string' && after!.error.length > 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M24.2 — learnerContext threading from studySet item into generate()
// ---------------------------------------------------------------------------

describe('processStudyGeneration — M24.2 learnerContext threading', () => {
  it('passes learnerContext from the studySet item to the generate dep (single-pass)', async () => {
    const sub = `sub-lc-${rand()}`;
    const studySetId = `set-lc-${rand()}`;
    const learnerContext = 'Learner context (user-provided preferences …): focus: Math; level: Advanced';

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-lc-1'],
        type: 'flashcards',
        title: 'Learner Context Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
        learnerContext,
      }),
    );

    const generateSpy = vi.fn().mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(generateSpy).toHaveBeenCalledOnce();
    // The generate dep must receive the learnerContext snapshot from the studySet item.
    expect(generateSpy.mock.calls[0]![0]).toMatchObject({ learnerContext });
  });

  it('learnerContext is undefined in generate() when studySet has no learnerContext', async () => {
    const sub = `sub-lc-absent-${rand()}`;
    const studySetId = `set-lc-absent-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-lc-absent'],
        type: 'flashcards',
        title: 'No Learner Context Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
        // no learnerContext
      }),
    );

    const generateSpy = vi.fn().mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' });

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: generateSpy,
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: vi.fn().mockResolvedValue(undefined),
      updateActivity: vi.fn().mockResolvedValue(undefined),
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');
    expect(generateSpy).toHaveBeenCalledOnce();
    // learnerContext must be absent / undefined — not a stale string.
    expect(generateSpy.mock.calls[0]![0].learnerContext).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ACTIVITY lifecycle — single-pass happy path
// ---------------------------------------------------------------------------

describe('processStudyGeneration — ACTIVITY lifecycle (single-pass)', () => {
  it('emits correct phase sequence via createActivity + updateActivity', async () => {
    const sub = `sub-activity-${rand()}`;
    const studySetId = `set-activity-${rand()}`;

    await putStudySet(
      buildStudySetItem({
        sub,
        studySetId,
        sourceNoteIds: ['note-activity-1'],
        type: 'flashcards',
        title: 'Activity Test Set',
        status: 'queued',
        language: 'auto',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        createdAt: '2024-06-10T00:00:00.000Z',
      }),
    );

    const createActivitySpy = vi.fn().mockResolvedValue(undefined);
    const updateActivitySpy = vi.fn().mockResolvedValue(undefined);

    const result = await processStudyGeneration(sub, studySetId, {
      getNoteMarkdown: vi.fn().mockResolvedValue('# Note body'),
      generate: vi.fn().mockResolvedValue({ payload: { cards: [] }, promptVersion: 'v1' }),
      putBody: vi.fn().mockResolvedValue(undefined),
      createActivity: createActivitySpy,
      updateActivity: updateActivitySpy,
      flushStream: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.outcome).toBe('ready');

    // createActivity called exactly once with the right shape.
    expect(createActivitySpy).toHaveBeenCalledTimes(1);
    const createdItem = createActivitySpy.mock.calls[0]![0] as {
      kind: string;
      phase: string;
      status: string;
      refId: string;
      activityId: string;
    };
    expect(createdItem.kind).toBe('study');
    expect(createdItem.phase).toBe('queued');
    expect(createdItem.status).toBe('running');
    expect(createdItem.refId).toBe(studySetId);

    // Capture the activityId from the created item.
    const capturedActivityId = createdItem.activityId;
    expect(typeof capturedActivityId).toBe('string');
    expect(capturedActivityId.length).toBeGreaterThan(0);

    // All updateActivity calls must use the same activityId.
    for (const call of updateActivitySpy.mock.calls) {
      const input = call[0] as { sub: string; activityId: string; phase: string };
      expect(input.sub).toBe(sub);
      expect(input.activityId).toBe(capturedActivityId);
    }

    // Extract the sequence of phases emitted via updateActivity.
    const phases = updateActivitySpy.mock.calls.map(
      (call) => (call[0] as { phase: string }).phase,
    );

    // Single-pass: reading_notes → generating → finalizing → ready
    expect(phases).toEqual(['reading_notes', 'generating', 'finalizing', 'ready']);

    // The 'ready' update must carry status: 'ready' and stream.done: true.
    const readyCall = updateActivitySpy.mock.calls.find(
      (call) => (call[0] as { phase: string }).phase === 'ready',
    );
    expect(readyCall).toBeDefined();
    const readyInput = readyCall![0] as {
      status: string;
      stream: { s3Key: string; done: boolean };
    };
    expect(readyInput.status).toBe('ready');
    expect(readyInput.stream.done).toBe(true);
    expect(readyInput.stream.s3Key).toBe(`activity/${sub}/${capturedActivityId}.stream.txt`);
  });
});
