/**
 * Integration test: `noteListRecentQuery` base-table query (issue #66, M6.1.1).
 *
 * Exercises the real `ddb` DocumentClient + `noteKeys.noteListRecentQuery` —
 * no mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * note items are written with individual PutCommands (exactly what `putNote`'s
 * TransactWriteCommand wraps), mirroring the pattern in notes.integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import { buildNoteItem } from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// Shared base input fragment — mirrors the pattern in notes.integration.test.ts
// ---------------------------------------------------------------------------

const BASE_NOTE = {
  status: 'original' as const,
  words: 100,
  highlights: 2,
  langPair: 'pt-BR → en',
  ocrConfidence: 90,
  bodyS3Key: 'markdown/users/lr-sub/note.md',
  originalImageS3Key: 'images/users/lr-sub/note.jpg',
};

// ---------------------------------------------------------------------------
// Pure unit-style checks (no I/O) — ScanIndexForward + Limit shape
// ---------------------------------------------------------------------------

describe('noteKeys.noteListRecentQuery — pure builder checks', () => {
  it('sets ScanIndexForward to false (newest ULID first)', () => {
    const params = noteKeys.noteListRecentQuery('any-sub');
    expect(params.ScanIndexForward).toBe(false);
  });

  it('sets Limit to 20', () => {
    const params = noteKeys.noteListRecentQuery('any-sub');
    expect(params.Limit).toBe(20);
  });

  it('uses pk = USER#<sub> in ExpressionAttributeValues', () => {
    const sub = 'lr-unit-sub';
    const params = noteKeys.noteListRecentQuery(sub);
    expect(params.ExpressionAttributeValues[':pk']).toBe(`USER#${sub}`);
  });

  it('uses sk prefix "NOTE#" in ExpressionAttributeValues', () => {
    const params = noteKeys.noteListRecentQuery('any-sub');
    expect(params.ExpressionAttributeValues[':sk']).toBe('NOTE#');
  });

  it('uses begins_with on sk (base-table, no IndexName)', () => {
    const params = noteKeys.noteListRecentQuery('any-sub');
    expect(params.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :sk)');
    expect('IndexName' in params).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 1: Three notes for user A — newest-first ordering
// ---------------------------------------------------------------------------

describe('noteListRecentQuery — writes three notes newest-first (base table)', () => {
  // Unique sub prefix to avoid collisions with other test files sharing dynalite.
  const SUB = 'sub-lr-001';
  // ULIDs are lexicographically time-ordered: A < B < C
  const NOTE_A = '01JXXXXXXXXXXXXXXXXXXLRA';
  const NOTE_B = '01JXXXXXXXXXXXXXXXXXXLRB';
  const NOTE_C = '01JXXXXXXXXXXXXXXXXXXLRC';

  it('setup: writes three notes with ascending ULIDs', async () => {
    for (const noteId of [NOTE_A, NOTE_B, NOTE_C]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildNoteItem({
            ...BASE_NOTE,
            sub: SUB,
            noteId,
            title: `Note ${noteId.slice(-1)}`,
            tags: [],
          }),
        }),
      );
    }
  });

  it('QueryCommand with noteListRecentQuery returns all three notes newest-first (C, B, A)', async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Notes,
        ...noteKeys.noteListRecentQuery(SUB),
      }),
    );

    expect(Items).toBeDefined();
    expect(Items!.length).toBe(3);

    // Descending ULID = newest first: C → B → A
    expect(Items![0].noteId).toBe(NOTE_C);
    expect(Items![1].noteId).toBe(NOTE_B);
    expect(Items![2].noteId).toBe(NOTE_A);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 2: Second user's note does NOT appear in user A's results
// ---------------------------------------------------------------------------

describe('noteListRecentQuery — user isolation', () => {
  const SUB_A = 'sub-lr-002a';
  const SUB_B = 'sub-lr-002b';
  const NOTE_A = '01JXXXXXXXXXXXXXXXXXXLA2';
  const NOTE_B = '01JXXXXXXXXXXXXXXXXXXLB2';

  it('setup: writes one note each for two different users', async () => {
    for (const [sub, noteId] of [
      [SUB_A, NOTE_A],
      [SUB_B, NOTE_B],
    ] as [string, string][]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildNoteItem({
            ...BASE_NOTE,
            sub,
            noteId,
            title: `Note for ${sub}`,
            tags: [],
          }),
        }),
      );
    }
  });

  it("user A's query does NOT include user B's note", async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Notes,
        ...noteKeys.noteListRecentQuery(SUB_A),
      }),
    );

    const noteIds = (Items ?? []).map((i) => i.noteId as string);
    expect(noteIds).toContain(NOTE_A);
    expect(noteIds).not.toContain(NOTE_B);
  });

  it("user B's query does NOT include user A's note", async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Notes,
        ...noteKeys.noteListRecentQuery(SUB_B),
      }),
    );

    const noteIds = (Items ?? []).map((i) => i.noteId as string);
    expect(noteIds).toContain(NOTE_B);
    expect(noteIds).not.toContain(NOTE_A);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 3: User with no notes returns an empty array
// ---------------------------------------------------------------------------

describe('noteListRecentQuery — empty result for unknown user', () => {
  it('returns an empty Items array for a user with no notes', async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Notes,
        ...noteKeys.noteListRecentQuery('sub-lr-nobody'),
      }),
    );

    expect(Items ?? []).toEqual([]);
  });
});
