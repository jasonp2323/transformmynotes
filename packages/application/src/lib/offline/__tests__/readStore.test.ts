/**
 * Unit tests for the offline read store (IndexedDB via idb).
 * fake-indexeddb/auto patches the global `indexedDB` so the real idb code runs
 * without a browser.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import type { NoteMetadata } from '@/src/lib/library';
import { OFFLINE_DB_NAME } from '../constants';
import {
  cacheNote,
  cacheNoteList,
  clearOfflineReadStore,
  readNote,
  readNoteList,
  _resetDBForTests,
} from '../readStore';

// ─── Fixture ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<NoteMetadata> = {}): NoteMetadata {
  return {
    noteId: 'note-1',
    title: 'Test Note',
    tags: ['tag1', 'tag2'],
    status: 'clean',
    words: 100,
    highlights: 3,
    langPair: 'en-es',
    ocrConfidence: 0.99,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const SUB_A = 'sub-user-a';
const SUB_B = 'sub-user-b';

// Reset the DB singleton and wipe the underlying fake-indexeddb store between
// tests so each test starts with clean stores.
beforeEach(async () => {
  _resetDBForTests();
  await deleteDB(OFFLINE_DB_NAME);
});

// ─── Note list ────────────────────────────────────────────────────────────────

describe('cacheNoteList / readNoteList', () => {
  it('round-trips the note list and returns a cachedAt timestamp', async () => {
    const notes = [makeNote({ noteId: 'note-1' }), makeNote({ noteId: 'note-2', title: 'B' })];
    const before = Date.now();
    await cacheNoteList(SUB_A, notes);
    const result = await readNoteList(SUB_A);

    expect(result).not.toBeNull();
    expect(result!.sub).toBe(SUB_A);
    expect(result!.notes).toEqual(notes);
    expect(result!.cachedAt).toBeGreaterThanOrEqual(before);
    expect(result!.cachedAt).toBeLessThanOrEqual(Date.now());
  });

  it('returns null for an unknown sub', async () => {
    const result = await readNoteList('unknown-sub');
    expect(result).toBeNull();
  });

  it('overwrites the previous list for the same sub', async () => {
    const first = [makeNote({ noteId: 'note-1' })];
    const second = [makeNote({ noteId: 'note-2' })];
    await cacheNoteList(SUB_A, first);
    await cacheNoteList(SUB_A, second);
    const result = await readNoteList(SUB_A);
    expect(result!.notes).toEqual(second);
  });
});

// ─── Single note ─────────────────────────────────────────────────────────────

describe('cacheNote / readNote', () => {
  it('round-trips note metadata and markdown body', async () => {
    const note = makeNote({ noteId: 'note-abc' });
    const markdown = '# Hello\n\nWorld';
    const before = Date.now();
    await cacheNote(SUB_A, 'note-abc', note, markdown);
    const result = await readNote(SUB_A, 'note-abc');

    expect(result).not.toBeNull();
    expect(result!.sub).toBe(SUB_A);
    expect(result!.noteId).toBe('note-abc');
    expect(result!.note).toEqual(note);
    expect(result!.markdown).toBe(markdown);
    expect(result!.cachedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns null for an unknown (sub, noteId) pair', async () => {
    const result = await readNote(SUB_A, 'nonexistent-note');
    expect(result).toBeNull();
  });

  it('namespaces by sub: sub-B cannot read sub-A data for the same noteId', async () => {
    const note = makeNote({ noteId: 'shared-id' });
    await cacheNote(SUB_A, 'shared-id', note, '# A content');
    const resultB = await readNote(SUB_B, 'shared-id');
    expect(resultB).toBeNull();
  });

  it('sub-A and sub-B can each have their own copy of the same noteId', async () => {
    const noteA = makeNote({ noteId: 'shared-id', title: 'A title' });
    const noteB = makeNote({ noteId: 'shared-id', title: 'B title' });
    await cacheNote(SUB_A, 'shared-id', noteA, '# A');
    await cacheNote(SUB_B, 'shared-id', noteB, '# B');

    const resultA = await readNote(SUB_A, 'shared-id');
    const resultB = await readNote(SUB_B, 'shared-id');

    expect(resultA!.note.title).toBe('A title');
    expect(resultA!.markdown).toBe('# A');
    expect(resultB!.note.title).toBe('B title');
    expect(resultB!.markdown).toBe('# B');
  });
});

// ─── clearOfflineReadStore ────────────────────────────────────────────────────

describe('clearOfflineReadStore', () => {
  it('wipes both stores so subsequent reads return null', async () => {
    const note = makeNote({ noteId: 'note-x' });
    await cacheNoteList(SUB_A, [note]);
    await cacheNote(SUB_A, 'note-x', note, '# X');

    await clearOfflineReadStore();

    expect(await readNoteList(SUB_A)).toBeNull();
    expect(await readNote(SUB_A, 'note-x')).toBeNull();
  });

  it('wipes data for all users', async () => {
    await cacheNoteList(SUB_A, [makeNote()]);
    await cacheNoteList(SUB_B, [makeNote({ noteId: 'note-b' })]);

    await clearOfflineReadStore();

    expect(await readNoteList(SUB_A)).toBeNull();
    expect(await readNoteList(SUB_B)).toBeNull();
  });
});
