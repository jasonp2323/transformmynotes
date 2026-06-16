/**
 * Integration test: STUDYSET status machine — `claimStudySet`, `markStudySetReady`,
 * `markStudySetFailed`, `countInFlightStudySets`, and `putStudySet` (M13.2).
 *
 * Exercises the real `ddb` DocumentClient, `studySetKeys` builders,
 * `buildStudySetItem`, and the new status-machine access functions — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import {
  buildStudySetItem,
  getStudySet,
  putStudySet,
  claimStudySet,
  markStudySetReady,
  markStudySetFailed,
  countInFlightStudySets,
} from '../src/db/study.js';

// ---------------------------------------------------------------------------
// Integration: claimStudySet — idempotency guard (queued → running)
// ---------------------------------------------------------------------------

describe('claimStudySet — queued → running idempotency guard', () => {
  const SUB = 'sub-study-status-claim';

  const QUEUED_SET = {
    studySetId: 'aaa-claim-001',
    sourceNoteIds: ['note-claim-001'],
    type: 'flashcards' as const,
    title: 'Claim test set',
    status: 'queued' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-07-01T00:00:00.000Z',
  };

  it('setup: writes a queued study set via PutCommand', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildStudySetItem({ sub: SUB, ...QUEUED_SET }),
      }),
    );
  });

  it('claimStudySet returns true and status becomes running on first claim', async () => {
    const claimed = await claimStudySet(SUB, QUEUED_SET.studySetId, '2024-07-01T00:01:00.000Z');
    expect(claimed).toBe(true);
    const item = await getStudySet(SUB, QUEUED_SET.studySetId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('running');
  });

  it('claimStudySet returns false on second attempt (idempotency guard) and status stays running', async () => {
    const claimed = await claimStudySet(SUB, QUEUED_SET.studySetId, '2024-07-01T00:02:00.000Z');
    expect(claimed).toBe(false);
    const item = await getStudySet(SUB, QUEUED_SET.studySetId);
    expect(item!.status).toBe('running');
  });

  it('claimStudySet returns false for a non-existent studySetId', async () => {
    const claimed = await claimStudySet(SUB, 'does-not-exist-claim', '2024-07-01T00:03:00.000Z');
    expect(claimed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: markStudySetReady — running → ready
// ---------------------------------------------------------------------------

describe('markStudySetReady — running → ready with bodyS3Key and promptVersion', () => {
  const SUB = 'sub-study-status-ready';

  const RUNNING_SET = {
    studySetId: 'bbb-ready-001',
    sourceNoteIds: ['note-ready-001'],
    type: 'quiz' as const,
    title: 'Ready test set',
    status: 'running' as const,
    language: 'bilingual' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-07-02T00:00:00.000Z',
  };

  const BODY_S3_KEY = 'study/users/sub-study-status-ready/bbb-ready-001.json';
  const PROMPT_VERSION = 'v2';
  const UPDATED_AT = '2024-07-02T01:00:00.000Z';

  it('setup: writes a running study set via putStudySet', async () => {
    await putStudySet(buildStudySetItem({ sub: SUB, ...RUNNING_SET }));
  });

  it('markStudySetReady sets status=ready with bodyS3Key, promptVersion, and bumped updatedAt', async () => {
    await markStudySetReady({
      sub: SUB,
      studySetId: RUNNING_SET.studySetId,
      bodyS3Key: BODY_S3_KEY,
      promptVersion: PROMPT_VERSION,
      updatedAt: UPDATED_AT,
    });

    const item = await getStudySet(SUB, RUNNING_SET.studySetId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('ready');
    expect(item!.bodyS3Key).toBe(BODY_S3_KEY);
    expect(item!.promptVersion).toBe(PROMPT_VERSION);
    expect(item!.updatedAt).toBe(UPDATED_AT);
    // createdAt must not be touched
    expect(item!.createdAt).toBe(RUNNING_SET.createdAt);
    // updatedAt must differ from createdAt (explicit bump)
    expect(item!.updatedAt).not.toBe(item!.createdAt);
  });
});

// ---------------------------------------------------------------------------
// Integration: markStudySetFailed — running → failed
// ---------------------------------------------------------------------------

describe('markStudySetFailed — running → failed with error attribute', () => {
  const SUB = 'sub-study-status-failed';

  const RUNNING_SET = {
    studySetId: 'ccc-failed-001',
    sourceNoteIds: ['note-failed-001'],
    type: 'summary' as const,
    title: 'Failed test set',
    status: 'running' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-07-03T00:00:00.000Z',
  };

  const ERROR_MESSAGE = 'Bedrock throttled the request after 3 retries';

  it('setup: writes a running study set via PutCommand', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildStudySetItem({ sub: SUB, ...RUNNING_SET }),
      }),
    );
  });

  it('markStudySetFailed sets status=failed and stores the error string', async () => {
    await markStudySetFailed({
      sub: SUB,
      studySetId: RUNNING_SET.studySetId,
      error: ERROR_MESSAGE,
      updatedAt: '2024-07-03T01:00:00.000Z',
    });

    const item = await getStudySet(SUB, RUNNING_SET.studySetId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('failed');
    expect(item!.error).toBe(ERROR_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Integration: countInFlightStudySets — GSI6 filter on status
// ---------------------------------------------------------------------------

describe('countInFlightStudySets — counts queued + running via GSI6 FilterExpression', () => {
  const SUB = 'sub-study-status-count';
  const SUB_EMPTY = 'sub-study-status-count-empty';

  // 2 queued + 1 running + 1 ready + 1 failed = 3 in-flight
  const SETS = [
    {
      studySetId: 'ddd-count-001',
      sourceNoteIds: ['note-count-001'],
      type: 'flashcards' as const,
      title: 'Count queued 1',
      status: 'queued' as const,
      language: 'pt-BR' as const,
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      promptVersion: '',
      createdAt: '2024-07-04T00:00:00.000Z',
    },
    {
      studySetId: 'eee-count-002',
      sourceNoteIds: ['note-count-001'],
      type: 'quiz' as const,
      title: 'Count queued 2',
      status: 'queued' as const,
      language: 'bilingual' as const,
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      promptVersion: '',
      createdAt: '2024-07-04T01:00:00.000Z',
    },
    {
      studySetId: 'fff-count-003',
      sourceNoteIds: ['note-count-002'],
      type: 'summary' as const,
      title: 'Count running',
      status: 'running' as const,
      language: 'pt-BR' as const,
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      promptVersion: '',
      createdAt: '2024-07-04T02:00:00.000Z',
    },
    {
      studySetId: 'ggg-count-004',
      sourceNoteIds: ['note-count-002'],
      type: 'assignment' as const,
      title: 'Count ready',
      status: 'ready' as const,
      language: 'pt-BR' as const,
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      promptVersion: 'v1',
      createdAt: '2024-07-04T03:00:00.000Z',
    },
    {
      studySetId: 'hhh-count-005',
      sourceNoteIds: ['note-count-003'],
      type: 'flashcards' as const,
      title: 'Count failed',
      status: 'failed' as const,
      language: 'bilingual' as const,
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      promptVersion: '',
      createdAt: '2024-07-04T04:00:00.000Z',
    },
  ];

  it('setup: writes 2 queued + 1 running + 1 ready + 1 failed sets', async () => {
    for (const set of SETS) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildStudySetItem({ sub: SUB, ...set }),
        }),
      );
    }
  });

  it('countInFlightStudySets returns 3 (2 queued + 1 running)', async () => {
    const count = await countInFlightStudySets(SUB);
    expect(count).toBe(3);
  });

  it('countInFlightStudySets returns 0 for a user with no study sets', async () => {
    const count = await countInFlightStudySets(SUB_EMPTY);
    expect(count).toBe(0);
  });
});
