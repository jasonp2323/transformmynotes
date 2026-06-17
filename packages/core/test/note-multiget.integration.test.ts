/**
 * Integration test: `noteMultiGetKeys` + `batchGetNotes` + `listNotesByGroup`
 * (M17.1.1 core/db layer — multi-note foundation).
 *
 * Exercises the real `ddb` DocumentClient, `noteKeys.noteMultiGetKeys`,
 * `noteKeys.notesByGroupQuery`, `batchGetNotes`, and `listNotesByGroup`
 * — no mocks.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands (mirroring the pattern
 * used throughout the integration suite). We use `buildNoteItem` directly
 * rather than going through `putNote`.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import { buildNoteItem, batchGetNotes, listNotesByGroup } from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// Unique subs to avoid collisions with other suites sharing dynalite.
const SUB_A = `sub-multiget-a-${Math.random().toString(36).slice(2, 9)}`;
const SUB_B = `sub-multiget-b-${Math.random().toString(36).slice(2, 9)}`;

// User A has 4 notes: 2 in group 'nb-1', 1 in 'nb-2', 1 with no group.
// Use ULID-like ids with ascending lexicographic order so newest-first ordering
// is deterministic: 'note-d' > 'note-c' > 'note-b' > 'note-a'.
const NOTE_A1 = {
  noteId: 'note-multiget-a1',
  title: 'Note A1 (nb-1, older)',
  groupId: 'nb-1',
  createdAt: '2024-10-01T00:00:00.000Z',
  updatedAt: '2024-10-01T00:00:00.000Z',
};
const NOTE_A2 = {
  noteId: 'note-multiget-a2',
  title: 'Note A2 (nb-1, newer)',
  groupId: 'nb-1',
  createdAt: '2024-10-02T00:00:00.000Z',
  updatedAt: '2024-10-02T00:00:00.000Z',
};
const NOTE_A3 = {
  noteId: 'note-multiget-a3',
  title: 'Note A3 (nb-2)',
  groupId: 'nb-2',
  createdAt: '2024-10-03T00:00:00.000Z',
  updatedAt: '2024-10-03T00:00:00.000Z',
};
const NOTE_A4 = {
  noteId: 'note-multiget-a4',
  title: 'Note A4 (no group)',
  createdAt: '2024-10-04T00:00:00.000Z',
  updatedAt: '2024-10-04T00:00:00.000Z',
};
const NOTE_B = {
  noteId: 'note-multiget-b1',
  title: 'Note B1 (user B)',
  groupId: 'nb-1',
  createdAt: '2024-10-05T00:00:00.000Z',
  updatedAt: '2024-10-05T00:00:00.000Z',
};

/** Shared base fields for every note (all non-optional non-id fields). */
const BASE_NOTE = {
  tags: [],
  status: 'original' as const,
  words: 10,
  highlights: 0,
  langPair: 'pt-BR',
  ocrConfidence: 0.9,
  bodyS3Key: 'markdown/users/test/note.md',
  originalImageS3Key: 'images/users/test/note.jpg',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('note-multiget integration — setup', () => {
  it('writes 4 notes for user A and 1 for user B using PutCommand + buildNoteItem', async () => {
    for (const note of [NOTE_A1, NOTE_A2, NOTE_A3, NOTE_A4]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildNoteItem({ sub: SUB_A, ...BASE_NOTE, ...note }),
        }),
      );
    }
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildNoteItem({ sub: SUB_B, ...BASE_NOTE, ...NOTE_B }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Unit-style assertion on noteKeys.noteMultiGetKeys (pure function, no I/O)
// ---------------------------------------------------------------------------

describe('noteKeys.noteMultiGetKeys — pure key builder', () => {
  it("builds the correct key list for sub='s' and noteIds=['a','b']", () => {
    const keys = noteKeys.noteMultiGetKeys('s', ['a', 'b']);
    expect(keys).toEqual([
      { pk: 'USER#s', sk: 'NOTE#a' },
      { pk: 'USER#s', sk: 'NOTE#b' },
    ]);
  });

  it('returns an empty array when noteIds is empty', () => {
    expect(noteKeys.noteMultiGetKeys('s', [])).toEqual([]);
  });

  it('returns one key per noteId (no dedup — caller is responsible)', () => {
    const keys = noteKeys.noteMultiGetKeys('sub', ['x', 'x']);
    expect(keys).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// batchGetNotes — integration (real BatchGetItem via dynalite)
// ---------------------------------------------------------------------------

describe('batchGetNotes — BatchGetItem round-trip', () => {
  it('returns all 4 notes for user A by id', async () => {
    const ids = [NOTE_A1.noteId, NOTE_A2.noteId, NOTE_A3.noteId, NOTE_A4.noteId];
    const notes = await batchGetNotes(SUB_A, ids);
    expect(notes).toHaveLength(4);
    const returnedIds = notes.map((n) => n.noteId).sort();
    expect(returnedIds).toEqual(ids.sort());
  });

  it('returns correct noteId, title, and bodyS3Key for each note', async () => {
    const notes = await batchGetNotes(SUB_A, [NOTE_A1.noteId, NOTE_A2.noteId]);
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note.noteId).toBeDefined();
      expect(note.title).toBeDefined();
      expect(note.bodyS3Key).toBe(BASE_NOTE.bodyS3Key);
    }
    const a1 = notes.find((n) => n.noteId === NOTE_A1.noteId);
    expect(a1).toBeDefined();
    expect(a1!.title).toBe(NOTE_A1.title);
    const a2 = notes.find((n) => n.noteId === NOTE_A2.noteId);
    expect(a2).toBeDefined();
    expect(a2!.title).toBe(NOTE_A2.title);
  });

  it('does NOT return user B note when called with user A sub and user B noteId (user-scoped keys)', async () => {
    // noteMultiGetKeys constructs keys as USER#subA / NOTE#<noteId>,
    // so user B's note (stored at USER#subB) won't be found — this is the
    // intended cross-user isolation behaviour.
    const notes = await batchGetNotes(SUB_A, [NOTE_B.noteId]);
    expect(notes).toHaveLength(0);
  });

  it('returns empty array for an empty noteIds input', async () => {
    const notes = await batchGetNotes(SUB_A, []);
    expect(notes).toHaveLength(0);
  });

  it('deduplicates input noteIds (returns 1 item, not 2)', async () => {
    const notes = await batchGetNotes(SUB_A, [NOTE_A1.noteId, NOTE_A1.noteId]);
    expect(notes).toHaveLength(1);
    expect(notes[0].noteId).toBe(NOTE_A1.noteId);
  });
});

// ---------------------------------------------------------------------------
// listNotesByGroup — integration (real GSI1 query + FilterExpression via dynalite)
// ---------------------------------------------------------------------------

describe('listNotesByGroup — GSI1 query with groupId FilterExpression', () => {
  it('returns exactly the 2 notes in nb-1 for user A', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-1');
    expect(notes).toHaveLength(2);
    const ids = notes.map((n) => n.noteId).sort();
    expect(ids).toEqual([NOTE_A1.noteId, NOTE_A2.noteId].sort());
  });

  it('returns nb-1 notes newest-first (ScanIndexForward: false — higher ULID first)', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-1');
    // NOTE_A2 has noteId 'note-multiget-a2' > 'note-multiget-a1' lexicographically
    expect(notes[0].noteId).toBe(NOTE_A2.noteId);
    expect(notes[1].noteId).toBe(NOTE_A1.noteId);
  });

  it('excludes notes from other groups (nb-2, no-group)', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-1');
    const ids = notes.map((n) => n.noteId);
    expect(ids).not.toContain(NOTE_A3.noteId);
    expect(ids).not.toContain(NOTE_A4.noteId);
  });

  it('does NOT return user B note even though it is in nb-1 (user-scoped GSI1 pk)', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-1');
    const ids = notes.map((n) => n.noteId);
    expect(ids).not.toContain(NOTE_B.noteId);
  });

  it('returns only the nb-2 note when querying nb-2', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-2');
    expect(notes).toHaveLength(1);
    expect(notes[0].noteId).toBe(NOTE_A3.noteId);
  });

  it('returns an empty array for a groupId with no notes', async () => {
    const notes = await listNotesByGroup(SUB_A, 'nb-does-not-exist');
    expect(notes).toHaveLength(0);
  });

  it('returns an empty array for user B querying nb-2 (user B has no nb-2 notes)', async () => {
    const notes = await listNotesByGroup(SUB_B, 'nb-2');
    expect(notes).toHaveLength(0);
  });
});
