/**
 * Integration test: STUDYSET item shape + `listStudySetsByUser` /
 * `listStudySetsByNote` / `getStudySet` via GSI6 (StudySetsByUser),
 * GSI7 (StudySetsByNote), and base-table GetItem (M13.1.2).
 *
 * Exercises the real `ddb` DocumentClient, `studySetKeys` builders,
 * `buildStudySetItem`, `listStudySetsByUser`, `listStudySetsByNote`, and
 * `getStudySet` — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { studySetKeys } from '../src/db/keys.js';
import {
  buildStudySetItem,
  listStudySetsByUser,
  listStudySetsByNote,
  getStudySet,
} from '../src/db/study.js';

// ---------------------------------------------------------------------------
// Integration: listStudySetsByUser — write / query round-trip (GSI6)
// ---------------------------------------------------------------------------

describe('listStudySetsByUser — write / query round-trip (GSI6 StudySetsByUser)', () => {
  // Unique sub to avoid collisions with other test files sharing dynalite.
  const SUB_A = 'sub-study-gsi6-a';
  const SUB_B = 'sub-study-gsi6-b';

  // Three study sets for user A with ascending ULID-like ids (lexicographically
  // ordered so that 'ccc' > 'bbb' > 'aaa' — newest-first means 'ccc' comes
  // back first from ScanIndexForward: false on GSI6).
  const SET_AAA = {
    studySetId: 'aaa-set-001',
    sourceNoteIds: ['note-gsi6-001'],
    type: 'flashcards' as const,
    title: 'Flashcards Set',
    status: 'ready' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: 'v1',
    createdAt: '2024-06-01T00:00:00.000Z',
  };
  const SET_BBB = {
    studySetId: 'bbb-set-002',
    sourceNoteIds: ['note-gsi6-001'],
    type: 'quiz' as const,
    title: 'Quiz Set',
    status: 'queued' as const,
    language: 'bilingual' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-06-02T00:00:00.000Z',
  };
  const SET_CCC = {
    studySetId: 'ccc-set-003',
    sourceNoteIds: ['note-gsi6-002'],
    type: 'summary' as const,
    title: 'Summary Set',
    status: 'ready' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: 'v1',
    createdAt: '2024-06-03T00:00:00.000Z',
  };
  // User B has one study set — must not appear in user A queries.
  const SET_B = {
    studySetId: 'ddd-set-004',
    sourceNoteIds: ['note-gsi6-003'],
    type: 'assignment' as const,
    title: 'User B Assignment',
    status: 'queued' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-06-04T00:00:00.000Z',
  };

  it('setup: writes 3 study sets for user A and 1 for user B', async () => {
    for (const set of [SET_AAA, SET_BBB, SET_CCC]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildStudySetItem({ sub: SUB_A, ...set }),
        }),
      );
    }
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildStudySetItem({ sub: SUB_B, ...SET_B }),
      }),
    );
  });

  it('listStudySetsByUser returns all 3 sets for user A', async () => {
    const sets = await listStudySetsByUser(SUB_A);
    expect(sets).toHaveLength(3);
  });

  it('listStudySetsByUser returns study sets newest-first (descending ULID order)', async () => {
    const sets = await listStudySetsByUser(SUB_A);
    const ids = sets.map((s) => s.studySetId);
    expect(ids[0]).toBe(SET_CCC.studySetId); // 'ccc' > 'bbb' > 'aaa'
    expect(ids[1]).toBe(SET_BBB.studySetId);
    expect(ids[2]).toBe(SET_AAA.studySetId);
  });

  it("listStudySetsByUser does NOT return user B's study set", async () => {
    const sets = await listStudySetsByUser(SUB_A);
    const ids = sets.map((s) => s.studySetId);
    expect(ids).not.toContain(SET_B.studySetId);
  });

  it("user B's listStudySetsByUser returns only user B's set", async () => {
    const sets = await listStudySetsByUser(SUB_B);
    expect(sets).toHaveLength(1);
    expect(sets[0].studySetId).toBe(SET_B.studySetId);
  });

  it('listStudySetsByUser returns full study set attributes (projection ALL)', async () => {
    const sets = await listStudySetsByUser(SUB_A);
    const found = sets.find((s) => s.studySetId === SET_AAA.studySetId);
    expect(found).toBeDefined();
    expect(found!.type).toBe(SET_AAA.type);
    expect(found!.title).toBe(SET_AAA.title);
    expect(found!.status).toBe(SET_AAA.status);
    expect(found!.language).toBe(SET_AAA.language);
    expect(found!.model).toBe(SET_AAA.model);
    expect(found!.promptVersion).toBe(SET_AAA.promptVersion);
    expect(found!.sourceNoteIds).toEqual(SET_AAA.sourceNoteIds);
  });
});

// ---------------------------------------------------------------------------
// Integration: listStudySetsByNote — GSI7 cross-user isolation
// ---------------------------------------------------------------------------

describe('listStudySetsByNote — by-note query + cross-user isolation (GSI7)', () => {
  // Unique subs to avoid collisions.
  const SUB_A = 'sub-study-gsi7-a';
  const SUB_B = 'sub-study-gsi7-b';

  const NOTE_TARGET = 'note-gsi7-target-001';
  const NOTE_OTHER = 'note-gsi7-other-002';

  // User A has 2 sets for the target note and 1 for a different note.
  const SET_A1 = {
    studySetId: 'eee-gsi7-001',
    sourceNoteIds: [NOTE_TARGET],
    type: 'flashcards' as const,
    title: 'A flashcards for target note',
    status: 'ready' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: 'v1',
    createdAt: '2024-06-05T00:00:00.000Z',
  };
  const SET_A2 = {
    studySetId: 'fff-gsi7-002',
    sourceNoteIds: [NOTE_TARGET],
    type: 'quiz' as const,
    title: 'A quiz for target note',
    status: 'queued' as const,
    language: 'bilingual' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-06-06T00:00:00.000Z',
  };
  const SET_A_OTHER = {
    studySetId: 'ggg-gsi7-003',
    sourceNoteIds: [NOTE_OTHER],
    type: 'summary' as const,
    title: 'A summary for other note',
    status: 'ready' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: 'v1',
    createdAt: '2024-06-07T00:00:00.000Z',
  };
  // User B also has a set for NOTE_TARGET — must NOT appear in user A's query.
  const SET_B_TARGET = {
    studySetId: 'hhh-gsi7-004',
    sourceNoteIds: [NOTE_TARGET],
    type: 'assignment' as const,
    title: 'B assignment for target note',
    status: 'queued' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-06-08T00:00:00.000Z',
  };

  it('setup: writes 2 sets for user A on the target note, 1 on other, and 1 for user B on target', async () => {
    for (const set of [SET_A1, SET_A2, SET_A_OTHER]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildStudySetItem({ sub: SUB_A, ...set }),
        }),
      );
    }
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildStudySetItem({ sub: SUB_B, ...SET_B_TARGET }),
      }),
    );
  });

  it('listStudySetsByNote returns both sets for user A on the target note', async () => {
    const sets = await listStudySetsByNote(SUB_A, NOTE_TARGET);
    expect(sets).toHaveLength(2);
    const ids = sets.map((s) => s.studySetId).sort();
    expect(ids).toEqual([SET_A1.studySetId, SET_A2.studySetId].sort());
  });

  it('listStudySetsByNote does NOT return the other-note set for user A', async () => {
    const sets = await listStudySetsByNote(SUB_A, NOTE_TARGET);
    const ids = sets.map((s) => s.studySetId);
    expect(ids).not.toContain(SET_A_OTHER.studySetId);
  });

  it('listStudySetsByNote does NOT return user B set even for the same note (cross-user isolation)', async () => {
    const sets = await listStudySetsByNote(SUB_A, NOTE_TARGET);
    const ids = sets.map((s) => s.studySetId);
    expect(ids).not.toContain(SET_B_TARGET.studySetId);
  });

  it("user B's listStudySetsByNote returns only user B's set for the target note", async () => {
    const sets = await listStudySetsByNote(SUB_B, NOTE_TARGET);
    expect(sets).toHaveLength(1);
    expect(sets[0].studySetId).toBe(SET_B_TARGET.studySetId);
  });

  it('listStudySetsByNote for the other note returns only that set for user A', async () => {
    const sets = await listStudySetsByNote(SUB_A, NOTE_OTHER);
    expect(sets).toHaveLength(1);
    expect(sets[0].studySetId).toBe(SET_A_OTHER.studySetId);
  });
});

// ---------------------------------------------------------------------------
// Integration: getStudySet — round-trip including status update
// ---------------------------------------------------------------------------

describe('getStudySet — write / status update / GetItem round-trip', () => {
  const SUB = 'sub-study-get-001';

  const INITIAL = {
    studySetId: 'iii-get-001',
    sourceNoteIds: ['note-get-001'],
    type: 'flashcards' as const,
    title: 'Get round-trip set',
    status: 'queued' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: '',
    createdAt: '2024-06-09T00:00:00.000Z',
  };

  const BODY_S3_KEY = 'study/users/sub-study-get-001/iii-get-001.json';
  const UPDATED_AT = '2024-06-09T01:00:00.000Z';

  it('setup: writes a queued study set', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildStudySetItem({ sub: SUB, ...INITIAL }),
      }),
    );
  });

  it('getStudySet returns the item immediately after write with status=queued', async () => {
    const item = await getStudySet(SUB, INITIAL.studySetId);
    expect(item).toBeDefined();
    expect(item!.studySetId).toBe(INITIAL.studySetId);
    expect(item!.status).toBe('queued');
    expect(item!.promptVersion).toBe('');
    expect('bodyS3Key' in item!).toBe(false);
    expect('error' in item!).toBe(false);
  });

  it('getStudySet round-trip: all initial fields survive the write', async () => {
    const item = await getStudySet(SUB, INITIAL.studySetId);
    expect(item!.sourceNoteIds).toEqual(INITIAL.sourceNoteIds);
    expect(item!.type).toBe(INITIAL.type);
    expect(item!.title).toBe(INITIAL.title);
    expect(item!.language).toBe(INITIAL.language);
    expect(item!.model).toBe(INITIAL.model);
    expect(item!.createdAt).toBe(INITIAL.createdAt);
    expect(item!.updatedAt).toBe(INITIAL.createdAt); // defaults to createdAt
  });

  it('setup: updates the study set to status=ready with bodyS3Key and promptVersion', async () => {
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.Notes,
        Key: studySetKeys.item(SUB, INITIAL.studySetId),
        UpdateExpression:
          'SET #status = :status, #bodyS3Key = :bodyS3Key, #promptVersion = :promptVersion, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#bodyS3Key': 'bodyS3Key',
          '#promptVersion': 'promptVersion',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'ready',
          ':bodyS3Key': BODY_S3_KEY,
          ':promptVersion': 'v1',
          ':updatedAt': UPDATED_AT,
        },
      }),
    );
  });

  it('getStudySet returns updated status=ready, bodyS3Key, promptVersion, and updatedAt', async () => {
    const item = await getStudySet(SUB, INITIAL.studySetId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('ready');
    expect(item!.bodyS3Key).toBe(BODY_S3_KEY);
    expect(item!.promptVersion).toBe('v1');
    expect(item!.updatedAt).toBe(UPDATED_AT);
  });

  it('getStudySet preserves GSI keys after update', async () => {
    const item = await getStudySet(SUB, INITIAL.studySetId);
    expect(item!.pk).toBe(`USER#${SUB}`);
    expect(item!.sk).toBe(`STUDYSET#${INITIAL.studySetId}`);
    expect(item!.gsi6pk).toBe(`USER#${SUB}`);
    expect(item!.gsi6sk).toBe(`STUDYSET#${INITIAL.studySetId}`);
    expect(item!.gsi7pk).toBe(`NOTE#${INITIAL.sourceNoteIds[0]}`);
    expect(item!.gsi7sk).toBe(`USER#${SUB}#STUDYSET#${INITIAL.studySetId}`);
  });

  it('getStudySet returns undefined for a non-existent study set', async () => {
    const item = await getStudySet(SUB, 'does-not-exist');
    expect(item).toBeUndefined();
  });
});
