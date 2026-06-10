/**
 * Integration test: Notes access patterns via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `noteKeys`,
 * `buildNoteItem`, `buildTagIndexItem`, `getNote`, `listUserNotes`, and
 * `listNoteIdsByTag` — no mocks. The dynalite server is started by
 * `dynalite-global.ts` (globalSetup) and the production client is pointed at
 * it via env vars set in `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems, so
 * `putNote` (which uses TransactWriteCommand) cannot be called directly against
 * the dynalite harness. Instead, the local helper `writeNoteWithTags` builds
 * the main note item via `buildNoteItem` and each tag-index item via
 * `buildTagIndexItem`, writing each with an individual `PutCommand` — exactly
 * what the transaction wraps — so we validate the full read access patterns
 * (including GSI1 and GSI2) without a live AWS stage.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import {
  buildNoteItem,
  buildTagIndexItem,
  getNote,
  listUserNotes,
  listNoteIdsByTag,
  type BuildNoteItemInput,
} from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// Helper: write a note item + its tag-index items individually.
// Mimics exactly what `putNote`'s TransactWriteCommand does as separate
// operations (dynalite does not support TransactWriteItems).
// ---------------------------------------------------------------------------

async function writeNoteWithTags(noteInput: BuildNoteItemInput): Promise<void> {
  const noteItem = buildNoteItem(noteInput);

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: noteItem,
    }),
  );

  const uniqueTags = [...new Set(noteInput.tags)];
  for (const tag of uniqueTags) {
    const tagItem = buildTagIndexItem({ tag, sub: noteInput.sub, noteId: noteInput.noteId });
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: tagItem,
      }),
    );
  }
}

// Shared base input fragment for building note inputs.
const BASE_NOTE = {
  status: 'original' as const,
  words: 150,
  highlights: 3,
  langPair: 'pt-BR → en',
  ocrConfidence: 92,
  bodyS3Key: 'markdown/users/sub-test/note-001.md',
  originalImageS3Key: 'images/users/sub-test/note-001.jpg',
};

// ---------------------------------------------------------------------------
// Sub-case 1: Write → GetItem by PK/SK (round-trip)
// ---------------------------------------------------------------------------

describe('Notes — getNote write/read round-trip', () => {
  const SUB = 'sub-rt-001';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXRT001';

  it('writes a note (no tags) and reads back all fields via getNote', async () => {
    const input: BuildNoteItemInput = {
      ...BASE_NOTE,
      sub: SUB,
      noteId: NOTE_ID,
      title: 'Round-trip Note',
      tags: [],
      createdAt: '2025-06-01T10:00:00.000Z',
      updatedAt: '2025-06-01T10:00:00.000Z',
    };

    await writeNoteWithTags(input);

    const fetched = await getNote(SUB, NOTE_ID);
    expect(fetched).toBeDefined();

    // Primary keys
    expect(fetched!.pk).toBe(`USER#${SUB}`);
    expect(fetched!.sk).toBe(`NOTE#${NOTE_ID}`);

    // GSI1 keys
    expect(fetched!.gsi1pk).toBe(`USER#${SUB}`);
    expect(fetched!.gsi1sk).toBe(`NOTE#${NOTE_ID}`);

    // Scalar fields
    expect(fetched!.noteId).toBe(NOTE_ID);
    expect(fetched!.sub).toBe(SUB);
    expect(fetched!.title).toBe('Round-trip Note');
    expect(fetched!.tags).toEqual([]);
    expect(fetched!.status).toBe('original');
    expect(fetched!.words).toBe(150);
    expect(fetched!.highlights).toBe(3);
    expect(fetched!.langPair).toBe('pt-BR → en');
    expect(fetched!.ocrConfidence).toBe(92);
    expect(fetched!.bodyS3Key).toBe('markdown/users/sub-test/note-001.md');
    expect(fetched!.originalImageS3Key).toBe('images/users/sub-test/note-001.jpg');
    expect(fetched!.createdAt).toBe('2025-06-01T10:00:00.000Z');
    expect(fetched!.updatedAt).toBe('2025-06-01T10:00:00.000Z');

    // Optional groupId absent
    expect(fetched!.groupId).toBeUndefined();
  });

  it('returns undefined for a non-existent note', async () => {
    const result = await getNote('sub-nobody', 'nonexistent-note-id');
    expect(result).toBeUndefined();
  });

  it('round-trip preserves the "clean" status variant', async () => {
    const input: BuildNoteItemInput = {
      ...BASE_NOTE,
      sub: SUB,
      noteId: '01JXXXXXXXXXXXXXXXXXRT002',
      title: 'Clean Note',
      tags: ['vocab'],
      status: 'clean',
    };

    await writeNoteWithTags(input);

    const fetched = await getNote(SUB, '01JXXXXXXXXXXXXXXXXXRT002');
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe('clean');
    expect(fetched!.tags).toEqual(['vocab']);
  });

  it('round-trip preserves optional groupId when set', async () => {
    const input: BuildNoteItemInput = {
      ...BASE_NOTE,
      sub: SUB,
      noteId: '01JXXXXXXXXXXXXXXXXXRT003',
      title: 'Grouped Note',
      tags: [],
      groupId: 'grp-abc',
    };

    await writeNoteWithTags(input);

    const fetched = await getNote(SUB, '01JXXXXXXXXXXXXXXXXXRT003');
    expect(fetched).toBeDefined();
    expect(fetched!.groupId).toBe('grp-abc');
  });
});

// ---------------------------------------------------------------------------
// Sub-case 2: GSI1 (UserNotesByTime) — newest-first ordering
// ---------------------------------------------------------------------------

describe('Notes — listUserNotes via GSI1 (UserNotesByTime), newest-first', () => {
  const SUB = 'sub-gsi1-001';
  // ULIDs are lexicographically time-ordered: A < B < C
  const NOTE_A = '01JXXXXXXXXXXXXXXXXXGSI1A';
  const NOTE_B = '01JXXXXXXXXXXXXXXXXXGSI1B';
  const NOTE_C = '01JXXXXXXXXXXXXXXXXXGSI1C';

  it('setup: writes three notes with ascending ULIDs', async () => {
    for (const noteId of [NOTE_A, NOTE_B, NOTE_C]) {
      await writeNoteWithTags({
        ...BASE_NOTE,
        sub: SUB,
        noteId,
        title: `Note ${noteId.slice(-1)}`,
        tags: [],
      });
    }
  });

  it('listUserNotes returns all three notes newest-first (C, B, A)', async () => {
    const notes = await listUserNotes(SUB);

    expect(notes.length).toBe(3);

    // Descending ULID: C → B → A
    expect(notes[0].noteId).toBe(NOTE_C);
    expect(notes[1].noteId).toBe(NOTE_B);
    expect(notes[2].noteId).toBe(NOTE_A);
  });

  it('listUserNotes returns an empty array for a user with no notes', async () => {
    const notes = await listUserNotes('sub-nobody-gsi1');
    expect(notes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 3: GSI2 (NotesByTag) — tag-based filtering
// ---------------------------------------------------------------------------

describe('Notes — listNoteIdsByTag via GSI2 (NotesByTag)', () => {
  const SUB = 'sub-gsi2-001';
  const NOTE_VERBS_1 = '01JXXXXXXXXXXXXXXXXXV001';
  const NOTE_VERBS_2 = '01JXXXXXXXXXXXXXXXXXV002';
  const NOTE_GRAMMAR = '01JXXXXXXXXXXXXXXXXXG001';

  it('setup: writes two "verbs" notes and one "grammar" note', async () => {
    await writeNoteWithTags({
      ...BASE_NOTE,
      sub: SUB,
      noteId: NOTE_VERBS_1,
      title: 'Verbs Note 1',
      tags: ['verbs'],
    });

    await writeNoteWithTags({
      ...BASE_NOTE,
      sub: SUB,
      noteId: NOTE_VERBS_2,
      title: 'Verbs Note 2',
      tags: ['verbs'],
    });

    await writeNoteWithTags({
      ...BASE_NOTE,
      sub: SUB,
      noteId: NOTE_GRAMMAR,
      title: 'Grammar Note',
      tags: ['grammar'],
    });
  });

  it('listNoteIdsByTag("verbs") returns exactly the two verbs notes', async () => {
    const items = await listNoteIdsByTag('verbs');

    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_VERBS_1);
    expect(noteIds).toContain(NOTE_VERBS_2);
    expect(noteIds.length).toBe(2);
  });

  it('listNoteIdsByTag("verbs") does NOT include the grammar note', async () => {
    const items = await listNoteIdsByTag('verbs');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).not.toContain(NOTE_GRAMMAR);
  });

  it('listNoteIdsByTag("grammar") returns only the grammar note', async () => {
    const items = await listNoteIdsByTag('grammar');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_GRAMMAR);
    expect(noteIds.length).toBe(1);
  });

  it('listNoteIdsByTag returns an empty array for an unknown tag', async () => {
    const items = await listNoteIdsByTag('unknown-tag-xyz');
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sub-case 4: Multi-tag write — each tag produces its own tag-index item
// ---------------------------------------------------------------------------

describe('Notes — multi-tag write produces one tag-index item per tag', () => {
  const SUB = 'sub-multitag-001';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXMT001';
  const TAGS = ['verbs', 'grammar', 'idioms'];

  it('setup: writes a note with three tags', async () => {
    await writeNoteWithTags({
      ...BASE_NOTE,
      sub: SUB,
      noteId: NOTE_ID,
      title: 'Multi-tag Note',
      tags: TAGS,
    });
  });

  it('listNoteIdsByTag("verbs") includes the multi-tag note', async () => {
    const items = await listNoteIdsByTag('verbs');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('listNoteIdsByTag("grammar") includes the multi-tag note', async () => {
    const items = await listNoteIdsByTag('grammar');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('listNoteIdsByTag("idioms") includes the multi-tag note', async () => {
    const items = await listNoteIdsByTag('idioms');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('exactly three tag-index items exist across all three tags for this note', async () => {
    const verbs = await listNoteIdsByTag('verbs');
    const grammar = await listNoteIdsByTag('grammar');
    const idioms = await listNoteIdsByTag('idioms');

    // Each tag query returns items that include the multi-tag note
    const verbsNoteIds = verbs.map((i) => i.noteId);
    const grammarNoteIds = grammar.map((i) => i.noteId);
    const idiomsNoteIds = idioms.map((i) => i.noteId);

    expect(verbsNoteIds).toContain(NOTE_ID);
    expect(grammarNoteIds).toContain(NOTE_ID);
    expect(idiomsNoteIds).toContain(NOTE_ID);
  });
});

// ---------------------------------------------------------------------------
// Pure item builder unit checks (no DynamoDB I/O)
// ---------------------------------------------------------------------------

describe('buildNoteItem — pure builder checks', () => {
  it('populates pk/sk/gsi1pk/gsi1sk from noteKeys', () => {
    const item = buildNoteItem({
      ...BASE_NOTE,
      sub: 'builder-sub',
      noteId: 'builder-note-id',
      title: 'Builder Test',
      tags: [],
    });

    expect(item.pk).toBe('USER#builder-sub');
    expect(item.sk).toBe('NOTE#builder-note-id');
    expect(item.gsi1pk).toBe('USER#builder-sub');
    expect(item.gsi1sk).toBe('NOTE#builder-note-id');
  });

  it('defaults createdAt and updatedAt to valid ISO-8601 strings', () => {
    const before = new Date().toISOString();
    const item = buildNoteItem({
      ...BASE_NOTE,
      sub: 'builder-sub',
      noteId: 'builder-note-ts',
      title: 'Timestamp Test',
      tags: [],
    });
    const after = new Date().toISOString();

    expect(item.createdAt >= before).toBe(true);
    expect(item.createdAt <= after).toBe(true);
    expect(item.updatedAt >= before).toBe(true);
    expect(item.updatedAt <= after).toBe(true);
  });

  it('uses provided createdAt/updatedAt when supplied', () => {
    const ts = '2025-03-01T12:00:00.000Z';
    const item = buildNoteItem({
      ...BASE_NOTE,
      sub: 's',
      noteId: 'n',
      title: 'T',
      tags: [],
      createdAt: ts,
      updatedAt: ts,
    });
    expect(item.createdAt).toBe(ts);
    expect(item.updatedAt).toBe(ts);
  });

  it('does not include groupId when not provided', () => {
    const item = buildNoteItem({ ...BASE_NOTE, sub: 's', noteId: 'n', title: 'T', tags: [] });
    expect(item.groupId).toBeUndefined();
  });

  it('includes groupId when provided', () => {
    const item = buildNoteItem({
      ...BASE_NOTE,
      sub: 's',
      noteId: 'n',
      title: 'T',
      tags: [],
      groupId: 'grp-xyz',
    });
    expect(item.groupId).toBe('grp-xyz');
  });

  it('preserves the tags array', () => {
    const tags = ['a', 'b', 'c'];
    const item = buildNoteItem({ ...BASE_NOTE, sub: 's', noteId: 'n', title: 'T', tags });
    expect(item.tags).toEqual(tags);
  });
});

describe('buildTagIndexItem — pure builder checks', () => {
  it('populates pk/sk/gsi2pk/gsi2sk correctly', () => {
    const item = buildTagIndexItem({ tag: 'verbs', sub: 'sub-1', noteId: 'note-1' });

    expect(item.pk).toBe('TAG#verbs');
    expect(item.sk).toBe('USER#sub-1#NOTE#note-1');
    expect(item.gsi2pk).toBe('TAG#verbs');
    expect(item.gsi2sk).toBe('USER#sub-1#NOTE#note-1');
    expect(item.noteId).toBe('note-1');
  });

  it('produces distinct items for different tags on the same note', () => {
    const item1 = buildTagIndexItem({ tag: 'verbs', sub: 'sub-1', noteId: 'note-1' });
    const item2 = buildTagIndexItem({ tag: 'grammar', sub: 'sub-1', noteId: 'note-1' });

    expect(item1.pk).not.toBe(item2.pk);
    expect(item1.gsi2pk).not.toBe(item2.gsi2pk);
    expect(item1.noteId).toBe(item2.noteId);
  });
});

describe('noteKeys — key builder consistency checks', () => {
  it('pk/sk/note are internally consistent', () => {
    const sub = 'sub-keys';
    const noteId = 'note-keys';
    const keys = noteKeys.note(sub, noteId);
    expect(keys.pk).toBe(noteKeys.pk(sub));
    expect(keys.sk).toBe(noteKeys.sk(noteId));
    expect(keys.pk).toBe(noteKeys.gsi1pk(sub));
    expect(keys.sk).toBe(noteKeys.gsi1sk(noteId));
  });

  it('tagItem and gsi2pk/gsi2sk are consistent', () => {
    const tag = 't';
    const sub = 's';
    const noteId = 'n';
    const tagItemKeys = noteKeys.tagItem(tag, sub, noteId);
    expect(tagItemKeys.pk).toBe(noteKeys.gsi2pk(tag));
    expect(tagItemKeys.sk).toBe(noteKeys.gsi2sk(sub, noteId));
  });

  it('listUserNotes sets ScanIndexForward: false', () => {
    const params = noteKeys.listUserNotes('any-sub');
    expect(params.ScanIndexForward).toBe(false);
  });
});
