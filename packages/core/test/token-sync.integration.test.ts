/**
 * Integration test: token-index maintenance helpers —
 * `putNoteTokens`, `deleteNoteTokens`, `syncNoteTokens`, `deleteNoteRecord`
 * (M6.2.3).
 *
 * Exercises the real `ddb` DocumentClient and all four new helpers against
 * the dynalite in-memory DynamoDB — no mocks, no AWS. The dynalite server is
 * started by `dynalite-global.ts` (globalSetup) and the production client is
 * pointed at it via env vars set in `integration-env.ts` (setupFiles).
 *
 * Uses the unique sub prefix `sub-tsync-*` to avoid key collisions with other
 * integration suites that share the same dynalite instance.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems.
 * These helpers use BatchWriteCommand, which dynalite does implement.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import {
  buildNoteItem,
  buildTagIndexItem,
  listNoteIdsByToken,
  putNoteTokens,
  deleteNoteTokens,
  syncNoteTokens,
  deleteNoteRecord,
} from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// putNoteTokens — write N tokens, then verify via listNoteIdsByToken
// ---------------------------------------------------------------------------

describe('putNoteTokens — writes token-index items', () => {
  const SUB = 'sub-tsync-001';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTS1';
  const TOKENS = ['physics', 'quantum', 'entanglement', 'superposition', 'wave'];

  it('puts five token-index items for one note', async () => {
    await putNoteTokens(SUB, NOTE_ID, TOKENS);
  });

  it('listNoteIdsByToken finds the note for each written token', async () => {
    for (const token of TOKENS) {
      const items = await listNoteIdsByToken(SUB, token);
      const noteIds = items.map((i) => i.noteId);
      expect(noteIds).toContain(NOTE_ID);
    }
  });

  it('is a no-op for an empty token array', async () => {
    // Should not throw and should not affect existing items
    await putNoteTokens(SUB, NOTE_ID, []);
    const items = await listNoteIdsByToken(SUB, TOKENS[0]);
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('de-duplicates tokens before writing (idempotent re-put)', async () => {
    // Re-putting duplicates should not throw or produce spurious state
    await putNoteTokens(SUB, NOTE_ID, ['quantum', 'quantum', 'wave', 'wave']);
    const items = await listNoteIdsByToken(SUB, 'quantum');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });
});

// ---------------------------------------------------------------------------
// deleteNoteTokens — removes given tokens
// ---------------------------------------------------------------------------

describe('deleteNoteTokens — removes token-index items', () => {
  const SUB = 'sub-tsync-002';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTS2';
  const TOKENS = ['biology', 'genetics', 'dna', 'rna', 'protein'];

  it('setup: writes five tokens via putNoteTokens', async () => {
    await putNoteTokens(SUB, NOTE_ID, TOKENS);
    // Verify they're there
    const items = await listNoteIdsByToken(SUB, 'biology');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('deletes two specific tokens ("biology", "rna")', async () => {
    await deleteNoteTokens(SUB, NOTE_ID, ['biology', 'rna']);
  });

  it('"biology" no longer returns the note after deletion', async () => {
    const items = await listNoteIdsByToken(SUB, 'biology');
    expect(items.map((i) => i.noteId)).not.toContain(NOTE_ID);
  });

  it('"rna" no longer returns the note after deletion', async () => {
    const items = await listNoteIdsByToken(SUB, 'rna');
    expect(items.map((i) => i.noteId)).not.toContain(NOTE_ID);
  });

  it('"genetics" (not removed) still returns the note', async () => {
    const items = await listNoteIdsByToken(SUB, 'genetics');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('is a no-op for an empty token array', async () => {
    await deleteNoteTokens(SUB, NOTE_ID, []);
    // Remaining tokens untouched
    const items = await listNoteIdsByToken(SUB, 'dna');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('de-duplicates tokens before deleting', async () => {
    // Delete with duplicates — should not throw
    await deleteNoteTokens(SUB, NOTE_ID, ['dna', 'dna', 'protein', 'protein']);
    const dnaitems = await listNoteIdsByToken(SUB, 'dna');
    expect(dnaitems.map((i) => i.noteId)).not.toContain(NOTE_ID);
  });
});

// ---------------------------------------------------------------------------
// syncNoteTokens — diff-based update
// ---------------------------------------------------------------------------

describe('syncNoteTokens — incremental token-index update', () => {
  const SUB = 'sub-tsync-003';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTS3';

  it('setup: writes initial tokens ["alpha","beta","gamma"] via putNoteTokens', async () => {
    await putNoteTokens(SUB, NOTE_ID, ['alpha', 'beta', 'gamma']);
    // Verify setup
    for (const t of ['alpha', 'beta', 'gamma']) {
      const items = await listNoteIdsByToken(SUB, t);
      expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
    }
  });

  it('syncNoteTokens(old=[alpha,beta,gamma], new=[beta,gamma,delta]) completes without error', async () => {
    await syncNoteTokens(SUB, NOTE_ID, ['alpha', 'beta', 'gamma'], ['beta', 'gamma', 'delta']);
  });

  it('"alpha" (removed) no longer returns the note', async () => {
    const items = await listNoteIdsByToken(SUB, 'alpha');
    expect(items.map((i) => i.noteId)).not.toContain(NOTE_ID);
  });

  it('"delta" (added) now returns the note', async () => {
    const items = await listNoteIdsByToken(SUB, 'delta');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('"beta" (unchanged) still returns the note', async () => {
    const items = await listNoteIdsByToken(SUB, 'beta');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('"gamma" (unchanged) still returns the note', async () => {
    const items = await listNoteIdsByToken(SUB, 'gamma');
    expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
  });

  it('syncing to identical token sets is a no-op (no add/remove)', async () => {
    // Should not throw; state remains the same
    await syncNoteTokens(SUB, NOTE_ID, ['beta', 'gamma', 'delta'], ['beta', 'gamma', 'delta']);
    for (const t of ['beta', 'gamma', 'delta']) {
      const items = await listNoteIdsByToken(SUB, t);
      expect(items.map((i) => i.noteId)).toContain(NOTE_ID);
    }
  });
});

// ---------------------------------------------------------------------------
// deleteNoteRecord — hard-delete of main note item + tag-index + token-index
// ---------------------------------------------------------------------------

describe('deleteNoteRecord — removes main note item, tag-index, and token-index items', () => {
  const SUB = 'sub-tsync-004';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTS4';
  const TAGS = ['history', 'ancient'];
  const TOKENS = ['rome', 'empire', 'caesar', 'senate'];

  it('setup: writes main note item, tag-index items, and token-index items', async () => {
    // Write the main note item via buildNoteItem + PutCommand
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildNoteItem({
          sub: SUB,
          noteId: NOTE_ID,
          title: 'Ancient Rome',
          tags: TAGS,
          status: 'original',
          words: 100,
          highlights: 0,
          langPair: 'en-en',
          ocrConfidence: 0.99,
          bodyS3Key: `markdown/users/${SUB}/${NOTE_ID}.md`,
          originalImageS3Key: `images/users/${SUB}/${NOTE_ID}.jpg`,
        }),
      }),
    );

    // Write tag-index items via buildTagIndexItem + PutCommand
    for (const tag of TAGS) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildTagIndexItem({ tag, sub: SUB, noteId: NOTE_ID }),
        }),
      );
    }

    // Write token-index items
    await putNoteTokens(SUB, NOTE_ID, TOKENS);

    // Verify setup: main note item exists
    const { Item } = await ddb.send(
      new GetCommand({ TableName: TableNames.Notes, Key: noteKeys.note(SUB, NOTE_ID) }),
    );
    expect(Item).toBeDefined();
  });

  it('deleteNoteRecord completes without error', async () => {
    await deleteNoteRecord(SUB, NOTE_ID, TAGS, TOKENS);
  });

  it('main note item no longer exists (GetCommand returns undefined)', async () => {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: TableNames.Notes, Key: noteKeys.note(SUB, NOTE_ID) }),
    );
    expect(Item).toBeUndefined();
  });

  it('tag-index item for "history" no longer exists', async () => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Notes,
        Key: noteKeys.tagItem('history', SUB, NOTE_ID),
      }),
    );
    expect(Item).toBeUndefined();
  });

  it('tag-index item for "ancient" no longer exists', async () => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.Notes,
        Key: noteKeys.tagItem('ancient', SUB, NOTE_ID),
      }),
    );
    expect(Item).toBeUndefined();
  });

  it('token queries return empty for all deleted tokens', async () => {
    for (const token of TOKENS) {
      const items = await listNoteIdsByToken(SUB, token);
      expect(items.map((i) => i.noteId)).not.toContain(NOTE_ID);
    }
  });

  it('handles duplicate tags and tokens gracefully (de-duplication)', async () => {
    // Write a minimal note and then delete with duplicate inputs — should not throw
    const DUP_NOTE = '01JXXXXXXXXXXXXXXXXXXXTS5';
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildNoteItem({
          sub: SUB,
          noteId: DUP_NOTE,
          title: 'Dup Test',
          tags: ['tag1'],
          status: 'original',
          words: 1,
          highlights: 0,
          langPair: 'en-en',
          ocrConfidence: 1,
          bodyS3Key: `markdown/users/${SUB}/${DUP_NOTE}.md`,
          originalImageS3Key: `images/users/${SUB}/${DUP_NOTE}.jpg`,
        }),
      }),
    );
    await putNoteTokens(SUB, DUP_NOTE, ['word1']);
    await deleteNoteRecord(SUB, DUP_NOTE, ['tag1', 'tag1'], ['word1', 'word1']);
    const { Item } = await ddb.send(
      new GetCommand({ TableName: TableNames.Notes, Key: noteKeys.note(SUB, DUP_NOTE) }),
    );
    expect(Item).toBeUndefined();
  });
});
