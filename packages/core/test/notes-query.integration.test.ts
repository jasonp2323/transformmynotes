/**
 * Integration test: `listRecentNotes` and `batchGetNotes`.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `noteKeys`,
 * `buildNoteItem`, `listRecentNotes`, and `batchGetNotes` — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * note items are written with individual PutCommands (exactly what `putNote`'s
 * TransactWriteCommand wraps), mirroring the pattern in notes.integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import { buildNoteItem, listRecentNotes, batchGetNotes } from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// Shared base input fragment — mirrors the pattern in notes.integration.test.ts
// ---------------------------------------------------------------------------

const BASE_NOTE = {
  status: 'original' as const,
  words: 120,
  highlights: 2,
  langPair: 'pt-BR → en',
  ocrConfidence: 91,
  bodyS3Key: 'markdown/users/nq-sub/note.md',
  originalImageS3Key: 'images/users/nq-sub/note.jpg',
};

// ---------------------------------------------------------------------------
// Sub-case 1: listRecentNotes — newest-first ordering + user isolation
// ---------------------------------------------------------------------------

describe('listRecentNotes — newest-first ordering and user isolation', () => {
  // Unique sub prefix to avoid collisions with other test files sharing dynalite.
  const SUB_A = 'sub-nq-001a';
  const SUB_B = 'sub-nq-001b';

  // ULIDs are lexicographically time-ordered: NQA < NQB < NQC
  const NOTE_A = '01JXXXXXXXXXXXXXXXXXXNQA'; // oldest
  const NOTE_B = '01JXXXXXXXXXXXXXXXXXXNQB';
  const NOTE_C = '01JXXXXXXXXXXXXXXXXXXNQC'; // newest
  const NOTE_B_USER = '01JXXXXXXXXXXXXXXXXXXNQD'; // belongs to user B

  it('setup: writes three notes for user A and one note for user B', async () => {
    for (const noteId of [NOTE_A, NOTE_B, NOTE_C]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildNoteItem({
            ...BASE_NOTE,
            sub: SUB_A,
            noteId,
            title: `Note ${noteId.slice(-1)}`,
            tags: [],
          }),
        }),
      );
    }

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildNoteItem({
          ...BASE_NOTE,
          sub: SUB_B,
          noteId: NOTE_B_USER,
          title: 'User B Note',
          tags: [],
        }),
      }),
    );
  });

  it('listRecentNotes returns all three notes for user A in newest-first order (C, B, A)', async () => {
    const notes = await listRecentNotes(SUB_A);

    expect(notes.length).toBe(3);

    // Descending ULID = newest first: C → B → A
    expect(notes[0].noteId).toBe(NOTE_C);
    expect(notes[1].noteId).toBe(NOTE_B);
    expect(notes[2].noteId).toBe(NOTE_A);
  });

  it('listRecentNotes for user A does NOT include user B note', async () => {
    const notes = await listRecentNotes(SUB_A);
    const noteIds = notes.map((n) => n.noteId);
    expect(noteIds).not.toContain(NOTE_B_USER);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 2: batchGetNotes — selective fetch by id
// ---------------------------------------------------------------------------

describe('batchGetNotes — selective fetch by noteId', () => {
  const SUB_A = 'sub-nq-002a';
  const SUB_B = 'sub-nq-002b';

  const NOTE_1 = '01JXXXXXXXXXXXXXXXXXXNQ1'; // oldest
  const NOTE_2 = '01JXXXXXXXXXXXXXXXXXXNQ2';
  const NOTE_3 = '01JXXXXXXXXXXXXXXXXXXNQ3'; // newest
  const NOTE_B_USER = '01JXXXXXXXXXXXXXXXXXXNQ4'; // belongs to user B

  it('setup: writes three notes for user A and one note for user B', async () => {
    for (const noteId of [NOTE_1, NOTE_2, NOTE_3]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildNoteItem({
            ...BASE_NOTE,
            sub: SUB_A,
            noteId,
            title: `Batch Note ${noteId.slice(-1)}`,
            tags: [],
          }),
        }),
      );
    }

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildNoteItem({
          ...BASE_NOTE,
          sub: SUB_B,
          noteId: NOTE_B_USER,
          title: 'Batch User B Note',
          tags: [],
        }),
      }),
    );
  });

  it('batchGetNotes returns exactly the two requested notes (NOTE_1 and NOTE_3)', async () => {
    const notes = await batchGetNotes(SUB_A, [NOTE_1, NOTE_3]);

    expect(notes.length).toBe(2);

    const noteIds = notes.map((n) => n.noteId);
    expect(noteIds).toContain(NOTE_1);
    expect(noteIds).toContain(NOTE_3);
  });

  it('batchGetNotes does NOT return NOTE_2 or user B note when only NOTE_1 and NOTE_3 are requested', async () => {
    const notes = await batchGetNotes(SUB_A, [NOTE_1, NOTE_3]);
    const noteIds = notes.map((n) => n.noteId);

    expect(noteIds).not.toContain(NOTE_2);
    expect(noteIds).not.toContain(NOTE_B_USER);
  });

  it('batchGetNotes returns [] for a nonexistent noteId', async () => {
    const notes = await batchGetNotes(SUB_A, ['nonexistent-id']);
    expect(notes).toEqual([]);
  });

  it('batchGetNotes returns [] when called with an empty array', async () => {
    const notes = await batchGetNotes(SUB_A, []);
    expect(notes).toEqual([]);
  });
});
